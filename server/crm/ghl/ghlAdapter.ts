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
    try {
      const data = (await ghlFetch(`/opportunities/${opportunityId}`, {
        token: this.token,
      })) as Record<string, unknown>;
      const o = (data.opportunity ?? data) as Record<string, unknown>;
      return {
        id: String(o.id ?? opportunityId),
        contactId: String(o.contactId ?? o.contact_id ?? ""),
        name: String(o.name ?? ""),
        pipelineId: String(o.pipelineId ?? o.pipeline_id ?? ""),
        stageId: String(o.pipelineStageId ?? o.stageId ?? o.stage_id ?? ""),
        value: o.monetaryValue != null ? Number(o.monetaryValue) : undefined,
        customFields:
          typeof o.customFields === "object"
            ? (o.customFields as Record<string, unknown>)
            : undefined,
      };
    } catch {
      return null;
    }
  }

  async getOpportunities(pipelineId?: string): Promise<CrmOpportunity[]> {
    try {
      const params = new URLSearchParams({ location_id: this.locationId });
      if (pipelineId) params.set("pipeline_id", pipelineId);
      const data = (await ghlFetch(`/opportunities/search?${params}`, {
        token: this.token,
      })) as { opportunities?: Array<Record<string, unknown>> };
      return (data.opportunities ?? []).map((o) => ({
        id: String(o.id ?? ""),
        contactId: String(o.contactId ?? o.contact_id ?? ""),
        name: String(o.name ?? ""),
        pipelineId: String(o.pipelineId ?? o.pipeline_id ?? ""),
        stageId: String(o.pipelineStageId ?? o.stageId ?? o.stage_id ?? ""),
        value: o.monetaryValue != null ? Number(o.monetaryValue) : undefined,
        customFields:
          typeof o.customFields === "object"
            ? (o.customFields as Record<string, unknown>)
            : undefined,
      }));
    } catch {
      return [];
    }
  }

  async getTasks(assignedTo?: string): Promise<CrmTask[]> {
    try {
      const params = new URLSearchParams({ locationId: this.locationId });
      if (assignedTo) params.set("assignedTo", assignedTo);
      const data = (await ghlFetch(`/contacts/tasks?${params}`, {
        token: this.token,
      })) as { tasks?: Array<Record<string, unknown>> };
      return (data.tasks ?? []).map((t) => ({
        id: String(t.id ?? ""),
        title: String(t.title ?? t.name ?? ""),
        description: t.body ? String(t.body) : t.description ? String(t.description) : undefined,
        assignedTo: t.assignedTo ? String(t.assignedTo) : undefined,
        contactId: t.contactId ? String(t.contactId) : undefined,
        dueDate: t.dueDate ? String(t.dueDate) : undefined,
        completed: Boolean(t.completed ?? t.isCompleted ?? false),
      }));
    } catch {
      return [];
    }
  }

  async getConversation(contactId: string): Promise<CrmConversation | null> {
    try {
      const params = new URLSearchParams({
        locationId: this.locationId,
        contactId,
      });
      const data = (await ghlFetch(`/conversations/search?${params}`, {
        token: this.token,
      })) as { conversations?: Array<Record<string, unknown>> };
      const conv = data.conversations?.[0];
      if (!conv) return null;
      const rawMessages = (conv.messages ?? []) as Array<Record<string, unknown>>;
      return {
        id: String(conv.id ?? ""),
        contactId,
        messages: rawMessages.map((m) => ({
          id: String(m.id ?? m.messageId ?? ""),
          direction: m.direction === "inbound" ? ("inbound" as const) : ("outbound" as const),
          body: String(m.body ?? m.message ?? m.text ?? ""),
          timestamp: String(m.dateAdded ?? m.createdAt ?? m.timestamp ?? ""),
          type: (m.type === "SMS" || m.type === "sms"
            ? "sms"
            : m.type === "EMAIL" || m.type === "email"
              ? "email"
              : "call") as "sms" | "email" | "call",
        })),
      };
    } catch {
      return null;
    }
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
