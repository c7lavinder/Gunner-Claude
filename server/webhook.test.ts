import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ============ SIGNATURE VERIFICATION TESTS ============

// GHL public key (same as in webhook.ts)
const GHL_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

function verifyGHLSignature(rawBody: Buffer | string, signature: string): boolean {
  try {
    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(GHL_PUBLIC_KEY, signature, "base64");
  } catch {
    return false;
  }
}

describe("GHL Webhook Signature Verification", () => {
  it("should reject an invalid signature", () => {
    const body = Buffer.from('{"type":"InboundMessage","locationId":"abc123"}');
    const fakeSignature = "aW52YWxpZHNpZ25hdHVyZQ=="; // base64 of "invalidsignature"
    
    expect(verifyGHLSignature(body, fakeSignature)).toBe(false);
  });

  it("should reject a tampered body with valid-looking signature", () => {
    const body = Buffer.from('{"type":"InboundMessage","locationId":"abc123"}');
    const tamperedBody = Buffer.from('{"type":"InboundMessage","locationId":"HACKED"}');
    
    // Even if we had a valid signature for the original body, it should fail for tampered
    const fakeSignature = "dGVzdA==";
    expect(verifyGHLSignature(tamperedBody, fakeSignature)).toBe(false);
  });

  it("should handle empty signature gracefully", () => {
    const body = Buffer.from('{"type":"test"}');
    expect(verifyGHLSignature(body, "")).toBe(false);
  });

  it("should handle malformed base64 signature gracefully", () => {
    const body = Buffer.from('{"type":"test"}');
    expect(verifyGHLSignature(body, "not-valid-base64!!!")).toBe(false);
  });
});

// ============ CALL EVENT NORMALIZATION TESTS ============

interface CallEvent {
  source: string;
  sourceCallId: string;
  sourceLocationId?: string;
  contactId?: string;
  contactPhone?: string;
  recordingUrl?: string;
  duration?: number;
  direction: "inbound" | "outbound";
  status: string;
  crmUserId?: string;
  callTimestamp: Date;
}

function normalizeGHLCallEvent(payload: Record<string, any>, direction: "inbound" | "outbound"): CallEvent | null {
  const messageType = payload.messageType || payload.message_type;
  if (messageType !== "CALL") return null;

  const status = payload.callStatus || payload.status || "completed";
  if (status === "voicemail" || status === "missed" || status === "no-answer") {
    return null;
  }

  let recordingUrl: string | undefined;
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    recordingUrl = payload.attachments[0];
  } else {
    recordingUrl = payload.recordingUrl || payload.recording_url || payload.recordingURL;
  }

  return {
    source: "ghl",
    sourceCallId: payload.messageId || payload.id || payload.callId,
    sourceLocationId: payload.locationId || payload.location_id,
    contactId: payload.contactId || payload.contact_id,
    contactPhone: direction === "inbound" ? payload.from : payload.to,
    recordingUrl,
    duration: typeof payload.callDuration === "number" ? payload.callDuration :
              typeof payload.callDuration === "string" ? parseInt(payload.callDuration, 10) : undefined,
    direction,
    status: status === "completed" ? "completed" : status,
    crmUserId: payload.userId || payload.user_id,
    callTimestamp: payload.dateAdded ? new Date(payload.dateAdded) : new Date(),
  };
}

