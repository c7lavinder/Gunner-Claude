import { fetchCallRecording, getAgentName, type BatchDialerCall } from "./batchDialerService";
import { getDb, createCall, getCallByBatchDialerId, getTeamMembers } from "./db";
import { calls } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { storagePut } from "./storage";
import { processCall } from "./grading";
import { getTenantsWithCrm, parseCrmConfig } from "./tenant";
import { ENV } from "./_core/env";

// ============ CONFIGURATION ============

/** Poll every 2 minutes to keep up with high call volume */
const POLL_INTERVAL = 2 * 60 * 1000;

/** Only import calls with these dispositions (actual conversations) */
const TARGET_DISPOSITIONS = new Set([
  "interested in selling",
  "follow up",
  "not selling",
  "call back",
]);

/** Track the highest call ID we've seen to avoid re-processing */
let lastSeenCallId: number | null = null;

let syncInterval: NodeJS.Timeout | null = null;

/** Prevent concurrent sync runs */
let isSyncing = false;

// ============ HELPERS ============

/**
 * Initialize lastSeenCallId from the database (most recent batchdialer call)
 */
async function initLastSeenCallId(): Promise<void> {
  if (lastSeenCallId !== null) return;

  const db = await getDb();
  if (!db) return;

  const recentCall = await db
    .select({ batchDialerCallId: calls.batchDialerCallId })
    .from(calls)
    .where(eq(calls.callSource, "batchdialer"))
    .orderBy(desc(calls.batchDialerCallId))
    .limit(1);

  if (recentCall.length > 0 && recentCall[0].batchDialerCallId) {
    lastSeenCallId = recentCall[0].batchDialerCallId;
    console.log(`[BatchDialer] Initialized lastSeenCallId from DB: ${lastSeenCallId}`);
  }
}

/**
 * Fetch the latest 200 calls from BatchDialer (2 pages of 100).
 * The v2/cdrs endpoint without date filters returns the most recent calls first.
 * Date filters are broken in the API so we don't use them.
 */
