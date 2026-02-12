import { describe, it, expect, vi, beforeEach } from "vitest";

// ============ DB Retry Logic Tests ============

describe("withDbRetry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return result on first successful attempt", async () => {
    const { withDbRetry } = await import("./db");
    const result = await withDbRetry(async () => "success");
    expect(result).toBe("success");
  });

  it("should retry on ECONNRESET error", async () => {
    const { withDbRetry } = await import("./db");
    let attempts = 0;
    const result = await withDbRetry(async () => {
      attempts++;
      if (attempts === 1) {
        const error: any = new Error("DrizzleQueryError");
        error.cause = { code: "ECONNRESET" };
        throw error;
      }
      return "recovered";
    });
    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("should retry on Connection lost error", async () => {
    const { withDbRetry } = await import("./db");
    let attempts = 0;
    const result = await withDbRetry(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("Connection lost");
      }
      return "recovered";
    });
    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("should retry on PROTOCOL_CONNECTION_LOST error", async () => {
    const { withDbRetry } = await import("./db");
    let attempts = 0;
    const result = await withDbRetry(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("PROTOCOL_CONNECTION_LOST");
      }
      return "recovered";
    });
    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("should throw non-transient errors immediately", async () => {
    const { withDbRetry } = await import("./db");
    let attempts = 0;
    await expect(
      withDbRetry(async () => {
        attempts++;
        throw new Error("Syntax error in SQL");
      })
    ).rejects.toThrow("Syntax error in SQL");
    expect(attempts).toBe(1);
  });

  it("should throw if retry also fails", async () => {
    const { withDbRetry } = await import("./db");
    let attempts = 0;
    await expect(
      withDbRetry(async () => {
        attempts++;
        const error: any = new Error("ECONNRESET");
        error.cause = { code: "ECONNRESET" };
        throw error;
      })
    ).rejects.toThrow("ECONNRESET");
    expect(attempts).toBe(2);
  });
});

// ============ Call Context Keyword Detection Tests ============

describe("Call context keyword detection", () => {
  const callKeywords = /\b(call|summary|summarize|last call|recent call|conversation)\b/i;

  it("should match 'summarize my last call'", () => {
    expect(callKeywords.test("Summarize my last call with Cindy Page")).toBe(true);
  });

  it("should match 'add a summary to notes'", () => {
    expect(callKeywords.test("Add a summary of the call to notes")).toBe(true);
  });

  it("should match 'recent call'", () => {
    expect(callKeywords.test("What was the recent call about?")).toBe(true);
  });

  it("should match 'conversation'", () => {
    expect(callKeywords.test("Summarize the conversation with John")).toBe(true);
  });

  it("should NOT match unrelated messages", () => {
    expect(callKeywords.test("Send an SMS to John")).toBe(false);
  });

  it("should NOT match 'add a tag'", () => {
    expect(callKeywords.test("Add a tag to the contact")).toBe(false);
  });

  it("should be case insensitive", () => {
    expect(callKeywords.test("SUMMARIZE THE CALL")).toBe(true);
  });
});

// ============ Call Context Formatting Tests ============

describe("Call context formatting", () => {
  it("should format call data correctly for LLM context", () => {
    const call = {
      contactName: "Cindy Page",
      callTimestamp: new Date("2026-02-10T14:30:00Z"),
      callType: "qualification",
      duration: 185, // 3m 5s
      teamMemberName: "Kyle Barks",
      gradeSummary: "Good qualification call with clear next steps",
      overallGrade: "B",
      overallScore: "82.50",
      strengths: ["Good rapport building", "Clear next steps"],
      improvements: ["Ask more qualifying questions"],
      transcript: "Rep: Hi, this is Kyle from Gunner Properties...",
    };

    let callContext = `\n--- Call with ${call.contactName || "Unknown"} ---\n`;
    callContext += `Date: ${call.callTimestamp ? new Date(call.callTimestamp).toLocaleDateString() : "Unknown"}\n`;
    callContext += `Type: ${call.callType || "Unknown"} | Duration: ${call.duration ? Math.floor(call.duration / 60) + "m " + (call.duration % 60) + "s" : "Unknown"}\n`;
    callContext += `Team Member: ${call.teamMemberName || "Unknown"}\n`;
    if (call.gradeSummary) callContext += `Grade Summary: ${call.gradeSummary}\n`;
    if (call.overallGrade) callContext += `Grade: ${call.overallGrade} (${call.overallScore}%)\n`;

    expect(callContext).toContain("Cindy Page");
    expect(callContext).toContain("qualification");
    expect(callContext).toContain("3m 5s");
    expect(callContext).toContain("Kyle Barks");
    expect(callContext).toContain("Good qualification call");
    expect(callContext).toContain("B (82.50%)");
  });

  it("should truncate long transcripts to 2000 chars", () => {
    const longTranscript = "A".repeat(3000);
    const truncated = longTranscript.length > 2000
      ? longTranscript.substring(0, 2000) + "... [truncated]"
      : longTranscript;

    expect(truncated.length).toBe(2000 + "... [truncated]".length);
    expect(truncated).toContain("... [truncated]");
  });

  it("should not truncate short transcripts", () => {
    const shortTranscript = "Hi, this is a short call.";
    const result = shortTranscript.length > 2000
      ? shortTranscript.substring(0, 2000) + "... [truncated]"
      : shortTranscript;

    expect(result).toBe(shortTranscript);
    expect(result).not.toContain("[truncated]");
  });

  it("should handle missing fields gracefully", () => {
    const call = {
      contactName: null,
      callTimestamp: null,
      callType: null,
      duration: null,
      teamMemberName: null,
    };

    let callContext = `\n--- Call with ${call.contactName || "Unknown"} ---\n`;
    callContext += `Type: ${call.callType || "Unknown"} | Duration: ${call.duration ? Math.floor(call.duration / 60) + "m " + (call.duration % 60) + "s" : "Unknown"}\n`;
    callContext += `Team Member: ${call.teamMemberName || "Unknown"}\n`;

    expect(callContext).toContain("Unknown");
    expect(callContext).not.toContain("null");
  });
});

// ============ resetDbConnection Tests ============

describe("resetDbConnection", () => {
  it("should reset the internal DB reference", async () => {
    const { resetDbConnection, getDb } = await import("./db");
    // Call getDb to initialize
    await getDb();
    // Reset should not throw
    expect(() => resetDbConnection()).not.toThrow();
  });
});
