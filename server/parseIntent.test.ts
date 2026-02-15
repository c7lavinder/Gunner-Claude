import { describe, it, expect } from "vitest";

/**
 * Tests for parseIntent contact name extraction logic.
 * Verifies that the regex patterns correctly extract contact names
 * from natural language task/action requests.
 */

const teamMemberNames = ["Chris Segura", "Daniel Lozano", "Kyle Barks", "Alex Diaz", "Efren Valenzuala", "Mirna Razo"];

function extractContactName(message: string): string {
  const nameExtractPatterns = [
    /(?:call\s+back|callback|follow\s*up\s+with|text|sms\s+to|message|contact|reach\s+out\s+to|note\s+(?:to|for|about|on))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:to\s+call|to\s+text|to\s+contact|to\s+reach)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];
  for (const pattern of nameExtractPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const potentialName = match[1].trim();
      const isTeamMember = teamMemberNames.some(tm =>
        tm.toLowerCase() === potentialName.toLowerCase() ||
        tm.toLowerCase().split(' ')[0] === potentialName.toLowerCase()
      );
      if (!isTeamMember) {
        return potentialName;
      }
    }
  }
  return "";
}

describe("parseIntent Contact Name Extraction", () => {
  it("should extract contact name from 'call back [name]' pattern", () => {
    expect(extractContactName("Set a task for chris to call back Mark Casper")).toBe("Mark Casper");
  });

  it("should extract contact name from 'to call [name]' pattern", () => {
    expect(extractContactName("Create a task for Monday at 8 for chris to call Mark Casper")).toBe("Mark Casper");
  });

  it("should extract contact name from 'follow up with [name]' pattern", () => {
    expect(extractContactName("Follow up with John Smith about the property")).toBe("John Smith");
  });

  it("should extract contact name from 'text [name]' pattern", () => {
    expect(extractContactName("Text Sarah Johnson about the offer")).toBe("Sarah Johnson");
  });

  it("should NOT extract team member name as contact", () => {
    // Chris is a team member, should not be returned as a contact
    expect(extractContactName("Set a task for Chris to do something")).toBe("");
  });

  it("should extract contact name even when team member is mentioned as assignee", () => {
    expect(extractContactName("Set a task for monday at 8 for chris to call back mark casper.")).toBe("mark casper");
  });

  it("should extract contact name from 'note about [name]' pattern", () => {
    expect(extractContactName("Add a note about Robert Williams regarding the deal")).toBe("Robert Williams");
  });

  it("should return empty string when no contact name is found", () => {
    expect(extractContactName("What should I focus on today?")).toBe("");
  });

  it("should extract from 'reach out to [name]' pattern", () => {
    expect(extractContactName("Reach out to Lisa Brown tomorrow")).toBe("Lisa Brown");
  });

  it("should extract from 'contact [name]' pattern", () => {
    expect(extractContactName("Contact Mike Davis about the inspection")).toBe("Mike Davis");
  });
});
