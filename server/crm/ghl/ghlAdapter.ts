import type {
  CrmAdapter,
  CrmCallRecording,
  CrmContact,
  CrmConversation,
  CrmOpportunity,
  CrmTask,
} from "../adapter";
import type { ActionResult } from "@shared/types";

const GHL_BASE = "https://services.leadconnectorhq.com";

function ghlFetch(
  path: string,
  opts: { method?: string; body?: unknown; token: string }
): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${GHL_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
  return fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(async (res) => {
    const text = await res.text();
    if (!res.ok) throw new Error(`GHL API ${res.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  });
}

export class GhlAdapter implements CrmAdapter {
  readonly type = "ghl";
  private apiKey: string;
  private locationId: string;
  private accessToken?: string;

  constructor(config: { apiKey: string; locationId: string; accessToken?: string }) {
    this.apiKey = config.apiKey;
    this.locationId = config.locationId;
    this.accessToken = config.accessToken;
  }

  private get token(): string {
    return this.accessToken ?? this.apiKey;
  }

  private actionResult(success: boolean, message: string, error?: string): ActionResult {
    return { success, message, timestamp: new Date().toISOString(), error };
  }

  async getContact(contactId: string): Promise<CrmContact | null> {
    try {
      const data = (await ghlFetch(`/contacts/${contactId}`, { token: this.token })) as Record<string, unknown>;
      const c = (data.contact ?? data) as Record<string, unknown>;
      return {
        id: String(c.id ?? contactId),
        name: String(c.name ?? ((c.firstName ?? "") + " " + (c.lastName ?? "")).trim()).trim() || "Unknown",
        email: c.email ? String(c.email) : undefined,
        phone: c.phone ? String(c.phone) : undefined,
        tags: Array.isArray(c.tags) ? (c.tags as string[]) : undefined,
        customFields: typeof c.customFields === "object" ? (c.customFields as Record<string, unknown>) : undefined,
      };
    } catch (e) {
      return null;
    }
  }

  async searchContacts(query: string, limit?: number): Promise<CrmContact[]> {
    try {
      const params = new URLSearchParams({
        query,
        limit: String(limit ?? 10),
        locationId: this.locationId,
      });
      const data = (await ghlFetch(`/contacts/search?${params}`, { token: this.token })) as { contacts?: Array<Record<string, unknown>> };
      const list = data.contacts ?? [];
      return list.map((c) => ({
        id: String(c.id ?? ""),
        name: String(c.name ?? ((c.firstName ?? "") + " " + (c.lastName ?? "")).trim()).trim() || "Unknown",
        email: c.email ? String(c.email) : undefined,
        phone: c.phone ? String(c.phone) : undefined,
        tags: Array.isArray(c.tags) ? (c.tags as string[]) : undefined,
        customFields: typeof c.customFields === "object" ? (c.customFields as Record<string, unknown>) : undefined,
      }));
    } catch (e) {
      return [];
    }
  }

  async getOpportunity(opportunityId: string): Promise<CrmOpportunity | null> {
    throw new Error("Not yet implemented");
  }

  async getOpportunities(pipelineId?: string): Promise<CrmOpportunity[]> {
    throw new Error("Not yet implemented");
  }

  async getTasks(assignedTo?: string): Promise<CrmTask[]> {
    throw new Error("Not yet implemented");
  }

  async getConversation(contactId: string): Promise<CrmConversation | null> {
    throw new Error("Not yet implemented");
  }

  async getCallRecordings(since: Date): Promise<CrmCallRecording[]> {
    const sinceStr = since.toISOString();
    const params = new URLSearchParams({
      locationId: this.locationId,
      type: "Call",
      dateFrom: sinceStr,
    });
    const data = (await ghlFetch(
      `/conversations/search?${params}`,
      { token: this.token }
    )) as { conversations?: Array<Record<string, unknown>> };
    const conversations = data.conversations ?? [];
    const recordings: CrmCallRecording[] = [];
    for (const conv of conversations) {
      const contactId = String(conv.contactId ?? conv.contact_id ?? "");
      const messages = (conv.messages ?? []) as Array<Record<string, unknown>>;
      for (const msg of messages) {
        const recUrl = msg.recordingUrl ?? msg.recording_url;
        if (!recUrl) continue;
        const ts = String(msg.createdAt ?? msg.created_at ?? msg.timestamp ?? "");
        if (ts && new Date(ts) < since) continue;
        recordings.push({
          id: String(msg.id ?? msg.messageId ?? ""),
          contactId,
          recordingUrl: String(recUrl),
          duration: Number(msg.duration ?? 0),
          direction: (msg.direction === "inbound" ? "inbound" : "outbound") as "inbound" | "outbound",
          timestamp: ts,
          assignedTo: msg.assignedTo ? String(msg.assignedTo) : undefined,
        });
      }
    }
    return recordings;
  }

  async sendSms(
    contactId: string,
    message: string,
    fromUserId?: string
  ): Promise<ActionResult> {
    try {
      await ghlFetch("/conversations/messages", {
        method: "POST",
        token: this.token,
        body: { type: "SMS", contactId, message },
      });
      return this.actionResult(true, "SMS sent");
    } catch (e) {
      return this.actionResult(false, "Failed to send SMS", e instanceof Error ? e.message : String(e));
    }
  }

  async addNote(contactId: string, body: string): Promise<ActionResult> {
    try {
      await ghlFetch(`/contacts/${contactId}/notes`, {
        method: "POST",
        token: this.token,
        body: { body },
      });
      return this.actionResult(true, "Note added");
    } catch (e) {
      return this.actionResult(false, "Failed to add note", e instanceof Error ? e.message : String(e));
    }
  }

  async createTask(task: Omit<CrmTask, "id" | "completed">): Promise<ActionResult> {
    try {
      if (!task.contactId) return this.actionResult(false, "Contact ID required");
      await ghlFetch(`/contacts/${task.contactId}/tasks`, {
        method: "POST",
        token: this.token,
        body: {
          title: task.title,
          body: task.description,
          dueDate: task.dueDate,
          assignedTo: task.assignedTo,
        },
      });
      return this.actionResult(true, "Task created");
    } catch (e) {
      return this.actionResult(false, "Failed to create task", e instanceof Error ? e.message : String(e));
    }
  }

  async completeTask(taskId: string): Promise<ActionResult> {
    try {
      await ghlFetch(`/contacts/tasks/${taskId}/completed`, {
        method: "PUT",
        token: this.token,
        body: { completed: true },
      });
      return this.actionResult(true, "Task completed");
    } catch (e) {
      return this.actionResult(false, "Failed to complete task", e instanceof Error ? e.message : String(e));
    }
  }

  async updateOpportunityStage(
    opportunityId: string,
    stageId: string
  ): Promise<ActionResult> {
    try {
      await ghlFetch(`/opportunities/${opportunityId}`, {
        method: "PUT",
        token: this.token,
        body: { stageId },
      });
      return this.actionResult(true, "Opportunity stage updated");
    } catch (e) {
      return this.actionResult(false, "Failed to update opportunity stage", e instanceof Error ? e.message : String(e));
    }
  }

  async createAppointment(params: {
    contactId: string;
    title: string;
    startTime: string;
    assignedTo?: string;
  }): Promise<ActionResult> {
    try {
      await ghlFetch("/calendars/events/appointments", {
        method: "POST",
        token: this.token,
        body: {
          contactId: params.contactId,
          title: params.title,
          startTime: params.startTime,
          assignedUserId: params.assignedTo,
          calendarId: "primary",
        },
      });
      return this.actionResult(true, "Appointment created");
    } catch (e) {
      return this.actionResult(false, "Failed to create appointment", e instanceof Error ? e.message : String(e));
    }
  }

  async addTag(contactId: string, tag: string): Promise<ActionResult> {
    try {
      await ghlFetch(`/contacts/${contactId}/tags`, {
        method: "POST",
        token: this.token,
        body: { tags: [tag] },
      });
      return this.actionResult(true, "Tag added");
    } catch (e) {
      return this.actionResult(false, "Failed to add tag", e instanceof Error ? e.message : String(e));
    }
  }

  async removeTag(contactId: string, tag: string): Promise<ActionResult> {
    try {
      await ghlFetch(`/contacts/${contactId}/tags`, {
        method: "DELETE",
        token: this.token,
        body: { tags: [tag] },
      });
      return this.actionResult(true, "Tag removed");
    } catch (e) {
      return this.actionResult(false, "Failed to remove tag", e instanceof Error ? e.message : String(e));
    }
  }

  async updateContactField(
    contactId: string,
    field: string,
    value: unknown
  ): Promise<ActionResult> {
    try {
      await ghlFetch(`/contacts/${contactId}`, {
        method: "PUT",
        token: this.token,
        body: { [field]: value },
      });
      return this.actionResult(true, "Contact field updated");
    } catch (e) {
      return this.actionResult(false, "Failed to update contact field", e instanceof Error ? e.message : String(e));
    }
  }

  async addToWorkflow(contactId: string, workflowId: string): Promise<ActionResult> {
    try {
      await ghlFetch(`/contacts/${contactId}/workflow/${workflowId}`, {
        method: "POST",
        token: this.token,
        body: {},
      });
      return this.actionResult(true, "Added to workflow");
    } catch (e) {
      return this.actionResult(false, "Failed to add to workflow", e instanceof Error ? e.message : String(e));
    }
  }

  async removeFromWorkflow(
    contactId: string,
    workflowId: string
  ): Promise<ActionResult> {
    return this.actionResult(false, "Remove from workflow not yet implemented");
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      await ghlFetch(`/locations/${this.locationId}`, { token: this.token });
      return { connected: true };
    } catch (e) {
      return {
        connected: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
