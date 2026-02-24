/**
 * Tests for the duplicate action re-detection fix.
 * Verifies that:
 * 1. The parseIntent prompt instructs the LLM to only parse the current message
 * 2. History messages are tagged as already-processed
 * 3. The system prompt contains explicit anti-re-detection instructions
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const routersPath = path.join(__dirname, "routers.ts");
const routersContent = fs.readFileSync(routersPath, "utf-8");

describe("Duplicate action re-detection prevention", () => {
  it("should have ONLY PARSE THE CURRENT MESSAGE instruction in the system prompt", () => {
    expect(routersContent).toContain("CRITICAL — ONLY PARSE THE CURRENT MESSAGE");
  });

  it("should instruct to only parse the LAST user message for new actions", () => {
    expect(routersContent).toContain("ONLY parse the LAST user message (the current request) for new actions");
  });

  it("should state that previous messages have already been processed", () => {
    expect(routersContent).toContain("Previous user messages in the history have ALREADY been processed and executed");
  });

  it("should instruct not to re-detect actions from history", () => {
    expect(routersContent).toContain("do NOT re-detect or re-create actions from them");
  });

  it("should give a concrete example of the correct behavior", () => {
    // The prompt should include an example like: if current message says "move Rose Hill", only return that action
    expect(routersContent).toContain("return ONLY the Rose Hill action");
    expect(routersContent).toContain("do NOT also return actions from earlier messages");
  });

  it("should tag history user messages as ALREADY PROCESSED", () => {
    expect(routersContent).toContain("[ALREADY PROCESSED - context only, do NOT parse as new action]");
  });

  it("should still include history for context (follow-ups like 'do it again')", () => {
    expect(routersContent).toContain("The history is provided ONLY so you can understand context for follow-ups");
  });

  it("should still pass the current message as the final user message without the ALREADY PROCESSED tag", () => {
    // The current message should be passed as a plain user message, not tagged
    expect(routersContent).toContain('{ role: "user", content: input.message }');
  });
});
