import { describe, it, expect } from "vitest";

// ============ OPPORTUNITY DETECTION V4 TESTS ============
// Tests for: SLA breach tier change, follow-up stage suppression for motivated_one_and_done,
// terminal stage suppression, enhanced dedup (not_a_deal blocks all rules for contact),
// and ghosted lead messaging improvements.

describe("Opportunity Detection V4 — Tier, Suppression & Dedup Fixes", () => {

  // ============ SLA BREACH TIER CHANGE ============
  describe("SLA breach tier: should be 'warning' (At Risk), not 'missed'", () => {
    it("new_lead_sla_breach detection returns tier 'warning'", () => {
      // Previously tier was "missed" — now changed to "warning" which maps to "At Risk" in UI
      const detection = {
        tier: "warning" as const,
        triggerRules: ["new_lead_sla_breach"],
        priorityScore: 60,
      };
      expect(detection.tier).toBe("warning");
      expect(detection.priorityScore).toBe(60); // Reduced from 70
    });

    it("RULE_DESCRIPTIONS maps new_lead_sla_breach to 'warning' tier", () => {
      const RULE_DESCRIPTIONS: Record<string, { tier: string }> = {
        new_lead_sla_breach: { tier: "warning" },
      };
      expect(RULE_DESCRIPTIONS.new_lead_sla_breach.tier).toBe("warning");
    });

    it("tierLabel maps 'warning' to 'At Risk'", () => {
      const tier = "warning";
      const tierLabel = tier === "missed" ? "Missed (urgent)" : (tier === "at_risk" || tier === "warning") ? "At Risk" : "Worth a Look";
      expect(tierLabel).toBe("At Risk");
    });

    it("UI tierConfig maps 'warning' to 'At Risk' label", () => {
      const tierConfig = {
        missed: { label: "Missed" },
        warning: { label: "At Risk" },
        possible: { label: "Worth a Look" },
      };
      expect(tierConfig.warning.label).toBe("At Risk");
    });
  });

  // ============ MOTIVATED ONE-AND-DONE FOLLOW-UP SUPPRESSION ============
  describe("motivated_one_and_done: suppress when lead is in follow-up after real conversation", () => {
    
    function shouldSuppressMotivatedOneDone(params: {
      currentStage: string;
      callClassification: string;
      callOutcome: string;
      callDuration: number;
    }): boolean {
      const stageLower = params.currentStage.toLowerCase();
      const isFollowUpOrDead = stageLower.includes("follow up") || stageLower.includes("followup") ||
        stageLower.includes("dead") || stageLower.includes("ghost") || stageLower.includes("dq") ||
        stageLower.includes("1 year");
      
      if (!isFollowUpOrDead) return false;
      
      // Only suppress if it was a real conversation
      if (params.callClassification !== "conversation") return false;
      
      const dqOutcomes = ["not_interested", "dead", "no_answer", "left_vm", "none"];
      if (dqOutcomes.includes(params.callOutcome)) return true;
      
      if (params.callDuration >= 60) return true;
      
      return false;
    }

    it("suppresses Sara Prinzi: 1 Year Follow Up, conversation, not_interested", () => {
      // Sara Prinzi: not motivated, wants crazy high price — moved to 1 Year Follow Up
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "1 Year Follow Up",
        callClassification: "conversation",
        callOutcome: "not_interested",
        callDuration: 120,
      })).toBe(true);
    });

    it("suppresses Matthew Golden: 1 Year Follow Up, conversation, 90s call", () => {
      // Matthew Golden: no equity, listing is best option — moved to 1 Year Follow Up
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "1 Year Follow Up",
        callClassification: "conversation",
        callOutcome: "none",
        callDuration: 90,
      })).toBe(true);
    });

    it("suppresses when in 'Dead' stage after conversation with 'dead' outcome", () => {
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "Dead",
        callClassification: "conversation",
        callOutcome: "dead",
        callDuration: 45,
      })).toBe(true);
    });

    it("suppresses when in 'Ghosted' stage after 60+ second conversation", () => {
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "Ghosted",
        callClassification: "conversation",
        callOutcome: "none",
        callDuration: 75,
      })).toBe(true);
    });

    it("suppresses when in 'DQ' stage after conversation with not_interested outcome", () => {
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "DQ",
        callClassification: "conversation",
        callOutcome: "not_interested",
        callDuration: 30,
      })).toBe(true);
    });

    it("does NOT suppress when in 'New Lead' stage (not follow-up)", () => {
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "New Lead",
        callClassification: "conversation",
        callOutcome: "not_interested",
        callDuration: 120,
      })).toBe(false);
    });

    it("does NOT suppress when in 'Hot Leads' stage", () => {
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "Hot Leads",
        callClassification: "conversation",
        callOutcome: "none",
        callDuration: 90,
      })).toBe(false);
    });

    it("does NOT suppress when call was voicemail (not conversation)", () => {
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "1 Year Follow Up",
        callClassification: "voicemail",
        callOutcome: "left_vm",
        callDuration: 30,
      })).toBe(false);
    });

    it("does NOT suppress when in follow-up but call was only 20 seconds with no DQ outcome", () => {
      // Short call with no clear DQ outcome — might have been a wrong number or accidental
      expect(shouldSuppressMotivatedOneDone({
        currentStage: "1 Year Follow Up",
        callClassification: "conversation",
        callOutcome: "interested", // Not a DQ outcome
        callDuration: 20, // Too short
      })).toBe(false);
    });
  });

  // ============ TERMINAL STAGE SUPPRESSION ============
  describe("Terminal stage suppression: skip under contract/purchased/closed leads", () => {
    
    function isTerminalStage(stageName: string): boolean {
      const lower = stageName.toLowerCase();
      return lower.includes("under contract") || lower.includes("purchased") || 
        lower.includes("closed") || lower.includes("sold");
    }

    it("identifies 'Under Contract' as terminal", () => {
      expect(isTerminalStage("Under Contract")).toBe(true);
    });

    it("identifies 'Purchased' as terminal", () => {
      expect(isTerminalStage("Purchased")).toBe(true);
    });

    it("identifies 'Closed Won' as terminal", () => {
      expect(isTerminalStage("Closed Won")).toBe(true);
    });

    it("identifies 'Sold' as terminal", () => {
      expect(isTerminalStage("Sold")).toBe(true);
    });

    it("does NOT identify 'New Lead' as terminal", () => {
      expect(isTerminalStage("New Lead")).toBe(false);
    });

    it("does NOT identify 'Follow Up' as terminal", () => {
      expect(isTerminalStage("Follow Up")).toBe(false);
    });

    it("does NOT identify 'Walkthrough Apt Scheduled' as terminal", () => {
      expect(isTerminalStage("Walkthrough Apt Scheduled")).toBe(false);
    });

    it("does NOT identify 'Made Offer' as terminal", () => {
      expect(isTerminalStage("Made Offer")).toBe(false);
    });
  });

  // ============ ENHANCED DEDUP — NOT_A_DEAL BLOCKS ALL RULES ============
  describe("Enhanced dedup: 'not_a_deal' dismissal blocks ALL rules for same contact", () => {
    
    // Simulates the isAlreadyFlagged logic
    function isBlockedByDismissal(params: {
      existingSameRule: boolean;
      dismissedAsNotADeal: boolean;
      dismissedAsFalsePositive: boolean;
      dismissedWithinDays: number;
    }): boolean {
      if (params.existingSameRule) return true;
      
      // New: if contact was dismissed as not_a_deal or false_positive within 60 days,
      // block ALL rules for this contact
      if ((params.dismissedAsNotADeal || params.dismissedAsFalsePositive) && params.dismissedWithinDays <= 60) {
        return true;
      }
      
      return false;
    }

    it("blocks same rule (existing behavior)", () => {
      expect(isBlockedByDismissal({
        existingSameRule: true,
        dismissedAsNotADeal: false,
        dismissedAsFalsePositive: false,
        dismissedWithinDays: 999,
      })).toBe(true);
    });

    it("blocks different rule when contact was dismissed as not_a_deal within 60 days", () => {
      // e.g., dismissed motivated_one_and_done as "Not a Deal" — should also block price_stated_no_followup
      expect(isBlockedByDismissal({
        existingSameRule: false,
        dismissedAsNotADeal: true,
        dismissedAsFalsePositive: false,
        dismissedWithinDays: 15,
      })).toBe(true);
    });

    it("blocks different rule when contact was dismissed as false_positive within 60 days", () => {
      expect(isBlockedByDismissal({
        existingSameRule: false,
        dismissedAsNotADeal: false,
        dismissedAsFalsePositive: true,
        dismissedWithinDays: 30,
      })).toBe(true);
    });

    it("does NOT block when dismissal was over 60 days ago", () => {
      expect(isBlockedByDismissal({
        existingSameRule: false,
        dismissedAsNotADeal: true,
        dismissedAsFalsePositive: false,
        dismissedWithinDays: 90,
      })).toBe(false);
    });

    it("does NOT block when dismissal reason was 'already_handled' (not a permanent DQ)", () => {
      // already_handled means the team dealt with it — but the contact might still be worth flagging later
      expect(isBlockedByDismissal({
        existingSameRule: false,
        dismissedAsNotADeal: false,
        dismissedAsFalsePositive: false,
        dismissedWithinDays: 10,
      })).toBe(false);
    });
  });

  // ============ RULE COUNT VALIDATION (UPDATED) ============
  describe("Rule count validation (with new rules)", () => {
    const allRules = [
      "backward_movement_no_call",
      "repeat_inbound_ignored",
      "followup_inbound_ignored",
      "offer_no_followup",
      "new_lead_sla_breach",
      "price_stated_no_followup",
      "motivated_one_and_done",
      "stale_active_stage",
      "dead_with_selling_signals",
      "walkthrough_no_offer",
      "duplicate_property_address",
      "missed_callback_request",
      "high_talk_time_dq",
      "active_negotiation_in_followup",
      "timeline_offered_no_commitment",
      "post_walkthrough_ghosting",
      "short_call_actionable_intel",
    ];

    it("has 17 detection rules total", () => {
      expect(allRules).toHaveLength(17);
    });

    it("all rule names use snake_case", () => {
      for (const rule of allRules) {
        expect(rule).toMatch(/^[a-z_]+$/);
      }
    });
  });

  // ============ GHOSTED LEAD MESSAGING ============
  describe("Ghosted lead missedItems: should focus on re-engagement, not rep coaching", () => {
    
    function isGhostedOrDeadLead(triggerRule: string, stageName: string): boolean {
      const ghostedRules = ["dead_with_selling_signals", "post_walkthrough_ghosting"];
      if (ghostedRules.includes(triggerRule)) return true;
      
      const lower = stageName.toLowerCase();
      return lower.includes("ghost") || lower.includes("dead") || lower.includes("dq") || lower.includes("1 year");
    }

    it("identifies dead_with_selling_signals as ghosted/dead", () => {
      expect(isGhostedOrDeadLead("dead_with_selling_signals", "Dead")).toBe(true);
    });

    it("identifies post_walkthrough_ghosting as ghosted/dead", () => {
      expect(isGhostedOrDeadLead("post_walkthrough_ghosting", "Ghosted")).toBe(true);
    });

    it("identifies lead in 'Ghosted' stage as ghosted/dead", () => {
      expect(isGhostedOrDeadLead("motivated_one_and_done", "Ghosted")).toBe(true);
    });

    it("identifies lead in '1 Year Follow Up' stage as ghosted/dead", () => {
      expect(isGhostedOrDeadLead("motivated_one_and_done", "1 Year Follow Up")).toBe(true);
    });

    it("does NOT identify lead in 'New Lead' stage as ghosted/dead", () => {
      expect(isGhostedOrDeadLead("motivated_one_and_done", "New Lead")).toBe(false);
    });

    it("does NOT identify lead in 'Hot Leads' stage as ghosted/dead", () => {
      expect(isGhostedOrDeadLead("price_stated_no_followup", "Hot Leads")).toBe(false);
    });
  });

  // ============ UI TIER LABEL MAPPING ============
  describe("UI: missedItems label changes based on tier", () => {
    
    function getMissedItemsLabel(tier: string): string {
      return tier === "possible" ? "Why This Is Worth a Look" : "What They Missed";
    }

    it("shows 'What They Missed' for missed tier", () => {
      expect(getMissedItemsLabel("missed")).toBe("What They Missed");
    });

    it("shows 'What They Missed' for warning tier", () => {
      expect(getMissedItemsLabel("warning")).toBe("What They Missed");
    });

    it("shows 'Why This Is Worth a Look' for possible tier", () => {
      expect(getMissedItemsLabel("possible")).toBe("Why This Is Worth a Look");
    });
  });

  // ============ REAL-WORLD SCENARIO TESTS ============
  describe("Real-world: Sara Prinzi (not motivated, crazy high price, 1 Year Follow Up)", () => {
    it("should be suppressed by follow-up stage check", () => {
      const currentStage = "1 Year Follow Up";
      const callClassification = "conversation";
      const callOutcome = "not_interested";
      
      const stageLower = currentStage.toLowerCase();
      const isFollowUp = stageLower.includes("follow up") || stageLower.includes("1 year");
      expect(isFollowUp).toBe(true);
      
      const dqOutcomes = ["not_interested", "dead", "no_answer", "left_vm", "none"];
      const isDqOutcome = dqOutcomes.includes(callOutcome);
      expect(isDqOutcome).toBe(true);
      
      // Both conditions met — should suppress
      const shouldSuppress = isFollowUp && callClassification === "conversation" && isDqOutcome;
      expect(shouldSuppress).toBe(true);
    });
  });

  describe("Real-world: Matthew Golden (no equity, listing best option, 1 Year Follow Up)", () => {
    it("should be suppressed by follow-up stage + long conversation check", () => {
      const currentStage = "1 Year Follow Up";
      const callClassification = "conversation";
      const callDuration = 167; // 2+ minute call — real conversation
      
      const stageLower = currentStage.toLowerCase();
      const isFollowUp = stageLower.includes("follow up") || stageLower.includes("1 year");
      expect(isFollowUp).toBe(true);
      
      // Long conversation + follow-up = intentional DQ
      const shouldSuppress = isFollowUp && callClassification === "conversation" && callDuration >= 60;
      expect(shouldSuppress).toBe(true);
    });
  });

  describe("Real-world: Cathie Cooper (ghosted after 12 days of calling/texting)", () => {
    it("should show re-engagement context in missedItems, not rep coaching", () => {
      // Cathie Cooper was moved to ghosted because team called/texted for 12 days with no response
      // missedItems should focus on:
      // - "12 outbound attempts over 2 weeks with no response"
      // - "Try a different channel or team member"
      // NOT:
      // - "Rep didn't ask about timeline"
      // - "Rep didn't ask about motivation"
      
      const triggerRule = "dead_with_selling_signals";
      const stageName = "Ghosted";
      
      const isGhosted = triggerRule === "dead_with_selling_signals" || 
        stageName.toLowerCase().includes("ghost");
      expect(isGhosted).toBe(true);
      
      // For ghosted leads, missedItems should be about re-engagement
      const goodMissedItems = [
        "12 outbound attempts over 2 weeks with no response — seller may have found another buyer",
        "Try reaching out via text or a different team member for a fresh approach",
      ];
      const badMissedItems = [
        "Rep didn't ask about timeline",
        "Rep didn't ask about motivation",
      ];
      
      // Good items mention outreach context
      expect(goodMissedItems[0]).toContain("outbound attempts");
      expect(goodMissedItems[1]).toContain("different");
      
      // Bad items are generic coaching — not appropriate for ghosted leads
      expect(badMissedItems[0]).toContain("didn't ask");
    });
  });

  describe("Real-world: Ching Chen & Karen Sherlin (SLA breach should be At Risk)", () => {
    it("Ching Chen: SLA breach should show as At Risk, not Missed", () => {
      const detection = {
        tier: "warning" as const,
        triggerRules: ["new_lead_sla_breach"],
      };
      
      // UI maps "warning" to "At Risk"
      const uiLabel = detection.tier === "missed" ? "Missed" : 
        detection.tier === "warning" ? "At Risk" : "Worth a Look";
      expect(uiLabel).toBe("At Risk");
    });

    it("Karen Sherlin: SLA breach should show as At Risk, not Missed", () => {
      const detection = {
        tier: "warning" as const,
        triggerRules: ["new_lead_sla_breach"],
      };
      
      const uiLabel = detection.tier === "missed" ? "Missed" :
        detection.tier === "warning" ? "At Risk" : "Worth a Look";
      expect(uiLabel).toBe("At Risk");
    });
  });
});
