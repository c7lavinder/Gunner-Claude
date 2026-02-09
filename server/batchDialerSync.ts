import { getCallsSince, fetchCallRecording } from "./batchDialerService";
import { getDb, createCall, getCallByBatchDialerId } from "./db";
import { calls, teamMembers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "./storage";
import { processCall } from "./grading";

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

  // Default to 24 hours ago (to avoid overwhelming with hundreds of calls)
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

/**
 * Map BatchDialer agent name to Gunner team member
 */
async function findTeamMemberByAgentName(agentName: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Try exact match first
  const exactMatch = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.name, agentName))
    .limit(1);

  if (exactMatch.length > 0) {
    return exactMatch[0].id;
  }

  // Try case-insensitive partial match
  const allMembers = await db.select().from(teamMembers);
  const normalizedAgent = agentName.toLowerCase().trim();

  for (const member of allMembers) {
    const normalizedMember = member.name.toLowerCase().trim();
    if (normalizedMember.includes(normalizedAgent) || normalizedAgent.includes(normalizedMember)) {
      return member.id;
    }
  }

  return null;
}

/**
 * Sync calls from BatchDialer
 */
export async function syncBatchDialerCalls(): Promise<{
  imported: number;
  skipped: number;
  errors: number;
}> {
  console.log("[BatchDialer] Starting sync...");
  
  const stats = {
    imported: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const db = await getDb();
    if (!db) {
      console.error("[BatchDialer] Database not available");
      return stats;
    }

    const lastSync = await getLastSyncTime();
    console.log(`[BatchDialer] Fetching calls since ${lastSync.toISOString()}`);

    const batchDialerCalls = await getCallsSince(lastSync);
    console.log(`[BatchDialer] Found ${batchDialerCalls.length} calls`);

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
          console.log(`[BatchDialer] Skipping call ${bdCall.id} - no recording`);
          stats.skipped++;
          continue;
        }

        // Skip if duration is too short (less than 10 seconds)
        if (bdCall.duration < 10) {
          console.log(`[BatchDialer] Skipping call ${bdCall.id} - too short (${bdCall.duration}s)`);
          stats.skipped++;
          continue;
        }

        // Find team member
        let teamMemberId: number | null = null;
        let teamMemberName = "Unknown";

        if (bdCall.agent) {
          teamMemberId = await findTeamMemberByAgentName(bdCall.agent);
          teamMemberName = bdCall.agent;
        }

        if (!teamMemberId) {
          console.log(`[BatchDialer] Could not map agent "${bdCall.agent}" to team member, skipping call ${bdCall.id}`);
          stats.skipped++;
          continue;
        }

        // Download recording
        console.log(`[BatchDialer] Downloading recording for call ${bdCall.id}`);
        const recordingBuffer = await fetchCallRecording(bdCall.id);

        // Upload to S3
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `calls/batchdialer-${bdCall.id}-${timestamp}-${randomSuffix}.mp3`;
        const { url: recordingUrl } = await storagePut(fileKey, recordingBuffer, "audio/mpeg");

        console.log(`[BatchDialer] Uploaded recording to: ${recordingUrl}`);

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
          callType: "qualification", // BatchDialer calls are typically cold calling
          status: "pending",
          callTimestamp: new Date(bdCall.callStartTime),
          callSource: "batchdialer",
          batchDialerCallId: bdCall.id,
          batchDialerCampaignId: bdCall.campaign.id,
          batchDialerCampaignName: bdCall.campaign.name,
          batchDialerAgentName: bdCall.agent || undefined,
        });

        // Process the call asynchronously
        if (newCall) {
          processCall(newCall.id).catch((err: Error) => {
            console.error(`[BatchDialer] Error processing call ${bdCall.id}:`, err);
          });
        }

        stats.imported++;
        console.log(`[BatchDialer] Imported call ${bdCall.id}`);
      } catch (error) {
        console.error(`[BatchDialer] Error importing call ${bdCall.id}:`, error);
        stats.errors++;
      }
    }

    console.log(`[BatchDialer] Sync complete. Imported: ${stats.imported}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  } catch (error) {
    console.error("[BatchDialer] Sync failed:", error);
  }

  return stats;
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
