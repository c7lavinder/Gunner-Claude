import { faker } from "@faker-js/faker";
import type {
  CrmAdapter,
  CrmCallRecording,
  CrmContact,
  CrmConversation,
  CrmMessage,
  CrmOpportunity,
  CrmTask,
} from "../adapter";
import type { ActionResult } from "@shared/types";

export const demoRecordingMeta = new Map<string, { callType: string; contactName: string; address: string }>();

const CALL_TYPE_WEIGHTS: { type: string; weight: number }[] = [
  { type: "cold_call", weight: 45 },
  { type: "warm_call", weight: 12 },
  { type: "inbound", weight: 8 },
  { type: "follow_up", weight: 15 },
  { type: "offer_call", weight: 8 },
  { type: "appointment_call", weight: 4 },
  { type: "dispo_call", weight: 8 },
];

const STAGE_DISTRIBUTION: { stageId: string; pipelineId: string; count: number }[] = [
  { stageId: "new_lead", pipelineId: "acquisitions", count: 7 },
  { stageId: "contacted", pipelineId: "acquisitions", count: 5 },
  { stageId: "qualified", pipelineId: "acquisitions", count: 3 },
  { stageId: "appointment_set", pipelineId: "acquisitions", count: 3 },
  { stageId: "offer_made", pipelineId: "acquisitions", count: 3 },
  { stageId: "under_contract", pipelineId: "acquisitions", count: 2 },
  { stageId: "dispo", pipelineId: "dispositions", count: 1 },
  { stageId: "closing", pipelineId: "dispositions", count: 1 },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickWeighted<T extends { weight: number }>(items: T[], rng: () => number): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let v = rng() * total;
  for (const item of items) {
    v -= item.weight;
    if (v <= 0) return item;
  }
  return items[items.length - 1];
}

function isBusinessHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const min = now.getMinutes();
  const mins = hour * 60 + min;
  if (day === 0 || day === 6) return false;
  return mins >= 8 * 60 && mins < 18 * 60;
}

function okResult(): ActionResult {
  return { success: true, message: "Demo: action simulated", timestamp: new Date().toISOString() };
}

export class DemoCrmAdapter implements CrmAdapter {
  readonly type = "demo";

  async getCallRecordings(since: Date): Promise<CrmCallRecording[]> {
    const isBiz = isBusinessHours();
    const maxCount = isBiz ? 2 : 1;
    const count = Math.random() < (isBiz ? 0.7 : 0.2) ? Math.floor(Math.random() * (maxCount + 1)) : 0;
    const recordings: CrmCallRecording[] = [];
    const daySeed = Math.floor(Date.now() / 86400000);
    faker.seed(daySeed);

    for (let i = 0; i < count; i++) {
      const id = faker.string.uuid();
      const contactId = faker.string.uuid();
      const duration = Math.random() < 0.8 ? faker.number.int({ min: 60, max: 420 }) : faker.number.int({ min: 15, max: 45 });
      const direction = faker.helpers.arrayElement(["inbound", "outbound"]) as "inbound" | "outbound";
      const timestamp = faker.date.between({ from: since, to: new Date() }).toISOString();
      const callType = pickWeighted(CALL_TYPE_WEIGHTS, () => faker.number.float({ min: 0, max: 1 })).type;
      const contactName = faker.person.fullName();
      const address = faker.location.streetAddress({ useFullAddress: true });

      demoRecordingMeta.set(id, { callType, contactName, address });

      recordings.push({
        id,
        contactId,
        recordingUrl: "demo://no-audio",
        duration,
        direction,
        timestamp,
        assignedTo: faker.person.fullName(),
      });
    }
    return recordings;
  }

  async getOpportunities(pipelineId?: string): Promise<CrmOpportunity[]> {
    faker.seed(Math.floor(Date.now() / 86400000));
    const opportunities: CrmOpportunity[] = [];
    let idx = 0;

    for (const { stageId, pipelineId: pId, count } of STAGE_DISTRIBUTION) {
      if (pipelineId && pId !== pipelineId) continue;
      for (let c = 0; c < count; c++) {
        const id = faker.string.uuid();
        const contactId = faker.string.uuid();
        const address = faker.location.streetAddress({ useFullAddress: true });
        const value = faker.number.int({ min: 80000, max: 300000 });
        opportunities.push({
          id,
          contactId,
          name: address,
          pipelineId: pId,
          stageId,
          value,
          customFields: { address },
        });
        idx++;
      }
    }
    return opportunities;
  }

  async getOpportunity(opportunityId: string): Promise<CrmOpportunity | null> {
    const all = await this.getOpportunities();
    return all.find((o) => o.id === opportunityId) ?? null;
  }

