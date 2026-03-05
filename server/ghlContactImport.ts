/**
 * GHL Contact Bulk Import
 * 
 * Pulls contact data from GHL opportunities in a specified pipeline,
 * extracts source/market/type from contact tags, and upserts into contact_cache.
 * 
 * Spec: Gunner does NOT store contacts as its own data — it mirrors from GHL.
 * 4 fields per contact: currentStage, source, market, buyBoxType
 */

import { getDb } from "./db";
import { contactCache } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ghlFetch, getCredentialsForTenant, getPipelinesForTenant, getContact } from "./ghlActions";

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
  }));
}

/**
 * Fetch a full contact from GHL including tags, source, and all fields.
 */
async function fetchFullContact(
  creds: any,
  contactId: string
): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  tags: string[];
  source: string;
  companyName: string;
} | null> {
  try {
    const data = await ghlFetch(creds, `/contacts/${contactId}`, "GET");
    const c = data.contact || data;

    // Build address from contact fields
    const addressParts = [
      c.address1 || c.streetAddress || "",
      c.city || "",
      c.state || "",
      c.postalCode || c.zip || "",
    ].filter(Boolean);

    return {
      id: c.id,
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      address: addressParts.join(", "),
      tags: Array.isArray(c.tags) ? c.tags : [],
      source: c.source || "",
      companyName: c.companyName || c.company || "",
    };
  } catch (error) {
    console.error(`[GHL Import] Error fetching contact ${contactId}:`, error);
    return null;
  }
}

/**
 * Run the bulk import for a tenant.
 * Scans a specified pipeline (or auto-detects "Dispo" / "Sales Process" pipeline),
 * fetches each opportunity's contact, extracts tags, and upserts into contact_cache.
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

    console.log(`[GHL Import] Starting bulk import for tenant ${tenantId}, pipeline: ${pipelineName} (${targetPipelineId})`);

    // Step 2: Fetch all opportunities in the pipeline
    progress.status = "fetching_opportunities";
    importProgress.set(tenantId, { ...progress });

    const opportunities = await fetchAllOpportunitiesInPipeline(creds, targetPipelineId!);
    progress.total = opportunities.length;
    console.log(`[GHL Import] Found ${opportunities.length} opportunities in pipeline "${pipelineName}"`);

    // Step 3: Process each opportunity
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

          // Fetch full contact details
          const contact = await fetchFullContact(creds, opp.contactId);
          if (!contact) {
            progress.skipped++;
            progress.processed++;
            progress.errors.push(`Could not fetch contact for opportunity ${opp.name || opp.id}`);
            return;
          }

          // Resolve stage name
          const stageName = stageMap.get(opp.pipelineStageId) || "Unknown";

          // Parse tags for source/market/type
          const tagData = parseContactTags(contact.tags);

          // Determine source: prefer tag, fall back to contact source field
          const finalSource = tagData.source || normalizeSource(contact.source);

          // Check if contact already exists in cache
          const [existing] = await db.select()
            .from(contactCache)
            .where(
              and(
                eq(contactCache.tenantId, tenantId),
                eq(contactCache.ghlContactId, opp.contactId)
              )
            );

          if (existing) {
            // Update existing contact with new pipeline data
            await db.update(contactCache)
              .set({
                currentStage: stageName,
                source: finalSource || existing.source || null,
                market: tagData.market || existing.market || null,
                buyBoxType: tagData.buyBoxType || existing.buyBoxType || null,
                ghlOpportunityId: opp.id,
                tags: JSON.stringify(contact.tags),
                name: contact.name || existing.name,
                firstName: contact.firstName || existing.firstName,
                lastName: contact.lastName || existing.lastName,
                email: contact.email || existing.email,
                phone: contact.phone || existing.phone,
                address: contact.address || existing.address,
                companyName: contact.companyName || existing.companyName,
                lastSyncedAt: new Date(),
              })
              .where(eq(contactCache.id, existing.id));
            progress.updated++;
          } else {
            // Insert new contact
            await db.insert(contactCache).values({
              tenantId,
              ghlContactId: opp.contactId,
              ghlLocationId: creds.locationId,
              ghlOpportunityId: opp.id,
              firstName: contact.firstName || null,
              lastName: contact.lastName || null,
              name: contact.name || null,
              email: contact.email || null,
              phone: contact.phone || null,
              address: contact.address || null,
              companyName: contact.companyName || null,
              tags: JSON.stringify(contact.tags),
              currentStage: stageName,
              source: finalSource || null,
              market: tagData.market || null,
              buyBoxType: tagData.buyBoxType || null,
              lastSyncedAt: new Date(),
            });
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
    console.log(`[GHL Import] Bulk import complete for tenant ${tenantId}: ${progress.imported} imported, ${progress.updated} updated, ${progress.skipped} skipped, ${progress.errors.length} errors`);

    return progress;
  } catch (error: any) {
    progress.status = "error";
    progress.errors.push(error.message);
    importProgress.set(tenantId, { ...progress });
    console.error(`[GHL Import] Bulk import failed for tenant ${tenantId}:`, error);
    return progress;
  }
}

// ============ INCREMENTAL SYNC ============

/**
 * Sync a single contact's pipeline data when a stage update occurs.
 * Called from webhook handler.
 */
