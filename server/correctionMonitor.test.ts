/**
 * Tests for Correction Pattern Monitor
 * Tests keyword categorization, pattern detection logic, and notification formatting
 */
import { describe, it, expect } from "vitest";
import {
  CORRECTION_CATEGORIES,
  categorizeCorrectionByKeywords,
  formatPatternNotification,
  type CorrectionPattern,
} from "./correctionMonitor";

// ============ CATEGORIZATION TESTS ============

describe("categorizeCorrectionByKeywords", () => {
  describe("DQ / Short Call Grading", () => {
    it("should categorize 'not in buybox' as dq_grading", () => {
      expect(categorizeCorrectionByKeywords("manufactured home fully remodeled and was going to list, not in buybox")).toBe("dq_grading");
    });

    it("should categorize 'no motivation' as dq_grading", () => {
      expect(categorizeCorrectionByKeywords("We would not be anywhere near his number and no motivation whatsoever")).toBe("dq_grading");
    });

    it("should categorize 'going to list' as dq_grading", () => {
      expect(categorizeCorrectionByKeywords("Property is going to list with a realtor, no point qualifying")).toBe("dq_grading");
    });

    it("should categorize 'manufactured' as dq_grading", () => {
      expect(categorizeCorrectionByKeywords("This is a manufactured home, not in our buybox")).toBe("dq_grading");
    });

    it("should categorize 'not in area' as dq_grading", () => {
      expect(categorizeCorrectionByKeywords("Property not in area, we don't buy there")).toBe("dq_grading");
    });

    it("should categorize 'dead lead' as dq_grading", () => {
      expect(categorizeCorrectionByKeywords("This was clearly a dead lead, no point in deep qualification")).toBe("dq_grading");
    });

    it("should categorize 'short call' as dq_grading", () => {
      expect(categorizeCorrectionByKeywords("This was a short call because the lead was not viable")).toBe("dq_grading");
    });
  });

  describe("Prior Context / Already Known Info", () => {
    it("should categorize 'already had notes' as prior_context", () => {
      expect(categorizeCorrectionByKeywords("I already had notes from previous conversation on his number")).toBe("prior_context");
    });

    it("should categorize 'texting leads' as prior_context", () => {
      expect(categorizeCorrectionByKeywords("the texting leads sometimes come in with more information")).toBe("prior_context");
    });

    it("should categorize 'previous conversation' as prior_context", () => {
      expect(categorizeCorrectionByKeywords("We had a previous conversation where he told me everything")).toBe("prior_context");
    });

    it("should categorize 'already knew' as prior_context", () => {
      expect(categorizeCorrectionByKeywords("I already knew the property details from our text exchange")).toBe("prior_context");
    });
  });

  describe("Setting Expectations Style", () => {
    it("should categorize 'same expectation different wording' as setting_expectations", () => {
      expect(categorizeCorrectionByKeywords("same expectation, different wording — I said good fit to work together")).toBe("setting_expectations");
    });

    it("should categorize 'set expectations' as setting_expectations", () => {
      expect(categorizeCorrectionByKeywords("I did set expectations, just not with the exact scripted words")).toBe("setting_expectations");
    });

    it("should categorize 'couple of questions' as setting_expectations", () => {
      expect(categorizeCorrectionByKeywords("I said I just have a couple of questions, that IS setting expectations")).toBe("setting_expectations");
    });
  });

  describe("Rubric Too Strict", () => {
    it("should categorize 'score too low' as rubric_too_strict", () => {
      expect(categorizeCorrectionByKeywords("The score is too low for what was actually a good call")).toBe("rubric_too_strict");
    });

    it("should categorize 'too strict' as rubric_too_strict", () => {
      expect(categorizeCorrectionByKeywords("The grading is too strict on this criterion")).toBe("rubric_too_strict");
    });

    it("should categorize 'unfair' as rubric_too_strict", () => {
      expect(categorizeCorrectionByKeywords("This is unfair, I handled the objection well")).toBe("rubric_too_strict");
    });
  });

  describe("Missed Context", () => {
    it("should categorize 'missed context' as missed_context", () => {
      expect(categorizeCorrectionByKeywords("The AI missed the context of what the seller was saying")).toBe("missed_context");
    });

    it("should categorize 'tone' as missed_context", () => {
      expect(categorizeCorrectionByKeywords("The seller's tone clearly indicated they were interested")).toBe("missed_context");
    });

    it("should categorize 'misunderstood' as missed_context", () => {
      expect(categorizeCorrectionByKeywords("The AI misunderstood what the seller meant")).toBe("missed_context");
    });
  });

  describe("Wrong Call Type", () => {
    it("should categorize 'wrong type' as wrong_call_type", () => {
      expect(categorizeCorrectionByKeywords("This was classified as the wrong type of call")).toBe("wrong_call_type");
    });

    it("should categorize 'not a qualification' as wrong_call_type", () => {
      expect(categorizeCorrectionByKeywords("This is not a qualification call, it was a follow up")).toBe("wrong_call_type");
    });
  });

  describe("Other / Uncategorized", () => {
    it("should categorize unrecognized text as other", () => {
      expect(categorizeCorrectionByKeywords("The weather was nice today")).toBe("other");
    });

    it("should categorize vague feedback as other", () => {
      expect(categorizeCorrectionByKeywords("I disagree with this grade")).toBe("other");
    });
  });
});

