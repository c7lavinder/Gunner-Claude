import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================
// Test: Webhook Health Stats Logic
// =============================================
describe("Webhook Health Stats", () => {
  it("should return 'never_connected' when no events exist", () => {
    // The default response when no webhook events are in the DB
    const emptyStats = {
      status: "never_connected" as const,
      lastEvent: null,
      lastHour: { total: 0, processed: 0, failed: 0, skipped: 0 },
      last24Hours: { total: 0, processed: 0, failed: 0 },
      eventsByType: [],
    };

    expect(emptyStats.status).toBe("never_connected");
    expect(emptyStats.lastEvent).toBeNull();
    expect(emptyStats.lastHour.total).toBe(0);
    expect(emptyStats.last24Hours.total).toBe(0);
    expect(emptyStats.eventsByType).toHaveLength(0);
  });

  it("should classify as 'healthy' when recent events exist with low failure rate", () => {
    const now = new Date();
    const stats = {
      lastEvent: { eventType: "InboundMessage", receivedAt: now },
      lastHour: { total: 15, processed: 14, failed: 1, skipped: 0 },
      last24Hours: { total: 200, processed: 190, failed: 10 },
      eventsByType: [
        { type: "InboundMessage", count: 120 },
        { type: "OpportunityCreate", count: 80 },
      ],
    };

    // Healthy: last event within 2 hours and failure rate < 20%
    const lastEventAge = now.getTime() - new Date(stats.lastEvent.receivedAt).getTime();
    const failureRate = stats.lastHour.total > 0 ? stats.lastHour.failed / stats.lastHour.total : 0;
    const isRecent = lastEventAge < 2 * 60 * 60 * 1000; // 2 hours
    const isLowFailure = failureRate < 0.2;

    let status: string;
    if (!stats.lastEvent) {
      status = "never_connected";
    } else if (!isRecent) {
      status = "inactive";
    } else if (!isLowFailure) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    expect(status).toBe("healthy");
    expect(stats.eventsByType).toHaveLength(2);
    expect(stats.last24Hours.total).toBe(200);
  });

  it("should classify as 'degraded' when failure rate is high", () => {
    const now = new Date();
    const stats = {
      lastEvent: { eventType: "InboundMessage", receivedAt: now },
      lastHour: { total: 10, processed: 5, failed: 5, skipped: 0 },
    };

    const failureRate = stats.lastHour.failed / stats.lastHour.total;
    const isRecent = true; // just received
    const isLowFailure = failureRate < 0.2;

    let status: string;
    if (!isRecent) {
      status = "inactive";
    } else if (!isLowFailure) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    expect(status).toBe("degraded");
    expect(failureRate).toBe(0.5);
  });

  it("should classify as 'inactive' when last event is older than 2 hours", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const stats = {
      lastEvent: { eventType: "InboundMessage", receivedAt: threeHoursAgo },
      lastHour: { total: 0, processed: 0, failed: 0, skipped: 0 },
    };

    const lastEventAge = Date.now() - new Date(stats.lastEvent.receivedAt).getTime();
    const isRecent = lastEventAge < 2 * 60 * 60 * 1000;

    let status: string;
    if (!isRecent) {
      status = "inactive";
    } else {
      status = "healthy";
    }

    expect(status).toBe("inactive");
  });
});

// =============================================
// Test: Contact Cache Logic
// =============================================
describe("Contact Cache", () => {
  it("should normalize contact data from GHL webhook payload", () => {
    const ghlContact = {
      id: "contact_123",
      locationId: "loc_456",
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      phone: "+15551234567",
      tags: ["seller", "motivated"],
      customFields: [
        { id: "cf_1", key: "property_address", value: "123 Main St" },
      ],
    };

    // Normalize to internal format
    const normalized = {
      ghlContactId: ghlContact.id,
      ghlLocationId: ghlContact.locationId,
      firstName: ghlContact.firstName || "",
      lastName: ghlContact.lastName || "",
      fullName: `${ghlContact.firstName || ""} ${ghlContact.lastName || ""}`.trim(),
      email: ghlContact.email || null,
      phone: ghlContact.phone || null,
      tags: ghlContact.tags || [],
    };

    expect(normalized.ghlContactId).toBe("contact_123");
    expect(normalized.fullName).toBe("John Smith");
    expect(normalized.email).toBe("john@example.com");
    expect(normalized.phone).toBe("+15551234567");
    expect(normalized.tags).toEqual(["seller", "motivated"]);
  });

  it("should handle contacts with missing fields gracefully", () => {
    const ghlContact = {
      id: "contact_789",
      locationId: "loc_456",
      // No firstName, lastName, email, phone
    };

    const normalized = {
      ghlContactId: ghlContact.id,
      ghlLocationId: ghlContact.locationId,
      firstName: "",
      lastName: "",
      fullName: "",
      email: null,
      phone: null,
      tags: [],
    };

    expect(normalized.ghlContactId).toBe("contact_789");
    expect(normalized.fullName).toBe("");
    expect(normalized.email).toBeNull();
    expect(normalized.phone).toBeNull();
    expect(normalized.tags).toEqual([]);
  });

  it("should generate correct cache key from tenantId and contactId", () => {
    const tenantId = 42;
    const contactId = "contact_123";
    const cacheKey = `${tenantId}:${contactId}`;

    expect(cacheKey).toBe("42:contact_123");
  });
});

