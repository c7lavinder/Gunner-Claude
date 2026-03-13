import { db } from "../_core/db";
import { transcribeAudio } from "../_core/llm";
import { uploadFile } from "../_core/storage";
import { createCrmAdapter } from "../crm";
import { gradeCall } from "./grading";
import { SOFTWARE_PLAYBOOK } from "./playbooks";
import { calls, callGrades, tenants, dispoProperties, tenantPlaybooks, syncActivityLog, teamMembers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { demoRecordingMeta } from "../crm/demo/demoAdapter";
import { getRandomTranscript, getCallOutcome } from "../seeds/demoTranscripts";
import { getRandomGrade } from "../seeds/demoGrades";
import { refreshTokenIfNeeded } from "./ghlOAuth";

const BUCKET = "gunner-recordings";

function normalizeCrmConfig(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[String(k)] = String(v);
  }
  if (out.ghlApiKey && !out.apiKey) out.apiKey = out.ghlApiKey;
  if (out.ghlLocationId && !out.locationId) out.locationId = out.ghlLocationId;
  return out;
}

export async function ingestCallsForTenant(tenantId: number) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const isDemo = tenant?.crmType === "demo";

  if (!isDemo && (!tenant?.crmConfig || tenant.crmType === "none")) {
    return { processed: 0, skipped: 0, errors: 0 };
  }

  // Refresh OAuth token if needed before making API calls
  if (!isDemo && tenant!.crmType === "ghl") {
    const freshToken = await refreshTokenIfNeeded(tenantId);
    if (freshToken) {
      // Re-read tenant to get updated crmConfig with fresh token
      const [refreshed] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      if (refreshed?.crmConfig) Object.assign(tenant!, refreshed);
    }
  }

  const since = tenant!.lastGhlSync ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const config = isDemo ? {} : normalizeCrmConfig(JSON.parse(tenant!.crmConfig!) as Record<string, unknown>);
  const adapter = createCrmAdapter(tenant!.crmType ?? "ghl", config);

  const recordings = await adapter.getCallRecordings(since);
  console.log(`[ingest] Tenant ${tenantId}: adapter returned ${recordings.length} recordings (since=${since.toISOString()})`);
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const rec of recordings) {
    try {
      const [existing] = await db.select().from(calls).where(and(eq(calls.tenantId, tenantId), eq(calls.ghlCallId, rec.id)));
      if (existing) {
        skipped++;
        continue;
      }

      const meta = isDemo ? demoRecordingMeta.get(rec.id) : undefined;
      const outcome = isDemo && meta ? getCallOutcome(meta.callType) : undefined;

      // 4a: Lookup teamMemberId from rec.assignedTo via team_members.ghlUserId
      let teamMemberId: number | undefined;
      if (rec.assignedTo) {
        const [member] = await db.select({ id: teamMembers.id })
          .from(teamMembers)
          .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.ghlUserId, rec.assignedTo)))
          .limit(1);
        if (member) teamMemberId = member.id;
      }

      const [call] = await db
        .insert(calls)
        .values({
          tenantId,
          ghlCallId: rec.id,
          ghlContactId: rec.contactId,
          ghlLocationId: isDemo ? "demo" : config.locationId,
          duration: rec.duration,
          callDirection: rec.direction,
          callType: meta?.callType,
          callOutcome: outcome?.callOutcome,
          classification: outcome?.classification,
          status: "processing",
          callTimestamp: rec.timestamp ? new Date(rec.timestamp) : undefined,
          teamMemberId: teamMemberId ?? null,
        })
        .returning();

      if (!call) continue;

      const MIN_DURATION = SOFTWARE_PLAYBOOK.minGradingDurationSeconds ?? 60;
      if ((call.duration ?? 0) < MIN_DURATION) {
        await db.update(calls).set({ status: "too_short" }).where(eq(calls.id, call.id));
        skipped++;
        continue;
      }

      if (isDemo && meta) {
        const transcript = getRandomTranscript(meta.callType, meta.contactName, meta.address);
        const grade = getRandomGrade(meta.callType);

        await db
          .update(calls)
          .set({
            transcript,
            contactName: meta.contactName,
            propertyAddress: meta.address,
            status: "graded",
            updatedAt: new Date(),
          })
          .where(eq(calls.id, call.id));

        await db.insert(callGrades).values({
          callId: call.id,
          tenantId,
          rubricType: meta.callType,
          overallGrade: grade.overallGrade,
          overallScore: String(grade.overallScore),
          summary: grade.summary,
          strengths: grade.strengths,
          improvements: grade.improvements,
          criteriaScores: grade.criteriaScores,
        });

        demoRecordingMeta.delete(rec.id);
        processed++;
        continue;
      }

      // Real CRM path: download audio, transcribe, grade
      const fetchOpts: RequestInit = rec.authHeaders ? { headers: rec.authHeaders } : {};
      const res = await fetch(rec.recordingUrl, fetchOpts);
      if (!res.ok) throw new Error(`Failed to fetch recording: ${res.status}`);
      const audioBuffer = Buffer.from(await res.arrayBuffer());

      const storagePath = `recordings/${tenantId}/${call.id}.mp3`;
      const recordingUrl = await uploadFile(BUCKET, storagePath, audioBuffer, "audio/mpeg");

      const transcript = await transcribeAudio(audioBuffer, "recording.mp3");

      await db
        .update(calls)
        .set({ transcript, recordingUrl, status: "transcribed", updatedAt: new Date() })
        .where(eq(calls.id, call.id));

      await gradeCall(call.id, tenantId);
      processed++;
    } catch (e) {
      errors++;
      console.error(`[ingest] tenant ${tenantId} recording ${rec.id}:`, e);
    }
  }

  await db.update(tenants).set({ lastGhlSync: new Date(), updatedAt: new Date() }).where(eq(tenants.id, tenantId));
  return { processed, skipped, errors };
}

