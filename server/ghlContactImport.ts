/**
 * GHL Property Bulk Import
 * 
 * Pulls property data from GHL opportunities in a specified pipeline,
 * fetches linked contact for seller info, extracts source/market/type from tags,
 * and upserts into dispo_properties.
 * 
 * Architecture: Gunner stores properties. GHL is the CRM for contacts.
 * Each GHL opportunity = one property. The linked contact = the seller.
 * Business name field on the contact = the property address (GHL convention).
 * Duplicate detection by address — no duplicate addresses allowed.
 */

import { getDb } from "./db";
import { dispoProperties, propertyStageHistory } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { ghlFetch, getCredentialsForTenant, getPipelinesForTenant } from "./ghlActions";

// ============ SOURCE NORMALIZATION ============

/**
 * Normalize messy GHL source strings into clean categories.
 * GHL source field can be "PropertyLeads.com", "propertyleads", "PPL - PropertyLeads", etc.
 */
const SOURCE_NORMALIZATION_MAP: Record<string, string> = {
  // PropertyLeads variants
  "propertyleads": "PropertyLeads",
  "propertyleads.com": "PropertyLeads",
  "ppl": "PropertyLeads",
  "ppl - propertyleads": "PropertyLeads",
  "property leads": "PropertyLeads",
  // MotivatedSellers variants
  "motivatedsellers": "MotivatedSellers",
  "motivated sellers": "MotivatedSellers",
  "motivated": "MotivatedSellers",
  // BatchDialer variants
  "batchdialer": "BatchDialer",
  "batch dialer": "BatchDialer",
  "batch": "BatchDialer",
  "cold call": "BatchDialer",
  "cold calling": "BatchDialer",
  // BatchLeads variants
  "batchleads": "BatchLeads",
  "batch leads": "BatchLeads",
  // Web Form variants
  "web form": "Web Form",
  "webform": "Web Form",
  "website": "Web Form",
  "web": "Web Form",
  "form": "Web Form",
  "landing page": "Web Form",
  // Referral variants
  "referral": "Referral",
  "referrals": "Referral",
  "referred": "Referral",
  "word of mouth": "Referral",
  // Direct Mail variants
  "direct mail": "Direct Mail",
  "directmail": "Direct Mail",
  "mail": "Direct Mail",
  "mailer": "Direct Mail",
  // Driving for Dollars
  "driving for dollars": "Driving for Dollars",
  "d4d": "Driving for Dollars",
  "dfd": "Driving for Dollars",
  // Bandit Signs
  "bandit sign": "Bandit Signs",
  "bandit signs": "Bandit Signs",
  "bandit": "Bandit Signs",
  // Social Media
  "facebook": "Social Media",
  "instagram": "Social Media",
  "social media": "Social Media",
  "social": "Social Media",
};

export function normalizeSource(rawSource: string): string {
  if (!rawSource) return "Unknown";
  const lower = rawSource.toLowerCase().trim();
  return SOURCE_NORMALIZATION_MAP[lower] || rawSource.trim();
}

// ============ TAG PARSING ============

/**
 * Extract tagged values from contact tags array.
 * Data Hygiene applies tags like: source:PropertyLeads, market:Nashville, type:House
 */
export function extractTagValue(tags: string[], prefix: string): string | null {
  for (const tag of tags) {
    const lower = tag.toLowerCase().trim();
    if (lower.startsWith(prefix.toLowerCase() + ":")) {
      return tag.substring(prefix.length + 1).trim();
    }
  }
  return null;
}

/**
 * Parse all classification fields from contact tags.
 */
export function parseContactTags(tags: string[]): {
  source: string | null;
  market: string | null;
  buyBoxType: string | null;
} {
  const source = extractTagValue(tags, "source");
  const market = extractTagValue(tags, "market");
  const buyBoxType = extractTagValue(tags, "type");
  return {
    source: source ? normalizeSource(source) : null,
    market: market || null,
    buyBoxType: buyBoxType || null,
  };
}

// ============ STAGE MAPPING ============

/**
 * Map GHL pipeline stage names to Gunner property statuses.
 * Case-insensitive matching.
 */
function mapStageToPropertyStatus(stageName: string): string {
  // GHL stage names often have counts appended like "New Lead (1)" or "Hot Leads(2)"
  const cleaned = stageName.replace(/\s*\(\d+\)\s*$/, '').trim();
  const lower = cleaned.toLowerCase();
  const mapping: Record<string, string> = {
    "new lead": "lead",
    "new leads": "lead",
    "warm lead": "apt_set",
    "warm leads": "apt_set",
    "hot lead": "apt_set",
    "hot leads": "apt_set",
    "appointment set": "apt_set",
    "apt set": "apt_set",
    "qualified": "apt_set",
    "offer made": "offer_made",
    "under contract": "under_contract",
    "marketing": "marketing",
    "buyer negotiating": "buyer_negotiating",
    "closing": "closing",
    "follow up": "follow_up",
    "follow-up": "follow_up",
    "followup": "follow_up",
    "closed": "closed",
    "dead": "dead",
    "lost": "dead",
  };
  return mapping[lower] || "marketing"; // default to marketing for dispo imports
}

