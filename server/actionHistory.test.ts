import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to verify the Action History feature in the Next Steps tab:
 * - Completed actions are shown at full opacity (no dimming)
 * - Timestamps are displayed for completed actions
 * - The "Actions Taken" header shows counts
 * - The getNextSteps route returns updatedAt
 */

describe("Action History visibility", () => {
  const nextStepsPath = path.join(__dirname, "../client/src/components/NextStepsTab.tsx");
  const nextStepsContent = fs.readFileSync(nextStepsPath, "utf-8");
  const routersPath = path.join(__dirname, "routers.ts");
  const routersContent = fs.readFileSync(routersPath, "utf-8");

  describe("NextStepsTab UI", () => {
    it("should NOT reduce opacity for pushed actions", () => {
      // The old code had opacity-70 for pushed and opacity-50 for skipped
      // The new code should not have these opacity reductions
      const cardWrapperSection = nextStepsContent.substring(
        nextStepsContent.indexOf("border rounded-lg overflow-hidden transition-all border-l-4"),
        nextStepsContent.indexOf("{/* Header — action type + badges */}")
      );
      expect(cardWrapperSection).not.toContain("opacity-70");
      expect(cardWrapperSection).not.toContain("opacity-50");
    });

    it("should have completedAt field in the NextStepAction interface", () => {
      const interfaceSection = nextStepsContent.substring(
        nextStepsContent.indexOf("interface NextStepAction"),
        nextStepsContent.indexOf("const ACTION_TYPE_CONFIG")
      );
      expect(interfaceSection).toContain("completedAt?: number");
    });

    it("should display timestamp footer for completed actions", () => {
      expect(nextStepsContent).toContain("Completed timestamp footer");
      expect(nextStepsContent).toContain("isDone && action.completedAt");
      expect(nextStepsContent).toContain("toLocaleDateString");
      expect(nextStepsContent).toContain("toLocaleTimeString");
    });

    it("should show 'Actions Taken' header with counts", () => {
      expect(nextStepsContent).toContain("Actions Taken");
      expect(nextStepsContent).toContain("pushed");
      expect(nextStepsContent).toContain("skipped");
      expect(nextStepsContent).toContain("failed");
    });

    it("should import History icon from lucide-react", () => {
      expect(nextStepsContent).toContain("History,");
      expect(nextStepsContent).toContain("History className=");
    });

    it("should map completedAt from stored data on initial load", () => {
      const loadSection = nextStepsContent.substring(
        nextStepsContent.indexOf("When stored data loads, populate actions"),
        nextStepsContent.indexOf("const generateMutation")
      );
      expect(loadSection).toContain("completedAt: a.updatedAt");
    });

    it("should set completedAt when pushing an action", () => {
      const pushSection = nextStepsContent.substring(
        nextStepsContent.indexOf("const handlePush = async"),
        nextStepsContent.indexOf("const handleSaveEdit = (action: NextStepAction, newPayload")
      );
      // Should set completedAt on both success and error paths
      // Check both success and error paths set completedAt
      expect(pushSection).toContain("completedAt: Date.now()");
      // Count occurrences - should be at least 2 (success + error)
      const count = pushSection.split("completedAt: Date.now()").length - 1;
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it("should set completedAt when skipping an action", () => {
      const skipSection = nextStepsContent.substring(
        nextStepsContent.indexOf("const handleSkip"),
        nextStepsContent.indexOf("const handleDelete")
      );
      expect(skipSection).toContain("completedAt: Date.now()");
    });

    it("should show contextual subtitle when all steps are processed", () => {
      expect(nextStepsContent).toContain("See what actions were taken for this call below");
    });
  });

  describe("getNextSteps route returns updatedAt", () => {
    it("should include updatedAt in the response mapping", () => {
      const getNextStepsSection = routersContent.substring(
        routersContent.indexOf("getNextSteps:"),
        routersContent.indexOf("getNextStepsCount:")
      );
      expect(getNextStepsSection).toContain("updatedAt: r.updatedAt");
    });
  });
});
