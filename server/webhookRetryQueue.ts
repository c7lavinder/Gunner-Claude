/**
 * Webhook Retry Queue Service
 * 
 * Stores failed Gunner Engine webhooks and retries them with exponential backoff.
 * Retry schedule: 1min, 5min, 15min, 1hr, 6hr (max 5 attempts)
 */

import { getDb } from "./db";
import { webhookRetryQueue, calls, tenants } from "../drizzle/schema";
import { eq, and, lte, sql } from "drizzle-orm";

// Default webhook URL — used when tenant has no custom engineWebhookUrl
const DEFAULT_ENGINE_WEBHOOK_URL = "https://gunner-engine-production.up.railway.app/webhooks/gunner/call-graded";

/**
 * Get the webhook URL for a given tenant.
 */
async function getWebhookUrlForTenant(tenantId: number): Promise<string> {
  try {
    const { getTenantById, parseCrmConfig } = await import("./tenant");
    const tenant = await getTenantById(tenantId);
    if (!tenant) return DEFAULT_ENGINE_WEBHOOK_URL;
    const config = parseCrmConfig(tenant);
    return config.engineWebhookUrl || DEFAULT_ENGINE_WEBHOOK_URL;
  } catch {
    return DEFAULT_ENGINE_WEBHOOK_URL;
  }
}

// Retry schedule in milliseconds
const RETRY_DELAYS = [
  1 * 60 * 1000,      // 1 minute
  5 * 60 * 1000,      // 5 minutes
  15 * 60 * 1000,     // 15 minutes
  60 * 60 * 1000,     // 1 hour
  6 * 60 * 60 * 1000, // 6 hours
];

const MAX_ATTEMPTS = 5;

let retryInterval: NodeJS.Timeout | null = null;

/**
 * Queue a failed webhook for retry
 */
export async function queueFailedWebhook(
  tenantId: number,
  callId: number,
  payload: Record<string, unknown>,
  error: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.error("[Webhook Retry] Database not available");
      return;
    }

    // Calculate next retry time (1 minute from now for first attempt)
    const nextRetryAt = new Date(Date.now() + RETRY_DELAYS[0]);

    await db.insert(webhookRetryQueue).values({
      tenantId,
      callId,
      payload: JSON.stringify(payload),
      attemptCount: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextRetryAt,
      status: "pending",
      lastError: error,
    });

    console.log(`[Webhook Retry] Queued webhook for call ${callId}, next retry at ${nextRetryAt.toISOString()}`);
  } catch (error) {
    console.error(`[Webhook Retry] Failed to queue webhook for call ${callId}:`, error);
  }
}

/**
 * Retry a single webhook
 */
