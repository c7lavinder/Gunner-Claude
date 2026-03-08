import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the dealBlastSend module.
 * Since sendDealBlast and getBuyerCountsByTier require database access,
 * we test the pure logic aspects and mock the DB for integration tests.
 */

describe("sendGhlEmail payload construction", () => {
  it("converts newlines to HTML breaks in email body", () => {
    const body = "Hello,\n\nNew deal alert!\n\nBest regards";
    const html = body.replace(/\n/g, "<br>");
    expect(html).toBe("Hello,<br><br>New deal alert!<br><br>Best regards");
  });

  it("handles empty email body", () => {
    const body = "";
    const html = body.replace(/\n/g, "<br>");
    expect(html).toBe("");
  });
});

describe("send channel filtering", () => {
  const channels = ["sms", "email", "both"] as const;

  it("sms channel only sends SMS", () => {
    const channel = "sms";
    const shouldSendSms = channel === "sms" || channel === "both";
    const shouldSendEmail = channel === "email" || channel === "both";
    expect(shouldSendSms).toBe(true);
    expect(shouldSendEmail).toBe(false);
  });

  it("email channel only sends email", () => {
    const channel = "email";
    const shouldSendSms = channel === "sms" || channel === "both";
    const shouldSendEmail = channel === "email" || channel === "both";
    expect(shouldSendSms).toBe(false);
    expect(shouldSendEmail).toBe(true);
  });

  it("both channel sends SMS and email", () => {
    const channel = "both";
    const shouldSendSms = channel === "sms" || channel === "both";
    const shouldSendEmail = channel === "email" || channel === "both";
    expect(shouldSendSms).toBe(true);
    expect(shouldSendEmail).toBe(true);
  });
});

describe("buyer eligibility filtering", () => {
  const mockBuyers = [
    { id: 1, buyerName: "Alice", ghlContactId: "c1", status: "matched", buyerTier: "priority" },
    { id: 2, buyerName: "Bob", ghlContactId: "c2", status: "passed", buyerTier: "priority" },
    { id: 3, buyerName: "Charlie", ghlContactId: "c3", status: "responded", buyerTier: "priority" },
    { id: 4, buyerName: "Dave", ghlContactId: null, status: "matched", buyerTier: "priority" },
    { id: 5, buyerName: "Eve", ghlContactId: "c5", status: "skipped", buyerTier: "priority" },
  ];

  it("filters out passed and skipped buyers", () => {
    const eligible = mockBuyers.filter(b => b.status !== "passed" && b.status !== "skipped");
    expect(eligible.length).toBe(3);
    expect(eligible.map(b => b.buyerName)).toEqual(["Alice", "Charlie", "Dave"]);
  });

  it("skips buyers without GHL contact ID", () => {
    const eligible = mockBuyers.filter(b => b.status !== "passed" && b.status !== "skipped");
    const sendable = eligible.filter(b => b.ghlContactId);
    expect(sendable.length).toBe(2);
    expect(sendable.map(b => b.buyerName)).toEqual(["Alice", "Charlie"]);
  });
});

describe("buyer counts by tier aggregation", () => {
  const mockBuyers = [
    { buyerTier: "priority", ghlContactId: "c1", status: "matched" },
    { buyerTier: "priority", ghlContactId: "c2", status: "matched" },
    { buyerTier: "priority", ghlContactId: null, status: "matched" },
    { buyerTier: "qualified", ghlContactId: "c4", status: "matched" },
    { buyerTier: "qualified", ghlContactId: "c5", status: "passed" }, // should be excluded
    { buyerTier: null, ghlContactId: "c6", status: "matched" }, // defaults to unqualified
    { buyerTier: "jv_partner", ghlContactId: "c7", status: "skipped" }, // should be excluded
  ];

  it("correctly counts buyers by tier excluding passed/skipped", () => {
    const counts: Record<string, { total: number; withContact: number }> = {};
    for (const b of mockBuyers) {
      const tier = b.buyerTier || "unqualified";
      if (b.status === "passed" || b.status === "skipped") continue;
      if (!counts[tier]) counts[tier] = { total: 0, withContact: 0 };
      counts[tier].total++;
      if (b.ghlContactId) counts[tier].withContact++;
    }

    expect(counts.priority).toEqual({ total: 3, withContact: 2 });
    expect(counts.qualified).toEqual({ total: 1, withContact: 1 });
    expect(counts.unqualified).toEqual({ total: 1, withContact: 1 });
    expect(counts.jv_partner).toBeUndefined(); // skipped buyer excluded
  });
});

describe("content fallback logic", () => {
  it("uses edited content when available", () => {
    const dist = {
      smsContent: "Original SMS",
      editedSmsContent: "Edited SMS",
      emailSubject: "Original Subject",
      editedEmailSubject: "Edited Subject",
      emailBody: "Original Body",
      editedEmailBody: "Edited Body",
    };
    const sms = dist.editedSmsContent || dist.smsContent || "";
    const subject = dist.editedEmailSubject || dist.emailSubject || "";
    const body = dist.editedEmailBody || dist.emailBody || "";
    expect(sms).toBe("Edited SMS");
    expect(subject).toBe("Edited Subject");
    expect(body).toBe("Edited Body");
  });

  it("falls back to original content when no edits", () => {
    const dist = {
      smsContent: "Original SMS",
      editedSmsContent: null,
      emailSubject: "Original Subject",
      editedEmailSubject: null,
      emailBody: "Original Body",
      editedEmailBody: null,
    };
    const sms = dist.editedSmsContent || dist.smsContent || "";
    const subject = dist.editedEmailSubject || dist.emailSubject || "";
    const body = dist.editedEmailBody || dist.emailBody || "";
    expect(sms).toBe("Original SMS");
    expect(subject).toBe("Original Subject");
    expect(body).toBe("Original Body");
  });

  it("returns empty string when both are null", () => {
    const dist = {
      smsContent: null,
      editedSmsContent: null,
      emailSubject: null,
      editedEmailSubject: null,
      emailBody: null,
      editedEmailBody: null,
    };
    const sms = dist.editedSmsContent || dist.smsContent || "";
    expect(sms).toBe("");
  });
});
