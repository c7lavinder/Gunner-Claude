/**
 * GHL Actions Service
 * Executes CRM actions in GoHighLevel on behalf of the AI Coach.
 * Supports: notes, pipeline stage changes, SMS, tasks, tags, field updates.
 */
import { getDb } from "./db";
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
  message: string
): Promise<{ success: boolean; messageId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const data = await ghlFetch(
    creds,
    `/conversations/messages`,
    "POST",
    {
      type: "SMS",
      contactId,
      message,
    }
  );

  return { success: true, messageId: data.messageId || data.id };
}

// ============ ACTION 5: CREATE TASK ============

export async function createTask(
  tenantId: number,
  contactId: string,
  title: string,
  description: string,
  dueDate?: string
): Promise<{ success: boolean; taskId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const body: any = {
    title,
    body: description,
    dueDate: dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    completed: false,
  };

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
  
  try {
    let result: any;

    switch (action.actionType) {
      case "add_note_contact":
        result = await addNoteToContact(action.tenantId, payload.contactId, payload.noteBody);
        break;
      case "add_note_opportunity":
        result = await addNoteToOpportunity(action.tenantId, payload.opportunityId, payload.noteBody);
        break;
      case "change_pipeline_stage":
        result = await changePipelineStage(action.tenantId, payload.opportunityId, payload.pipelineId, payload.stageId);
        break;
      case "send_sms":
        result = await sendSms(action.tenantId, payload.contactId, payload.message);
        break;
      case "create_task":
        result = await createTask(action.tenantId, payload.contactId, payload.title, payload.description, payload.dueDate);
        break;
      case "add_tag":
        result = await addTag(action.tenantId, payload.contactId, payload.tags);
        break;
      case "remove_tag":
        result = await removeTag(action.tenantId, payload.contactId, payload.tags);
        break;
      case "update_field":
        result = await updateContactField(action.tenantId, payload.contactId, payload.fieldKey, payload.fieldValue);
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