function mapGhlStageToStatus(stageId: string, stageMappings?: Record<string, string>): string {
  if (stageMappings?.[stageId]) return stageMappings[stageId]!;
  const lower = stageId.toLowerCase();
  if (lower.includes("new") || lower.includes("lead")) return "new_lead"; // eslint-disable-line no-restricted-syntax -- CRM stage matching, not UI label
  if (lower.includes("contact") || lower.includes("reached")) return "contacted";
  if (lower.includes("appt") || lower.includes("appointment") || lower.includes("sched")) return "apt_set";
  if (lower.includes("offer") || lower.includes("negotiat")) return "offer_made";
  if (lower.includes("contract") || lower.includes("accept")) return "under_contract";
  if (lower.includes("close") || lower.includes("won") || lower.includes("sold")) return "closed";
  if (lower.includes("dead") || lower.includes("lost") || lower.includes("disqualified")) return "dead";
  return "new_lead";
}

export async function ingestOpportunitiesForTenant(tenantId: number): Promise<{ upserted: number; skipped: number; errors: number }> {
  let [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant?.crmConfig || tenant.crmType === "none") return { upserted: 0, skipped: 0, errors: 0 };

  // Refresh OAuth token if needed
  if (tenant.crmType === "ghl") {
    const freshToken = await refreshTokenIfNeeded(tenantId);
    if (freshToken) {
      const [refreshed] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      if (refreshed) tenant = refreshed;
    }
  }

  const config = normalizeCrmConfig(JSON.parse(tenant.crmConfig!) as Record<string, unknown>);
  const adapter = createCrmAdapter(tenant.crmType ?? "ghl", config);

  // Load tenant playbook for stage mappings
  const [playbook] = await db.select().from(tenantPlaybooks).where(eq(tenantPlaybooks.tenantId, tenantId)).limit(1);
  const stageMappings = (playbook?.algorithmOverrides as Record<string, unknown> | null)?.stageMappings as Record<string, string> | undefined;

  const opportunities = await adapter.getOpportunities();
  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const opp of opportunities) {
    try {
      if (!opp.contactId) { skipped++; continue; }

      const [existing] = await db
        .select({ id: dispoProperties.id })
        .from(dispoProperties)
        .where(and(eq(dispoProperties.tenantId, tenantId), eq(dispoProperties.ghlOpportunityId, opp.id)))
        .limit(1);

      const status = mapGhlStageToStatus(opp.stageId, stageMappings);

      if (existing) {
        await db.update(dispoProperties).set({
          status,
          ghlPipelineStageId: opp.stageId,
          stageChangedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(dispoProperties.id, existing.id));
      } else {
        // 4c: Enrich with contact details on first insert
        let city = "";
        let state = "";
        let zip = "";
        let sellerName: string | undefined;
        let sellerPhone: string | undefined;
        try {
          const contact = await adapter.getContact(opp.contactId);
          if (contact) {
            const cf = contact.customFields ?? {};
            city = String(cf.city ?? cf.address_city ?? "");
            state = String(cf.state ?? cf.address_state ?? "");
            zip = String(cf.zip ?? cf.postal_code ?? cf.address_zip ?? "");
            sellerName = contact.name !== "Unknown" ? contact.name : undefined;
            sellerPhone = contact.phone ?? undefined;
          }
        } catch {
          // Contact enrichment failure shouldn't block ingestion
        }

        await db.insert(dispoProperties).values({
          tenantId,
          address: opp.name || "Unknown",
          city,
          state,
          zip,
          sellerName: sellerName ?? null,
          sellerPhone: sellerPhone ?? null,
          ghlContactId: opp.contactId,
          ghlOpportunityId: opp.id,
          ghlPipelineId: opp.pipelineId,
          ghlPipelineStageId: opp.stageId,
          status,
          contractPrice: opp.value ? opp.value * 100 : null,
          stageChangedAt: new Date(),
        }).onConflictDoNothing();
      }
      upserted++;
    } catch (e) {
      errors++;
      console.error(`[opp-ingest] tenant ${tenantId} opp ${opp.id}:`, e);
    }
  }

  return { upserted, skipped, errors };
}