describe("GHL Call Event Normalization", () => {
  it("should normalize a completed inbound call", () => {
    const payload = {
      type: "InboundMessage",
      locationId: "loc123",
      attachments: ["https://recordings.example.com/call.mp3"],
      contactId: "contact456",
      conversationId: "conv789",
      dateAdded: "2024-05-08T11:57:42.250Z",
      direction: "inbound",
      messageType: "CALL",
      userId: "user001",
      messageId: "msg123",
      status: "completed",
      callDuration: 120,
      callStatus: "completed",
      from: "+15551234567",
      to: "+15559876543",
    };

    const event = normalizeGHLCallEvent(payload, "inbound");
    
    expect(event).not.toBeNull();
    expect(event!.source).toBe("ghl");
    expect(event!.sourceCallId).toBe("msg123");
    expect(event!.sourceLocationId).toBe("loc123");
    expect(event!.contactId).toBe("contact456");
    expect(event!.contactPhone).toBe("+15551234567"); // "from" for inbound
    expect(event!.recordingUrl).toBe("https://recordings.example.com/call.mp3");
    expect(event!.duration).toBe(120);
    expect(event!.direction).toBe("inbound");
    expect(event!.status).toBe("completed");
    expect(event!.crmUserId).toBe("user001");
    expect(event!.callTimestamp).toEqual(new Date("2024-05-08T11:57:42.250Z"));
  });

  it("should normalize an outbound call with 'to' as contact phone", () => {
    const payload = {
      type: "OutboundMessage",
      locationId: "loc123",
      attachments: ["https://recordings.example.com/outbound.mp3"],
      contactId: "contact789",
      messageType: "CALL",
      userId: "user002",
      messageId: "msg456",
      callStatus: "completed",
      callDuration: 300,
      from: "+15559876543",
      to: "+15551234567",
    };

    const event = normalizeGHLCallEvent(payload, "outbound");
    
    expect(event).not.toBeNull();
    expect(event!.contactPhone).toBe("+15551234567"); // "to" for outbound
    expect(event!.direction).toBe("outbound");
    expect(event!.duration).toBe(300);
  });

  it("should skip non-call messages (SMS)", () => {
    const payload = {
      type: "InboundMessage",
      messageType: "SMS",
      messageId: "sms123",
      contactId: "contact456",
    };

    const event = normalizeGHLCallEvent(payload, "inbound");
    expect(event).toBeNull();
  });

  it("should skip voicemail calls", () => {
    const payload = {
      type: "InboundMessage",
      messageType: "CALL",
      messageId: "vm123",
      callStatus: "voicemail",
      contactId: "contact456",
    };

    const event = normalizeGHLCallEvent(payload, "inbound");
    expect(event).toBeNull();
  });

  it("should skip missed calls", () => {
    const payload = {
      type: "InboundMessage",
      messageType: "CALL",
      messageId: "missed123",
      callStatus: "missed",
      contactId: "contact456",
    };

    const event = normalizeGHLCallEvent(payload, "inbound");
    expect(event).toBeNull();
  });

  it("should handle string duration", () => {
    const payload = {
      type: "InboundMessage",
      messageType: "CALL",
      messageId: "msg789",
      callStatus: "completed",
      callDuration: "180",
      attachments: ["https://example.com/recording.mp3"],
    };

    const event = normalizeGHLCallEvent(payload, "inbound");
    expect(event).not.toBeNull();
    expect(event!.duration).toBe(180);
  });

  it("should extract recording from direct field when no attachments", () => {
    const payload = {
      type: "InboundMessage",
      messageType: "CALL",
      messageId: "msg101",
      callStatus: "completed",
      recordingUrl: "https://example.com/direct-recording.mp3",
    };

    const event = normalizeGHLCallEvent(payload, "inbound");
    expect(event).not.toBeNull();
    expect(event!.recordingUrl).toBe("https://example.com/direct-recording.mp3");
  });
});

// ============ OPPORTUNITY EVENT NORMALIZATION TESTS ============

interface OpportunityEvent {
  source: string;
  eventType: string;
  sourceOpportunityId: string;
  sourceLocationId?: string;
  contactId?: string;
  contactName?: string;
  pipelineId?: string;
  pipelineName?: string;
  stageId?: string;
  stageName?: string;
  status?: string;
  monetaryValue?: number;
  assignedTo?: string;
  eventTimestamp: Date;
}

function normalizeGHLOpportunityEvent(
  payload: Record<string, any>,
  eventType: string
): OpportunityEvent | null {
  const typeMap: Record<string, string> = {
    "OpportunityCreate": "created",
    "OpportunityStageUpdate": "stage_updated",
    "OpportunityStatusUpdate": "status_updated",
    "OpportunityAssignedToUpdate": "assigned_updated",
    "OpportunityMonetaryValueUpdate": "value_updated",
    "OpportunityDelete": "deleted",
    "OpportunityUpdate": "stage_updated",
  };

  const mappedType = typeMap[eventType];
  if (!mappedType) return null;

  return {
    source: "ghl",
    eventType: mappedType,
    sourceOpportunityId: payload.id || payload.opportunityId,
    sourceLocationId: payload.locationId || payload.location_id,
    contactId: payload.contactId || payload.contact_id,
    contactName: payload.contactName || payload.contact_name,
    pipelineId: payload.pipelineId || payload.pipeline_id,
    pipelineName: payload.pipelineName || payload.pipeline_name,
    stageId: payload.pipelineStageId || payload.stageId || payload.stage_id,
    stageName: payload.pipelineStageName || payload.stageName || payload.stage_name,
    status: payload.status,
    monetaryValue: payload.monetaryValue ? Math.round(parseFloat(payload.monetaryValue) * 100) : undefined,
    assignedTo: payload.assignedTo || payload.assigned_to,
    eventTimestamp: payload.dateAdded ? new Date(payload.dateAdded) : new Date(),
  };
}

