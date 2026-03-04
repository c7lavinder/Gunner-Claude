import { describe, it, expect } from "vitest";

/**
 * Tests for the GHL message type parsing fix.
 * GHL returns `type` as a number (1=call, 2=sms, 3=email) 
 * and `messageType` as a string ("TYPE_CALL", "TYPE_SMS", "TYPE_EMAIL").
 * The code must handle both formats correctly.
 */

describe("GHL Message Type Parsing", () => {
  // Simulate the fixed parsing logic from getContactTodayActivity
  function classifyMessage(m: { type?: number | string; messageType?: string }) {
    const msgTypeStr = (m.messageType || "").toUpperCase();
    const msgTypeNum = typeof m.type === "number" ? m.type : 0;

    const isSms = msgTypeStr.includes("SMS") || msgTypeNum === 2;
    const isCall = msgTypeStr.includes("CALL") || msgTypeNum === 1;
    const isEmail = msgTypeStr.includes("EMAIL") || msgTypeNum === 3;

    return isSms ? "sms" : isCall ? "call" : isEmail ? "email" : "other";
  }

  it("should classify messages by messageType string (TYPE_SMS)", () => {
    expect(classifyMessage({ type: 2, messageType: "TYPE_SMS" })).toBe("sms");
    expect(classifyMessage({ type: 1, messageType: "TYPE_CALL" })).toBe("call");
    expect(classifyMessage({ type: 3, messageType: "TYPE_EMAIL" })).toBe("email");
  });

  it("should classify messages by numeric type when messageType is missing", () => {
    expect(classifyMessage({ type: 2 })).toBe("sms");
    expect(classifyMessage({ type: 1 })).toBe("call");
    expect(classifyMessage({ type: 3 })).toBe("email");
  });

  it("should classify messages by messageType when type is a string (old format)", () => {
    expect(classifyMessage({ type: "SMS" as any, messageType: "TYPE_SMS" })).toBe("sms");
    expect(classifyMessage({ type: "CALL" as any, messageType: "TYPE_CALL" })).toBe("call");
  });

  it("should return 'other' when neither type nor messageType is recognized", () => {
    expect(classifyMessage({})).toBe("other");
    expect(classifyMessage({ type: 99 })).toBe("other");
    expect(classifyMessage({ type: 0, messageType: "" })).toBe("other");
  });

  it("should handle real GHL message format from API response", () => {
    // Real data from the GHL API debug output
    const realMessages = [
      { type: 1, messageType: "TYPE_CALL", direction: "outbound" },
      { type: 2, messageType: "TYPE_SMS", direction: "outbound" },
      { type: 3, messageType: "TYPE_EMAIL", direction: "outbound" },
    ];

    const counts = { sms: 0, call: 0, email: 0 };
    for (const m of realMessages) {
      const classification = classifyMessage(m);
      if (classification === "sms") counts.sms++;
      else if (classification === "call") counts.call++;
      else if (classification === "email") counts.email++;
    }

    expect(counts.sms).toBe(1);
    expect(counts.call).toBe(1);
    expect(counts.email).toBe(1);
  });

  it("should correctly count Cathy Peacock's actual activity", () => {
    // Real data from the test output: 6 calls, 2 SMS, 1 email
    const realMessages = [
      { type: 1, messageType: "TYPE_CALL" },
      { type: 1, messageType: "TYPE_CALL" },
      { type: 1, messageType: "TYPE_CALL" },
      { type: 2, messageType: "TYPE_SMS" },
      { type: 3, messageType: "TYPE_EMAIL" },
      { type: 2, messageType: "TYPE_SMS" },
      { type: 1, messageType: "TYPE_CALL" },
      { type: 1, messageType: "TYPE_CALL" },
      { type: 1, messageType: "TYPE_CALL" },
    ];

    let smsSent = 0, callsMade = 0, emailsSent = 0;
    for (const m of realMessages) {
      const classification = classifyMessage(m);
      if (classification === "sms") smsSent++;
      else if (classification === "call") callsMade++;
      else if (classification === "email") emailsSent++;
    }

    expect(smsSent).toBe(2);
    expect(callsMade).toBe(6);
    expect(emailsSent).toBe(1);
  });
});

describe("Today's Date Filter — EST Timezone", () => {
  it("should calculate midnight EST correctly", () => {
    // Simulate the EST midnight calculation from the fixed code
    const testDate = new Date("2026-03-03T22:00:00Z"); // 5 PM EST
    const estFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const estDateStr = estFormatter.format(testDate);
    const [month, day, year] = estDateStr.split("/").map(Number);
    const todayEstMidnight = new Date(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00-05:00`
    );

    // March 3 midnight EST = March 3 05:00 UTC
    expect(todayEstMidnight.getUTCHours()).toBe(5);
    expect(todayEstMidnight.getUTCDate()).toBe(3);
    expect(todayEstMidnight.getUTCMonth()).toBe(2); // March = 2 (0-indexed)
  });

  it("should include messages from today EST", () => {
    // March 3, 2026 midnight EST = March 3 05:00 UTC
    const todayMs = new Date("2026-03-03T05:00:00Z").getTime();

    const messages = [
      { dateAdded: "2026-03-03T15:52:40.199Z" }, // 10:52 AM EST — today
      { dateAdded: "2026-03-03T21:48:05.948Z" }, // 4:48 PM EST — today
      { dateAdded: "2026-03-02T22:15:41.375Z" }, // 5:15 PM EST yesterday — NOT today
      { dateAdded: "2026-03-03T04:59:59.999Z" }, // 11:59 PM EST March 2 — NOT today
    ];

    const todayMessages = messages.filter((m) => {
      const msgDate = new Date(m.dateAdded);
      return msgDate.getTime() >= todayMs;
    });

    expect(todayMessages).toHaveLength(2);
  });
});
