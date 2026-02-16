/**
 * GHL Actions Service
 * Executes CRM actions in GoHighLevel on behalf of the AI Coach.
 * Supports: notes, pipeline stage changes, SMS, tasks, tags, field updates.
 */
import { getDb, getTeamMemberByUserId, getTeamMembers } from "./db";
import { coachActionLog } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { parseCrmConfig, getTenantById, type TenantCrmConfig } from "./tenant";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

interface GHLActionCredentials {
  apiKey: string;
  locationId: string;
}

async function getCredentialsForTenant(tenantId: number): Promise<GHLActionCredentials | null> {
  const tenant = await getTenantById(tenantId);
  if (!tenant || !tenant.crmConfig) return null;
  
  const config = parseCrmConfig(tenant);
  if (!config?.ghlApiKey || !config?.ghlLocationId) return null;
  
  return {
    apiKey: config.ghlApiKey,
    locationId: config.ghlLocationId,
  };
}

async function ghlFetch(
  creds: GHLActionCredentials,
  path: string,
  method: string = "GET",
  body?: any
): Promise<any> {
  const url = `${GHL_API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${creds.apiKey}`,
    "Version": "2021-07-28",
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GHL API error: ${response.status} - ${text}`);
  }

  return response.json();
}

// ============ CONTACT SEARCH ============

export async function searchContacts(
  tenantId: number,
  query: string
): Promise<Array<{ id: string; name: string; phone: string; email: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured for this tenant");

  try {
    const data = await ghlFetch(
      creds,
      `/contacts/?locationId=${creds.locationId}&query=${encodeURIComponent(query)}&limit=10`,
      "GET"
    );
    
    return (data.contacts || []).map((c: any) => ({
      id: c.id,
      name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown",
      phone: c.phone || "",
      email: c.email || "",
    }));
  } catch (error) {
    console.error("[GHLActions] Contact search error:", error);
    throw error;
  }
}

// ============ ACTION 1: ADD NOTE TO CONTACT ============

export async function addNoteToContact(
  tenantId: number,
  contactId: string,
  noteBody: string
): Promise<{ success: boolean; noteId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const data = await ghlFetch(
    creds,
    `/contacts/${contactId}/notes`,
    "POST",
    { body: noteBody }
  );

  return { success: true, noteId: data.note?.id || data.id };
}

// ============ ACTION 2: ADD NOTE TO OPPORTUNITY ============

export async function addNoteToOpportunity(
  tenantId: number,
  opportunityId: string,
  noteBody: string
): Promise<{ success: boolean; noteId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const data = await ghlFetch(
    creds,
    `/opportunities/${opportunityId}/notes`,
    "POST",
    { body: noteBody }
  );

  return { success: true, noteId: data.note?.id || data.id };
}

// ============ OPPORTUNITY LOOKUP BY CONTACT ============

export async function findOpportunityByContact(
  tenantId: number,
  contactId: string
): Promise<{ opportunityId: string; pipelineId: string; stageId: string; name: string } | null> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return null;

  try {
    // GHL API: search opportunities filtered by contact_id
    const data = await ghlFetch(
      creds,
      `/opportunities/search?location_id=${creds.locationId}&contact_id=${contactId}&limit=10`,
      "GET"
    );
    const opps = data.opportunities || [];
    if (opps.length === 0) return null;

    // Return the most recently updated opportunity
    const sorted = opps.sort((a: any, b: any) => 
      new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
    const opp = sorted[0];
    return {
      opportunityId: opp.id,
      pipelineId: opp.pipelineId,
      stageId: opp.pipelineStageId,
      name: opp.name || opp.contactName || "Unknown",
    };
  } catch (error) {
    console.error("[GHLActions] Opportunity lookup by contact error:", error);
    return null;
  }
}

// ============ PIPELINE & STAGE RESOLUTION ============

export async function getPipelinesForTenant(
  tenantId: number
): Promise<Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const data = await ghlFetch(
      creds,
      `/opportunities/pipelines?locationId=${creds.locationId}`,
      "GET"
    );
    return (data.pipelines || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
    }));
  } catch (error) {
    console.error("[GHLActions] Pipeline fetch error:", error);
    return [];
  }
}

// Common abbreviation mappings for real estate pipeline stages
const ABBREVIATION_MAP: Record<string, string[]> = {
  "apt": ["appointment", "appt"],
  "appt": ["appointment", "apt"],
  "appointment": ["apt", "appt"],
  "qual": ["qualified", "qualification"],
  "qualified": ["qual"],
  "dq": ["disqualified", "disqualify", "dq'd"],
  "dq'd": ["disqualified", "disqualify", "dq"],
  "disqualified": ["dq", "dq'd"],
  "disqualify": ["dq", "dq'd"],
  "sched": ["scheduled"],
  "scheduled": ["sched"],
  "cxl": ["cancelled", "canceled"],
  "cancelled": ["cxl"],
  "canceled": ["cxl"],
  "prop": ["property"],
  "property": ["prop"],
  "neg": ["negotiation", "negotiating"],
  "negotiation": ["neg"],
  "insp": ["inspection"],
  "inspection": ["insp"],
  "ctr": ["contract"],
  "contract": ["ctr"],
  "pend": ["pending"],
  "pending": ["pend"],
  "fup": ["follow up", "followup"],
  "follow up": ["fup", "followup"],
  "followup": ["fup", "follow up"],
};

/**
 * Strip parenthetical content like "(3)" or "(New)" from stage names
 */
function stripParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

/**
 * Expand a word into all its possible abbreviation variants
 */
function expandWord(word: string): string[] {
  const lower = word.toLowerCase();
  const variants = [lower];
  if (ABBREVIATION_MAP[lower]) {
    variants.push(...ABBREVIATION_MAP[lower]);
  }
  return variants;
}

/**
 * Check if two strings are a fuzzy match considering abbreviations.
 * Splits both into words, expands abbreviations, and checks if all words
 * from one string have a match in the other.
 */
/**
 * Check if two words match, allowing substring matching only for short abbreviations (<=4 chars)
 * to prevent false positives like "disqualified" matching "qualified"
 */
function wordsMatch(word1: string, word2: string): boolean {
  if (word1 === word2) return true;
  // Only allow substring matching for short abbreviations
  const minLen = Math.min(word1.length, word2.length);
  if (minLen <= 4) {
    // Short word: allow it to be a prefix of the longer word
    const shorter = word1.length <= word2.length ? word1 : word2;
    const longer = word1.length <= word2.length ? word2 : word1;
    return longer.startsWith(shorter);
  }
  return false;
}

// Compound words that should be treated as equivalent
const COMPOUND_NORMALIZATIONS: Record<string, string> = {
  "followup": "follow up",
  "follow-up": "follow up",
  "setup": "set up",
  "set-up": "set up",
  "callback": "call back",
  "call-back": "call back",
  "walkthrough": "walk through",
  "walk-through": "walk through",
};

function normalizeCompounds(text: string): string {
  let result = text.toLowerCase();
  for (const [compound, expanded] of Object.entries(COMPOUND_NORMALIZATIONS)) {
    result = result.replace(new RegExp(`\\b${compound}\\b`, "g"), expanded);
  }
  return result;
}

function fuzzyStageMatch(userInput: string, actualName: string): boolean {
  // Normalize compound words before splitting
  const normalizedInput = normalizeCompounds(userInput);
  const normalizedActual = normalizeCompounds(actualName);
  
  const inputWords = normalizedInput.split(/\s+/).filter(Boolean);
  const actualWords = normalizedActual.split(/\s+/).filter(Boolean);

  // Filter out common filler words that shouldn't affect matching
  const fillerWords = new Set(["stage", "the", "to", "in", "a", "an"]);
  const filteredInput = inputWords.filter(w => !fillerWords.has(w));
  const filteredActual = actualWords.filter(w => !fillerWords.has(w));

  if (filteredInput.length === 0 || filteredActual.length === 0) return false;

  // Check if every actual word (or its abbreviation) matches some input word (or its abbreviation)
  const actualMatchesInput = filteredActual.every(aw => {
    const aVariants = expandWord(aw);
    return aVariants.some(av => {
      return filteredInput.some(iw => {
        const iVariants = expandWord(iw);
        return iVariants.some(iv => wordsMatch(av, iv));
      });
    });
  });

  // Check if every input word (or its abbreviation) matches some actual word (or its abbreviation)
  const inputMatchesActual = filteredInput.every(iw => {
    const iVariants = expandWord(iw);
    return iVariants.some(iv => {
      return filteredActual.some(aw => {
        const aVariants = expandWord(aw);
        return aVariants.some(av => wordsMatch(iv, av));
      });
    });
  });

  // Both directions must match to prevent false positives
  return actualMatchesInput && inputMatchesActual;
}

export function resolveStageByName(
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>,
  stageName: string,
  pipelineName?: string
): { pipelineId: string; stageId: string; pipelineName: string; stageName: string } | null {
  const normalizedStage = stageName.toLowerCase().trim();
  const normalizedPipeline = pipelineName?.toLowerCase().trim();

  // If pipeline name is specified, search only that pipeline
  const targetPipelines = normalizedPipeline
    ? pipelines.filter(p => p.name.toLowerCase().includes(normalizedPipeline))
    : pipelines;

  // Pass 1: Exact match on raw name
  for (const pipeline of targetPipelines) {
    const stage = pipeline.stages.find(s => s.name.toLowerCase() === normalizedStage);
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  // Pass 2: Exact match after stripping parenthetical content (e.g., "Pending Apt(3)" → "Pending Apt")
  for (const pipeline of targetPipelines) {
    const stage = pipeline.stages.find(s => stripParenthetical(s.name).toLowerCase() === normalizedStage);
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  // Pass 3: Fuzzy match with abbreviation expansion (e.g., "pending appointment" ↔ "Pending Apt(3)")
  // This runs BEFORE substring includes to prevent false positives like "disqualified" matching "Qualified"
  for (const pipeline of targetPipelines) {
    const stage = pipeline.stages.find(s => {
      const strippedActual = stripParenthetical(s.name);
      return fuzzyStageMatch(normalizedStage, strippedActual);
    });
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  // Pass 4: Abbreviation-expanded exact word match — check if input abbreviation matches a stage
  // e.g., "disqualified" → abbreviation "dq" matches stage "DQ'd" → abbreviation "dq"
  for (const pipeline of targetPipelines) {
    const inputVariants = new Set(normalizedStage.split(/\s+/).flatMap(w => expandWord(w)));
    const stage = pipeline.stages.find(s => {
      const strippedActual = stripParenthetical(s.name).toLowerCase();
      const actualVariants = new Set(strippedActual.split(/\s+/).flatMap(w => expandWord(w)));
      // Check if any input variant exactly matches any actual variant
      for (const iv of Array.from(inputVariants)) {
        if (actualVariants.has(iv)) return true;
      }
      return false;
    });
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  // Pass 5: Includes match — only allow when the shorter string is a meaningful prefix/substring
  // Require the shorter string to be at least 60% the length of the longer to prevent false positives
  for (const pipeline of targetPipelines) {
    const strippedInput = stripParenthetical(normalizedStage);
    const stage = pipeline.stages.find(s => {
      const strippedActual = stripParenthetical(s.name).toLowerCase();
      if (strippedActual.includes(strippedInput) || strippedInput.includes(strippedActual)) {
        const shorter = Math.min(strippedActual.length, strippedInput.length);
        const longer = Math.max(strippedActual.length, strippedInput.length);
        // Only match if the shorter string is at least 60% the length of the longer
        return shorter / longer >= 0.6;
      }
      return false;
    });
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  return null;
}

// ============ ACTION 3: CHANGE PIPELINE STAGE ============

export async function changePipelineStage(
  tenantId: number,
  opportunityId: string,
  pipelineId: string,
  stageId: string
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  await ghlFetch(
    creds,
    `/opportunities/${opportunityId}`,
    "PUT",
    {
      pipelineId,
      pipelineStageId: stageId,
    }
  );

  return { success: true };
}

// ============ ACTION 4: SEND SMS ============

export async function sendSms(
  tenantId: number,
  contactId: string,
  message: string,
  userId?: string // GHL user ID — routes SMS from that user's assigned phone number
): Promise<{ success: boolean; messageId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const body: any = {
    type: "SMS",
    contactId,
    message,
  };
  // If a GHL userId is provided, include it so GHL routes from that user's number
  if (userId) {
    body.userId = userId;
  }

  const data = await ghlFetch(
    creds,
    `/conversations/messages`,
    "POST",
    body
  );

  return { success: true, messageId: data.messageId || data.id };
}

// ============ ACTION 5: CREATE TASK ============

export async function createTask(
  tenantId: number,
  contactId: string,
  title: string,
  description: string,
  dueDate?: string,
  assignedTo?: string // GHL user ID to assign the task to
): Promise<{ success: boolean; taskId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const body: any = {
    title,
    body: description,
    dueDate: dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    completed: false,
  };
  // Assign to specific GHL user if provided
  if (assignedTo) {
    body.assignedTo = assignedTo;
  }

  const data = await ghlFetch(
    creds,
    `/contacts/${contactId}/tasks`,
    "POST",
    body
  );

  return { success: true, taskId: data.task?.id || data.id };
}

// ============ ACTION 6: ADD TAG ============

export async function addTag(
  tenantId: number,
  contactId: string,
  tags: string[]
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  // First get existing tags
  const contact = await ghlFetch(creds, `/contacts/${contactId}`, "GET");
  const existingTags = contact.contact?.tags || [];
  const newTags = Array.from(new Set([...existingTags, ...tags]));

  await ghlFetch(
    creds,
    `/contacts/${contactId}`,
    "PUT",
    { tags: newTags }
  );

  return { success: true };
}

// ============ ACTION 7: REMOVE TAG ============

export async function removeTag(
  tenantId: number,
  contactId: string,
  tags: string[]
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const contact = await ghlFetch(creds, `/contacts/${contactId}`, "GET");
  const existingTags: string[] = contact.contact?.tags || [];
  const newTags = existingTags.filter((t: string) => !tags.includes(t));

  await ghlFetch(
    creds,
    `/contacts/${contactId}`,
    "PUT",
    { tags: newTags }
  );

  return { success: true };
}

// ============ ACTION 8: UPDATE CUSTOM FIELD ============

export async function updateContactField(
  tenantId: number,
  contactId: string,
  fieldKey: string,
  fieldValue: string
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  await ghlFetch(
    creds,
    `/contacts/${contactId}`,
    "PUT",
    { customFields: [{ key: fieldKey, value: fieldValue }] }
  );

  return { success: true };
}

// ============ ACTION LOG HELPERS ============

export async function createActionLog(params: {
  tenantId: number;
  requestedBy: number;
  requestedByName: string;
  actionType: string;
  requestText: string;
  targetContactId?: string;
  targetContactName?: string;
  targetOpportunityId?: string;
  payload?: any;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(coachActionLog).values({
    tenantId: params.tenantId,
    requestedBy: params.requestedBy,
    requestedByName: params.requestedByName,
    actionType: params.actionType as any,
    requestText: params.requestText,
    targetContactId: params.targetContactId,
    targetContactName: params.targetContactName,
    targetOpportunityId: params.targetOpportunityId,
    payload: params.payload,
    status: "pending",
  });

  return (result as any).insertId;
}

export async function confirmAction(actionId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(coachActionLog)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(coachActionLog.id, actionId));
}

export async function executeAction(actionId: number): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [action] = await db.select().from(coachActionLog).where(eq(coachActionLog.id, actionId));
  if (!action) throw new Error("Action not found");
  if (action.status !== "confirmed") throw new Error("Action must be confirmed before execution");

  const payload = action.payload as any;
  // Use targetContactId from the action log as the authoritative contact ID
  // (payload.contactId from LLM may be empty; the real ID is resolved during contact search)
  const contactId = action.targetContactId || payload.contactId;
  const opportunityId = action.targetOpportunityId || payload.opportunityId;

  // Resolve the requesting user's GHL user ID for SMS routing and task default assignment
  let requestingUserGhlId: string | undefined;
  try {
    const teamMember = await getTeamMemberByUserId(action.requestedBy);
    if (teamMember?.ghlUserId) {
      requestingUserGhlId = teamMember.ghlUserId;
    }
  } catch { /* non-critical */ }

  // Resolve assignee GHL user ID for tasks (from assigneeName in payload)
  let taskAssigneeGhlId: string | undefined;
  if (action.actionType === "create_task" && payload.assigneeName) {
    try {
      const members = await getTeamMembers(action.tenantId);
      const match = members.find(m => 
        m.name.toLowerCase().includes(payload.assigneeName.toLowerCase()) ||
        payload.assigneeName.toLowerCase().includes(m.name.split(" ")[0].toLowerCase())
      );
      if (match?.ghlUserId) {
        taskAssigneeGhlId = match.ghlUserId;
      }
    } catch { /* non-critical */ }
  }
  // Default task assignment: named person > creator
  const finalTaskAssignee = taskAssigneeGhlId || requestingUserGhlId;
  
  try {
    let result: any;

    switch (action.actionType) {
      case "add_note_contact":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await addNoteToContact(action.tenantId, contactId, payload.noteBody);
        break;
      case "add_note_opportunity":
        if (!opportunityId) throw new Error("No opportunity ID available.");
        result = await addNoteToOpportunity(action.tenantId, opportunityId, payload.noteBody);
        break;
      case "change_pipeline_stage": {
        let resolvedOppId = opportunityId;
        let resolvedPipelineId = payload.pipelineId;
        let resolvedStageId = payload.stageId;

        // Auto-resolve opportunity ID from contact if not provided
        if (!resolvedOppId && contactId) {
          console.log(`[GHLActions] No opportunity ID — looking up opportunities for contact ${contactId}`);
          const opp = await findOpportunityByContact(action.tenantId, contactId);
          if (opp) {
            resolvedOppId = opp.opportunityId;
            // Use the opportunity's current pipeline if no pipeline specified
            if (!resolvedPipelineId) resolvedPipelineId = opp.pipelineId;
            console.log(`[GHLActions] Found opportunity ${resolvedOppId} in pipeline ${resolvedPipelineId}`);
          }
        }

        if (!resolvedOppId) {
          throw new Error("No opportunity found for this contact. The contact may not have a deal in any pipeline yet.");
        }

        // Auto-resolve stage ID from stage name if not provided or if LLM gave a name instead of ID
        if ((!resolvedStageId || !resolvedPipelineId) && payload.stageName) {
          console.log(`[GHLActions] Resolving stage name "${payload.stageName}" to pipeline/stage IDs`);
          const pipelines = await getPipelinesForTenant(action.tenantId);
          const resolved = resolveStageByName(pipelines, payload.stageName, payload.pipelineName);
          if (resolved) {
            resolvedPipelineId = resolved.pipelineId;
            resolvedStageId = resolved.stageId;
            console.log(`[GHLActions] Resolved to pipeline "${resolved.pipelineName}" stage "${resolved.stageName}"`);
          } else {
            throw new Error(`Could not find a pipeline stage matching "${payload.stageName}". Please check the stage name and try again.`);
          }
        }

        if (!resolvedPipelineId || !resolvedStageId) {
          throw new Error("Could not determine the target pipeline stage. Please specify the stage name more clearly.");
        }

        result = await changePipelineStage(action.tenantId, resolvedOppId, resolvedPipelineId, resolvedStageId);
        break;
      }
      case "send_sms":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await sendSms(action.tenantId, contactId, payload.message, requestingUserGhlId);
        break;
      case "create_task":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await createTask(action.tenantId, contactId, payload.title, payload.description, payload.dueDate, finalTaskAssignee);
        break;
      case "add_tag":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await addTag(action.tenantId, contactId, payload.tags);
        break;
      case "remove_tag":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await removeTag(action.tenantId, contactId, payload.tags);
        break;
      case "update_field":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await updateContactField(action.tenantId, contactId, payload.fieldKey, payload.fieldValue);
        break;
      default:
        throw new Error(`Unknown action type: ${action.actionType}`);
    }

    await db.update(coachActionLog)
      .set({ status: "executed", executedAt: new Date() })
      .where(eq(coachActionLog.id, actionId));

    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || "Unknown error";
    await db.update(coachActionLog)
      .set({ status: "failed", error: errorMsg })
      .where(eq(coachActionLog.id, actionId));

    return { success: false, error: errorMsg };
  }
}

export async function cancelAction(actionId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(coachActionLog)
    .set({ status: "cancelled" })
    .where(eq(coachActionLog.id, actionId));
}
