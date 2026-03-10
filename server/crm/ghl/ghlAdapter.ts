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

  private notImplemented(): ActionResult {
    return {
      success: false,
      message: "Not yet implemented",
      timestamp: new Date().toISOString(),
    };
  }

  async getContact(contactId: string): Promise<CrmContact | null> {
    throw new Error("Not yet implemented");
  }

  async searchContacts(query: string, limit?: number): Promise<CrmContact[]> {
    throw new Error("Not yet implemented");
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
    return this.notImplemented();
  }

  async addNote(contactId: string, body: string): Promise<ActionResult> {
    return this.notImplemented();
  }

  async createTask(task: Omit<CrmTask, "id" | "completed">): Promise<ActionResult> {
    return this.notImplemented();
  }

  async completeTask(taskId: string): Promise<ActionResult> {
    return this.notImplemented();
  }

  async updateOpportunityStage(
    opportunityId: string,
    stageId: string
  ): Promise<ActionResult> {
    return this.notImplemented();
  }

  async createAppointment(params: {
    contactId: string;
    title: string;
    startTime: string;
    assignedTo?: string;
  }): Promise<ActionResult> {
    return this.notImplemented();
  }

  async addTag(contactId: string, tag: string): Promise<ActionResult> {
    return this.notImplemented();
  }

  async removeTag(contactId: string, tag: string): Promise<ActionResult> {
    return this.notImplemented();
  }

  async updateContactField(
    contactId: string,
    field: string,
    value: unknown
  ): Promise<ActionResult> {
    return this.notImplemented();
  }

  async addToWorkflow(contactId: string, workflowId: string): Promise<ActionResult> {
    return this.notImplemented();
  }

  async removeFromWorkflow(
    contactId: string,
    workflowId: string
  ): Promise<ActionResult> {
    return this.notImplemented();
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