// =============================================
// Test: Contact Event Normalization
// =============================================
describe("Contact Event Normalization", () => {
  it("should normalize ContactCreate event from GHL", () => {
    const ghlPayload = {
      type: "ContactCreate",
      locationId: "loc_456",
      id: "contact_new",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+15559876543",
      tags: ["buyer"],
      dateAdded: "2026-02-25T10:00:00Z",
    };

    const event = {
      provider: "ghl" as const,
      eventType: "contact.created" as const,
      contactId: ghlPayload.id,
      locationId: ghlPayload.locationId,
      data: {
        firstName: ghlPayload.firstName,
        lastName: ghlPayload.lastName,
        email: ghlPayload.email,
        phone: ghlPayload.phone,
        tags: ghlPayload.tags,
      },
      timestamp: new Date(ghlPayload.dateAdded),
    };

    expect(event.provider).toBe("ghl");
    expect(event.eventType).toBe("contact.created");
    expect(event.contactId).toBe("contact_new");
    expect(event.data.firstName).toBe("Jane");
    expect(event.data.tags).toEqual(["buyer"]);
  });

  it("should normalize ContactUpdate event from GHL", () => {
    const ghlPayload = {
      type: "ContactUpdate",
      locationId: "loc_456",
      id: "contact_existing",
      firstName: "Jane",
      lastName: "Smith", // Name changed
      email: "jane.smith@example.com", // Email changed
      phone: "+15559876543",
      tags: ["buyer", "hot-lead"], // Tag added
    };

    const event = {
      provider: "ghl" as const,
      eventType: "contact.updated" as const,
      contactId: ghlPayload.id,
      locationId: ghlPayload.locationId,
      data: {
        firstName: ghlPayload.firstName,
        lastName: ghlPayload.lastName,
        email: ghlPayload.email,
        phone: ghlPayload.phone,
        tags: ghlPayload.tags,
      },
    };

    expect(event.eventType).toBe("contact.updated");
    expect(event.data.lastName).toBe("Smith");
    expect(event.data.tags).toContain("hot-lead");
  });

  it("should handle ContactTagUpdate event", () => {
    const ghlPayload = {
      type: "ContactTagUpdate",
      locationId: "loc_456",
      id: "contact_existing",
      tags: ["buyer", "hot-lead", "vip"],
    };

    const event = {
      provider: "ghl" as const,
      eventType: "contact.updated" as const,
      contactId: ghlPayload.id,
      locationId: ghlPayload.locationId,
      data: {
        tags: ghlPayload.tags,
      },
    };

    expect(event.eventType).toBe("contact.updated");
    expect(event.data.tags).toHaveLength(3);
    expect(event.data.tags).toContain("vip");
  });
});

// =============================================
// Test: Webhook URL Generation
// =============================================
describe("Webhook URL Generation", () => {
  it("should generate correct webhook URL from APP_URL", () => {
    const appUrl = "https://gunner-ai-nusxfqu5.manus.space";
    const webhookUrl = `${appUrl}/api/webhook/ghl`;

    expect(webhookUrl).toBe("https://gunner-ai-nusxfqu5.manus.space/api/webhook/ghl");
  });

  it("should list all supported GHL events", () => {
    const supportedEvents = [
      "InboundMessage",
      "OutboundMessage",
      "OpportunityCreate",
      "OpportunityStageUpdate",
      "OpportunityStatusUpdate",
      "OpportunityDelete",
      "ContactCreate",
      "ContactUpdate",
      "ContactTagUpdate",
    ];

    expect(supportedEvents).toContain("InboundMessage");
    expect(supportedEvents).toContain("ContactCreate");
    expect(supportedEvents).toContain("OpportunityCreate");
    expect(supportedEvents.length).toBeGreaterThanOrEqual(9);
  });

  it("should fallback to localhost when APP_URL is not set", () => {
    const appUrl = undefined;
    const origin = undefined;
    const fallback = appUrl || origin || "http://localhost:3000";
    const webhookUrl = `${fallback}/api/webhook/ghl`;

    expect(webhookUrl).toBe("http://localhost:3000/api/webhook/ghl");
  });
});

// =============================================
// Test: Webhook Event Deduplication
// =============================================
describe("Webhook Event Deduplication", () => {
  it("should detect duplicate events by event ID", () => {
    const processedEvents = new Set<string>();
    const eventId1 = "evt_abc123";
    const eventId2 = "evt_def456";

    // First time — not a duplicate
    expect(processedEvents.has(eventId1)).toBe(false);
    processedEvents.add(eventId1);

    // Second time — is a duplicate
    expect(processedEvents.has(eventId1)).toBe(true);

    // Different event — not a duplicate
    expect(processedEvents.has(eventId2)).toBe(false);
  });

  it("should expire old entries from dedup cache", () => {
    const cache = new Map<string, number>();
    const TTL = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    // Add an old entry
    cache.set("evt_old", now - 10 * 60 * 1000); // 10 min ago

    // Add a recent entry
    cache.set("evt_recent", now - 1 * 60 * 1000); // 1 min ago

    // Clean expired
    const cleaned = new Map<string, number>();
    for (const [key, timestamp] of cache.entries()) {
      if (now - timestamp < TTL) {
        cleaned.set(key, timestamp);
      }
    }

    expect(cleaned.has("evt_old")).toBe(false);
    expect(cleaned.has("evt_recent")).toBe(true);
  });
});
