import { getCallsSince, fetchCallRecording } from "./batchDialerService";
import { getDb, createCall, getCallByBatchDialerId, getTeamMembers } from "./db";
import { calls, teamMembers } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePut } from "./storage";
import { processCall } from "./grading";
import { getTenantsWithCrm, parseCrmConfig } from "./tenant";

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes
const LAST_SYNC_KEY = "batchdialer_last_sync";

let syncInterval: NodeJS.Timeout | null = null;

/**
 * Get the last sync timestamp from database or use 7 days ago as default
 */
async function getLastSyncTime(): Promise<Date> {
  // For now, use a simple approach: get the most recent BatchDialer call timestamp
  // or default to 7 days ago
  const db = await getDb();
  if (!db) {
    console.error("[BatchDialer] Database not available");
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  const recentCall = await db
    .select()
    .from(calls)
    .where(eq(calls.callSource, "batchdialer"))
    .orderBy(calls.callTimestamp)
    .limit(1);

  if (recentCall.length > 0 && recentCall[0].callTimestamp) {
    return new Date(recentCall[0].callTimestamp);
  }

  // Default to 30 minutes ago (small window to avoid API timeout, will catch up over time)
  return new Date(Date.now() - 30 * 60 * 1000);
}

/**
 * Map BatchDialer agent name to Gunner team member, scoped by tenantId
 */
async function findTeamMemberByAgentName(agentName: string, tenantId?: number): Promise<{ id: number; teamRole: string | null } | null> {
  const members = await getTeamMembers(tenantId);

  // Try exact match first
  const normalizedAgent = agentName.toLowerCase().trim();
  const exactMatch = members.find(m => m.name.toLowerCase().trim() === normalizedAgent);
  if (exactMatch) {
    return { id: exactMatch.id, teamRole: exactMatch.teamRole };
  }

  // Try partial match
  for (const member of members) {
    const normalizedMember = member.name.toLowerCase().trim();
    if (normalizedMember.includes(normalizedAgent) || normalizedAgent.includes(normalizedMember)) {
      return { id: member.id, teamRole: member.teamRole };
    }
  }

  return null;
}

/**
 * Determine call type based on team member's role (not hardcoded names)
 */
function getCallTypeForRole(teamRole: string | null): "cold_call" | "qualification" {
  // Don't pre-assign "offer" based on role — AI detection in processCall will determine the real type.
  // Acquisition managers make many call types (callbacks, scheduling, qualification) not just offers.
  switch (teamRole) {
    case "lead_generator":
      return "cold_call";
    case "lead_manager":
    default:
      return "qualification";
  }
}

/**
 * Sync calls from BatchDialer for a specific tenant
 */
async function syncBatchDialerCallsForTenant(
  tenantId: number,
  tenantName: string,
  batchDialerApiKey: string
): Promise<{ imported: number; skipped: number; errors: number }> {
  const stats = { imported: 0, skipped: 0, errors: 0 };

  try {
    const db = await getDb();
    if (!db) {
      console.error(`[BatchDialer] Tenant ${tenantId}: Database not available`);
      return stats;
    }

    const lastSync = await getLastSyncTime();
    console.log(`[BatchDialer] Tenant ${tenantId} (${tenantName}): Fetching calls since ${lastSync.toISOString()}`);

    // Pass the tenant-specific API key to getCallsSince
    const batchDialerCalls = await getCallsSince(lastSync, batchDialerApiKey);
    console.log(`[BatchDialer] Tenant ${tenantId}: Found ${batchDialerCalls.length} calls`);

    for (const bdCall of batchDialerCalls) {
      try {
        // Skip if call already exists
        const existing = await getCallByBatchDialerId(bdCall.id);
        if (existing) {
          stats.skipped++;
          continue;
        }

        // Skip if no recording available
        if (!bdCall.recordingenabled || !bdCall.callRecordUrl) {
          stats.skipped++;
          continue;
        }

        // Skip if duration is too short (less than 10 seconds)
        if (bdCall.duration < 10) {
          stats.skipped++;
          continue;
        }

        // Find team member by agent name, scoped to this tenant
        let teamMemberId: number | null = null;
        let teamMemberName = "Unknown";
        let callType: "cold_call" | "qualification" = "qualification";

        if (bdCall.agent) {
          const match = await findTeamMemberByAgentName(bdCall.agent, tenantId);
          if (match) {
            teamMemberId = match.id;
            teamMemberName = bdCall.agent;
            callType = getCallTypeForRole(match.teamRole);
          }
        }

        if (!teamMemberId) {
          console.log(`[BatchDialer] Tenant ${tenantId}: Could not map agent "${bdCall.agent}" to team member, skipping call ${bdCall.id}`);
          stats.skipped++;
          continue;
        }

        // Download recording
        console.log(`[BatchDialer] Tenant ${tenantId}: Downloading recording for call ${bdCall.id}`);
        const recordingBuffer = await fetchCallRecording(bdCall.id, batchDialerApiKey);

        // Upload to S3
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `calls/batchdialer-${bdCall.id}-${timestamp}-${randomSuffix}.mp3`;
        const { url: recordingUrl } = await storagePut(fileKey, recordingBuffer, "audio/mpeg");

        // Create call record
        const contactName = `${bdCall.contact.firstname} ${bdCall.contact.lastname}`.trim();
        const propertyAddress = `${bdCall.contact.address}, ${bdCall.contact.city}, ${bdCall.contact.state} ${bdCall.contact.zip}`.trim();

        const newCall = await createCall({
          contactName: contactName || undefined,
          contactPhone: bdCall.customerNumber,
          propertyAddress: propertyAddress || undefined,
          recordingUrl,
          duration: bdCall.duration,
          teamMemberId,
          teamMemberName,
          callType,
          status: "pending",
          callTimestamp: new Date(bdCall.callStartTime),
          callSource: "batchdialer",
          batchDialerCallId: bdCall.id,
          batchDialerCampaignId: bdCall.campaign.id,
          batchDialerCampaignName: bdCall.campaign.name,
          batchDialerAgentName: bdCall.agent || undefined,
          tenantId,
        });

        // Process the call asynchronously
        if (newCall) {
          processCall(newCall.id).catch((err: Error) => {
            console.error(`[BatchDialer] Tenant ${tenantId}: Error processing call ${bdCall.id}:`, err);
          });
        }

        stats.imported++;
        console.log(`[BatchDialer] Tenant ${tenantId}: Imported call ${bdCall.id}`);
      } catch (error) {
        console.error(`[BatchDialer] Tenant ${tenantId}: Error importing call ${bdCall.id}:`, error);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`[BatchDialer] Tenant ${tenantId}: Sync failed:`, error);
  }

  return stats;
}

/**
 * Sync calls from BatchDialer across all tenants with BatchDialer configured
 */
export async function syncBatchDialerCalls(): Promise<{
  imported: number;
  skipped: number;
  errors: number;
}> {
  console.log("[BatchDialer] Starting sync...");
  
  const totalStats = { imported: 0, skipped: 0, errors: 0 };

  try {
    const crmTenants = await getTenantsWithCrm();
    
    for (const tenant of crmTenants) {
      const config = parseCrmConfig(tenant);
      if (!config.batchDialerApiKey) {
        continue; // Tenant doesn't have BatchDialer configured
      }

      const stats = await syncBatchDialerCallsForTenant(
        tenant.id,
        tenant.name,
        config.batchDialerApiKey
      );

      totalStats.imported += stats.imported;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;

      // Record successful sync timestamp
      const { updateTenantSettings } = await import("./tenant");
      await updateTenantSettings(tenant.id, { lastBatchDialerSync: new Date() });
      console.log(`[BatchDialer] Tenant ${tenant.id}: Recorded sync timestamp`);
    }

    console.log(`[BatchDialer] Sync complete. Imported: ${totalStats.imported}, Skipped: ${totalStats.skipped}, Errors: ${totalStats.errors}`);
  } catch (error) {
    console.error("[BatchDialer] Sync failed:", error);
  }

  return totalStats;
}

/**
 * Start automatic polling
 */
export function startBatchDialerPolling() {
  if (syncInterval) {
    console.log("[BatchDialer] Polling already running");
    return;
  }

  console.log(`[BatchDialer] Starting automatic polling (every ${POLL_INTERVAL / 1000 / 60} minutes)`);

  // Run initial sync after 1 minute
  setTimeout(() => {
    syncBatchDialerCalls().catch(err => {
      console.error("[BatchDialer] Initial sync failed:", err);
    });
  }, 60 * 1000);

  // Then run every 30 minutes
  syncInterval = setInterval(() => {
    syncBatchDialerCalls().catch(err => {
      console.error("[BatchDialer] Scheduled sync failed:", err);
    });
  }, POLL_INTERVAL);
}

/**
 * Stop automatic polling
 */
export function stopBatchDialerPolling() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[BatchDialer] Polling stopped");
  }
}