  async getContact(contactId: string): Promise<CrmContact | null> {
    faker.seed(hashString(contactId));
    return {
      id: contactId,
      name: faker.person.fullName(),
      email: faker.internet.email(),
      phone: faker.phone.number(),
      tags: faker.helpers.arrayElements(["motivated", "cash-buyer", "wholesale", "investor"], { min: 0, max: 3 }),
    };
  }

  async searchContacts(query: string, limit = 5): Promise<CrmContact[]> {
    faker.seed(hashString(query));
    const n = Math.min(limit, faker.number.int({ min: 2, max: 5 }));
    const contacts: CrmContact[] = [];
    for (let i = 0; i < n; i++) {
      contacts.push({
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        phone: faker.phone.number(),
      });
    }
    return contacts;
  }

  async getTasks(assignedTo?: string): Promise<CrmTask[]> {
    faker.seed(Math.floor(Date.now() / 86400000));
    const n = faker.number.int({ min: 2, max: 4 });
    const tasks: CrmTask[] = [];
    const titles = ["Follow up on offer", "Schedule walkthrough", "Send contract", "Call back lead", "Verify funding"];
    for (let i = 0; i < n; i++) {
      tasks.push({
        id: faker.string.uuid(),
        title: faker.helpers.arrayElement(titles),
        description: faker.lorem.sentence(),
        assignedTo: assignedTo ?? faker.person.fullName(),
        contactId: faker.string.uuid(),
        dueDate: faker.date.soon({ days: 3 }).toISOString().slice(0, 10),
        completed: false,
      });
    }
    return tasks;
  }

  async getConversation(contactId: string): Promise<CrmConversation | null> {
    faker.seed(hashString(contactId));
    const msgCount = faker.number.int({ min: 3, max: 5 });
    const messages: CrmMessage[] = [];
    let ts = faker.date.past({ years: 0.1 });
    for (let i = 0; i < msgCount; i++) {
      const dir = i % 2 === 0 ? ("inbound" as const) : ("outbound" as const);
      messages.push({
        id: faker.string.uuid(),
        direction: dir,
        body: dir === "inbound" ? faker.lorem.sentence() : faker.lorem.sentence(),
        timestamp: ts.toISOString(),
        type: "sms",
      });
      ts = faker.date.soon({ days: 0.5, refDate: ts });
    }
    return {
      id: `conv-${contactId}`,
      contactId,
      messages,
    };
  }

  async searchConversations(locationId: string, query?: string): Promise<CrmConversation[]> {
    faker.seed(hashString(locationId + (query ?? "")));
    const n = faker.number.int({ min: 2, max: 4 });
    const convos: CrmConversation[] = [];
    for (let i = 0; i < n; i++) {
      const contactId = faker.string.uuid();
      const conv = await this.getConversation(contactId);
      if (conv) convos.push(conv);
    }
    return convos;
  }

  async getConversationMessages(conversationId: string): Promise<CrmMessage[]> {
    const contactId = conversationId.replace(/^conv-/, "");
    const conv = await this.getConversation(contactId);
    return conv?.messages ?? [];
  }

  async sendSms(): Promise<ActionResult> {
    return okResult();
  }

  async addNote(): Promise<ActionResult> {
    return okResult();
  }

  async createTask(): Promise<ActionResult> {
    return okResult();
  }

  async completeTask(): Promise<ActionResult> {
    return okResult();
  }

  async updateOpportunityStage(): Promise<ActionResult> {
    return okResult();
  }

  async createAppointment(): Promise<ActionResult> {
    return okResult();
  }

  async addTag(): Promise<ActionResult> {
    return okResult();
  }

  async removeTag(): Promise<ActionResult> {
    return okResult();
  }

  async updateContactField(): Promise<ActionResult> {
    return okResult();
  }

  async addToWorkflow(): Promise<ActionResult> {
    return okResult();
  }

  async removeFromWorkflow(): Promise<ActionResult> {
    return okResult();
  }

  async sendMessage(): Promise<ActionResult> {
    return okResult();
  }

  async updateOpportunity(): Promise<ActionResult> {
    return okResult();
  }

  async createOpportunity(): Promise<ActionResult> {
    return okResult();
  }

  async markDnc(): Promise<ActionResult> {
    return okResult();
  }

  async getCalendars(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: "demo-cal-1", name: "Demo Calendar" }];
  }

  async getPipelines(): Promise<Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>> {
    return [{ id: "demo-pipe-1", name: "Demo Pipeline", stages: [{ id: "new", name: "New" }] }];
  }

  async getLocationTags(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: "demo-tag-1", name: "Demo Tag" }];
  }

  async getWorkflows(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: "demo-wf-1", name: "Demo Workflow" }];
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    return { connected: true };
  }
}
