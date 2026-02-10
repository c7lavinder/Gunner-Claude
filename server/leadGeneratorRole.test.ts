import { describe, it, expect } from "vitest";
import { LEAD_GENERATOR_RUBRIC, LEAD_MANAGER_RUBRIC } from "./grading";
import { LEAD_GENERATOR_BADGES, LEAD_MANAGER_BADGES, ALL_BADGES, BadgeDefinition } from "./gamification";

describe("Lead Generator Role Definitions", () => {
  describe("Lead Generator Rubric", () => {
    it("should explicitly state the goal is NOT to set appointments", () => {
      const desc = LEAD_GENERATOR_RUBRIC.description.toLowerCase();
      // The description should explicitly say NOT to set appointments
      expect(desc).toContain("not to set appointments");
      // The description should focus on generating interest
      expect(desc).toContain("generate");
      expect(desc).toContain("interest");
    });

    it("should mention Lead Manager follow-up in the rubric description", () => {
      expect(LEAD_GENERATOR_RUBRIC.description.toLowerCase()).toContain("lead manager");
      expect(LEAD_GENERATOR_RUBRIC.description.toLowerCase()).toContain("follow up");
    });

    it("should have Interest Discovery as the highest-weighted criterion", () => {
      const interestDiscovery = LEAD_GENERATOR_RUBRIC.criteria.find(c => c.name === "Interest Discovery");
      expect(interestDiscovery).toBeDefined();
      expect(interestDiscovery!.maxPoints).toBe(25);
      // Verify it's the highest
      const maxPoints = Math.max(...LEAD_GENERATOR_RUBRIC.criteria.map(c => c.maxPoints));
      expect(interestDiscovery!.maxPoints).toBe(maxPoints);
    });

    it("should have Warm Transfer / Handoff Setup criterion", () => {
      const warmTransfer = LEAD_GENERATOR_RUBRIC.criteria.find(c => c.name === "Warm Transfer / Handoff Setup");
      expect(warmTransfer).toBeDefined();
      expect(warmTransfer!.description.toLowerCase()).toContain("lead manager");
    });

    it("should include red flag for trying to set appointments", () => {
      const appointmentRedFlag = LEAD_GENERATOR_RUBRIC.redFlags.find(
        rf => rf.toLowerCase().includes("appointment") && rf.toLowerCase().includes("interest")
      );
      expect(appointmentRedFlag).toBeDefined();
    });
  });

  describe("Lead Manager Rubric", () => {
    it("should mention appointment setting in the description", () => {
      expect(LEAD_MANAGER_RUBRIC.description.toLowerCase()).toContain("appointment");
    });

    it("should have Call Outcome criterion that mentions appointment setting", () => {
      const callOutcome = LEAD_MANAGER_RUBRIC.criteria.find(c => c.name === "Call Outcome");
      expect(callOutcome).toBeDefined();
      expect(callOutcome!.description.toLowerCase()).toContain("appointment");
    });
  });

  describe("Lead Generator Badges", () => {
    it("should NOT have an Appointment Setter badge", () => {
      const appointmentBadge = LEAD_GENERATOR_BADGES.find(b => b.code === "appointment_setter");
      expect(appointmentBadge).toBeUndefined();
    });

    it("should have a Warm Handoff Pro badge instead", () => {
      const warmHandoffBadge = LEAD_GENERATOR_BADGES.find(b => b.code === "warm_handoff_pro");
      expect(warmHandoffBadge).toBeDefined();
      expect(warmHandoffBadge!.criteria.criteriaName).toBe("follow_up");
      expect(warmHandoffBadge!.description.toLowerCase()).toContain("interest");
      expect(warmHandoffBadge!.description.toLowerCase()).toContain("lead manager");
    });

    it("should have all badges with lead_generator category", () => {
      for (const badge of LEAD_GENERATOR_BADGES) {
        expect(badge.category).toBe("lead_generator");
      }
    });

    it("should have Interest Generator badge", () => {
      const interestBadge = LEAD_GENERATOR_BADGES.find(b => b.code === "interest_generator");
      expect(interestBadge).toBeDefined();
      expect(interestBadge!.description.toLowerCase()).toContain("interest");
    });

    it("should have Conversation Starter badge", () => {
      const convoStarter = LEAD_GENERATOR_BADGES.find(b => b.code === "conversation_starter");
      expect(convoStarter).toBeDefined();
      expect(convoStarter!.description.toLowerCase()).toContain("interest");
    });

    it("should have Cold Call Warrior badge", () => {
      const warrior = LEAD_GENERATOR_BADGES.find(b => b.code === "cold_call_warrior");
      expect(warrior).toBeDefined();
    });
  });

  describe("Badge Category Filtering", () => {
    it("should correctly filter badges for lead_generator role", () => {
      const teamRole = "lead_generator";
      const relevantBadges = ALL_BADGES.filter(b =>
        b.category === "universal" ||
        (teamRole === "lead_manager" && b.category === "lead_manager") ||
        (teamRole === "acquisition_manager" && b.category === "acquisition_manager") ||
        (teamRole === "lead_generator" && b.category === "lead_generator")
      );

      // Should include universal + lead_generator badges only
      expect(relevantBadges.length).toBeGreaterThan(0);
      for (const badge of relevantBadges) {
        expect(["universal", "lead_generator"]).toContain(badge.category);
      }

      // Should NOT include lead_manager or acquisition_manager badges
      const hasLeadManagerBadge = relevantBadges.some(b => b.category === "lead_manager");
      expect(hasLeadManagerBadge).toBe(false);
      const hasAcqManagerBadge = relevantBadges.some(b => b.category === "acquisition_manager");
      expect(hasAcqManagerBadge).toBe(false);
    });

    it("should correctly filter badges for lead_manager role", () => {
      const teamRole = "lead_manager";
      const relevantBadges = ALL_BADGES.filter(b =>
        b.category === "universal" ||
        (teamRole === "lead_manager" && b.category === "lead_manager") ||
        (teamRole === "acquisition_manager" && b.category === "acquisition_manager") ||
        (teamRole === "lead_generator" && b.category === "lead_generator")
      );

      // Should NOT include lead_generator badges
      const hasLeadGenBadge = relevantBadges.some(b => b.category === "lead_generator");
      expect(hasLeadGenBadge).toBe(false);
    });

    it("Lead Manager badges should still have Appointment Machine badge", () => {
      const appointmentBadge = LEAD_MANAGER_BADGES.find(b => b.code === "appointment_machine");
      expect(appointmentBadge).toBeDefined();
      expect(appointmentBadge!.description.toLowerCase()).toContain("appointment");
    });
  });
});
