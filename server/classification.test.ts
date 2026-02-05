import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyCall } from "./grading";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";

const mockedInvokeLLM = vi.mocked(invokeLLM);

describe("Call Classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should classify post-offer document signing calls as admin_call", async () => {
    // Simulate LLM response for a post-offer admin call
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            classification: "admin_call",
            reason: "Post-offer call helping seller sign purchase agreement - not a sales conversation",
            shouldGrade: false,
            summary: "Helped seller sign purchase agreement via DocuSign. Resolved email access issues.",
          }),
        },
      }],
    } as any);

    const transcript = `
      Kyle: Hey Jamie, I'm calling to help you get that purchase agreement signed.
      Jamie: Yeah, I got the email but I can't open it.
      Kyle: No problem, let me walk you through it. Can you check your spam folder?
      Jamie: Oh there it is. Now what do I click?
      Kyle: Click the blue button that says "Review and Sign".
      Jamie: Okay, I see the agreement. The price is $85,000 right?
      Kyle: That's correct, just like we discussed last week.
    `;

    const result = await classifyCall(transcript, 600);
    
    expect(result.classification).toBe("admin_call");
    expect(result.shouldGrade).toBe(false);
  });

  it("should classify initial offer presentation as conversation", async () => {
    // Simulate LLM response for an offer presentation call
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            classification: "conversation",
            reason: "Sales call presenting an offer for the first time",
            shouldGrade: true,
            summary: "",
          }),
        },
      }],
    } as any);

    const transcript = `
      Kyle: So based on our analysis, we'd like to make you an offer of $85,000 for the property.
      Seller: That's lower than I was hoping for.
      Kyle: I understand. Let me explain how we arrived at that number...
    `;

    const result = await classifyCall(transcript, 600);
    
    expect(result.classification).toBe("conversation");
    expect(result.shouldGrade).toBe(true);
  });

  it("should classify calls under minimum duration as too_short", async () => {
    const result = await classifyCall("Hello?", 30);
    
    expect(result.classification).toBe("too_short");
    expect(result.shouldGrade).toBe(false);
    expect(mockedInvokeLLM).not.toHaveBeenCalled(); // Should not call LLM for short calls
  });

  it("should classify technical support calls as admin_call", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            classification: "admin_call",
            reason: "Technical support call helping with email/document access",
            shouldGrade: false,
            summary: "Assisted seller with accessing DocuSign link on mobile device.",
          }),
        },
      }],
    } as any);

    const transcript = `
      Kyle: I see you're having trouble with the DocuSign link.
      Jamie: Yeah my phone keeps saying the page won't load.
      Kyle: Let's try a different approach. Can you access your email on a computer?
      Jamie: Let me try... okay it's loading now.
      Kyle: Great, now click on the document and you should see where to sign.
    `;

    const result = await classifyCall(transcript, 500);
    
    expect(result.classification).toBe("admin_call");
    expect(result.shouldGrade).toBe(false);
  });

  it("should default to conversation when LLM fails", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
        },
      }],
    } as any);

    const result = await classifyCall("Some transcript content", 600);
    
    expect(result.classification).toBe("conversation");
    expect(result.shouldGrade).toBe(true);
  });
});
