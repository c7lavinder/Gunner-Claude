import { Router } from "express";
import { createHmac } from "node:crypto";
import { db } from "../_core/db";
import { webhookEvents, webhookRetryQueue, calls, tenants, syncActivityLog } from "../../drizzle/schema";
import { eq, and, lte, lt } from "drizzle-orm";
import { ENV } from "../_core/env";
import { gradeCall } from "../services/grading";
import { transcribeAudio } from "../_core/llm";
import { uploadFile } from "../_core/storage";

const BUCKET = "gunner-recordings";
const MAX_RETRY_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000]; // 1m, 5m, 15m, 1h

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

async function isDuplicateEvent(eventId: string | undefined, eventType: string, _locationId: string): Promise<boolean> {
  if (!eventId) return false;
  const [existing] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.eventId, eventId),
        eq(webhookEvents.eventType, eventType),
        eq(webhookEvents.status, "processed")
      )
    )
    .limit(1);
  return !!existing;
}

async function processCallEvent(
  body: Record<string, unknown>,
  locationId: string,
  webhookEventId: number
): Promise<void> {
  const tenant = await findTenantByLocationId(locationId);
  if (!tenant) {
    await db.update(webhookEvents).set({ status: "failed", errorMessage: "Tenant not found", processedAt: new Date() }).where(eq(webhookEvents.id, webhookEventId));
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
    await db.update(webhookEvents).set({ status: "failed", errorMessage: "Missing recordingUrl or callId", processedAt: new Date() }).where(eq(webhookEvents.id, webhookEventId));
    return;
  }

  const [existing] = await db.select().from(calls).where(and(eq(calls.tenantId, tenant.id), eq(calls.ghlCallId, callId)));
  if (existing) {
    await db.update(webhookEvents).set({ tenantId: tenant.id, status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, webhookEventId));
    return;
  }

  const [call] = await db.insert(calls).values({
    tenantId: tenant.id,
    ghlCallId: callId,
    ghlContactId: contactId || null,
    ghlLocationId: locationId || null,
    contactName: contactName || null,
    duration: duration ?? null,
    callDirection: direction === "inbound" ? "inbound" : "outbound",
    status: "processing",
  }).returning();

  if (!call) throw new Error("Insert failed");

  const fetchRes = await fetch(recordingUrl);
  if (!fetchRes.ok) throw new Error(`Fetch recording: ${fetchRes.status}`);
  const audioBuffer = Buffer.from(await fetchRes.arrayBuffer());
  const storagePath = `recordings/${tenant.id}/${call.id}.mp3`;
  const uploadedUrl = await uploadFile(BUCKET, storagePath, audioBuffer, "audio/mpeg");
  const transcript = await transcribeAudio(audioBuffer, "recording.mp3");
  await db.update(calls).set({ transcript, recordingUrl: uploadedUrl, status: "transcribed", updatedAt: new Date() }).where(eq(calls.id, call.id));
  await gradeCall(call.id, tenant.id);
  await db.update(webhookEvents).set({ tenantId: tenant.id, status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, webhookEventId));
}

async function enqueueRetry(webhookEventId: number, tenantId: number, payload: Record<string, unknown>, attempt: number): Promise<void> {
  if (attempt >= MAX_RETRY_ATTEMPTS) return;
  const nextRetryAt = new Date(Date.now() + RETRY_BACKOFF_MS[attempt]!);
  await db.insert(webhookRetryQueue).values({
    tenantId,
    callId: webhookEventId, // reusing callId column for webhookEventId
    payload: JSON.stringify(payload),
    attemptCount: attempt + 1,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    lastAttemptAt: new Date(),
    nextRetryAt,
    status: "pending",
  });
}

