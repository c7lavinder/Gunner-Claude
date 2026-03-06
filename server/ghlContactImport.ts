/**
 * GHL Property Bulk Import
 * 
 * Pulls property data from GHL opportunities in BOTH the Sales Process and Dispo pipelines,
 * fetches linked contact for seller info, pulls source from the opportunity object,
 * and upserts into dispo_properties.
 * 
 * Architecture: Gunner stores properties. GHL is the CRM for contacts.
 * Each GHL opportunity = one property. The linked contact = the seller.
 * Business name field on the contact = the property address (GHL convention).
 * Duplicate detection by address — no duplicate addresses allowed.
 * 
 * CREATION RULES:
 *   - Only create new properties from New Lead, Warm Leads, or Hot Leads stages (Sales Process pipeline)
 *   - Dispo pipeline NEVER creates new properties, only updates existing ones
 *   - All other Sales Process stages only update existing properties
 * 
 * SOURCE: Pulled from the opportunity's source field (not contact tags)
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

// ============ STAGE MAPPING ============

/**
 * Stages that allow CREATION of new properties.
 * Only opportunities in these stages (Sales Process pipeline) will create new dispo_properties.
 */
const CREATION_STAGES = new Set([
  "new lead",
  "new leads",
  "warm lead",
  "warm leads",
  "hot lead",
  "hot leads",
]);

/**
 * Map GHL pipeline stage names to Gunner property statuses.
 * Covers both Sales Process and Dispo Pipeline stages.
 * Case-insensitive matching.
 */
function mapStageToPropertyStatus(stageName: string): string | null {
  // GHL stage names often have counts appended like "New Lead (1)" or "Hot Leads(2)"
  const cleaned = stageName.replace(/\s*\(\d+\)\s*$/, '').trim();
  const lower = cleaned.toLowerCase();
  const mapping: Record<string, string> = {
    // ---- Sales Process Pipeline ----
    "new lead": "lead",
    "new leads": "lead",
    "warm lead": "lead",
    "warm leads": "lead",
    "hot lead": "lead",
    "hot leads": "lead",
    "pending apt": "apt_set",
    "walkthrough apt scheduled": "apt_set",
    "offer apt scheduled": "apt_set",
    "made offer": "offer_made",
    "under contract": "under_contract",
    "purchased": "closed",
    "1 month follow up": "follow_up",
    "4 month follow up": "follow_up",
    "1 year follow up": "follow_up",
    "ghosted lead": "follow_up",
    "agreement not closed": "dead",
    "sold": "dead",
    "do not want": "dead",
    // ---- Dispo Pipeline ----
    "new deal": "marketing",
    "clear to send out": "marketing",
    "sent to buyers": "marketing",
    "offers received": "buyer_negotiating",
    "<1 day — need to terminate": "marketing",
    "<1 day - need to terminate": "marketing",
    "with jv partner": "buyer_negotiating",
    "uc w/ buyer": "closing",
    "working w/ title": "closing",
    "closed": "closed",
    // ---- Legacy / generic fallbacks ----
    "appointment set": "apt_set",
    "apt set": "apt_set",
    "offer made": "offer_made",
    "marketing": "marketing",
    "buyer negotiating": "buyer_negotiating",
    "closing": "closing",
    "follow up": "follow_up",
    "follow-up": "follow_up",
    "followup": "follow_up",
    "dead": "dead",
    "lost": "dead",
  };
  return mapping[lower] || null;
}

/**
 * Check if a stage name is a creation-eligible stage.
 */
function isCreationStage(stageName: string): boolean {
  const cleaned = stageName.replace(/\s*\(\d+\)\s*$/, '').trim();
  return CREATION_STAGES.has(cleaned.toLowerCase());
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
 * Now also captures the opportunity's source field.
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
  source: string;
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
    source: opp.source || "",
  }));
}

