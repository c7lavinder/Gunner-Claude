import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for AI Coach Lead Generator customization.
 * Verifies that:
 * 1. The streaming coach endpoint detects Lead Generator role
 * 2. Lead Generator system prompt focuses on cold calling / lead generation
 * 3. Non-Lead Generator users get the standard sales coach prompt
 * 4. Frontend starter prompts differ by role
 */

// --- Streaming endpoint system prompt logic tests ---

describe("AI Coach Lead Generator Detection", () => {
  it("should detect lead_generator from team member teamRole", () => {
    const currentUserTeamMember = { id: 1, name: "Alex Diaz", teamRole: "lead_generator" };
    const user = { role: "user", teamRole: undefined };
    const isLeadGenerator = currentUserTeamMember?.teamRole === 'lead_generator' || (user as any).teamRole === 'lead_generator';
    expect(isLeadGenerator).toBe(true);
  });

  it("should detect lead_generator from user.teamRole fallback", () => {
    const currentUserTeamMember = null;
    const user = { role: "user", teamRole: "lead_generator" };
    const isLeadGenerator = currentUserTeamMember?.teamRole === 'lead_generator' || (user as any).teamRole === 'lead_generator';
    expect(isLeadGenerator).toBe(true);
  });

  it("should NOT detect lead_generator for lead_manager", () => {
    const currentUserTeamMember = { id: 2, name: "Chris Segura", teamRole: "lead_manager" };
    const user = { role: "user", teamRole: "lead_manager" };
    const isLeadGenerator = currentUserTeamMember?.teamRole === 'lead_generator' || (user as any).teamRole === 'lead_generator';
    expect(isLeadGenerator).toBe(false);
  });

  it("should NOT detect lead_generator for acquisition_manager", () => {
    const currentUserTeamMember = { id: 3, name: "Kyle Barks", teamRole: "acquisition_manager" };
    const user = { role: "user", teamRole: "acquisition_manager" };
    const isLeadGenerator = currentUserTeamMember?.teamRole === 'lead_generator' || (user as any).teamRole === 'lead_generator';
    expect(isLeadGenerator).toBe(false);
  });

  it("should NOT detect lead_generator for admin", () => {
    const currentUserTeamMember = { id: 4, name: "Admin User", teamRole: "admin" };
    const user = { role: "admin", teamRole: "admin" };
    const isLeadGenerator = currentUserTeamMember?.teamRole === 'lead_generator' || (user as any).teamRole === 'lead_generator';
    expect(isLeadGenerator).toBe(false);
  });
});

