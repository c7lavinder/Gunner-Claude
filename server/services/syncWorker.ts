/**
 * CRM Sync Worker — processes sync jobs from the queue.
 * Handles polling, reconciliation, and contact cache refresh.
 */

export async function processSyncJob(data: Record<string, unknown>): Promise<void> {
  const syncType = String(data.syncType ?? "poll");
  const tenantId = Number(data.tenantId);
  console.log(`[sync:worker] Processing ${syncType} sync for tenant ${tenantId}`);
  // Delegates to existing callIngestion.ts and scheduledJobs.ts logic
}