export async function syncContactFromOpportunityEvent(
  tenantId: number,
  contactId: string,
  opportunityId: string,
  stageName: string,
  pipelineId?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return;

  try {
    // Fetch full contact for tags
    const contact = await fetchFullContact(creds, contactId);
    const tags = contact?.tags || [];
    const tagData = parseContactTags(tags);
    const finalSource = tagData.source || (contact ? normalizeSource(contact.source) : null);

    // Upsert into contact_cache
    const [existing] = await db.select()
      .from(contactCache)
      .where(
        and(
          eq(contactCache.tenantId, tenantId),
          eq(contactCache.ghlContactId, contactId)
        )
      );

    if (existing) {
      await db.update(contactCache)
        .set({
          currentStage: stageName,
          source: finalSource || existing.source || null,
          market: tagData.market || existing.market || null,
          buyBoxType: tagData.buyBoxType || existing.buyBoxType || null,
          ghlOpportunityId: opportunityId,
          tags: tags.length > 0 ? JSON.stringify(tags) : existing.tags,
          name: contact?.name || existing.name,
          firstName: contact?.firstName || existing.firstName,
          lastName: contact?.lastName || existing.lastName,
          email: contact?.email || existing.email,
          phone: contact?.phone || existing.phone,
          address: contact?.address || existing.address,
          lastSyncedAt: new Date(),
        })
        .where(eq(contactCache.id, existing.id));
    } else if (contact) {
      await db.insert(contactCache).values({
        tenantId,
        ghlContactId: contactId,
        ghlLocationId: creds.locationId,
        ghlOpportunityId: opportunityId,
        firstName: contact.firstName || null,
        lastName: contact.lastName || null,
        name: contact.name || null,
        email: contact.email || null,
        phone: contact.phone || null,
        address: contact.address || null,
        companyName: contact.companyName || null,
        tags: JSON.stringify(tags),
        currentStage: stageName,
        source: finalSource || null,
        market: tagData.market || null,
        buyBoxType: tagData.buyBoxType || null,
        lastSyncedAt: new Date(),
      });
    }

    console.log(`[GHL Import] Synced contact ${contactId} stage → ${stageName}`);
  } catch (error) {
    console.error(`[GHL Import] Error syncing contact ${contactId}:`, error);
  }
}

/**
 * Sync a new contact from a ContactCreate webhook event.
 */
export async function syncNewContactFromWebhook(
  tenantId: number,
  contactId: string,
  contactData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    tags?: string[];
    source?: string;
    address?: string;
    companyName?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const tags = contactData.tags || [];
    const tagData = parseContactTags(tags);
    const finalSource = tagData.source || (contactData.source ? normalizeSource(contactData.source) : null);
    const fullName = [contactData.firstName, contactData.lastName].filter(Boolean).join(" ") || null;

    // Check if already exists
    const [existing] = await db.select()
      .from(contactCache)
      .where(
        and(
          eq(contactCache.tenantId, tenantId),
          eq(contactCache.ghlContactId, contactId)
        )
      );

    if (existing) {
      // Update
      await db.update(contactCache)
        .set({
          source: finalSource || existing.source || null,
          market: tagData.market || existing.market || null,
          buyBoxType: tagData.buyBoxType || existing.buyBoxType || null,
          tags: tags.length > 0 ? JSON.stringify(tags) : existing.tags,
          name: fullName || existing.name,
          firstName: contactData.firstName || existing.firstName,
          lastName: contactData.lastName || existing.lastName,
          email: contactData.email || existing.email,
          phone: contactData.phone || existing.phone,
          address: contactData.address || existing.address,
          companyName: contactData.companyName || existing.companyName,
          lastSyncedAt: new Date(),
        })
        .where(eq(contactCache.id, existing.id));
    } else {
      await db.insert(contactCache).values({
        tenantId,
        ghlContactId: contactId,
        firstName: contactData.firstName || null,
        lastName: contactData.lastName || null,
        name: fullName,
        email: contactData.email || null,
        phone: contactData.phone || null,
        address: contactData.address || null,
        companyName: contactData.companyName || null,
        tags: tags.length > 0 ? JSON.stringify(tags) : null,
        source: finalSource || null,
        market: tagData.market || null,
        buyBoxType: tagData.buyBoxType || null,
        lastSyncedAt: new Date(),
      });
    }

    console.log(`[GHL Import] Synced new contact ${contactId} from webhook`);
  } catch (error) {
    console.error(`[GHL Import] Error syncing new contact ${contactId}:`, error);
  }
}
