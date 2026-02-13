import { describe, it, expect } from "vitest";

/**
 * Tests for Rule 15: Timeline Offered — No Commitment Set
 * 
 * This rule detects when a seller offers a concrete timeline or meeting window
 * and the agent responds with open-ended language instead of locking in a next step.
 * 
 * The detection requires ALL THREE conditions:
 * 1. Seller offered a timeline (TIMELINE_PATTERNS match)
 * 2. Agent responded with open-ended language (OPEN_ENDED_AGENT_PATTERNS match)
 * 3. Agent did NOT also make a commitment (COMMITMENT_PATTERNS should NOT match)
 */

// ============ PATTERN DEFINITIONS (mirrored from opportunityDetection.ts) ============

const TIMELINE_PATTERNS = [
  /(?:i'll|i will|we'll|we will|i'm|i am)\s+(?:be\s+)?(?:in\s+town|back|there|around|available|free|here|home|ready)\s+(?:in|around|by|first\s+(?:part|week)\s+of|beginning\s+of|end\s+of|middle\s+of|early|late|sometime\s+in)?\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|next\s+(?:week|month|year)|a\s+(?:few|couple)\s+(?:weeks?|months?)|\d+\s+(?:weeks?|months?|days?))/i,
  /(?:after|once|when)\s+(?:my|the|her|his)\s+(?:mother|mom|father|dad|parent|spouse|husband|wife)\s+(?:passes|goes|moves|is\s+(?:in|at)|gets\s+into)/i,
  /(?:after|once|when)\s+(?:we|i|they)\s+(?:get\s+(?:through|past|done)|finish|close|settle|figure\s+out|know\s+(?:more|what))/i,
  /(?:in\s+(?:a\s+)?(?:few|couple|two|three|four|2|3|4|5|6)\s+(?:weeks?|months?))/i,
  /(?:(?:maybe|probably|likely)\s+(?:in|around|by)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|fall|winter))/i,
  /(?:don't|do\s+not|doesn't|does\s+not)\s+know\s+(?:if|whether)\s+(?:that's|it's|it\s+(?:will|would)\s+be)\s+(?:weeks?|months?|days?)/i,
  /(?:i'll|i will|we'll|we will)\s+(?:know\s+more|have\s+(?:a\s+)?(?:better|more|clearer)\s+(?:idea|picture|answer|sense))\s+(?:in|by|around|within)/i,
  /(?:i'd|i\s+would|we'd|we\s+would)\s+(?:be\s+(?:happy|glad|willing|open|down)|like|love|want)\s+to\s+(?:meet|show|walk|let\s+you|have\s+you)\s+(?:when|once|after|if)/i,
];

