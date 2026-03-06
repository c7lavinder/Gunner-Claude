import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Set the env var BEFORE importing the module so the default URL is picked up
const WEBHOOK_URL = "https://gunner-engine-production.up.railway.app/webhooks/gunner/call-graded";
process.env.GUNNER_ENGINE_WEBHOOK_URL = WEBHOOK_URL;
// Also set OWNER_OPEN_ID to a test value so the platform owner check can work
process.env.OWNER_OPEN_ID = "test-owner-open-id";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock the GHL contact search (used for fallback lookup)
vi.mock("./ghlActions", () => ({
  searchContacts: vi.fn().mockResolvedValue([]),
}));

// Mock the db — getDb returns a mock that finds the owner user
const mockDbSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([{ id: 1, openId: "test-owner-open-id" }]),
    }),
  }),
});
vi.mock("./db", () => ({
  updateCall: vi.fn().mockResolvedValue(null),
  getDb: vi.fn().mockResolvedValue({
    select: () => mockDbSelect(),
  }),
}));

// Mock the tenant module — return tenant with no engineWebhookUrl so it falls through to env var
vi.mock("./tenant", () => ({
  getTenantById: vi.fn().mockResolvedValue({ id: 1, name: "Test Tenant", crmConfig: '{}' }),
  parseCrmConfig: vi.fn().mockReturnValue({}),
  isPlatformOwner: vi.fn().mockReturnValue(true),
}));

// Mock the webhook retry queue
vi.mock("./webhookRetryQueue", () => ({
  queueFailedWebhook: vi.fn().mockResolvedValue(undefined),
}));

