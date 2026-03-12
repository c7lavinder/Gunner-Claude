/**
 * Webhook Processor — handles webhook jobs from the BullMQ queue.
 * Delegates to the existing webhook handler logic.
 */
import { processRetryQueue } from "./webhook";

export async function processWebhookJob(data: Record<string, unknown>): Promise<void> {
  console.log("[webhookProcessor] Processing webhook job:", data.eventId ?? "unknown");

  // For now, delegate to the existing retry queue processor.
  // Future: process individual webhook events directly from job data.
  await processRetryQueue();
}
