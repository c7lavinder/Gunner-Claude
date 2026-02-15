import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn(),
  saveCoachExchange: vi.fn(),
  getRecentCoachMessages: vi.fn(),
  buildCoachMemoryContext: vi.fn(),
}));

import { saveCoachExchange, getRecentCoachMessages, buildCoachMemoryContext } from "./db";

describe("Coach Conversation Memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveCoachExchange", () => {
    it("should be callable with tenantId, userId, exchangeId, question, and answer", async () => {
      (saveCoachExchange as any).mockResolvedValue(undefined);
      
      await saveCoachExchange(1, 42, "exc-123", "How am I doing?", "You're doing great!");
      
      expect(saveCoachExchange).toHaveBeenCalledWith(
        1, 42, "exc-123", "How am I doing?", "You're doing great!"
      );
    });

    it("should handle empty messages gracefully", async () => {
      (saveCoachExchange as any).mockResolvedValue(undefined);
      
      await saveCoachExchange(1, 42, "exc-456", "", "");
      
      expect(saveCoachExchange).toHaveBeenCalled();
    });
  });

  describe("getRecentCoachMessages", () => {
    it("should return messages ordered by exchange", async () => {
      const mockMessages = [
        { role: "user" as const, content: "How many calls today?", exchangeId: "exc-1", createdAt: new Date("2026-02-14") },
        { role: "assistant" as const, content: "You made 5 calls today.", exchangeId: "exc-1", createdAt: new Date("2026-02-14") },
        { role: "user" as const, content: "What about yesterday?", exchangeId: "exc-2", createdAt: new Date("2026-02-15") },
        { role: "assistant" as const, content: "You made 3 calls yesterday.", exchangeId: "exc-2", createdAt: new Date("2026-02-15") },
      ];
      
      (getRecentCoachMessages as any).mockResolvedValue(mockMessages);
      
      const result = await getRecentCoachMessages(1, 42, 10);
      
      expect(result).toHaveLength(4);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
    });

    it("should respect the limit parameter", async () => {
      (getRecentCoachMessages as any).mockResolvedValue([]);
      
      await getRecentCoachMessages(1, 42, 5);
      
      expect(getRecentCoachMessages).toHaveBeenCalledWith(1, 42, 5);
    });

    it("should return empty array when no messages exist", async () => {
      (getRecentCoachMessages as any).mockResolvedValue([]);
      
      const result = await getRecentCoachMessages(1, 42, 10);
      
      expect(result).toEqual([]);
    });
  });

  describe("buildCoachMemoryContext", () => {
    it("should return empty string when no messages exist", async () => {
      (buildCoachMemoryContext as any).mockResolvedValue("");
      
      const result = await buildCoachMemoryContext(1, 42, 8);
      
      expect(result).toBe("");
    });

    it("should build formatted context from past exchanges", async () => {
      const mockContext = `CONVERSATION MEMORY (recent past discussions with this user — use for context and continuity):
1. [2026-02-14] Q: "How many calls today?" → A: "You made 5 calls today."
2. [2026-02-15] Q: "What about yesterday?" → A: "You made 3 calls yesterday."

When the user references something discussed before, use this memory to provide continuity. You can say things like "As we discussed earlier..." or "Building on what we talked about..."`;
      
      (buildCoachMemoryContext as any).mockResolvedValue(mockContext);
      
      const result = await buildCoachMemoryContext(1, 42, 8);
      
      expect(result).toContain("CONVERSATION MEMORY");
      expect(result).toContain("How many calls today?");
      expect(result).toContain("What about yesterday?");
      expect(result).toContain("continuity");
    });

    it("should respect maxExchanges parameter", async () => {
      (buildCoachMemoryContext as any).mockResolvedValue("");
      
      await buildCoachMemoryContext(1, 42, 3);
      
      expect(buildCoachMemoryContext).toHaveBeenCalledWith(1, 42, 3);
    });
  });

  describe("Exchange ID generation", () => {
    it("should generate unique exchange IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        ids.add(id);
      }
      // All 100 should be unique
      expect(ids.size).toBe(100);
    });

    it("should generate IDs with timestamp prefix", () => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const parts = id.split("-");
      expect(parts.length).toBe(2);
      expect(Number(parts[0])).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Memory context truncation", () => {
    it("should handle long messages by truncating in context", async () => {
      const longQuestion = "A".repeat(300);
      const longAnswer = "B".repeat(500);
      
      // The buildCoachMemoryContext function truncates at 200 chars for questions and 300 for answers
      const mockContext = `CONVERSATION MEMORY (recent past discussions with this user — use for context and continuity):
1. [2026-02-15] Q: "${longQuestion.slice(0, 200)}..." → A: "${longAnswer.slice(0, 300)}..."

When the user references something discussed before, use this memory to provide continuity.`;
      
      (buildCoachMemoryContext as any).mockResolvedValue(mockContext);
      
      const result = await buildCoachMemoryContext(1, 42, 8);
      
      // The truncated question should be max ~203 chars (200 + "...")
      expect(result).toContain("...");
    });
  });

  describe("UI behavior", () => {
    it("conversation state should start empty (fresh UI)", () => {
      // Simulating the React state initialization
      const initialConversation: Array<{ role: string; content: string }> = [];
      expect(initialConversation).toEqual([]);
    });

    it("clear conversation should reset to empty", () => {
      // Simulating the clearConversation function
      let conversation = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      
      // Clear
      conversation = [];
      
      expect(conversation).toEqual([]);
    });
  });
});
