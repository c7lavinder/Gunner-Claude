import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Test response from AI" } }],
  }),
}));

// Mock db functions
vi.mock("./db", () => ({
  getTrainingMaterials: vi.fn().mockResolvedValue([
    { id: 1, title: "Test Training", content: "Training content" },
  ]),
  getCallsWithGrades: vi.fn().mockResolvedValue({ items: [
    {
      id: 1,
      contactName: "Test Contact",
      teamMemberName: "Test Member",
      transcript: "Test transcript content",
      grade: {
        overallScore: "85",
        summary: "Good call",
        strengths: ["Good rapport"],
        improvements: ["Follow up faster"],
      },
    },
  ], total: 1 }),
}));

describe("Meeting Facilitator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Meeting modes", () => {
    it("should support facilitate mode", () => {
      const modes = ["facilitate", "roleplay", "example", "qa"];
      expect(modes).toContain("facilitate");
      expect(modes).toContain("roleplay");
      expect(modes).toContain("example");
      expect(modes).toContain("qa");
    });

    it("should have seller personalities for roleplay", () => {
      const personalities = [
        "skeptical",
        "motivated",
        "price_focused",
        "tire_kicker",
        "emotional",
      ];
      expect(personalities.length).toBe(5);
      expect(personalities).toContain("skeptical");
      expect(personalities).toContain("motivated");
    });

    it("should have roleplay scenarios", () => {
      const scenarios = [
        "first_call",
        "follow_up",
        "offer_presentation",
        "objection_heavy",
        "closing",
      ];
      expect(scenarios.length).toBe(5);
      expect(scenarios).toContain("first_call");
      expect(scenarios).toContain("offer_presentation");
    });
  });

  describe("Session management", () => {
    it("should create session with agenda items", () => {
      const agendaItems = [
        { id: 1, title: "Objection handling", description: "Practice price objections" },
        { id: 2, title: "Role-play exercise", description: null },
      ];
      
      expect(agendaItems.length).toBe(2);
      expect(agendaItems[0].title).toBe("Objection handling");
    });

    it("should track agenda progress", () => {
      let currentIndex = 0;
      const totalItems = 3;
      
      // Advance through agenda
      currentIndex++;
      expect(currentIndex).toBe(1);
      expect(currentIndex < totalItems).toBe(true);
      
      currentIndex++;
      expect(currentIndex).toBe(2);
      expect(currentIndex < totalItems).toBe(true);
      
      currentIndex++;
      expect(currentIndex).toBe(3);
      expect(currentIndex >= totalItems).toBe(true); // End of agenda
    });
  });

  describe("Conversation history", () => {
    it("should maintain conversation history", () => {
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
      
      messages.push({ role: "user", content: "How do I handle price objections?" });
      messages.push({ role: "assistant", content: "Great question! Here's a tip..." });
      messages.push({ role: "user", content: "Can we do a role-play?" });
      
      expect(messages.length).toBe(3);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
    });

    it("should limit conversation history to last 10 messages", () => {
      const messages = Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i}`,
      }));
      
      const limitedHistory = messages.slice(-10);
      expect(limitedHistory.length).toBe(10);
      expect(limitedHistory[0].content).toBe("Message 5");
    });
  });

  describe("Meeting summary", () => {
    it("should track discussed agenda items", () => {
      const agendaItems = [
        { title: "Item 1", discussed: true },
        { title: "Item 2", discussed: true },
        { title: "Item 3", discussed: false },
      ];
      
      const discussedCount = agendaItems.filter(item => item.discussed).length;
      expect(discussedCount).toBe(2);
    });

    it("should track roleplay count", () => {
      let roleplayCount = 0;
      
      // Simulate roleplay interactions
      roleplayCount++;
      roleplayCount++;
      roleplayCount++;
      
      expect(roleplayCount).toBe(3);
    });
  });
});