async function retryWebhook(
  queueItem: typeof webhookRetryQueue.$inferSelect
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = JSON.parse(queueItem.payload);
    
    const webhookUrl = await getWebhookUrlForTenant(queueItem.tenantId);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = await response.json();
    console.log(`[Webhook Retry] Success for call ${queueItem.callId}:`, result);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process the retry queue
 */
export async function processRetryQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  pending: number;
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0, pending: 0 };

  try {
    const db = await getDb();
    if (!db) {
      console.error("[Webhook Retry] Database not available");
      return stats;
    }

    // Find all pending webhooks that are ready to retry
    const now = new Date();
    const pendingWebhooks = await db
      .select()
      .from(webhookRetryQueue)
      .where(
        and(
          eq(webhookRetryQueue.status, "pending"),
          lte(webhookRetryQueue.nextRetryAt, now)
        )
      )
      .limit(50); // Process in batches of 50

    if (pendingWebhooks.length === 0) {
      return stats;
    }

    console.log(`[Webhook Retry] Processing ${pendingWebhooks.length} pending webhooks`);

    for (const webhook of pendingWebhooks) {
      stats.processed++;

      const result = await retryWebhook(webhook);

      if (result.success) {
        // Mark as delivered
        await db
          .update(webhookRetryQueue)
          .set({
            status: "delivered",
            lastAttemptAt: now,
            attemptCount: webhook.attemptCount + 1,
          })
          .where(eq(webhookRetryQueue.id, webhook.id));

        stats.succeeded++;
        console.log(`[Webhook Retry] Delivered webhook for call ${webhook.callId} after ${webhook.attemptCount + 1} attempts`);
      } else {
        // Check if we've exceeded max attempts
        const newAttemptCount = webhook.attemptCount + 1;
        
        if (newAttemptCount >= MAX_ATTEMPTS) {
          // Mark as failed
          await db
            .update(webhookRetryQueue)
            .set({
              status: "failed",
              lastAttemptAt: now,
              attemptCount: newAttemptCount,
              lastError: result.error || "Max attempts exceeded",
            })
            .where(eq(webhookRetryQueue.id, webhook.id));

          stats.failed++;
          console.error(`[Webhook Retry] Failed webhook for call ${webhook.callId} after ${newAttemptCount} attempts: ${result.error}`);
        } else {
          // Schedule next retry with exponential backoff
          const nextDelay = RETRY_DELAYS[newAttemptCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          const nextRetryAt = new Date(Date.now() + nextDelay);

          await db
            .update(webhookRetryQueue)
            .set({
              lastAttemptAt: now,
              attemptCount: newAttemptCount,
              nextRetryAt,
              lastError: result.error || "Unknown error",
            })
            .where(eq(webhookRetryQueue.id, webhook.id));

          stats.pending++;
          console.log(`[Webhook Retry] Retry ${newAttemptCount}/${MAX_ATTEMPTS} failed for call ${webhook.callId}. Next retry at ${nextRetryAt.toISOString()}`);
        }
      }

      // Rate limit: 500ms between retries
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Webhook Retry] Processed: ${stats.processed}, Succeeded: ${stats.succeeded}, Failed: ${stats.failed}, Pending: ${stats.pending}`);
  } catch (error) {
    console.error("[Webhook Retry] Error processing queue:", error);
  }

  return stats;
}

/**
 * Start automatic retry queue processing
 */
export function startWebhookRetryQueue() {
  if (retryInterval) {
    console.log("[Webhook Retry] Queue processing already running");
    return;
  }

  console.log("[Webhook Retry] Starting automatic queue processing (every 5 minutes)");

  // Run initial processing after 30 seconds
  setTimeout(() => {
    processRetryQueue().catch(err => {
      console.error("[Webhook Retry] Initial processing failed:", err);
    });
  }, 30 * 1000);

  // Then run every 5 minutes
  retryInterval = setInterval(() => {
    processRetryQueue().catch(err => {
      console.error("[Webhook Retry] Scheduled processing failed:", err);
    });
  }, 5 * 60 * 1000);
}

/**
 * Stop automatic retry queue processing
 */
export function stopWebhookRetryQueue() {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
    console.log("[Webhook Retry] Queue processing stopped");
  }
}

/**
 * Get retry queue status for a tenant (admin only)
 */
export async function getRetryQueueStatus(tenantId: number): Promise<{
  pending: number;
  delivered: number;
  failed: number;
  recentFailures: Array<{
    callId: number;
    attemptCount: number;
    lastError: string | null;
    nextRetryAt: Date;
    createdAt: Date;
  }>;
}> {
  const db = await getDb();
  if (!db) {
    return { pending: 0, delivered: 0, failed: 0, recentFailures: [] };
  }

  const [pendingCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(webhookRetryQueue)
    .where(
      and(
        eq(webhookRetryQueue.tenantId, tenantId),
        eq(webhookRetryQueue.status, "pending")
      )
    );

  const [deliveredCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(webhookRetryQueue)
    .where(
      and(
        eq(webhookRetryQueue.tenantId, tenantId),
        eq(webhookRetryQueue.status, "delivered")
      )
    );

  const [failedCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(webhookRetryQueue)
    .where(
      and(
        eq(webhookRetryQueue.tenantId, tenantId),
        eq(webhookRetryQueue.status, "failed")
      )
    );

  const recentFailures = await db
    .select({
      callId: webhookRetryQueue.callId,
      attemptCount: webhookRetryQueue.attemptCount,
      lastError: webhookRetryQueue.lastError,
      nextRetryAt: webhookRetryQueue.nextRetryAt,
      createdAt: webhookRetryQueue.createdAt,
    })
    .from(webhookRetryQueue)
    .where(
      and(
        eq(webhookRetryQueue.tenantId, tenantId),
        eq(webhookRetryQueue.status, "failed")
      )
    )
    .limit(10)
    .orderBy(webhookRetryQueue.createdAt);

  return {
    pending: Number(pendingCount?.count || 0),
    delivered: Number(deliveredCount?.count || 0),
    failed: Number(failedCount?.count || 0),
    recentFailures: recentFailures.map(f => ({
      ...f,
      nextRetryAt: new Date(f.nextRetryAt),
      createdAt: new Date(f.createdAt),
    })),
  };
}