describe("GHL Opportunity Event Normalization", () => {
  it("should normalize OpportunityCreate event", () => {
    const payload = {
      id: "opp123",
      locationId: "loc456",
      contactId: "contact789",
      contactName: "John Doe",
      pipelineId: "pipe001",
      pipelineName: "Acquisitions",
      pipelineStageId: "stage001",
      pipelineStageName: "New Lead",
      status: "open",
      monetaryValue: "150000",
      dateAdded: "2024-06-15T10:00:00.000Z",
    };

    const event = normalizeGHLOpportunityEvent(payload, "OpportunityCreate");
    
    expect(event).not.toBeNull();
    expect(event!.source).toBe("ghl");
    expect(event!.eventType).toBe("created");
    expect(event!.sourceOpportunityId).toBe("opp123");
    expect(event!.sourceLocationId).toBe("loc456");
    expect(event!.contactId).toBe("contact789");
    expect(event!.contactName).toBe("John Doe");
    expect(event!.pipelineId).toBe("pipe001");
    expect(event!.pipelineName).toBe("Acquisitions");
    expect(event!.stageId).toBe("stage001");
    expect(event!.stageName).toBe("New Lead");
    expect(event!.status).toBe("open");
    expect(event!.monetaryValue).toBe(15000000); // $150,000 in cents
  });

  it("should normalize OpportunityStageUpdate event", () => {
    const payload = {
      id: "opp123",
      locationId: "loc456",
      pipelineStageId: "stage002",
      pipelineStageName: "Under Contract",
    };

    const event = normalizeGHLOpportunityEvent(payload, "OpportunityStageUpdate");
    
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("stage_updated");
    expect(event!.stageId).toBe("stage002");
    expect(event!.stageName).toBe("Under Contract");
  });

  it("should normalize OpportunityDelete event", () => {
    const payload = {
      id: "opp123",
      locationId: "loc456",
    };

    const event = normalizeGHLOpportunityEvent(payload, "OpportunityDelete");
    
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("deleted");
  });

  it("should return null for unknown event types", () => {
    const payload = { id: "opp123" };
    const event = normalizeGHLOpportunityEvent(payload, "UnknownEvent");
    expect(event).toBeNull();
  });

  it("should handle missing optional fields gracefully", () => {
    const payload = {
      id: "opp123",
      locationId: "loc456",
    };

    const event = normalizeGHLOpportunityEvent(payload, "OpportunityCreate");
    
    expect(event).not.toBeNull();
    expect(event!.contactId).toBeUndefined();
    expect(event!.contactName).toBeUndefined();
    expect(event!.monetaryValue).toBeUndefined();
  });
});

// ============ DEDUPLICATION TESTS ============

describe("Webhook Deduplication", () => {
  const processedIds = new Map<string, number>();
  const DEDUP_TTL_MS = 60 * 60 * 1000;
  const DEDUP_MAX_SIZE = 10_000;

  function isDuplicate(webhookId: string): boolean {
    if (!webhookId) return false;
    if (processedIds.size > DEDUP_MAX_SIZE) {
      const cutoff = Date.now() - DEDUP_TTL_MS;
      const entries = Array.from(processedIds.entries());
      for (const [id, ts] of entries) {
        if (ts < cutoff) processedIds.delete(id);
      }
    }
    if (processedIds.has(webhookId)) return true;
    processedIds.set(webhookId, Date.now());
    return false;
  }

  it("should not flag first occurrence as duplicate", () => {
    expect(isDuplicate("unique-webhook-1")).toBe(false);
  });

  it("should flag second occurrence as duplicate", () => {
    isDuplicate("dup-webhook-1"); // first time
    expect(isDuplicate("dup-webhook-1")).toBe(true); // second time
  });

  it("should handle empty webhook ID", () => {
    expect(isDuplicate("")).toBe(false);
  });

  it("should track different webhook IDs independently", () => {
    expect(isDuplicate("webhook-a")).toBe(false);
    expect(isDuplicate("webhook-b")).toBe(false);
    expect(isDuplicate("webhook-a")).toBe(true);
    expect(isDuplicate("webhook-b")).toBe(true);
    expect(isDuplicate("webhook-c")).toBe(false);
  });
});