async function fetchLatest200Calls(apiKey: string): Promise<BatchDialerCall[]> {
  const allCalls: BatchDialerCall[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams({ pagelength: "100" });
    if (cursor) params.append("next_page", cursor);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(
        `https://app.batchdialer.com/api/v2/cdrs?${params.toString()}`,
        {
          headers: { "X-ApiKey": apiKey, Accept: "application/json" },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`BatchDialer V2 API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const items: BatchDialerCall[] = data.items || (Array.isArray(data) ? data : []);
      if (items.length === 0) break;

      allCalls.push(...items);
      cursor = data.nextPage;
      if (!cursor) break;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  return allCalls;
}

/**
 * Map BatchDialer agent name to Gunner team member, scoped by tenantId
 */
async function findTeamMemberByAgentName(
  agentName: string,
  tenantId?: number
): Promise<{ id: number; teamRole: string | null } | null> {
  const members = await getTeamMembers(tenantId);
  const normalizedAgent = agentName.toLowerCase().trim();

  // Exact match
  const exactMatch = members.find(
    (m) => m.name.toLowerCase().trim() === normalizedAgent
  );
  if (exactMatch) return { id: exactMatch.id, teamRole: exactMatch.teamRole };

  // Partial match
  for (const member of members) {
    const normalizedMember = member.name.toLowerCase().trim();
    if (
      normalizedMember.includes(normalizedAgent) ||
      normalizedAgent.includes(normalizedMember)
    ) {
      return { id: member.id, teamRole: member.teamRole };
    }
  }

  return null;
}

/**
 * Determine call type based on team member's role
 */
function getCallTypeForRole(teamRole: string | null): "cold_call" | "qualification" {
  switch (teamRole) {
    case "lead_generator":
      return "cold_call";
    case "lead_manager":
    default:
      return "qualification";
  }
}

/**
 * Resolve the BatchDialer API key for a tenant.
 */
function resolveBatchDialerApiKey(
  tenantConfig: ReturnType<typeof parseCrmConfig>
): string | null {
  if (tenantConfig.batchDialerApiKey) return tenantConfig.batchDialerApiKey;
  if (ENV.batchDialerApiKey) return ENV.batchDialerApiKey;
  return null;
}

// ============ SYNC LOGIC ============

/**
 * Sync calls from BatchDialer for a specific tenant.
 * 
 * Strategy:
 * - Fetch the latest 200 calls (API max) from /v2/cdrs (no date filter — it's broken)
 * - Filter to only the 4 target dispositions (Interested in Selling, Follow Up, Not Selling, Call Back)
 * - Skip calls we've already seen (by tracking lastSeenCallId)
 * - Skip calls with no recording or duration < 10s
 * - Handle recording 404s gracefully (skip the call, don't error)
 * 
 * With ~50 calls/minute and 200-call window, we see ~4 minutes of history.
 * Polling every 2 minutes ensures we never miss a call.
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

    // Fetch latest 200 calls
    console.log(
      `[BatchDialer] Tenant ${tenantId} (${tenantName}): Fetching latest 200 calls`
    );
    const allCalls = await fetchLatest200Calls(batchDialerApiKey);
    console.log(
      `[BatchDialer] Tenant ${tenantId}: Got ${allCalls.length} calls`
    );

    // Filter to target dispositions only
    const targetCalls = allCalls.filter((c) => {
      const d = (c.disposition || "").toLowerCase().trim();
      return TARGET_DISPOSITIONS.has(d);
    });
    console.log(
      `[BatchDialer] Tenant ${tenantId}: ${targetCalls.length} calls with target dispositions`
    );

    // Filter out calls we've already seen (by ID)
    const newCalls = lastSeenCallId
      ? targetCalls.filter((c) => c.id > lastSeenCallId!)
      : targetCalls;
    console.log(
      `[BatchDialer] Tenant ${tenantId}: ${newCalls.length} new calls (lastSeenCallId: ${lastSeenCallId})`
    );

    // Track the highest ID from this batch
    let maxId = lastSeenCallId || 0;
    for (const c of allCalls) {
      if (c.id > maxId) maxId = c.id;
    }

    for (const bdCall of newCalls) {
      try {
        // Double-check: skip if call already exists in DB
        const existing = await getCallByBatchDialerId(bdCall.id);
        if (existing) {
          stats.skipped++;
          continue;
        }

        // Skip if no recording available
        if (!bdCall.recordingenabled || !bdCall.callRecordUrl) {
          console.log(
            `[BatchDialer] Tenant ${tenantId}: Call ${bdCall.id} has no recording, skipping`
          );
          stats.skipped++;
          continue;
        }

        // Skip if duration is too short (less than 10 seconds)
        if (bdCall.duration < 10) {
          console.log(
            `[BatchDialer] Tenant ${tenantId}: Call ${bdCall.id} too short (${bdCall.duration}s), skipping`
          );
          stats.skipped++;
          continue;
        }

        // Extract agent name
        const agentName = getAgentName(bdCall.agent);

        // Find team member by agent name
        let teamMemberId: number | null = null;
        let teamMemberName = "Unknown";
        let callType: "cold_call" | "qualification" = "qualification";

        if (agentName) {
          const match = await findTeamMemberByAgentName(agentName, tenantId);
          if (match) {
            teamMemberId = match.id;
            teamMemberName = agentName;
            callType = getCallTypeForRole(match.teamRole);
          }
        }

        if (!teamMemberId) {
          console.log(
            `[BatchDialer] Tenant ${tenantId}: Could not map agent "${agentName}" to team member, skipping call ${bdCall.id}`
          );
          stats.skipped++;
          continue;
        }

        // Download recording — handle 404 gracefully
        console.log(
          `[BatchDialer] Tenant ${tenantId}: Downloading recording for call ${bdCall.id} (${agentName}, ${bdCall.disposition}, ${bdCall.duration}s)`
        );
        let recordingBuffer: Buffer;
        try {
          recordingBuffer = await fetchCallRecording(bdCall.id, batchDialerApiKey);
        } catch (recError: any) {
          if (
            recError.message?.includes("404") ||
            recError.message?.includes("Not Found")
          ) {
            console.log(
              `[BatchDialer] Tenant ${tenantId}: Recording 404 for call ${bdCall.id}, skipping (may not be ready yet)`
            );
            stats.skipped++;
            continue;
          }
          throw recError; // Re-throw non-404 errors
        }

        // Upload to S3
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `calls/batchdialer-${bdCall.id}-${timestamp}-${randomSuffix}.mp3`;
        const { url: recordingUrl } = await storagePut(
          fileKey,
          recordingBuffer,
          "audio/mpeg"
        );

        // Create call record
        const contactName =
          `${bdCall.contact.firstname} ${bdCall.contact.lastname}`.trim();
        const propertyAddress =
          `${bdCall.contact.address}, ${bdCall.contact.city}, ${bdCall.contact.state} ${bdCall.contact.zip}`.trim();

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
          batchDialerAgentName: agentName || undefined,
          tenantId,
        });

        // Process the call asynchronously
        if (newCall) {
          processCall(newCall.id).catch((err: Error) => {
            console.error(
              `[BatchDialer] Tenant ${tenantId}: Error processing call ${bdCall.id}:`,
              err
            );
          });
        }

        stats.imported++;
        console.log(
          `[BatchDialer] Tenant ${tenantId}: Imported call ${bdCall.id} (${agentName}, ${bdCall.disposition}, ${bdCall.duration}s)`
        );
      } catch (error: any) {
        // Handle duplicate entry errors gracefully (unique index on batchDialerCallId)
        if (error?.message?.includes('Duplicate entry') || error?.cause?.message?.includes('Duplicate entry')) {
          console.log(`[BatchDialer] Tenant ${tenantId}: Skipping duplicate call ${bdCall.id}`);
          stats.skipped++;
        } else {
          console.error(
            `[BatchDialer] Tenant ${tenantId}: Error importing call ${bdCall.id}:`,
            error
          );
          stats.errors++;
        }
      }
    }

    // Update lastSeenCallId after processing
    if (maxId > (lastSeenCallId || 0)) {
      lastSeenCallId = maxId;
    }
  } catch (error) {
    console.error(`[BatchDialer] Tenant ${tenantId}: Sync failed:`, error);
  }

  return stats;
}

/**
 * Sync calls from BatchDialer across all tenants with BatchDialer configured.
 */
export async function syncBatchDialerCalls(): Promise<{
  imported: number;
  skipped: number;
  errors: number;
}> {
  // Prevent concurrent sync runs
  if (isSyncing) {
    console.log("[BatchDialer] Sync already in progress, skipping");
    return { imported: 0, skipped: 0, errors: 0 };
  }
  isSyncing = true;

  console.log("[BatchDialer] Starting sync...");

  const totalStats = { imported: 0, skipped: 0, errors: 0 };

  try {
    // Initialize lastSeenCallId from DB on first run
    await initLastSeenCallId();

    const crmTenants = await getTenantsWithCrm();
    let processedAny = false;

    for (const tenant of crmTenants) {
      const config = parseCrmConfig(tenant);
      const apiKey = resolveBatchDialerApiKey(config);

      if (!apiKey) {
        continue;
      }

      processedAny = true;
      console.log(
        `[BatchDialer] Syncing tenant ${tenant.id} (${tenant.name}) with ${
          config.batchDialerApiKey ? "tenant-specific" : "global"
        } API key`
      );

      const stats = await syncBatchDialerCallsForTenant(
        tenant.id,
        tenant.name,
        apiKey
      );

      totalStats.imported += stats.imported;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;

      // Record successful sync timestamp
      const { updateTenantSettings } = await import("./tenant");
      await updateTenantSettings(tenant.id, {
        lastBatchDialerSync: new Date(),
      });
    }

    if (!processedAny) {
      console.log(
        "[BatchDialer] No tenants with BatchDialer API key configured"
      );
    }

    console.log(
      `[BatchDialer] Sync complete. Imported: ${totalStats.imported}, Skipped: ${totalStats.skipped}, Errors: ${totalStats.errors}`
    );
  } catch (error) {
    console.error("[BatchDialer] Sync failed:", error);
  } finally {
    isSyncing = false;
  }

  return totalStats;
}

/**
 * Start automatic polling every 2 minutes
 */
export function startBatchDialerPolling() {
  if (syncInterval) {
    console.log("[BatchDialer] Polling already running");
    return;
  }

  console.log(
    `[BatchDialer] Starting automatic polling (every ${POLL_INTERVAL / 1000} seconds)`
  );

  // Run initial sync after 30 seconds (give server time to start)
  setTimeout(() => {
    syncBatchDialerCalls().catch((err) => {
      console.error("[BatchDialer] Initial sync failed:", err);
    });
  }, 30 * 1000);

  // Then run every 2 minutes
  syncInterval = setInterval(() => {
    syncBatchDialerCalls().catch((err) => {
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
