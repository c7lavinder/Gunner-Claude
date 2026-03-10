import { Router } from "express";
import { db } from "../_core/db";
import { webhookEvents, calls, tenants } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { gradeCall } from "../services/grading";
import { transcribeAudio } from "../_core/llm";
import { uploadFile } from "../_core/storage";

const BUCKET = "gunner-recordings";

function findTenantByLocationId(locationId: string): Promise<{ id: number; crmConfig: string } | null> {
  return db.transaction(async (tx) => {
    const all = await tx.select().from(tenants).where(eq(tenants.crmConnected, "true"));
    for (const t of all) {
      if (!t.crmConfig) continue;
      try {
        const cfg = JSON.parse(t.crmConfig) as Record<string, unknown>;
        const loc = String(cfg.locationId ?? cfg.ghlLocationId ?? "").trim();
        if (loc && loc === locationId) return { id: t.id, crmConfig: t.crmConfig };
      } catch {
        continue;
      }
    }
    return null;
  });
}

export const webhookRouter = Router();

webhookRouter.post("/:provider", async (req, res) => {
  res.status(200).json({ ok: true });
  const provider = req.params.provider as string;
  const body = req.body as Record<string, unknown>;
  const locationId = String(body.locationId ?? body.location_id ?? "").trim();
  const eventType = String(body.type ?? body.eventType ?? body.event ?? "unknown");
  const eventId = body.id ?? body.eventId ? String(body.id ?? body.eventId) : undefined;

  const [ev] = await db
    .insert(webhookEvents)
    .values({
      provider,
      locationId: locationId || null,
      eventType,
      eventId: eventId ?? null,
      status: "received",
    })
    .returning();

  const process = async () => {
    try {
      if (provider === "ghl" && (eventType === "CallCompleted" || eventType === "call.completed")) {
        const tenant = await findTenantByLocationId(locationId);
        if (!tenant) {
          await db
            .update(webhookEvents)
            .set({ status: "failed", errorMessage: "Tenant not found", processedAt: new Date() })
            .where(eq(webhookEvents.id, ev!.id));
          return;
        }
        const rec = (body.recording ?? body) as Record<string, unknown>;
        const recordingUrl = String(rec.recordingUrl ?? rec.recording_url ?? "").trim();
        const contactId = String(rec.contactId ?? rec.contact_id ?? "").trim();
        const contactName = String(rec.contactName ?? rec.contact_name ?? "").trim();
        const duration = Number(rec.duration ?? 0) || undefined;
        const direction = String(rec.direction ?? rec.callDirection ?? "outbound").toLowerCase();
        const callId = String(rec.callId ?? rec.id ?? rec.call_id ?? "").trim();
        if (!recordingUrl || !callId) {
          await db
            .update(webhookEvents)
            .set({ status: "failed", errorMessage: "Missing recordingUrl or callId", processedAt: new Date() })
            .where(eq(webhookEvents.id, ev!.id));
          return;
        }
        const [existing] = await db.select().from(calls).where(and(eq(calls.tenantId, tenant.id), eq(calls.ghlCallId, callId)));
        if (existing) {
          await db.update(webhookEvents).set({ tenantId: tenant.id, status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ev!.id));
          return;
        }
        const [call] = await db
          .insert(calls)
          .values({
            tenantId: tenant.id,
            ghlCallId: callId,
            ghlContactId: contactId || null,
            ghlLocationId: locationId || null,
            contactName: contactName || null,
            duration: duration ?? null,
            callDirection: direction === "inbound" ? "inbound" : "outbound",
            status: "processing",
          })
          .returning();
        if (!call) throw new Error("Insert failed");
        const res = await fetch(recordingUrl);
        if (!res.ok) throw new Error(`Fetch recording: ${res.status}`);
        const audioBuffer = Buffer.from(await res.arrayBuffer());
        const storagePath = `recordings/${tenant.id}/${call.id}.mp3`;
        const uploadedUrl = await uploadFile(BUCKET, storagePath, audioBuffer, "audio/mpeg");
        const transcript = await transcribeAudio(audioBuffer, "recording.mp3");
        await db.update(calls).set({ transcript, recordingUrl: uploadedUrl, status: "transcribed", updatedAt: new Date() }).where(eq(calls.id, call.id));
        await gradeCall(call.id, tenant.id);
        await db.update(webhookEvents).set({ tenantId: tenant.id, status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ev!.id));
      } else if (eventType === "ContactUpdate") {
        await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ev!.id));
      } else if (eventType === "OpportunityStageUpdate") {
        await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ev!.id));
      } else {
        await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ev!.id));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(webhookEvents)
        .set({ status: "failed", errorMessage: msg, processedAt: new Date() })
        .where(eq(webhookEvents.id, ev!.id));
    }
  };
  void process();
});
