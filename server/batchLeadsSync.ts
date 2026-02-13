/**
 * BatchLeads Sync Service
 * 
 * Enriches call records with property data from BatchLeads.
 * When a call has a property address, this service looks up property details
 * (estimated value, equity, owner info, etc.) and attaches them to the call record.
 */

import { searchPropertyByAddress } from "./batchLeadsService";
import { getDb } from "./db";
import { calls } from "../drizzle/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { getTenantsWithCrm, parseCrmConfig, getTenantById } from "./tenant";

const POLL_INTERVAL = 60 * 60 * 1000; // 60 minutes (less frequent than BatchDialer since it's enrichment)
let syncInterval: NodeJS.Timeout | null = null;

/**
 * Enrich a single call with BatchLeads property data
 */
async function enrichCallWithPropertyData(
  callId: number,
  propertyAddress: string,
  apiKey: string
): Promise<boolean> {
  try {
    const property = await searchPropertyByAddress(propertyAddress, apiKey);
    if (!property) {
      console.log(`[BatchLeads] No property found for address: ${propertyAddress}`);
      return false;
    }

    const db = await getDb();
    if (!db) return false;

    // Build enrichment data as JSON to store in the call's metadata
    const enrichmentData = {
      batchLeadsPropertyId: property.id,
      ownerFirstName: property.owner_first_name,
      ownerLastName: property.owner_last_name,
      propertyType: property.property_type,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sqft: property.sqft,
      yearBuilt: property.year_built,
      estimatedValue: property.estimated_value,
      estimatedEquity: property.estimated_equity,
      mortgageBalance: property.mortgage_balance,
      lastSaleDate: property.last_sale_date,
      lastSalePrice: property.last_sale_price,
      ownerOccupied: property.owner_occupied,
      vacant: property.vacant,
      enrichedAt: new Date().toISOString(),
    };

    // Update the call record with enrichment data
    await db
      .update(calls)
      .set({
        batchLeadsEnrichment: JSON.stringify(enrichmentData),
      })
      .where(eq(calls.id, callId));

    console.log(`[BatchLeads] Enriched call ${callId} with property data (value: $${property.estimated_value || 'N/A'})`);
    return true;
  } catch (error) {
    console.error(`[BatchLeads] Error enriching call ${callId}:`, error);
    return false;
  }
}

/**
 * Sync BatchLeads property data for a specific tenant
 * Finds calls with property addresses that haven't been enriched yet
 */
export async function syncBatchLeadsForTenant(
  tenantId: number
): Promise<{ enriched: number; skipped: number; errors: number }> {
  const stats = { enriched: 0, skipped: 0, errors: 0 };

  try {
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      console.error(`[BatchLeads] Tenant ${tenantId} not found`);
      return stats;
    }

    const config = parseCrmConfig({ crmConfig: tenant.crmConfig as string | null });
    if (!config.batchLeadsApiKey) {
      console.log(`[BatchLeads] Tenant ${tenantId}: No BatchLeads API key configured`);
      return stats;
    }

    const db = await getDb();
    if (!db) {
      console.error(`[BatchLeads] Database not available`);
      return stats;
    }

    // Find calls with property addresses that haven't been enriched
    const unenrichedCalls = await db
      .select({
        id: calls.id,
        propertyAddress: calls.propertyAddress,
      })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          isNotNull(calls.propertyAddress),
          isNull(calls.batchLeadsEnrichment)
        )
      )
      .orderBy(desc(calls.createdAt))
      .limit(50); // Process in batches of 50

    console.log(`[BatchLeads] Tenant ${tenantId}: Found ${unenrichedCalls.length} calls to enrich`);

    for (const call of unenrichedCalls) {
      if (!call.propertyAddress) {
        stats.skipped++;
        continue;
      }

      try {
        const success = await enrichCallWithPropertyData(
          call.id,
          call.propertyAddress,
          config.batchLeadsApiKey
        );

        if (success) {
          stats.enriched++;
        } else {
          stats.skipped++;
        }

        // Rate limit: 500ms between API calls
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[BatchLeads] Error enriching call ${call.id}:`, error);
        stats.errors++;
      }
    }

    console.log(`[BatchLeads] Tenant ${tenantId}: Enrichment complete. Enriched: ${stats.enriched}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  } catch (error) {
    console.error(`[BatchLeads] Tenant ${tenantId}: Sync failed:`, error);
  }

  return stats;
}

/**
 * Sync BatchLeads across all tenants with BatchLeads configured
 */
export async function syncBatchLeadsCalls(): Promise<{
  enriched: number;
  skipped: number;
  errors: number;
}> {
  console.log("[BatchLeads] Starting enrichment sync...");

  const totalStats = { enriched: 0, skipped: 0, errors: 0 };

  try {
    const crmTenants = await getTenantsWithCrm();

    for (const tenant of crmTenants) {
      const config = parseCrmConfig(tenant);
      if (!config.batchLeadsApiKey) {
        continue; // Tenant doesn't have BatchLeads configured
      }

      const stats = await syncBatchLeadsForTenant(tenant.id);

      totalStats.enriched += stats.enriched;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;
    }

    console.log(`[BatchLeads] Sync complete. Enriched: ${totalStats.enriched}, Skipped: ${totalStats.skipped}, Errors: ${totalStats.errors}`);
  } catch (error) {
    console.error("[BatchLeads] Sync failed:", error);
  }

  return totalStats;
}

/**
 * Start automatic polling for BatchLeads enrichment
 */
export function startBatchLeadsPolling() {
  if (syncInterval) {
    console.log("[BatchLeads] Polling already running");
    return;
  }

  console.log(`[BatchLeads] Starting automatic polling (every ${POLL_INTERVAL / 1000 / 60} minutes)`);

  // Run initial sync after 2 minutes (stagger with BatchDialer)
  setTimeout(() => {
    syncBatchLeadsCalls().catch(err => {
      console.error("[BatchLeads] Initial sync failed:", err);
    });
  }, 2 * 60 * 1000);

  // Then run every 60 minutes
  syncInterval = setInterval(() => {
    syncBatchLeadsCalls().catch(err => {
      console.error("[BatchLeads] Scheduled sync failed:", err);
    });
  }, POLL_INTERVAL);
}

/**
 * Stop automatic polling
 */
export function stopBatchLeadsPolling() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[BatchLeads] Polling stopped");
  }
}
