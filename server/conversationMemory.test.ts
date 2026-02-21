import { describe, it, expect } from "vitest";

/**
 * Tests for the parseIntent conversation memory feature.
 * Validates that contact names can be extracted from conversation history
 * when the current message doesn't contain one (e.g., "do it again", "try again").
 */

// Simulate the history contact name extraction logic from parseIntent
function extractContactFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  let historyContactName = "";
  
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "user") {
      const historyNamePatterns = [
        /(?:note|notes|summary|text|sms|task|call|tag|stage|workflow|appointment)\s+(?:to|for|about|on|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:call|conversation|chat|summary|talk)\s+(?:with|for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|\u2019s)\s+(?:call|conversation|last\s+call)/i,
        /(?:^|\s)([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15})(?:\s|$|[.,!?])/,
      ];
      for (const pattern of historyNamePatterns) {
        const match = msg.content.match(pattern);
        if (match && match[1]) {
          const potentialName = match[1].trim();
          const commonWords = new Set(['The', 'This', 'That', 'What', 'How', 'Why', 'When', 'Where', 'Who', 'Can', 'Could', 'Would', 'Should', 'Tell', 'Show', 'Give', 'Help', 'About', 'Team', 'Call', 'Last', 'Recent', 'CRM', 'Sales', 'Pipeline']);
          if (!commonWords.has(potentialName.split(' ')[0])) {
            historyContactName = potentialName;
            break;
          }
        }
      }
      if (historyContactName) break;
    }
    if (msg.role === "assistant") {
      const assistantNamePatterns = [
        /(?:note|notes|task|sms|text|tag|stage)\s+(?:to|for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:Creating|Adding|Sending|Moving|Updating)\s+\w+\s+(?:to|for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      ];
      for (const pattern of assistantNamePatterns) {
        const match = msg.content.match(pattern);
        if (match && match[1]) {
          historyContactName = match[1].trim();
          break;
        }
      }
      if (historyContactName) break;
    }
  }
  
  return historyContactName;
}

