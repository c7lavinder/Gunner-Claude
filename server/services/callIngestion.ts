import { db } from "../_core/db";
import { transcribeAudio } from "../_core/llm";
import { uploadFile } from "../_core/storage";
import { createCrmAdapter } from "../crm";
import { gradeCall } from "./grading";
import { calls, tenants } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

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
  if (!tenant?.crmConfig || tenant.crmType === "none") return { processed: 0, skipped: 0, errors: 0 };

  const since = tenant.lastGhlSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const config = normalizeCrmConfig(JSON.parse(tenant.crmConfig) as Record<string, unknown>);
  const adapter = createCrmAdapter(tenant.crmType ?? "ghl", config);

  const recordings = await adapter.getCallRecordings(since);
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

      const [call] = await db
        .insert(calls)
        .values({
          tenantId,
          ghlCallId: rec.id,
          ghlContactId: rec.contactId,
          ghlLocationId: config.locationId,
          duration: rec.duration,
          callDirection: rec.direction,
          status: "processing",
          callTimestamp: rec.timestamp ? new Date(rec.timestamp) : undefined,
        })
        .returning();

      if (!call) continue;

      const res = await fetch(rec.recordingUrl);
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

export function startPolling(intervalMinutes: number) {
  console.log(`[ingest] Polling started every ${intervalMinutes} minutes`);
  setInterval(async () => {
    console.log("[ingest] Cycle started");
    const active = await db.select().from(tenants).where(eq(tenants.crmConnected, "true"));
    for (const t of active) {
      try {
        const result = await ingestCallsForTenant(t.id);
        console.log(`[ingest] Tenant ${t.id}: processed=${result.processed} skipped=${result.skipped} errors=${result.errors}`);
      } catch (e) {
        console.error(`[ingest] Tenant ${t.id} failed:`, e);
      }
    }
    console.log("[ingest] Cycle ended");
  }, intervalMinutes * 60 * 1000);
}