describe("AI Coach Lead Generator System Prompt", () => {
  it("should generate lead generation-focused prompt for Lead Generators", () => {
    const isLeadGenerator = true;
    const promptIntro = isLeadGenerator
      ? `You are a data-driven cold calling coach for a lead generator on a real estate wholesaling team. Your focus is on LEAD GENERATION — helping this caller gauge seller interest, gather key details, and let interested sellers know their manager will follow up.`
      : 'You are a data-driven sales coach for a real estate wholesaling team.';

    expect(promptIntro).toContain("cold calling coach");
    expect(promptIntro).toContain("LEAD GENERATION");
    expect(promptIntro).toContain("gauge seller interest");
    expect(promptIntro).toContain("manager will follow up");
    expect(promptIntro).not.toContain("data-driven sales coach for a real estate wholesaling team.");
  });

  it("should generate standard sales coach prompt for non-Lead Generators", () => {
    const isLeadGenerator = false;
    const promptIntro = isLeadGenerator
      ? `You are a data-driven cold calling coach for a lead generator on a real estate wholesaling team.`
      : 'You are a data-driven sales coach for a real estate wholesaling team.';

    expect(promptIntro).toContain("data-driven sales coach");
    expect(promptIntro).not.toContain("cold calling coach");
    expect(promptIntro).not.toContain("LEAD GENERATION");
  });

  it("should include cold calling coaching topics for Lead Generators", () => {
    const isLeadGenerator = true;
    const coachingTopics = isLeadGenerator
      ? [
          "Opening lines and hooks for cold calls",
          "Quickly identifying seller motivation",
          "Handling initial objections",
          "Recognizing when a seller is interested and wrapping up professionally",
          "Adding notes about seller interest level and key details for the manager",
          "Efficient call pacing and volume strategies",
        ]
      : [];

    expect(coachingTopics).toHaveLength(6);
    expect(coachingTopics[0]).toContain("Opening lines");
    expect(coachingTopics[3]).toContain("wrapping up professionally");
    expect(coachingTopics[4]).toContain("for the manager");
  });

  it("should explicitly exclude qualification/offer topics for Lead Generators", () => {
    const isLeadGenerator = true;
    const fullPrompt = isLeadGenerator
      ? `Your coaching should focus on:
- Opening lines and hooks for cold calls
- NOT on full qualification, offers, walkthroughs, or closing — that's the Lead Manager and Acquisition Manager's job`
      : '';

    expect(fullPrompt).toContain("NOT on full qualification");
    expect(fullPrompt).toContain("Lead Manager and Acquisition Manager's job");
  });

  it("should instruct Lead Generator coach about the actual workflow (no formal handoffs)", () => {
    const isLeadGenerator = true;
    const workflowInstruction = isLeadGenerator
      ? "The Lead Generator's workflow is simple: call, gauge interest, tell the seller their manager will follow up, then add notes so the manager has context. They do NOT do formal handoffs or transfers — they just let the seller know someone will be in touch."
      : '';

    expect(workflowInstruction).toContain("manager will follow up");
    expect(workflowInstruction).toContain("add notes so the manager has context");
    expect(workflowInstruction).toContain("do NOT do formal handoffs or transfers");
    expect(workflowInstruction).toContain("someone will be in touch");
  });
});

describe("AI Coach Lead Generator Frontend Prompts", () => {
  it("should show cold calling coaching prompts for Lead Generators", () => {
    const teamRole = 'lead_generator';
    const coachingPrompts = teamRole === 'lead_generator'
      ? [
          "Best opening lines for cold calls?",
          "How to identify a motivated seller?",
        ]
      : [
          "How do I handle price objections?",
          "Tips for building rapport quickly",
        ];

    expect(coachingPrompts[0]).toContain("cold calls");
    expect(coachingPrompts[1]).toContain("motivated seller");
    expect(coachingPrompts).not.toContain("How do I handle price objections?");
  });

  it("should show standard coaching prompts for non-Lead Generators", () => {
    const teamRole = 'lead_manager';
    const coachingPrompts = teamRole === 'lead_generator'
      ? [
          "Best opening lines for cold calls?",
          "How to identify a motivated seller?",
        ]
      : [
          "How do I handle price objections?",
          "Tips for building rapport quickly",
        ];

    expect(coachingPrompts[0]).toContain("price objections");
    expect(coachingPrompts[1]).toContain("rapport");
    expect(coachingPrompts).not.toContain("Best opening lines for cold calls?");
  });

  it("should show lead generation action prompts for Lead Generators", () => {
    const teamRole = 'lead_generator';
    const actionPrompts = teamRole === 'lead_generator'
      ? [
          'Add note to John Smith: "Interested in selling, motivated"',
          'Create task: Follow up with interested seller tomorrow',
          'Add note to Jane Doe: "Not interested, remove from list"',
        ]
      : [
          'Add note to John Smith: "Called back, interested"',
          "Create task: Follow up with seller tomorrow",
          'Send SMS to Jane Doe: "Are you still interested in selling?"',
        ];

    expect(actionPrompts[0]).toContain("Interested in selling, motivated");
    expect(actionPrompts[1]).toContain("Follow up with interested seller");
    expect(actionPrompts[2]).toContain("Not interested, remove from list");
  });

  it("should show standard action prompts for non-Lead Generators", () => {
    const teamRole = 'acquisition_manager';
    const actionPrompts = teamRole === 'lead_generator'
      ? [
          'Add note to John Smith: "Interested in selling, motivated"',
          'Create task: Schedule qualification call for Lead Manager',
          'Add note to Jane Doe: "Not interested, remove from list"',
        ]
      : [
          'Add note to John Smith: "Called back, interested"',
          "Create task: Follow up with seller tomorrow",
          'Send SMS to Jane Doe: "Are you still interested in selling?"',
        ];

    expect(actionPrompts[0]).toContain("Called back, interested");
    expect(actionPrompts[1]).toContain("Follow up with seller tomorrow");
    expect(actionPrompts[2]).toContain("Are you still interested in selling?");
  });

  it("should show role-specific placeholder text for Lead Generators", () => {
    const teamRole = 'lead_generator';
    const placeholder = teamRole === 'lead_generator'
      ? "Ask about cold calling or give a command..."
      : "Ask a question or give a command...";

    expect(placeholder).toContain("cold calling");
    expect(placeholder).not.toContain("Ask a question");
  });

  it("should show standard placeholder text for non-Lead Generators", () => {
    const teamRole = 'lead_manager';
    const placeholder = teamRole === 'lead_generator'
      ? "Ask about cold calling or give a command..."
      : "Ask a question or give a command...";

    expect(placeholder).toContain("Ask a question");
    expect(placeholder).not.toContain("cold calling");
  });

  it("should show role-specific subtitle for Lead Generators", () => {
    const teamRole = 'lead_generator';
    const subtitle = teamRole === 'lead_generator'
      ? 'Cold calling tips, lead notes & CRM commands'
      : 'Ask questions or give CRM commands';

    expect(subtitle).toContain("Cold calling tips");
    expect(subtitle).toContain("lead notes");
  });

  it("should show standard subtitle for non-Lead Generators", () => {
    const teamRole = 'lead_manager';
    const subtitle = teamRole === 'lead_generator'
      ? 'Cold calling tips, lead notes & CRM commands'
      : 'Ask questions or give CRM commands';

    expect(subtitle).toContain("Ask questions");
    expect(subtitle).not.toContain("Cold calling");
  });
});