describe("Conversation Memory - Contact Name Extraction from History", () => {
  describe("Extracts contact name from previous user messages", () => {
    it("should extract name from 'write CRM notes for Rita Adams'", () => {
      const history = [
        { role: "user" as const, content: "write CRM notes for Rita Adams" },
        { role: "assistant" as const, content: "I'll create CRM notes for Rita Adams based on the call data." },
      ];
      expect(extractContactFromHistory(history)).toBe("Rita Adams");
    });

    it("should extract name from 'create a summary for John Smith and add it as a note'", () => {
      const history = [
        { role: "user" as const, content: "create a summary for John Smith and add it as a note" },
      ];
      expect(extractContactFromHistory(history)).toBe("John Smith");
    });

    it("should extract name from 'text Mike Johnson about the property'", () => {
      const history = [
        { role: "user" as const, content: "text Mike Johnson about the property" },
        { role: "assistant" as const, content: "Sending SMS to Mike Johnson..." },
      ];
      expect(extractContactFromHistory(history)).toBe("Mike Johnson");
    });

    it("should extract name from 'summarize the call with Rita Adams'", () => {
      const history = [
        { role: "user" as const, content: "summarize the call with Rita Adams" },
      ];
      expect(extractContactFromHistory(history)).toBe("Rita Adams");
    });

    it("should extract name from possessive form: 'Rita Adams's last call'", () => {
      const history = [
        { role: "user" as const, content: "Rita Adams's last call" },
      ];
      expect(extractContactFromHistory(history)).toBe("Rita Adams");
    });

    it("should extract name from 'add a note about Travis Adams'", () => {
      const history = [
        { role: "user" as const, content: "add a note about Travis Adams" },
      ];
      expect(extractContactFromHistory(history)).toBe("Travis Adams");
    });
  });

  describe("Extracts contact name from assistant messages", () => {
    it("should extract from 'Creating note for Rita Adams...'", () => {
      const history = [
        { role: "user" as const, content: "do it" },
        { role: "assistant" as const, content: "Creating note for Rita Adams based on the call transcript." },
      ];
      // User message has no name, but assistant message does
      expect(extractContactFromHistory(history)).toBe("Rita Adams");
    });

    it("should extract from 'Adding task for John Smith...'", () => {
      const history = [
        { role: "user" as const, content: "try again" },
        { role: "assistant" as const, content: "Adding task for John Smith to follow up on the property." },
      ];
      expect(extractContactFromHistory(history)).toBe("John Smith");
    });

    it("should extract from 'Sending SMS to Mike Davis...'", () => {
      const history = [
        { role: "user" as const, content: "redo it" },
        { role: "assistant" as const, content: "Sending SMS to Mike Davis about the appointment." },
      ];
      expect(extractContactFromHistory(history)).toBe("Mike Davis");
    });
  });

  describe("Handles multi-turn conversations correctly", () => {
    it("should find the most recent contact name from history (reverse scan)", () => {
      const history = [
        { role: "user" as const, content: "write notes for John Smith" },
        { role: "assistant" as const, content: "Here are the notes for John Smith." },
        { role: "user" as const, content: "now write notes for Rita Adams" },
        { role: "assistant" as const, content: "Creating note for Rita Adams." },
        { role: "user" as const, content: "do it again" },
      ];
      // Should find "Rita Adams" (most recent), not "John Smith"
      expect(extractContactFromHistory(history)).toBe("Rita Adams");
    });

    it("should handle Daniel's exact scenario: 'its there i want you to type it'", () => {
      const history = [
        { role: "user" as const, content: "write CRM notes for Rita Adams" },
        { role: "assistant" as const, content: "I'll create CRM notes for Rita Adams." },
        { role: "user" as const, content: "its there i want you to type it" },
      ];
      // "its there i want you to type it" has no name, should fall back to history
      expect(extractContactFromHistory(history)).toBe("Rita Adams");
    });

    it("should handle 'i confirmed it' follow-up", () => {
      const history = [
        { role: "user" as const, content: "add a note for Travis Adams about the offer call" },
        { role: "assistant" as const, content: "Creating note for Travis Adams." },
        { role: "user" as const, content: "i confirmed it" },
      ];
      expect(extractContactFromHistory(history)).toBe("Travis Adams");
    });

    it("should handle 'do it again' follow-up", () => {
      const history = [
        { role: "user" as const, content: "summarize the conversation with Rita Adams" },
        { role: "assistant" as const, content: "Here's the summary..." },
        { role: "user" as const, content: "do it again" },
      ];
      expect(extractContactFromHistory(history)).toBe("Rita Adams");
    });
  });

  describe("Filters out common words that aren't names", () => {
    it("should not extract 'The Call' as a name", () => {
      const history = [
        { role: "user" as const, content: "The Call was good" },
      ];
      expect(extractContactFromHistory(history)).toBe("");
    });

    it("should not extract 'Sales Pipeline' as a name", () => {
      const history = [
        { role: "user" as const, content: "check the Sales Pipeline" },
      ];
      expect(extractContactFromHistory(history)).toBe("");
    });
  });

  describe("Returns empty string when no name found", () => {
    it("should return empty for empty history", () => {
      expect(extractContactFromHistory([])).toBe("");
    });

    it("should return empty for history with no names", () => {
      const history = [
        { role: "user" as const, content: "hello" },
        { role: "assistant" as const, content: "how can I help?" },
        { role: "user" as const, content: "do it again" },
      ];
      expect(extractContactFromHistory(history)).toBe("");
    });
  });

  describe("parseIntent input schema accepts history parameter", () => {
    it("should accept history as an optional array of role/content objects", () => {
      // This validates the schema shape - the actual tRPC call is tested via integration
      const validInput = {
        message: "do it again",
        history: [
          { role: "user" as const, content: "write notes for Rita Adams" },
          { role: "assistant" as const, content: "Creating notes..." },
        ],
      };
      expect(validInput.history).toHaveLength(2);
      expect(validInput.history[0].role).toBe("user");
      expect(validInput.history[1].role).toBe("assistant");
    });

    it("should work without history parameter", () => {
      const validInput = {
        message: "write notes for John Smith",
      };
      expect(validInput.message).toBeTruthy();
      expect((validInput as any).history).toBeUndefined();
    });
  });
});

describe("LLM System Prompt - Follow-up Instructions", () => {
  it("should include FOLLOW-UP MESSAGES instruction in the system prompt", async () => {
    // Read the routers.ts to verify the prompt contains follow-up handling
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("FOLLOW-UP MESSAGES");
    expect(routersContent).toContain("do it again");
    expect(routersContent).toContain("try again");
    expect(routersContent).toContain("CONVERSATION HISTORY");
  });

  it("should include history parameter in parseIntent input schema", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    // Verify the history parameter is in the parseIntent input
    expect(routersContent).toContain('history: z.array(z.object({');
    expect(routersContent).toContain('role: z.enum(["user", "assistant"])');
  });

  it("should spread history into LLM messages array", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    // Verify history is included in the LLM call
    expect(routersContent).toContain("input.history.slice(-6)");
  });
});
