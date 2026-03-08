import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateCallHighlights } from "./callHighlights";
import type { TranscriptionSegment } from "./grading";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
const mockInvokeLLM = vi.mocked(invokeLLM);

describe("generateCallHighlights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty transcript", async () => {
    const result = await generateCallHighlights("", undefined, "cold_call");
    expect(result).toEqual([]);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns empty array for very short transcript", async () => {
    const result = await generateCallHighlights("Hello", undefined, "cold_call");
    expect(result).toEqual([]);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("calls LLM with correct prompt structure and returns parsed highlights", async () => {
    const mockHighlights = {
      highlights: [
        {
          type: "objection_handled",
          label: "Handled price objection",
          timestampSeconds: 120,
          quote: "I understand your concern about the price",
          insight: "Good empathy shown before addressing the objection",
          importance: 3,
        },
        {
          type: "appointment_set",
          label: "Walkthrough scheduled",
          timestampSeconds: 300,
          quote: "How about Thursday at 2pm?",
          insight: "Successfully closed for the appointment",
          importance: 3,
        },
        {
          type: "rapport_building",
          label: "Connected on neighborhood",
          timestampSeconds: 45,
          quote: "I grew up near that area",
          insight: "Personal connection built early in the call",
          importance: 1,
        },
      ],
    };

    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockHighlights),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check. The seller mentioned concerns about the price and the rep handled it well. They also set up a walkthrough appointment for Thursday.";

    const result = await generateCallHighlights(transcript, undefined, "cold_call");

    expect(result).toHaveLength(3);
    // Should be sorted by timestamp
    expect(result[0].timestampSeconds).toBe(45);
    expect(result[1].timestampSeconds).toBe(120);
    expect(result[2].timestampSeconds).toBe(300);

    // Verify structure
    expect(result[0]).toEqual({
      type: "rapport_building",
      label: "Connected on neighborhood",
      timestampSeconds: 45,
      quote: "I grew up near that area",
      insight: "Personal connection built early in the call",
      importance: 1,
    });

    // Verify LLM was called with response_format
    expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    const llmCall = mockInvokeLLM.mock.calls[0][0];
    expect(llmCall.response_format).toBeDefined();
    expect(llmCall.response_format?.type).toBe("json_schema");
    expect(llmCall.messages).toHaveLength(2);
    expect(llmCall.messages[0].role).toBe("system");
    expect(llmCall.messages[1].role).toBe("user");
  });

  it("includes grade context in prompt when provided", async () => {
    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ highlights: [] }),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check. The seller mentioned concerns about the price.";

    await generateCallHighlights(transcript, undefined, "qualification", {
      overallGrade: "B",
      overallScore: "78",
      strengths: ["Good rapport", "Asked qualifying questions"],
      improvements: ["Missed closing opportunity"],
      redFlags: ["Talked over seller"],
    });

    const userMessage = mockInvokeLLM.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain("GRADE CONTEXT");
    expect(userMessage).toContain("Grade: B (78%)");
    expect(userMessage).toContain("Good rapport");
    expect(userMessage).toContain("Missed closing opportunity");
    expect(userMessage).toContain("Talked over seller");
  });

  it("builds timestamped transcript from segments", async () => {
    const segments: TranscriptionSegment[] = [
      { start: 0, end: 5, text: "Hello, is this the homeowner?" },
      { start: 5, end: 12, text: "Yes, who is this?" },
      { start: 35, end: 45, text: "I'm calling about your property on Oak Street." },
      { start: 65, end: 75, text: "We're not interested in selling." },
    ];

    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ highlights: [] }),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "Hello, is this the homeowner? Yes, who is this? I'm calling about your property on Oak Street. We're not interested in selling.";

    await generateCallHighlights(transcript, segments, "cold_call");

    const userMessage = mockInvokeLLM.mock.calls[0][0].messages[1].content as string;
    // Should contain timestamp markers
    expect(userMessage).toContain("[0:00]");
    expect(userMessage).toContain("[0:35]");
    expect(userMessage).toContain("[1:05]");
  });

  it("truncates long labels and quotes", async () => {
    const mockHighlights = {
      highlights: [
        {
          type: "key_info_gathered",
          label: "A".repeat(100), // Too long
          timestampSeconds: 60,
          quote: "B".repeat(200), // Too long
          insight: "C".repeat(200), // Too long
          importance: 2,
        },
      ],
    };

    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockHighlights),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check for the call highlights generation system.";

    const result = await generateCallHighlights(transcript);

    expect(result).toHaveLength(1);
    expect(result[0].label.length).toBeLessThanOrEqual(50);
    expect(result[0].quote.length).toBeLessThanOrEqual(100);
    expect(result[0].insight.length).toBeLessThanOrEqual(120);
  });

  it("filters out invalid highlights", async () => {
    const mockHighlights = {
      highlights: [
        {
          type: "objection_handled",
          label: "Valid highlight",
          timestampSeconds: 60,
          quote: "Some quote",
          insight: "Some insight",
          importance: 3,
        },
        {
          // Missing type
          label: "Invalid - no type",
          timestampSeconds: 90,
          quote: "Some quote",
          insight: "Some insight",
          importance: 2,
        },
        {
          type: "red_flag",
          // Missing label
          timestampSeconds: 120,
          quote: "Some quote",
          insight: "Some insight",
          importance: 1,
        },
        {
          type: "price_discussion",
          label: "Valid - no timestamp",
          timestampSeconds: "not a number", // Invalid timestamp
          quote: "Some quote",
          insight: "Some insight",
          importance: 2,
        },
      ],
    };

    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockHighlights),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check for the call highlights generation system.";

    const result = await generateCallHighlights(transcript);

    // Only the first one should pass validation
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Valid highlight");
  });

  it("clamps negative timestamps to 0", async () => {
    const mockHighlights = {
      highlights: [
        {
          type: "objection_handled",
          label: "Negative timestamp",
          timestampSeconds: -10,
          quote: "Some quote",
          insight: "Some insight",
          importance: 2,
        },
      ],
    };

    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockHighlights),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check for the call highlights generation system.";

    const result = await generateCallHighlights(transcript);

    expect(result).toHaveLength(1);
    expect(result[0].timestampSeconds).toBe(0);
  });

  it("returns empty array on LLM error", async () => {
    mockInvokeLLM.mockRejectedValue(new Error("LLM service unavailable"));

    const transcript = "This is a long enough transcript to pass the minimum length check for the call highlights generation system.";

    const result = await generateCallHighlights(transcript);

    expect(result).toEqual([]);
  });

  it("returns empty array when LLM returns no content", async () => {
    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check for the call highlights generation system.";

    const result = await generateCallHighlights(transcript);

    expect(result).toEqual([]);
  });

  it("normalizes invalid importance values to 2", async () => {
    const mockHighlights = {
      highlights: [
        {
          type: "key_info_gathered",
          label: "Some highlight",
          timestampSeconds: 60,
          quote: "Some quote",
          insight: "Some insight",
          importance: 5, // Invalid - should be clamped to 2
        },
      ],
    };

    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockHighlights),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check for the call highlights generation system.";

    const result = await generateCallHighlights(transcript);

    expect(result).toHaveLength(1);
    expect(result[0].importance).toBe(2);
  });

  it("uses correct call type label in system prompt", async () => {
    mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ highlights: [] }),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
    } as any);

    const transcript = "This is a long enough transcript to pass the minimum length check for the call highlights generation system.";

    await generateCallHighlights(transcript, undefined, "follow_up");

    const systemMessage = mockInvokeLLM.mock.calls[0][0].messages[0].content as string;
    expect(systemMessage).toContain("Follow Up");
  });
});