export function startPolling(intervalMinutes: number) {
  console.log(`[ingest] Polling started every ${intervalMinutes} minutes`);

  // Call ingestion — every intervalMinutes
  setInterval(async () => {
    console.log("[ingest] Call cycle started");
    const active = await db.select().from(tenants).where(eq(tenants.crmConnected, "true"));
    for (const t of active) {
      try {
        const result = await ingestCallsForTenant(t.id);
        console.log(`[ingest] Tenant ${t.id}: processed=${result.processed} skipped=${result.skipped} errors=${result.errors}`);
        await db.insert(syncActivityLog).values({
          tenantId: t.id,
          layer: "polling",
          eventType: "call_ingestion",
          status: result.errors > 0 ? "error" : "success",
          details: JSON.stringify(result),
        });
      } catch (e) {
        console.error(`[ingest] Tenant ${t.id} failed:`, e);
        await db.insert(syncActivityLog).values({
          tenantId: t.id,
          layer: "polling",
          eventType: "call_ingestion",
          status: "error",
          details: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
        }).catch(() => {/* ignore logging failure */});
      }
    }
    console.log("[ingest] Call cycle ended");
  }, intervalMinutes * 60 * 1000);

  // Opportunity ingestion — every 10 minutes
  setInterval(async () => {
    console.log("[opp-ingest] Cycle started");
    const active = await db.select().from(tenants).where(eq(tenants.crmConnected, "true"));
    for (const t of active) {
      try {
        const result = await ingestOpportunitiesForTenant(t.id);
        if (result.upserted > 0 || result.errors > 0) {
          console.log(`[opp-ingest] Tenant ${t.id}: upserted=${result.upserted} skipped=${result.skipped} errors=${result.errors}`);
          await db.insert(syncActivityLog).values({
            tenantId: t.id,
            layer: "polling",
            eventType: "opportunity_ingestion",
            status: result.errors > 0 ? "error" : "success",
            details: JSON.stringify(result),
          });
        }
      } catch (e) {
        console.error(`[opp-ingest] Tenant ${t.id} failed:`, e);
        await db.insert(syncActivityLog).values({
          tenantId: t.id,
          layer: "polling",
          eventType: "opportunity_ingestion",
          status: "error",
          details: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
        }).catch(() => {/* ignore logging failure */});
      }
    }
    console.log("[opp-ingest] Cycle ended");
  }, 10 * 60 * 1000);
}