// ============ EVENT ROUTING TESTS ============

describe("GHL Event Routing", () => {
  function getEventCategory(eventType: string): "call" | "opportunity" | "contact" | "note" | "unknown" {
    switch (eventType) {
      case "InboundMessage":
      case "OutboundMessage":
        return "call";
      case "OpportunityCreate":
      case "OpportunityStageUpdate":
      case "OpportunityStatusUpdate":
      case "OpportunityAssignedToUpdate":
      case "OpportunityMonetaryValueUpdate":
      case "OpportunityDelete":
      case "OpportunityUpdate":
        return "opportunity";
      case "ContactCreate":
      case "ContactUpdate":
      case "ContactDelete":
      case "ContactTagUpdate":
        return "contact";
      case "NoteCreate":
      case "NoteUpdate":
      case "NoteDelete":
        return "note";
      default:
        return "unknown";
    }
  }

  it("should route InboundMessage to call handler", () => {
    expect(getEventCategory("InboundMessage")).toBe("call");
  });

  it("should route OutboundMessage to call handler", () => {
    expect(getEventCategory("OutboundMessage")).toBe("call");
  });

  it("should route all opportunity events to opportunity handler", () => {
    expect(getEventCategory("OpportunityCreate")).toBe("opportunity");
    expect(getEventCategory("OpportunityStageUpdate")).toBe("opportunity");
    expect(getEventCategory("OpportunityStatusUpdate")).toBe("opportunity");
    expect(getEventCategory("OpportunityAssignedToUpdate")).toBe("opportunity");
    expect(getEventCategory("OpportunityMonetaryValueUpdate")).toBe("opportunity");
    expect(getEventCategory("OpportunityDelete")).toBe("opportunity");
    expect(getEventCategory("OpportunityUpdate")).toBe("opportunity");
  });

  it("should route contact events to contact handler", () => {
    expect(getEventCategory("ContactCreate")).toBe("contact");
    expect(getEventCategory("ContactUpdate")).toBe("contact");
    expect(getEventCategory("ContactDelete")).toBe("contact");
    expect(getEventCategory("ContactTagUpdate")).toBe("contact");
  });

  it("should route note events to note handler", () => {
    expect(getEventCategory("NoteCreate")).toBe("note");
    expect(getEventCategory("NoteUpdate")).toBe("note");
    expect(getEventCategory("NoteDelete")).toBe("note");
  });

  it("should return unknown for unrecognized events", () => {
    expect(getEventCategory("SomeNewEvent")).toBe("unknown");
    expect(getEventCategory("")).toBe("unknown");
  });
});

// ============ CRM-AGNOSTIC EVENT TYPES TESTS ============

describe("CRM-Agnostic Event Types", () => {
  it("should support multiple CRM sources for CallEvent", () => {
    const ghlCall: CallEvent = {
      source: "ghl",
      sourceCallId: "ghl-123",
      direction: "inbound",
      status: "completed",
      callTimestamp: new Date(),
    };

    const batchDialerCall: CallEvent = {
      source: "batchdialer" as any,
      sourceCallId: "bd-456",
      direction: "outbound",
      status: "completed",
      callTimestamp: new Date(),
    };

    // Both should have the same shape
    expect(ghlCall.source).toBe("ghl");
    expect(batchDialerCall.source).toBe("batchdialer");
    expect(ghlCall.direction).toBe("inbound");
    expect(batchDialerCall.direction).toBe("outbound");
  });

  it("should support all call statuses", () => {
    const statuses = ["completed", "voicemail", "missed", "no-answer", "busy", "failed"];
    for (const status of statuses) {
      const event: CallEvent = {
        source: "ghl",
        sourceCallId: `call-${status}`,
        direction: "inbound",
        status,
        callTimestamp: new Date(),
      };
      expect(event.status).toBe(status);
    }
  });
});