/**
 * Fetch a contact from GHL to get seller info and address.
 * In GHL Dispo Pipeline:
 *   - companyName / businessName = property address (visual convention)
 *   - contact name = seller name
 *   - contact phone = seller phone
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
 * Scans BOTH the Sales Process pipeline and Dispo pipeline,
 * fetches each opportunity's contact, and upserts into dispo_properties.
 * 
 * CREATION: Only from New Lead / Warm Leads / Hot Leads stages in Sales Process.
 * UPDATES: All other stages in both pipelines update existing properties.
 * SOURCE: Pulled from the opportunity's source field (not contact tags).
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
    // Step 1: Resolve pipelines — we need BOTH Sales Process and Dispo
    const allPipelines = await getPipelinesForTenant(tenantId);
    
    // Build a list of pipelines to scan
    const pipelinesToScan: Array<{
      id: string;
      name: string;
      stageMap: Map<string, string>;
      isDispo: boolean;
    }> = [];

    if (pipelineId) {
      // Specific pipeline requested
      const found = allPipelines.find(p => p.id === pipelineId);
      if (found) {
        const sm = new Map<string, string>();
        for (const s of found.stages) sm.set(s.id, s.name);
        const isDispo = found.name.toLowerCase().includes("dispo");
        pipelinesToScan.push({ id: found.id, name: found.name, stageMap: sm, isDispo });
      }
    } else {
      // Auto-detect: find Sales Process and Dispo pipelines
      for (const p of allPipelines) {
        const lower = p.name.toLowerCase();
        const isSalesProcess = lower.includes("sales process") || lower.includes("acquisition");
        const isDispo = lower.includes("dispo");
        
        if (isSalesProcess || isDispo) {
          const sm = new Map<string, string>();
          for (const s of p.stages) sm.set(s.id, s.name);
          pipelinesToScan.push({ id: p.id, name: p.name, stageMap: sm, isDispo });
        }
      }

      // If no matching pipelines found, fall back to first pipeline
      if (pipelinesToScan.length === 0 && allPipelines.length > 0) {
        const p = allPipelines[0];
        const sm = new Map<string, string>();
        for (const s of p.stages) sm.set(s.id, s.name);
        pipelinesToScan.push({ id: p.id, name: p.name, stageMap: sm, isDispo: false });
      }

      if (pipelinesToScan.length === 0) {
        progress.status = "error";
        progress.errors.push("No pipelines found in GHL");
        return progress;
      }
    }

    console.log(`[GHL Import] Scanning ${pipelinesToScan.length} pipeline(s) for tenant ${tenantId}: ${pipelinesToScan.map(p => p.name).join(", ")}`);

    // Step 2: Fetch all opportunities from all pipelines
    progress.status = "fetching_opportunities";
    importProgress.set(tenantId, { ...progress });

    const allOpportunities: Array<{
      id: string;
      contactId: string;
      pipelineStageId: string;
      name: string;
      status: string;
      monetaryValue: number | null;
      source: string;
      pipelineId: string;
      pipelineName: string;
      stageName: string;
      isDispo: boolean;
    }> = [];

    for (const pipeline of pipelinesToScan) {
      const opps = await fetchAllOpportunitiesInPipeline(creds, pipeline.id);
      for (const opp of opps) {
        const stageName = pipeline.stageMap.get(opp.pipelineStageId) || "Unknown";
        allOpportunities.push({
          ...opp,
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          stageName,
          isDispo: pipeline.isDispo,
        });
      }
    }

    progress.total = allOpportunities.length;
    console.log(`[GHL Import] Found ${allOpportunities.length} total opportunities across ${pipelinesToScan.length} pipeline(s)`);

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
    for (let i = 0; i < allOpportunities.length; i += BATCH_SIZE) {
      const batch = allOpportunities.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (opp) => {
        try {
          if (!opp.contactId) {
            progress.skipped++;
            progress.processed++;
            return;
          }

          // Resolve stage name → property status
          const mappedStatus = mapStageToPropertyStatus(opp.stageName);
          if (!mappedStatus) {
            // Unknown stage — skip
            progress.skipped++;
            progress.processed++;
            return;
          }

          // Source from opportunity (not tags)
          const finalSource = opp.source ? normalizeSource(opp.source) : null;

          // Milestone flags
          const milestoneFlags = getMilestoneFlags(mappedStatus);

          // Check if property already exists by ghlOpportunityId
          const existingPropId = existingOppIds.get(opp.id);

          if (existingPropId) {
            // UPDATE existing property (matched by opportunity ID)
            await db.update(dispoProperties)
              .set({
                status: mappedStatus,
                ghlContactId: opp.contactId,
                ghlPipelineId: opp.pipelineId,
                ghlPipelineStageId: opp.pipelineStageId,
                leadSource: finalSource || undefined,
                stageChangedAt: new Date(),
                ...(milestoneFlags.aptEverSet ? { aptEverSet: true } : {}),
                ...(milestoneFlags.offerEverMade ? { offerEverMade: true } : {}),
                ...(milestoneFlags.everUnderContract ? { everUnderContract: true } : {}),
                ...(milestoneFlags.everClosed ? { everClosed: true } : {}),
              })
              .where(eq(dispoProperties.id, existingPropId));
            progress.updated++;
          } else if (isCreationStage(opp.stageName) && !opp.isDispo) {
            // CREATE new property — only from New Lead / Warm Leads / Hot Leads in Sales Process
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

            // Duplicate address check
            if (existingAddresses.has(address.toLowerCase().trim())) {
              progress.skipped++;
              progress.processed++;
              return;
            }

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
              ghlPipelineId: opp.pipelineId || null,
              ghlPipelineStageId: opp.pipelineStageId || null,
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
                notes: `Imported from GHL pipeline "${opp.pipelineName}". Stage: ${opp.stageName}. Source: ${finalSource || "unknown"}. Seller: ${contact.name || "unknown"}`,
              });
            }

            progress.imported++;
          } else {
            // Not a creation stage OR is Dispo pipeline — skip (no existing property to update)
            progress.skipped++;
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
      if (i + BATCH_SIZE < allOpportunities.length) {
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