// Need to also mock drizzle schema and drizzle-orm for the dynamic imports in getWebhookUrl
vi.mock("../drizzle/schema", () => ({
  users: { tenantId: "tenantId", openId: "openId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
}));

// We need a fresh import for each test since the module caches
let sendCallGradedWebhook: any;

describe("Gunner Engine Webhook", () => {
  const validPayload = {
    callId: "123",
    contactId: "ghl-contact-456",
    teamMember: "Chris Smith",
    grade: "B" as const,
    score: 82,
    transcript: "Agent: Hello, is this the homeowner? Seller: Yes it is...",
    coachingFeedback: "Strength: Great rapport building\nImprove: Ask about timeline\nFollow up with a callback",
    callType: "qualification",
    duration: 180,
    propertyAddress: "123 Oak St, Dallas TX",
    phone: "+15551234567",
    timestamp: "2026-02-13T12:00:00.000Z",
  };

  const tenantId = 1;
  const callId = 123;

  beforeEach(async () => {
    mockFetch.mockReset();
    const mod = await import("./gunnerEngineWebhook");
    sendCallGradedWebhook = mod.sendCallGradedWebhook;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send webhook with correct URL and payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true, dryRun: true }),
    });

    const result = await sendCallGradedWebhook(validPayload, tenantId, callId);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("should return true on successful response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true, dryRun: true }),
    });

    const result = await sendCallGradedWebhook(validPayload, tenantId, callId);
    expect(result).toBe(true);
  });

  it("should return false on non-OK response (e.g. 500)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await sendCallGradedWebhook(validPayload, tenantId, callId);
    expect(result).toBe(false);
  });

  it("should return false on non-OK response (e.g. 404)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await sendCallGradedWebhook(validPayload, tenantId, callId);
    expect(result).toBe(false);
  });

  it("should return false and not throw on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await sendCallGradedWebhook(validPayload, tenantId, callId);
    expect(result).toBe(false);
  });

  it("should return false and not throw on timeout", async () => {
    mockFetch.mockRejectedValueOnce(new Error("AbortError: signal timed out"));

    const result = await sendCallGradedWebhook(validPayload, tenantId, callId);
    expect(result).toBe(false);
  });

  it("should attempt GHL contact lookup when contactId is empty", async () => {
    const { searchContacts } = await import("./ghlActions");
    const mockSearch = vi.mocked(searchContacts);
    mockSearch.mockResolvedValueOnce([
      { id: "resolved-contact-789", name: "John Doe", phone: "+15551234567", email: "john@test.com" },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const payloadNoContact = { ...validPayload, contactId: "" };
    const result = await sendCallGradedWebhook(payloadNoContact, tenantId, callId);

    expect(result).toBe(true);
    expect(mockSearch).toHaveBeenCalledWith(tenantId, "+15551234567");

    // The sent payload should have the resolved contactId
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.contactId).toBe("resolved-contact-789");
  });

  it("should send empty contactId when GHL lookup finds no match", async () => {
    const { searchContacts } = await import("./ghlActions");
    const mockSearch = vi.mocked(searchContacts);
    mockSearch.mockResolvedValueOnce([]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const payloadNoContact = { ...validPayload, contactId: "" };
    const result = await sendCallGradedWebhook(payloadNoContact, tenantId, callId);

    expect(result).toBe(true);
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.contactId).toBe("");
  });

  it("should still send webhook even if GHL lookup fails", async () => {
    const { searchContacts } = await import("./ghlActions");
    const mockSearch = vi.mocked(searchContacts);
    mockSearch.mockRejectedValueOnce(new Error("GHL API down"));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const payloadNoContact = { ...validPayload, contactId: "" };
    const result = await sendCallGradedWebhook(payloadNoContact, tenantId, callId);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should backfill ghlContactId in database when resolved", async () => {
    const { searchContacts } = await import("./ghlActions");
    const mockSearch = vi.mocked(searchContacts);
    mockSearch.mockResolvedValueOnce([
      { id: "resolved-contact-789", name: "John Doe", phone: "+15551234567", email: "john@test.com" },
    ]);

    const { updateCall } = await import("./db");
    const mockUpdate = vi.mocked(updateCall);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const payloadNoContact = { ...validPayload, contactId: "" };
    await sendCallGradedWebhook(payloadNoContact, tenantId, callId);

    expect(mockUpdate).toHaveBeenCalledWith(callId, { ghlContactId: "resolved-contact-789" });
  });

  it("should skip GHL lookup when contactId is already populated", async () => {
    const { searchContacts } = await import("./ghlActions");
    const mockSearch = vi.mocked(searchContacts);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    await sendCallGradedWebhook(validPayload, tenantId, callId);

    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("should send payload without optional propertyAddress", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const payloadNoAddress = { ...validPayload, propertyAddress: undefined };
    const result = await sendCallGradedWebhook(payloadNoAddress, tenantId, callId);

    expect(result).toBe(true);
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.callId).toBe("123");
    expect(sentBody.callType).toBe("qualification");
  });

  it("should include all required fields in the payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    await sendCallGradedWebhook(validPayload, tenantId, callId);

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody).toHaveProperty("callId", "123");
    expect(sentBody).toHaveProperty("contactId", "ghl-contact-456");
    expect(sentBody).toHaveProperty("teamMember", "Chris Smith");
    expect(sentBody).toHaveProperty("grade", "B");
    expect(sentBody).toHaveProperty("score", 82);
    expect(sentBody).toHaveProperty("transcript");
    expect(sentBody).toHaveProperty("coachingFeedback");
    expect(sentBody).toHaveProperty("callType", "qualification");
    expect(sentBody).toHaveProperty("duration", 180);
    expect(sentBody).toHaveProperty("propertyAddress", "123 Oak St, Dallas TX");
    expect(sentBody).toHaveProperty("phone", "+15551234567");
    expect(sentBody).toHaveProperty("timestamp", "2026-02-13T12:00:00.000Z");
  });

  it("should handle different call types correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const offerPayload = { ...validPayload, callType: "offer", grade: "A", score: 95 };
    await sendCallGradedWebhook(offerPayload, tenantId, callId);

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.callType).toBe("offer");
    expect(sentBody.grade).toBe("A");
    expect(sentBody.score).toBe(95);
  });

  it("should handle admin_callback call type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const adminPayload = { ...validPayload, callType: "admin_callback", grade: "C", score: 72 };
    await sendCallGradedWebhook(adminPayload, tenantId, callId);

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.callType).toBe("admin_callback");
  });

  it("should accept tenantId and callId as required parameters", () => {
    expect(sendCallGradedWebhook.length).toBe(3);
  });
});
