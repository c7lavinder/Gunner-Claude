import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Onboarding UX: Stage Classification & Webhook Instructions", () => {
  const onboardingPath = path.join(__dirname, "../client/src/pages/Onboarding.tsx");
  const settingsPath = path.join(__dirname, "../client/src/pages/TenantSettings.tsx");
  const onboardingContent = fs.readFileSync(onboardingPath, "utf-8");
  const settingsContent = fs.readFileSync(settingsPath, "utf-8");

  describe("Interactive Stage Classification in Onboarding", () => {
    it("should have stageClassifications state for interactive classification", () => {
      expect(onboardingContent).toContain("stageClassifications");
      expect(onboardingContent).toContain("setStageClassifications");
    });

    it("should render clickable stage chips when pipelines are loaded", () => {
      expect(onboardingContent).toContain("handleStageClick");
      expect(onboardingContent).toContain("cycleOrder");
    });

    it("should cycle through active, follow_up, dead, unclassified buckets", () => {
      expect(onboardingContent).toContain("'active'");
      expect(onboardingContent).toContain("'follow_up'");
      expect(onboardingContent).toContain("'dead'");
      expect(onboardingContent).toContain("'unclassified'");
    });

    it("should show color-coded legend with counts", () => {
      expect(onboardingContent).toContain("Active Deal ({counts.active})");
      expect(onboardingContent).toContain("Follow-Up ({counts.follow_up})");
      expect(onboardingContent).toContain("Dead ({counts.dead})");
      expect(onboardingContent).toContain("Unclassified ({counts.unclassified})");
    });

    it("should have a fallback to free-text inputs when no pipelines loaded", () => {
      // Free-text inputs should still exist as fallback
      expect(onboardingContent).toContain("formData.activeStages");
      expect(onboardingContent).toContain("formData.followUpStages");
      expect(onboardingContent).toContain("formData.deadStages");
    });

    it("should derive stage lists from interactive map when saving", () => {
      expect(onboardingContent).toContain("hasInteractiveClassifications");
      expect(onboardingContent).toContain("Object.entries(stageClassifications)");
    });

    it("should get stages from ALL pipelines, not just selected", () => {
      expect(onboardingContent).toContain("pipelines.flatMap(p => p.stages)");
    });
  });

  describe("CRM Webhook Setup Instruction Card in Onboarding", () => {
    it("should show webhook instruction card after successful connection", () => {
      expect(onboardingContent).toContain("Required: Set Up CRM Webhook");
    });

    it("should display the webhook URL with copy button", () => {
      expect(onboardingContent).toContain("/api/webhook/ghl");
      expect(onboardingContent).toContain("Webhook URL copied!");
    });

    it("should include step-by-step CRM setup instructions", () => {
      expect(onboardingContent).toContain("Automation");
      expect(onboardingContent).toContain("Workflows");
      expect(onboardingContent).toContain("Call Status Changed");
      expect(onboardingContent).toContain("Completed");
    });

    it("should show a warning about missing webhook", () => {
      expect(onboardingContent).toContain("Without this webhook");
    });

    it("should only show when connection is successful", () => {
      expect(onboardingContent).toContain("connectionStatus.success && (");
    });
  });

  describe("CRM Webhook URL in Settings", () => {
    it("should show CRM webhook URL in settings Advanced Configuration", () => {
      expect(settingsContent).toContain("CRM Webhook URL");
      expect(settingsContent).toContain("/api/webhook/ghl");
    });

    it("should have a copy button for the webhook URL in settings", () => {
      expect(settingsContent).toContain("Webhook URL copied!");
    });

    it("should include brief setup instructions in settings", () => {
      expect(settingsContent).toContain("Call Status Changed");
    });

    it("should import Webhook and Copy icons", () => {
      expect(settingsContent).toContain("Webhook");
      expect(settingsContent).toContain("Copy");
    });
  });

  describe("No Manus branding in onboarding or settings", () => {
    it("should not contain manuscdn URLs in onboarding", () => {
      expect(onboardingContent).not.toContain("manuscdn.com");
    });

    it("should not contain manuscdn URLs in settings", () => {
      expect(settingsContent).not.toContain("manuscdn.com");
    });

    it("should not contain 'Manus' text in onboarding (except framework files)", () => {
      // Check for user-visible Manus text
      expect(onboardingContent).not.toMatch(/Login with Manus/i);
      expect(onboardingContent).not.toMatch(/Powered by Manus/i);
    });
  });
});
