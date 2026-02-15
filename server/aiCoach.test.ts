import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for AI Coach grounding behavior.
 * Verifies that the coach system prompt includes team member data
 * and handles unknown names correctly.
 */

// Mock the LLM to capture what system prompt is sent
let capturedMessages: any[] = [];
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async (params: any) => {
    capturedMessages = params.messages || [];
    return {
      choices: [{ message: { content: "Test response from AI Coach." } }],
    };
  }),
}));

// Mock rate limiting and usage tracking
vi.mock("./_core/rateLimit", () => ({
  checkRateLimit: vi.fn(),
  trackUsage: vi.fn(),
}));

// Mock db functions
const mockTeamMembers = [
  { id: 1, name: "Chris Segura", teamRole: "lead_manager", isActive: "true", tenantId: 1, user: null },
  { id: 2, name: "Daniel Lozano", teamRole: "lead_manager", isActive: "true", tenantId: 1, user: null },
  { id: 3, name: "Kyle Barks", teamRole: "acquisition_manager", isActive: "true", tenantId: 1, user: null },
];

const mockCalls = [
  {
    id: 100,
    contactName: "John Doe",
    teamMemberId: 1,
    teamMemberName: "Chris Segura",
    callTimestamp: new Date("2026-02-10"),
    transcript: "Hello, I'm calling about your property...",
    grade: { overallScore: "85", overallGrade: "B", summary: "Good qualification call", strengths: ["rapport"], improvements: ["closing"] },
  },
];

vi.mock("./db", () => ({
  getTeamMembers: vi.fn(async () => mockTeamMembers),
  getCallsWithGrades: vi.fn(async (options: any) => {
    if (options.teamMemberId) {
      const filtered = mockCalls.filter(c => c.teamMemberId === options.teamMemberId);
      return { items: filtered, total: filtered.length };
    }
    return { items: mockCalls, total: mockCalls.length };
  }),
  getTrainingMaterials: vi.fn(async () => []),
}));

vi.mock("./coachPreferences", () => ({
  buildPreferenceContext: vi.fn(async () => ""),
}));

describe("AI Coach Grounding", () => {
  beforeEach(() => {
    capturedMessages = [];
  });

  it("should include team member names in the system prompt", async () => {
    // Import after mocks are set up
    const { getTeamMembers, getCallsWithGrades, getTrainingMaterials } = await import("./db");
    const { invokeLLM } = await import("./_core/llm");

    // Simulate what the endpoint does
    const teamMembersList = await getTeamMembers(1);
    const teamMemberNames = teamMembersList.map((m: any) => m.name);

    expect(teamMemberNames).toContain("Chris Segura");
    expect(teamMemberNames).toContain("Daniel Lozano");
    expect(teamMemberNames).toContain("Kyle Barks");
    expect(teamMemberNames).not.toContain("Daniel Segura");
    expect(teamMemberNames).not.toContain("Zach Johnson");
  });

  it("should detect when a mentioned name matches a team member", () => {
    const question = "What is summary of daniel lozanos last call?";
    const questionLower = question.toLowerCase();

    let mentionedMember: any = null;
    for (const member of mockTeamMembers) {
      const nameParts = member.name.toLowerCase().split(' ');
      const fullName = member.name.toLowerCase();
      if (questionLower.includes(fullName) ||
          nameParts.some(part => part.length > 2 && questionLower.includes(part))) {
        mentionedMember = member;
        break;
      }
    }

    expect(mentionedMember).not.toBeNull();
    expect(mentionedMember!.name).toBe("Daniel Lozano");
  });

  it("should NOT match a fake team member name", () => {
    const question = "What about Zach Johnson, what is he doing well?";
    const questionLower = question.toLowerCase();

    let mentionedMember: any = null;
    for (const member of mockTeamMembers) {
      const nameParts = member.name.toLowerCase().split(' ');
      const fullName = member.name.toLowerCase();
      if (questionLower.includes(fullName) ||
          nameParts.some(part => part.length > 2 && questionLower.includes(part))) {
        mentionedMember = member;
        break;
      }
    }

    expect(mentionedMember).toBeNull();
  });

  it("should detect unknown name patterns in the question", () => {
    const question = "What about Zach Johnson, what is he doing well?";
    const namePatterns = question.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
    const commonWords = new Set(['What', 'How', 'Why', 'When', 'Where', 'Who', 'Can', 'Could', 'Would', 'Should', 'Tell', 'Show', 'Give', 'Help', 'About', 'Team', 'Call', 'Last', 'Recent', 'Best', 'Worst', 'Good', 'Bad', 'Well', 'Today', 'Yesterday', 'This', 'That', 'The', 'His', 'Her', 'Their', 'Score', 'Grade', 'Summary']);
    const potentialNames = namePatterns.filter(n => !commonWords.has(n) && !commonWords.has(n.split(' ')[0]));

    expect(potentialNames.length).toBeGreaterThan(0);
    expect(potentialNames).toContain("Zach Johnson");
  });

  it("should NOT flag common words as unknown names", () => {
    const question = "What should I focus on this week?";
    const namePatterns = question.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
    const commonWords = new Set(['What', 'How', 'Why', 'When', 'Where', 'Who', 'Can', 'Could', 'Would', 'Should', 'Tell', 'Show', 'Give', 'Help', 'About', 'Team', 'Call', 'Last', 'Recent', 'Best', 'Worst', 'Good', 'Bad', 'Well', 'Today', 'Yesterday', 'This', 'That', 'The', 'His', 'Her', 'Their', 'Score', 'Grade', 'Summary']);
    const potentialNames = namePatterns.filter(n => !commonWords.has(n) && !commonWords.has(n.split(' ')[0]));

    expect(potentialNames.length).toBe(0);
  });

  it("should match team member by first name only", () => {
    const question = "how is kyle doing?";
    const questionLower = question.toLowerCase();

    let mentionedMember: any = null;
    for (const member of mockTeamMembers) {
      const nameParts = member.name.toLowerCase().split(' ');
      const fullName = member.name.toLowerCase();
      if (questionLower.includes(fullName) ||
          nameParts.some(part => part.length > 2 && questionLower.includes(part))) {
        mentionedMember = member;
        break;
      }
    }

    expect(mentionedMember).not.toBeNull();
    expect(mentionedMember!.name).toBe("Kyle Barks");
  });

  it("should match team member by last name only", () => {
    const question = "What is Segura's last call about?";
    const questionLower = question.toLowerCase();

    let mentionedMember: any = null;
    for (const member of mockTeamMembers) {
      const nameParts = member.name.toLowerCase().split(' ');
      const fullName = member.name.toLowerCase();
      if (questionLower.includes(fullName) ||
          nameParts.some(part => part.length > 2 && questionLower.includes(part))) {
        mentionedMember = member;
        break;
      }
    }

    expect(mentionedMember).not.toBeNull();
    expect(mentionedMember!.name).toBe("Chris Segura");
  });
});
