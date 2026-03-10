import type { ActionResult } from "@shared/types";

export interface CrmContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface CrmOpportunity {
  id: string;
  contactId: string;
  name: string;
  pipelineId: string;
  stageId: string;
  value?: number;
  customFields?: Record<string, unknown>;
}

export interface CrmTask {
  id: string;
  title: string;
  description?: string;
  assignedTo?: string;
  contactId?: string;
  dueDate?: string;
  completed: boolean;
}

export interface CrmConversation {
  id: string;
  contactId: string;
  messages: CrmMessage[];
}

export interface CrmMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  timestamp: string;
  type: "sms" | "email" | "call";
}

export interface CrmCallRecording {
  id: string;
  contactId: string;
  recordingUrl: string;
  duration: number;
  direction: "inbound" | "outbound";
  timestamp: string;
  assignedTo?: string;
}

export interface CrmAdapter {
  readonly type: string;

  getContact(contactId: string): Promise<CrmContact | null>;
  searchContacts(query: string, limit?: number): Promise<CrmContact[]>;
  getOpportunity(opportunityId: string): Promise<CrmOpportunity | null>;
  getOpportunities(pipelineId?: string): Promise<CrmOpportunity[]>;
  getTasks(assignedTo?: string): Promise<CrmTask[]>;
  getConversation(contactId: string): Promise<CrmConversation | null>;
  getCallRecordings(since: Date): Promise<CrmCallRecording[]>;

  sendSms(contactId: string, message: string, fromUserId?: string): Promise<ActionResult>;
  addNote(contactId: string, body: string): Promise<ActionResult>;
  createTask(task: Omit<CrmTask, "id" | "completed">): Promise<ActionResult>;
  completeTask(taskId: string): Promise<ActionResult>;
  updateOpportunityStage(opportunityId: string, stageId: string): Promise<ActionResult>;
  createAppointment(params: {
    contactId: string;
    title: string;
    startTime: string;
    assignedTo?: string;
  }): Promise<ActionResult>;
  addTag(contactId: string, tag: string): Promise<ActionResult>;
  removeTag(contactId: string, tag: string): Promise<ActionResult>;
  updateContactField(contactId: string, field: string, value: unknown): Promise<ActionResult>;
  addToWorkflow(contactId: string, workflowId: string): Promise<ActionResult>;
  removeFromWorkflow(contactId: string, workflowId: string): Promise<ActionResult>;

  testConnection(): Promise<{ connected: boolean; error?: string }>;
}
