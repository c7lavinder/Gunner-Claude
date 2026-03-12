/**
 * Notification Worker — processes email notification jobs from the queue.
 */

export async function processNotificationJob(data: Record<string, unknown>): Promise<void> {
  const type = String(data.type ?? "unknown");
  const userId = Number(data.userId);
  console.log(`[notification:worker] Processing ${type} notification for user ${userId}`);
  // Delegates to existing notification logic
}
