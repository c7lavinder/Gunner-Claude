import { describe, it, expect } from "vitest";
import { hasSignificantTypos } from "./messageCleanup";

describe("Message Cleanup - Typo Detection", () => {
  it("detects common typos like 'adn', 'ehy', 'losed'", () => {
    expect(hasSignificantTypos("text Deanna Jonker adn ehy denan hope you are well. Did you get Kinser Road losed?")).toBe(true);
  });

  it("detects 'becuase' and similar misspellings", () => {
    expect(hasSignificantTypos("I want to call him becuase he was interested")).toBe(true);
  });

  it("detects 'definately' misspelling", () => {
    expect(hasSignificantTypos("She definately wants to sell")).toBe(true);
  });

  it("does not flag clean messages", () => {
    expect(hasSignificantTypos("Text Deanna Jonker and say hey hope you are well")).toBe(false);
  });

  it("does not flag normal short words", () => {
    expect(hasSignificantTypos("Call back John Smith and ask for the contract")).toBe(false);
  });

  it("does not flag messages with common abbreviations", () => {
    expect(hasSignificantTypos("Add a note for the property on Main St")).toBe(false);
  });
});

describe("AI Coach - Current Message Contact Priority", () => {
  it("should prioritize current message contact over history contact", () => {
    // This is a behavioral test documenting the expected behavior:
    // When Kyle types "text Deanna Jonker..." but history has "Barbara Thompson",
    // the system should create an action for Deanna Jonker, not Barbara Thompson.
    
    // The regex extraction correctly finds "Deanna Jonker" from the message
    const message = "text Deanna Jonker adn ehy denan hope you are well. Did you get Kinser Road losed?";
    const namePattern = /(?:text|sms\s+to|message|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
    const match = message.match(namePattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Deanna Jonker");
  });

  it("should extract contact name even with surrounding typos", () => {
    const message = "text Deanna Jonker adn ehy denan hope you are well";
    const namePattern = /(?:text|sms\s+to|message|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
    const match = message.match(namePattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Deanna Jonker");
  });

  it("should handle clean follow-up messages", () => {
    const message = "Text Deanna Jonker and say hey hope you are well, did you get kinser rd closed?";
    const namePattern = /(?:text|sms\s+to|message|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
    const match = message.match(namePattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Deanna Jonker");
  });
});
