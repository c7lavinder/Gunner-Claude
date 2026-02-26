/**
 * CRM-Agnostic Event Types
 * 
 * All CRM webhook handlers (GHL, BatchDialer, HubSpot, etc.) normalize
 * their incoming payloads into these standard event types. The processing
 * pipeline is CRM-agnostic — a CallEvent is a CallEvent regardless of source.
 */

// ============ CALL EVENTS ============

export interface CallEvent {
  /** Source CRM identifier */
  source: "ghl" | "batchdialer" | "hubspot" | "salesforce" | "manual";

  /** Unique call ID from the source CRM */
  sourceCallId: string;

  /** Tenant routing */
  sourceLocationId?: string;  // e.g., GHL locationId
  tenantId?: number;          // Resolved internally

  /** Contact info */
  contactId?: string;         // CRM contact ID
  contactName?: string;
  contactPhone?: string;

  /** Call details */
  recordingUrl?: string;
  duration?: number;          // seconds
  direction: "inbound" | "outbound";
  status: "completed" | "voicemail" | "missed" | "no-answer" | "busy" | "failed";

  /** Team member who handled the call */
  crmUserId?: string;         // CRM user ID (e.g., GHL userId)
  teamMemberName?: string;

  /** Property info (if available) */
  propertyAddress?: string;

  /** Timestamp */
  callTimestamp: Date;

  /** Raw payload for debugging */
  rawPayload?: Record<string, unknown>;
}

// ============ OPPORTUNITY EVENTS ============

export type OpportunityEventType =
  | "created"
  | "stage_updated"
  | "status_updated"
  | "assigned_updated"
  | "value_updated"
  | "deleted";

export interface OpportunityEvent {
  /** Source CRM identifier */
  source: "ghl" | "hubspot" | "salesforce";

  /** Event type */
  eventType: OpportunityEventType;

  /** Unique opportunity ID from the source CRM */
  sourceOpportunityId: string;

  /** Tenant routing */
  sourceLocationId?: string;
  tenantId?: number;

  /** Opportunity details */
  contactId?: string;
  contactName?: string;
  pipelineId?: string;
  pipelineName?: string;
  stageId?: string;
  stageName?: string;
  status?: string;           // "open" | "won" | "lost" | "abandoned"
  monetaryValue?: number;    // in cents
  assignedTo?: string;       // CRM user ID

  /** Timestamp */
  eventTimestamp: Date;

  /** Raw payload for debugging */
  rawPayload?: Record<string, unknown>;
}

// ============ CONTACT EVENTS ============

export type ContactEventType = "created" | "updated" | "deleted" | "tag_updated";

export interface ContactEvent {
  /** Source CRM identifier */
  source: "ghl" | "hubspot" | "salesforce";

  /** Event type */
  eventType: ContactEventType;

  /** Unique contact ID from the source CRM */
  sourceContactId: string;

  /** Tenant routing */
  sourceLocationId?: string;
  tenantId?: number;

  /** Contact details */
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];

  /** Timestamp */
  eventTimestamp: Date;

  /** Raw payload for debugging */
  rawPayload?: Record<string, unknown>;
}

// ============ GENERIC WEBHOOK ENVELOPE ============

export interface WebhookEnvelope {
  /** Unique webhook delivery ID (for deduplication) */
  webhookId: string;

  /** Source CRM */
  source: string;

  /** Event type string from the CRM */
  eventType: string;

  /** Parsed event (one of the normalized types) */
  event: CallEvent | OpportunityEvent | ContactEvent;

  /** When the webhook was received */
  receivedAt: Date;
}
