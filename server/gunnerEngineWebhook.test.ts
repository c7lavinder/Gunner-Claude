import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendCallGradedWebhook } from "./gunnerEngineWebhook";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send webhook with correct URL and payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true, dryRun: true }),
    });

    const result = await sendCallGradedWebhook(validPayload);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://gunner-engine-production.up.railway.app/webhooks/gunner/call-graded",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPayload),
      }
    );
  });

  it("should return true on successful response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true, dryRun: true }),
    });

    const result = await sendCallGradedWebhook(validPayload);
    expect(result).toBe(true);
  });

  it("should return false on non-OK response (e.g. 500)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await sendCallGradedWebhook(validPayload);
    expect(result).toBe(false);
  });

  it("should return false on non-OK response (e.g. 404)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await sendCallGradedWebhook(validPayload);
    expect(result).toBe(false);
  });

  it("should return false and not throw on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await sendCallGradedWebhook(validPayload);
    expect(result).toBe(false);
  });

  it("should return false and not throw on timeout", async () => {
    mockFetch.mockRejectedValueOnce(new Error("AbortError: signal timed out"));

    const result = await sendCallGradedWebhook(validPayload);
    expect(result).toBe(false);
  });

  it("should send payload without optional contactId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const payloadNoContact = { ...validPayload, contactId: undefined };
    const result = await sendCallGradedWebhook(payloadNoContact);

    expect(result).toBe(true);
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    // contactId should not be present or be undefined in the payload
    expect(sentBody.callId).toBe("123");
    expect(sentBody.teamMember).toBe("Chris Smith");
    expect(sentBody.grade).toBe("B");
    expect(sentBody.score).toBe(82);
  });

  it("should send payload without optional propertyAddress", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const payloadNoAddress = { ...validPayload, propertyAddress: undefined };
    const result = await sendCallGradedWebhook(payloadNoAddress);

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

    await sendCallGradedWebhook(validPayload);

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
    await sendCallGradedWebhook(offerPayload);

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
    await sendCallGradedWebhook(adminPayload);

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.callType).toBe("admin_callback");
  });

  it("should handle empty transcript gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const emptyTranscriptPayload = { ...validPayload, transcript: "" };
    const result = await sendCallGradedWebhook(emptyTranscriptPayload);

    expect(result).toBe(true);
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.transcript).toBe("");
  });

  it("should handle empty phone gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ received: true }),
    });

    const emptyPhonePayload = { ...validPayload, phone: "" };
    const result = await sendCallGradedWebhook(emptyPhonePayload);

    expect(result).toBe(true);
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.phone).toBe("");
  });
});