export async function processRetryQueue(): Promise<void> {
  const pending = await db
    .select()
    .from(webhookRetryQueue)
    .where(
      and(
        eq(webhookRetryQueue.status, "pending"),
        lte(webhookRetryQueue.nextRetryAt, new Date()),
        lt(webhookRetryQueue.attemptCount, webhookRetryQueue.maxAttempts)
      )
    )
    .limit(20);

  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload) as Record<string, unknown>;
      const locationId = String(payload.locationId ?? payload.location_id ?? "").trim();
      await processCallEvent(payload, locationId, item.callId);
      await db.update(webhookRetryQueue).set({ status: "completed", lastAttemptAt: new Date() }).where(eq(webhookRetryQueue.id, item.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextAttempt = item.attemptCount;
      if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
        await db.update(webhookRetryQueue).set({ status: "failed", lastAttemptAt: new Date() }).where(eq(webhookRetryQueue.id, item.id));
      } else {
        const nextRetryAt = new Date(Date.now() + RETRY_BACKOFF_MS[nextAttempt]!);
        await db.update(webhookRetryQueue).set({
          attemptCount: nextAttempt + 1,
          lastAttemptAt: new Date(),
          nextRetryAt,
        }).where(eq(webhookRetryQueue.id, item.id));
      }
      console.error(`[webhook-retry] Item ${item.id} attempt ${nextAttempt + 1} failed:`, msg);
    }
  }
}

export function startRetryProcessor(): void {
  setInterval(() => void processRetryQueue(), 60_000);
  console.log("[webhook-retry] Retry processor started (60s interval)");
}

export const webhookRouter = Router();

/**
 * Verify GHL webhook signature using HMAC-SHA256.
 * GHL signs the raw request body with the webhook secret and sends it in x-ghl-signature.
 * If GHL_WEBHOOK_SECRET is not configured, verification is skipped (dev/test mode).
 */
function verifyGhlSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!ENV.ghlWebhookSecret) return true; // Skip verification if no secret configured
  if (!signature) return false;
  const expected = createHmac("sha256", ENV.ghlWebhookSecret)
    .update(rawBody)
    .digest("hex");
  return signature === expected;
}

webhookRouter.post("/:provider", async (req, res) => {
  const provider = req.params.provider as string;

  // Verify GHL webhook signature before accepting the payload
  if (provider === "ghl") {
    const sig = req.headers["x-ghl-signature"] as string | undefined;
    const rawBody = (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    if (!verifyGhlSignature(rawBody, sig)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  }

  res.status(200).json({ ok: true });
  const body = req.body as Record<string, unknown>;
  const locationId = String(body.locationId ?? body.location_id ?? "").trim();
  const eventType = String(body.type ?? body.eventType ?? body.event ?? "unknown");
  const eventId = body.id ?? body.eventId ? String(body.id ?? body.eventId) : undefined;

  // Dedup: skip if we already processed this exact event
  if (await isDuplicateEvent(eventId, eventType, locationId)) return;

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
    const tenant = await findTenantByLocationId(locationId);
    try {
      if (provider === "ghl" && (eventType === "CallCompleted" || eventType === "call.completed")) {
        await processCallEvent(body, locationId, ev!.id);
      } else {
        await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ev!.id));
      }
      // Log successful webhook processing
      if (tenant) {
        await db.insert(syncActivityLog).values({
          tenantId: tenant.id,
          layer: "oauth",
          eventType,
          status: "success",
          details: JSON.stringify({ provider, eventId, locationId }),
        });
        // Update lastWebhookAt on tenant
        await db.update(tenants).set({ lastWebhookAt: new Date() }).where(eq(tenants.id, tenant.id));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(webhookEvents).set({ status: "failed", errorMessage: msg, processedAt: new Date() }).where(eq(webhookEvents.id, ev!.id));
      // Log webhook error
      if (tenant) {
        await db.insert(syncActivityLog).values({
          tenantId: tenant.id,
          layer: "oauth",
          eventType,
          status: "error",
          details: JSON.stringify({ provider, error: msg }),
        });
        await enqueueRetry(ev!.id, tenant.id, body, 0);
      } else {
        const fallbackTenant = await findTenantByLocationId(locationId);
        if (fallbackTenant) {
          await enqueueRetry(ev!.id, fallbackTenant.id, body, 0);
        }
      }
    }
  };
  void process();
});