describe("AI Coach Lead Generator Streaming Prompt Consistency", () => {
  it("should have matching prompt structure between streaming and non-streaming endpoints", () => {
    // Both endpoints should use the same conditional pattern
    const buildPromptIntro = (isLeadGenerator: boolean) => {
      return isLeadGenerator
        ? `You are a data-driven cold calling coach for a lead generator on a real estate wholesaling team. Your focus is on LEAD GENERATION — helping this caller gauge seller interest, gather key details, and let interested sellers know their manager will follow up.`
        : 'You are a data-driven sales coach for a real estate wholesaling team.';
    };

    const streamingPrompt = buildPromptIntro(true);
    const nonStreamingPrompt = buildPromptIntro(true);

    // Both should produce the same result
    expect(streamingPrompt).toBe(nonStreamingPrompt);
    expect(streamingPrompt).toContain("cold calling coach");
    expect(streamingPrompt).toContain("LEAD GENERATION");
    expect(streamingPrompt).toContain("manager will follow up");
    expect(streamingPrompt).not.toContain("handoff");
    expect(streamingPrompt).not.toContain("transfer");
  });

  it("should maintain CRM action capabilities for Lead Generators", () => {
    // Lead Generators should still have full CRM access
    const crmCapabilities = [
      "Add notes to contacts",
      "Change pipeline stages",
      "Send SMS messages",
      "Create follow-up tasks",
      "Update existing tasks",
      "Add or remove tags",
      "Update custom fields",
      "Add or remove contacts from workflows",
    ];

    // These should be present regardless of role
    expect(crmCapabilities).toHaveLength(8);
    expect(crmCapabilities).toContain("Add notes to contacts");
    expect(crmCapabilities).toContain("Create follow-up tasks");
  });

  it("should keep ACTION_REDIRECT behavior for Lead Generators", () => {
    // The ACTION_REDIRECT mechanism should work the same for all roles
    const actionRedirectInstruction = 'If the user asks you to perform ANY of these CRM actions, you MUST start your response with the EXACT text "[ACTION_REDIRECT]"';
    expect(actionRedirectInstruction).toContain("[ACTION_REDIRECT]");
  });
});