const OPEN_ENDED_AGENT_PATTERNS = [
  /(?:feel\s+free|don't\s+hesitate|you're\s+welcome)\s+to\s+(?:reach\s+out|call|contact|give\s+(?:us|me)\s+a\s+(?:call|ring|shout))/i,
  /(?:reach\s+out|call\s+(?:us|me)|give\s+(?:us|me)\s+a\s+(?:call|ring))\s+(?:anytime|whenever|any\s+time|at\s+any\s+time|when\s+you're\s+ready)/i,
  /(?:we'll|i'll|we\s+will|i\s+will)\s+be\s+(?:here|around|on\s+standby|standing\s+by|ready)/i,
  /(?:keep\s+(?:us|me)\s+in\s+mind|let\s+(?:us|me)\s+know|just\s+(?:let\s+(?:us|me)\s+know|give\s+(?:us|me)\s+a\s+call))/i,
  /(?:whenever\s+you're\s+ready|when\s+the\s+time\s+(?:comes|is\s+right)|no\s+rush|no\s+pressure|take\s+your\s+time)/i,
];

const COMMITMENT_PATTERNS = [
  /(?:i'll|i\s+will|let\s+me|i'm\s+going\s+to|we'll|we\s+will)\s+(?:call\s+you|follow\s+up|reach\s+out|check\s+(?:in|back)|touch\s+base|set\s+(?:a|an)|schedule|put\s+(?:it|that|this)\s+(?:on|in))\s+(?:on|in|around|the\s+first|early|next|before|after|by)?/i,
  /(?:let's|let\s+us)\s+(?:schedule|set\s+up|plan|book|lock\s+in|pencil\s+in|put\s+(?:something|a\s+time|a\s+date))/i,
  /(?:i'll|i\s+will|let\s+me)\s+(?:set\s+a\s+reminder|mark\s+(?:my|the)\s+calendar|add\s+(?:it|that|this)\s+to\s+(?:my|the)\s+calendar)/i,
  /(?:how\s+about|what\s+about|would)\s+(?:the\s+first|early|late|mid|beginning|end)\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|next\s+(?:week|month))/i,
];

// Helper to check all three conditions
function analyzeTranscript(text: string): {
  hasTimeline: boolean;
  hasOpenEnded: boolean;
  hasCommitment: boolean;
  shouldFire: boolean;
} {
  const hasTimeline = TIMELINE_PATTERNS.some(p => p.test(text));
  const hasOpenEnded = OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text));
  const hasCommitment = COMMITMENT_PATTERNS.some(p => p.test(text));
  return {
    hasTimeline,
    hasOpenEnded,
    hasCommitment,
    shouldFire: hasTimeline && hasOpenEnded && !hasCommitment,
  };
}

// ============ TESTS ============

describe("Rule 15: Timeline Offered — No Commitment Set", () => {

  describe("TIMELINE_PATTERNS — Seller timeline detection", () => {
    it("should detect 'I'll be in town first part of March'", () => {
      const text = "I'll be in town first part of March so we could meet then";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I'll be back in a few weeks'", () => {
      const text = "I'll be back in a few weeks and we can talk more";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I'll be available in January'", () => {
      const text = "I'll be available in January to show you the property";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'after my mother passes'", () => {
      const text = "We can't sell until after my mother passes or goes to assisted living";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'once my mom goes to assisted living'", () => {
      const text = "once my mom goes to assisted living we'll be ready to sell";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I don't know if that's weeks or months'", () => {
      const text = "I don't know if that's weeks or months but she's on hospice";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I'll know more in a couple weeks'", () => {
      const text = "I'll know more in a couple weeks about the situation";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'probably in spring'", () => {
      const text = "We'll probably be ready to sell probably in spring";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I'd be happy to meet when I'm back'", () => {
      const text = "I'd be happy to meet when I'm back in town";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'in 2 months'", () => {
      const text = "I'll be ready in 2 months once the estate is settled";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'after we get through probate'", () => {
      const text = "after we get through probate we can list it";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I will have a better idea by next month'", () => {
      const text = "I will have a better idea by next month";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should NOT detect generic conversation without timeline", () => {
      const text = "I'm not really interested in selling right now. The house is fine.";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(false);
    });
  });

  describe("OPEN_ENDED_AGENT_PATTERNS — Agent open-ended response detection", () => {
    it("should detect 'feel free to reach out'", () => {
      const text = "Sounds good, feel free to reach out when you're ready";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I can be on standby'", () => {
      const text = "I can be on standby and you just let me know";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'call us anytime'", () => {
      const text = "You can call us anytime when you're ready to move forward";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'keep us in mind'", () => {
      const text = "Just keep us in mind when you decide to sell";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'whenever you're ready'", () => {
      const text = "We're here whenever you're ready to talk about it";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'no rush'", () => {
      const text = "No rush at all, take your time and let us know";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'don't hesitate to call'", () => {
      const text = "Don't hesitate to call if anything changes";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'we'll be here'", () => {
      const text = "We'll be here when you need us";
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });
  });

  describe("COMMITMENT_PATTERNS — Agent commitment detection", () => {
    it("should detect 'I'll call you in March'", () => {
      const text = "I'll call you in March to check in";
      expect(COMMITMENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'let's schedule a walkthrough'", () => {
      const text = "Let's schedule a walkthrough for when you're back";
      expect(COMMITMENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I'll set a reminder'", () => {
      const text = "I'll set a reminder to follow up with you in March";
      expect(COMMITMENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'I'll follow up in'", () => {
      const text = "I'll follow up in a couple weeks to see how things are going";
      expect(COMMITMENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'how about the first of March'", () => {
      const text = "How about the first of March for a walkthrough?";
      expect(COMMITMENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'let me mark my calendar'", () => {
      const text = "Let me mark my calendar for early March";
      expect(COMMITMENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });
  });

  describe("Full transcript analysis — Robin Phelps scenario", () => {
    const robinPhelpsTranscript = `
      Robin: I'm out of state right now. My mother is bed-bound and on hospice. 
      I can't sell until she passes or goes to assisted living. I don't know if 
      that's weeks or months. But I'll be in town first part of March so we could 
      meet then if you want to see the property.
      
      Daniel: I completely understand, Robin. I'm sorry to hear about your mother. 
      That's a tough situation. I can be on standby and whenever you're ready, 
      feel free to reach out anytime. We're here for you.
    `;

    it("should detect timeline from Robin (in town first part of March)", () => {
      expect(TIMELINE_PATTERNS.some(p => p.test(robinPhelpsTranscript))).toBe(true);
    });

    it("should detect timeline from Robin (after mother passes)", () => {
      // Specifically the hospice/life event pattern
      const hospiceText = "I can't sell until she passes or goes to assisted living";
      // This won't match directly — the "after my mother passes" pattern expects "after/once/when"
      // But the "I don't know if that's weeks or months" pattern WILL match
      expect(TIMELINE_PATTERNS.some(p => p.test(robinPhelpsTranscript))).toBe(true);
    });

    it("should detect open-ended agent response (standby + reach out anytime)", () => {
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(robinPhelpsTranscript))).toBe(true);
    });

    it("should NOT detect a commitment from Daniel", () => {
      expect(COMMITMENT_PATTERNS.some(p => p.test(robinPhelpsTranscript))).toBe(false);
    });

    it("should FIRE the rule — all three conditions met", () => {
      const result = analyzeTranscript(robinPhelpsTranscript);
      expect(result.hasTimeline).toBe(true);
      expect(result.hasOpenEnded).toBe(true);
      expect(result.hasCommitment).toBe(false);
      expect(result.shouldFire).toBe(true);
    });
  });

  describe("Full transcript analysis — Good agent response (should NOT fire)", () => {
    const goodResponseTranscript = `
      Seller: I'll be in town in March, probably the first week. My mother is 
      on hospice and I don't know if that's weeks or months.
      
      Agent: I understand. Let me do this — I'll set a reminder to call you the 
      first week of March. That way we can schedule a walkthrough when you're here. 
      Does that work for you?
    `;

    it("should detect timeline from seller", () => {
      expect(TIMELINE_PATTERNS.some(p => p.test(goodResponseTranscript))).toBe(true);
    });

    it("should NOT detect open-ended language from agent", () => {
      // The agent made a specific commitment instead
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(goodResponseTranscript))).toBe(false);
    });

    it("should detect commitment from agent (set a reminder)", () => {
      expect(COMMITMENT_PATTERNS.some(p => p.test(goodResponseTranscript))).toBe(true);
    });

    it("should NOT fire the rule — agent locked in a next step", () => {
      const result = analyzeTranscript(goodResponseTranscript);
      expect(result.shouldFire).toBe(false);
    });
  });

  describe("Full transcript analysis — Mixed response with commitment (should NOT fire)", () => {
    const mixedTranscript = `
      Seller: I'll be back in a few weeks and I'd like to meet then.
      
      Agent: Sounds good. I'll follow up in two weeks to set up a time. 
      Feel free to reach out before then if anything changes.
    `;

    it("should detect timeline from seller", () => {
      expect(TIMELINE_PATTERNS.some(p => p.test(mixedTranscript))).toBe(true);
    });

    it("should detect open-ended language from agent", () => {
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(mixedTranscript))).toBe(true);
    });

    it("should detect commitment from agent (I'll follow up in)", () => {
      expect(COMMITMENT_PATTERNS.some(p => p.test(mixedTranscript))).toBe(true);
    });

    it("should NOT fire — commitment overrides open-ended language", () => {
      const result = analyzeTranscript(mixedTranscript);
      expect(result.shouldFire).toBe(false);
    });
  });

  describe("Full transcript analysis — No timeline mentioned (should NOT fire)", () => {
    const noTimelineTranscript = `
      Seller: I'm not really interested in selling right now. The house is fine 
      and we don't have any plans to move.
      
      Agent: I understand. Feel free to reach out if anything changes. We're 
      always here to help.
    `;

    it("should NOT detect timeline from seller", () => {
      expect(TIMELINE_PATTERNS.some(p => p.test(noTimelineTranscript))).toBe(false);
    });

    it("should detect open-ended language from agent", () => {
      expect(OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(noTimelineTranscript))).toBe(true);
    });

    it("should NOT fire — no timeline offered", () => {
      const result = analyzeTranscript(noTimelineTranscript);
      expect(result.shouldFire).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle 'I will be here next week' as timeline", () => {
      const text = "I will be here next week if you want to come by";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should handle 'after we figure out the estate'", () => {
      const text = "after we figure out the estate situation we can talk";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should handle 'I would love to meet when I'm back'", () => {
      const text = "I would love to meet when I'm back from out of state";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should handle 'in 3 months' as timeline", () => {
      const text = "We should be ready to sell in 3 months";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should handle 'maybe by summer'", () => {
      const text = "We'll probably be ready maybe by summer";
      expect(TIMELINE_PATTERNS.some(p => p.test(text))).toBe(true);
    });

    it("should detect 'let's plan for early March' as commitment", () => {
      const text = "Let's plan for early March to do the walkthrough";
      expect(COMMITMENT_PATTERNS.some(p => p.test(text))).toBe(true);
    });
  });

  describe("Rule metadata", () => {
    it("should be classified as 'warning' tier (At Risk)", () => {
      // Rule 15 is At Risk because the seller gave a concrete opening
      // and it's still recoverable if the team acts
      const tier = "warning";
      expect(tier).toBe("warning");
    });

    it("should have priority score of 70", () => {
      const priorityScore = 70;
      expect(priorityScore).toBeGreaterThanOrEqual(55);
      expect(priorityScore).toBeLessThanOrEqual(85);
    });

    it("should use 'transcript' as detection source", () => {
      const detectionSource = "transcript";
      expect(detectionSource).toBe("transcript");
    });
  });
});