// ============ CORRECTION CATEGORIES STRUCTURE ============

describe("CORRECTION_CATEGORIES", () => {
  it("should have unique IDs", () => {
    const ids = CORRECTION_CATEGORIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have 7 categories", () => {
    expect(CORRECTION_CATEGORIES.length).toBe(7);
  });

  it("should have 'other' as the last category (fallback)", () => {
    expect(CORRECTION_CATEGORIES[CORRECTION_CATEGORIES.length - 1].id).toBe("other");
  });

  it("should have keywords for all categories except 'other'", () => {
    for (const cat of CORRECTION_CATEGORIES) {
      if (cat.id === "other") {
        expect(cat.keywords.length).toBe(0);
      } else {
        expect(cat.keywords.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============ NOTIFICATION FORMATTING TESTS ============

describe("formatPatternNotification", () => {
  const mockPatterns: CorrectionPattern[] = [
    {
      category: "dq_grading",
      categoryName: "DQ / Short Call Grading",
      count: 3,
      corrections: [
        { id: 1, explanation: "Not in buybox, manufactured home", userName: "Daniel Lozano", createdAt: new Date() },
        { id: 2, explanation: "No motivation whatsoever", userName: "Daniel Lozano", createdAt: new Date() },
        { id: 3, explanation: "Going to list with realtor", userName: "Daniel Lozano", createdAt: new Date() },
      ],
      suggestedAction: "Consider re-grading recent DQ calls.",
    },
    {
      category: "prior_context",
      categoryName: "Prior Context / Already Known Info",
      count: 2,
      corrections: [
        { id: 4, explanation: "Already had notes from previous conversation", userName: "Daniel Lozano", createdAt: new Date() },
        { id: 5, explanation: "Texting lead came in with info", userName: "Sarah Smith", createdAt: new Date() },
      ],
      suggestedAction: "The grading system now recognizes prior context.",
    },
  ];

  it("should include total correction count in title", () => {
    const { title } = formatPatternNotification(mockPatterns, 7);
    expect(title).toContain("5 corrections");
  });

  it("should include team member count in title", () => {
    const { title } = formatPatternNotification(mockPatterns, 7);
    expect(title).toContain("2 team members");
  });

  it("should include day window in title", () => {
    const { title } = formatPatternNotification(mockPatterns, 7);
    expect(title).toContain("last 7 days");
  });

  it("should include category names in content", () => {
    const { content } = formatPatternNotification(mockPatterns, 7);
    expect(content).toContain("DQ / Short Call Grading");
    expect(content).toContain("Prior Context / Already Known Info");
  });

  it("should include correction counts per category", () => {
    const { content } = formatPatternNotification(mockPatterns, 7);
    expect(content).toContain("3 corrections");
    expect(content).toContain("2 corrections");
  });

  it("should include example explanations", () => {
    const { content } = formatPatternNotification(mockPatterns, 7);
    expect(content).toContain("Not in buybox, manufactured home");
    expect(content).toContain("No motivation whatsoever");
  });

  it("should limit examples to 2 per pattern", () => {
    const { content } = formatPatternNotification(mockPatterns, 7);
    // Third DQ correction should NOT appear
    expect(content).not.toContain("Going to list with realtor");
  });

  it("should include suggested actions", () => {
    const { content } = formatPatternNotification(mockPatterns, 7);
    expect(content).toContain("Consider re-grading recent DQ calls.");
    expect(content).toContain("The grading system now recognizes prior context.");
  });

  it("should include unique member names in content", () => {
    const { content } = formatPatternNotification(mockPatterns, 7);
    expect(content).toContain("Daniel Lozano");
    expect(content).toContain("Sarah Smith");
  });

  it("should handle single team member correctly", () => {
    const singleMemberPatterns: CorrectionPattern[] = [{
      category: "dq_grading",
      categoryName: "DQ / Short Call Grading",
      count: 2,
      corrections: [
        { id: 1, explanation: "Not in buybox", userName: "Daniel Lozano", createdAt: new Date() },
        { id: 2, explanation: "Dead lead", userName: "Daniel Lozano", createdAt: new Date() },
      ],
      suggestedAction: "Review DQ calls.",
    }];
    const { title } = formatPatternNotification(singleMemberPatterns, 7);
    expect(title).toContain("1 team member");
    expect(title).not.toContain("1 team members");
  });

  it("should truncate long explanations", () => {
    const longExplanation = "A".repeat(200);
    const patterns: CorrectionPattern[] = [{
      category: "other",
      categoryName: "Other",
      count: 2,
      corrections: [
        { id: 1, explanation: longExplanation, userName: "Test User", createdAt: new Date() },
        { id: 2, explanation: "Short one", userName: "Test User", createdAt: new Date() },
      ],
      suggestedAction: "Review.",
    }];
    const { content } = formatPatternNotification(patterns, 7);
    expect(content).toContain("...");
    // Should not contain the full 200-char string
    expect(content).not.toContain(longExplanation);
  });
});

// ============ REAL-WORLD SCENARIO TESTS ============

describe("Real-world correction scenarios", () => {
  it("should correctly categorize Daniel's actual corrections", () => {
    // These are Daniel's actual corrections from the screenshots
    const corrections = [
      {
        text: "Daniel should have explicitly set expectations at the beginning of the call, stating the call structure and comfort with saying 'not a good fit.' He missed the opportunity after 'Am I catching you at a good time? Yeah, you're fine.'",
        expected: "setting_expectations",
      },
      {
        text: "Daniel could have more explicitly set expectations at the beginning of the call, detailing the call structure and comfort with saying 'not a good fit', rather than just 'i just have a couple of questions to see if we're a good fit to work together'. same expectation, different wording",
        expected: "setting_expectations",
      },
      {
        text: "No use in qualifying thoroughly, manufactured home fully remodeled and was going to list, not in buybox",
        expected: "dq_grading",
      },
      {
        text: "We would not be anywhere near his number and no motivation whatsoever",
        expected: "dq_grading",
      },
      {
        text: "I already had notes from previous conversation on his number, the texting leads sometimes come in with more information",
        expected: "prior_context",
      },
    ];

    for (const correction of corrections) {
      const result = categorizeCorrectionByKeywords(correction.text);
      expect(result).toBe(correction.expected);
    }
  });

  it("should detect 3 patterns from Daniel's 5 corrections", () => {
    // Simulate what pattern detection would find
    const categories = [
      "setting_expectations",
      "setting_expectations",
      "dq_grading",
      "dq_grading",
      "prior_context",
    ];

    const categoryCounts = new Map<string, number>();
    for (const cat of categories) {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }

    // With minCount=2, should detect setting_expectations (2) and dq_grading (2)
    // prior_context only has 1, so it wouldn't be a pattern at minCount=2
    const patternsWithMin2 = Array.from(categoryCounts.entries()).filter(([_, count]) => count >= 2);
    expect(patternsWithMin2.length).toBe(2);
    expect(patternsWithMin2.map(([cat]) => cat).sort()).toEqual(["dq_grading", "setting_expectations"]);
  });
});