/**
 * Determine which milestone flags to set based on the new status.
 */
function getMilestoneFlags(status: string): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  const statusOrder = ["lead", "apt_set", "offer_made", "under_contract", "marketing", "buyer_negotiating", "closing", "closed", "follow_up"];
  const idx = statusOrder.indexOf(status);
  if (idx >= 1) flags.aptEverSet = true;
  if (idx >= 2) flags.offerEverMade = true;
  if (idx >= 3) flags.everUnderContract = true;
  if (idx >= 7) flags.everClosed = true;
  return flags;
}

// ============ BULK IMPORT ============

export interface BulkImportProgress {
  total: number;
  processed: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  status: "idle" | "fetching_pipeline" | "fetching_opportunities" | "processing" | "done" | "error";
}

// In-memory progress tracker per tenant
const importProgress = new Map<number, BulkImportProgress>();

export function getImportProgress(tenantId: number): BulkImportProgress | null {
  return importProgress.get(tenantId) || null;
}

/**
 * Search all opportunities in a pipeline with pagination.
 * GHL API: GET /opportunities/search?location_id={}&pipeline_id={}&limit=100&startAfter=...
 */
async function fetchAllOpportunitiesInPipeline(
  creds: any,
  pipelineId: string
): Promise<Array<{
  id: string;
  contactId: string;
  pipelineStageId: string;
  name: string;
  status: string;
  monetaryValue: number | null;
}>> {
  const allOpps: any[] = [];
  let startAfter: string | undefined;
  let page = 0;
  const limit = 100;

  while (true) {
    let url = `/opportunities/search?location_id=${creds.locationId}&pipeline_id=${pipelineId}&limit=${limit}`;
    if (startAfter) {
      url += `&startAfter=${startAfter}&startAfterId=${startAfter}`;
    }

    try {
      const data = await ghlFetch(creds, url, "GET");
      const opps = data.opportunities || [];
      allOpps.push(...opps);
      page++;
      console.log(`[GHL Import] Fetched page ${page}: ${opps.length} opportunities (total: ${allOpps.length})`);

      // Check if there are more pages
      if (opps.length < limit || !data.meta?.nextPageUrl) {
        break;
      }
      // Use the last opportunity's ID for pagination
      startAfter = opps[opps.length - 1]?.id;
      if (!startAfter) break;

      // Rate limit: small delay between pages
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[GHL Import] Error fetching page ${page}:`, error);
      break;
    }
  }

  return allOpps.map((opp: any) => ({
    id: opp.id,
    contactId: opp.contact?.id || opp.contactId || "",
    pipelineStageId: opp.pipelineStageId || "",
    name: opp.name || opp.contact?.name || "",
    status: opp.status || "open",
    monetaryValue: opp.monetaryValue || null,
  }));
}

/**
 * Fetch a contact from GHL to get seller info and address.
 * In GHL Dispo Pipeline:
 *   - companyName / businessName = property address (visual convention)
 *   - contact name = seller name
 *   - contact phone = seller phone
 *   - tags = source:X, market:Y, type:Z
 */
async function fetchContactForProperty(
  creds: any,
  contactId: string
): Promise<{
  id: string;
  name: string;
  phone: string;
  companyName: string; // used as property address in GHL
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  tags: string[];
  source: string;
} | null> {
  try {
    const data = await ghlFetch(creds, `/contacts/${contactId}`, "GET");
    const c = data.contact || data;

    return {
      id: c.id,
      name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "",
      phone: c.phone || "",
      companyName: c.companyName || c.company || "",
      address1: c.address1 || c.streetAddress || "",
      city: c.city || "",
      state: c.state || "",
      postalCode: c.postalCode || c.zip || "",
      tags: Array.isArray(c.tags) ? c.tags : [],
      source: c.source || "",
    };
  } catch (error) {
    console.error(`[GHL Import] Error fetching contact ${contactId}:`, error);
    return null;
  }
}

/**
 * Resolve the property address from GHL contact data.
 * Priority:
 *   1. companyName (GHL convention: business name = address for visual display)
 *   2. address1 field from contact
 *   3. Opportunity name as fallback
 */
function resolvePropertyAddress(contact: {
  companyName: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
}, oppName: string): { address: string; city: string; state: string; zip: string } {
  // Try companyName first (GHL convention for dispo pipeline)
  if (contact.companyName && contact.companyName.trim()) {
    // companyName might be full address like "123 Main St, Nashville, TN 37201"
    // or just the street address like "123 Main St"
    const parts = contact.companyName.split(",").map(p => p.trim());
    if (parts.length >= 3) {
      // Full address in companyName
      const stateZip = parts[2].split(" ").filter(Boolean);
      return {
        address: parts[0],
        city: parts[1] || contact.city || "",
        state: stateZip[0] || contact.state || "",
        zip: stateZip[1] || contact.postalCode || "",
      };
    } else if (parts.length === 2) {
      return {
        address: parts[0],
        city: parts[1] || contact.city || "",
        state: contact.state || "",
        zip: contact.postalCode || "",
      };
    } else {
      // Just the street address
      return {
        address: contact.companyName.trim(),
        city: contact.city || "",
        state: contact.state || "",
        zip: contact.postalCode || "",
      };
    }
  }

  // Fall back to address1
  if (contact.address1 && contact.address1.trim()) {
    return {
      address: contact.address1.trim(),
      city: contact.city || "",
      state: contact.state || "",
      zip: contact.postalCode || "",
    };
  }

  // Last resort: opportunity name
  return {
    address: oppName || "Address Pending",
    city: contact.city || "",
    state: contact.state || "",
    zip: contact.postalCode || "",
  };
}

/**
 * Run the bulk import for a tenant.
 * Scans a specified pipeline (or auto-detects "Dispo" / "Sales Process" pipeline),
 * fetches each opportunity's contact, and upserts into dispo_properties.
 * Duplicate detection by address — no duplicate addresses.
 */
export async function runBulkImport(
  tenantId: number,
  pipelineId?: string
): Promise<BulkImportProgress> {
  const progress: BulkImportProgress = {
    total: 0,
    processed: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    status: "fetching_pipeline",
  };
  importProgress.set(tenantId, progress);

  const db = await getDb();
  if (!db) {
    progress.status = "error";
    progress.errors.push("Database not available");
    return progress;
  }

  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) {
    progress.status = "error";
    progress.errors.push("No GHL credentials configured for this tenant");
    return progress;
  }

  try {
    // Step 1: Resolve pipeline
    let targetPipelineId = pipelineId;
    let pipelineName = "";
    let stageMap = new Map<string, string>(); // stageId → stageName

    if (!targetPipelineId) {
      // Auto-detect: look for "Sales Process" or "Dispo" pipeline
      const pipelines = await getPipelinesForTenant(tenantId);
      const salesPipeline = pipelines.find(p =>
        p.name.toLowerCase().includes("sales process") ||
        p.name.toLowerCase().includes("dispo") ||
        p.name.toLowerCase().includes("acquisition")
      );
      if (!salesPipeline) {
        // Fall back to the first pipeline
        if (pipelines.length > 0) {
          targetPipelineId = pipelines[0].id;
          pipelineName = pipelines[0].name;
          for (const s of pipelines[0].stages) stageMap.set(s.id, s.name);
        } else {
          progress.status = "error";
          progress.errors.push("No pipelines found in GHL");
          return progress;
        }
      } else {
        targetPipelineId = salesPipeline.id;
        pipelineName = salesPipeline.name;
        for (const s of salesPipeline.stages) stageMap.set(s.id, s.name);
      }
    } else {
      // Fetch pipeline details for stage name resolution
      const pipelines = await getPipelinesForTenant(tenantId);
      const found = pipelines.find(p => p.id === targetPipelineId);
      if (found) {
        pipelineName = found.name;
        for (const s of found.stages) stageMap.set(s.id, s.name);
      }
    }

    console.log(`[GHL Import] Starting property import for tenant ${tenantId}, pipeline: ${pipelineName} (${targetPipelineId})`);

    // Step 2: Fetch all opportunities in the pipeline
    progress.status = "fetching_opportunities";
    importProgress.set(tenantId, { ...progress });

    const opportunities = await fetchAllOpportunitiesInPipeline(creds, targetPipelineId!);
    progress.total = opportunities.length;
    console.log(`[GHL Import] Found ${opportunities.length} opportunities in pipeline "${pipelineName}"`);

    // Step 3: Build existing address set for duplicate detection
    const existingProps = await db.select({
      address: dispoProperties.address,
      ghlOpportunityId: dispoProperties.ghlOpportunityId,
      id: dispoProperties.id,
    })
      .from(dispoProperties)
      .where(eq(dispoProperties.tenantId, tenantId));

    const existingAddresses = new Set(existingProps.map(p => p.address.toLowerCase().trim()));
    const existingOppIds = new Map<string, number>(); // oppId → propertyId
    existingProps.forEach(p => {
      if (p.ghlOpportunityId) existingOppIds.set(p.ghlOpportunityId, p.id);
    });

    // Step 4: Process each opportunity → create/update dispo_properties
    progress.status = "processing";
    importProgress.set(tenantId, { ...progress });

    // Process in batches to avoid rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
      const batch = opportunities.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (opp) => {
        try {
          if (!opp.contactId) {
            progress.skipped++;
            progress.processed++;
            return;
          }

          // Fetch contact details (seller info + address)
          const contact = await fetchContactForProperty(creds, opp.contactId);
          if (!contact) {
            progress.skipped++;
            progress.processed++;
            progress.errors.push(`Could not fetch contact for opportunity ${opp.name || opp.id}`);
            return;
          }

          // Resolve property address
          const { address, city, state, zip } = resolvePropertyAddress(contact, opp.name);

          // Skip if no meaningful address
          if (!address || address === "Address Pending") {
            progress.skipped++;
            progress.processed++;
            return;
          }

          // Resolve stage name → property status
          const stageName = stageMap.get(opp.pipelineStageId) || "Unknown";
          const mappedStatus = mapStageToPropertyStatus(stageName);

          // Parse tags for source/market/buyBoxType
          const tagData = parseContactTags(contact.tags);
          const finalSource = tagData.source || normalizeSource(contact.source);

          // Milestone flags
          const milestoneFlags = getMilestoneFlags(mappedStatus);

          // Check if property already exists by ghlOpportunityId first, then by address
          const existingPropId = existingOppIds.get(opp.id);

          if (existingPropId) {
            // Update existing property (matched by opportunity ID)
            await db.update(dispoProperties)
              .set({
                status: mappedStatus,
                sellerName: contact.name || undefined,
                sellerPhone: contact.phone || undefined,
                ghlContactId: opp.contactId,
                ghlPipelineId: targetPipelineId,
                ghlPipelineStageId: opp.pipelineStageId,
                market: tagData.market || undefined,
                leadSource: finalSource || undefined,
                stageChangedAt: new Date(),
                ...(milestoneFlags.aptEverSet ? { aptEverSet: true } : {}),
                ...(milestoneFlags.offerEverMade ? { offerEverMade: true } : {}),
                ...(milestoneFlags.everUnderContract ? { everUnderContract: true } : {}),
                ...(milestoneFlags.everClosed ? { everClosed: true } : {}),
              })
              .where(eq(dispoProperties.id, existingPropId));
            progress.updated++;
          } else if (existingAddresses.has(address.toLowerCase().trim())) {
            // Duplicate address — skip
            progress.skipped++;
          } else {
            // Insert new property
            const [result] = await db.insert(dispoProperties).values({
              tenantId,
              address,
              city: city || "",
              state: state || "",
              zip: zip || "",
              status: mappedStatus,
              sellerName: contact.name || null,
              sellerPhone: contact.phone || null,
              ghlContactId: opp.contactId,
              ghlOpportunityId: opp.id,
              ghlPipelineId: targetPipelineId || null,
              ghlPipelineStageId: opp.pipelineStageId || null,
              market: tagData.market || null,
              leadSource: finalSource || null,
              stageChangedAt: new Date(),
              aptEverSet: milestoneFlags.aptEverSet || false,
              offerEverMade: milestoneFlags.offerEverMade || false,
              everUnderContract: milestoneFlags.everUnderContract || false,
              everClosed: milestoneFlags.everClosed || false,
            });

            // Track for duplicate detection within this batch
            existingAddresses.add(address.toLowerCase().trim());
            if (opp.id) existingOppIds.set(opp.id, result.insertId);

            // Log initial stage in history
            const insertId = result?.insertId;
            if (insertId) {
              await db.insert(propertyStageHistory).values({
                tenantId,
                propertyId: insertId,
                fromStatus: null,
                toStatus: mappedStatus,
                source: "ghl_import",
                notes: `Imported from GHL pipeline "${pipelineName}". Stage: ${stageName}. Seller: ${contact.name || "unknown"}`,
              });
            }

            progress.imported++;
          }

          progress.processed++;
        } catch (error: any) {
          progress.processed++;
          progress.errors.push(`Error processing ${opp.name || opp.id}: ${error.message}`);
        }
      }));

      // Update progress in memory
      importProgress.set(tenantId, { ...progress });

      // Rate limit between batches
      if (i + BATCH_SIZE < opportunities.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    progress.status = "done";
    importProgress.set(tenantId, { ...progress });
    console.log(`[GHL Import] Property import complete for tenant ${tenantId}: ${progress.imported} imported, ${progress.updated} updated, ${progress.skipped} skipped, ${progress.errors.length} errors`);

    return progress;
  } catch (error: any) {
    progress.status = "error";
    progress.errors.push(error.message);
    importProgress.set(tenantId, { ...progress });
    console.error(`[GHL Import] Property import failed for tenant ${tenantId}:`, error);
    return progress;
  }
}
