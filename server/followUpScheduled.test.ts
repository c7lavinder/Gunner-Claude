import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Follow-Up Scheduled Feature", () => {
  describe("Schema", () => {
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );

    it("should have followUpScheduled column in calls table", () => {
      expect(schemaContent).toContain("followUpScheduled");
    });

    it("should default followUpScheduled to false", () => {
      expect(schemaContent).toMatch(/followUpScheduled.*default.*false/s);
    });
  });

  describe("Grading", () => {
    const gradingContent = fs.readFileSync(
      path.resolve(__dirname, "./grading.ts"),
      "utf-8"
    );

    it("should include followUpScheduled in GradingResult interface", () => {
      expect(gradingContent).toContain("followUpScheduled");
    });

    it("should include followUpScheduled in the grading prompt", () => {
      // followUpScheduled appears near callOutcome in the JSON format section
      expect(gradingContent).toContain("followUpScheduled");      
      // Verify it appears in the prompt context (near callOutcome)
      const idx = gradingContent.indexOf("followUpScheduled");
      const nearbyContent = gradingContent.substring(Math.max(0, idx - 300), idx + 300);
      expect(nearbyContent).toContain("callOutcome");
    });

    it("should save followUpScheduled to the database", () => {
      const dbUpdateMatches = gradingContent.match(/followUpScheduled.*gradeResult/g);
      expect(dbUpdateMatches).not.toBeNull();
      expect(dbUpdateMatches!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Frontend - CallDetail", () => {
    const callDetailContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/CallDetail.tsx"),
      "utf-8"
    );

    it("should display Follow-Up Scheduled badge", () => {
      expect(callDetailContent).toContain("followUpScheduled");
      expect(callDetailContent).toContain("Follow-Up Scheduled");
    });
  });

  describe("Frontend - CallInbox", () => {
    const callInboxContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/CallInbox.tsx"),
      "utf-8"
    );

    it("should display Follow-Up indicator", () => {
      expect(callInboxContent).toContain("followUpScheduled");
      expect(callInboxContent).toContain("Follow-Up");
    });
  });
});

describe("Bulk Re-Grade Feature", () => {
  describe("Backend - Router", () => {
    const routersContent = fs.readFileSync(
      path.resolve(__dirname, "./routers.ts"),
      "utf-8"
    );

    it("should have a bulkRegrade procedure", () => {
      expect(routersContent).toContain("bulkRegrade");
    });

    it("should accept filter and daysBack parameters", () => {
      const bulkSection = routersContent.substring(
        routersContent.indexOf("bulkRegrade"),
        routersContent.indexOf("bulkRegrade") + 500
      );
      expect(bulkSection).toContain("filter");
      expect(bulkSection).toContain("daysBack");
    });

    it("should require admin access", () => {
      const bulkSection = routersContent.substring(
        routersContent.indexOf("bulkRegrade"),
        routersContent.indexOf("bulkRegrade") + 300
      );
      expect(bulkSection).toContain("admin");
    });

    it("should limit batch size to 200", () => {
      const bulkSection = routersContent.substring(
        routersContent.indexOf("bulkRegrade"),
        routersContent.indexOf("bulkRegrade") + 1500
      );
      expect(bulkSection).toContain(".limit(200)");
    });
  });

  describe("Frontend - BulkRegradeWidget", () => {
    const widgetContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/BulkRegradeWidget.tsx"),
      "utf-8"
    );

    it("should have filter selection for callback_only and all_completed", () => {
      expect(widgetContent).toContain("callback_only");
      expect(widgetContent).toContain("all_completed");
    });

    it("should have days back selection", () => {
      expect(widgetContent).toContain("daysBack");
    });

    it("should show a warning about AI credits", () => {
      expect(widgetContent).toContain("AI credits");
    });
  });

  describe("Frontend - TenantSettings integration", () => {
    const settingsContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/TenantSettings.tsx"),
      "utf-8"
    );

    it("should import BulkRegradeWidget", () => {
      expect(settingsContent).toContain("BulkRegradeWidget");
    });

    it("should render BulkRegradeWidget in the rubrics tab", () => {
      const rubricsIndex = settingsContent.indexOf('rubrics');
      const widgetIndex = settingsContent.indexOf("<BulkRegradeWidget");
      expect(widgetIndex).toBeGreaterThan(rubricsIndex);
    });
  });
});

describe("Stripe Bypass Subscription Handling", () => {
  const checkoutContent = fs.readFileSync(
    path.resolve(__dirname, "./stripe/checkout.ts"),
    "utf-8"
  );

  it("should skip Stripe API for super admin bypass subscription IDs", () => {
    expect(checkoutContent).toContain("sub_super_admin");
  });

  it("should skip Stripe API for bypass subscription IDs", () => {
    expect(checkoutContent).toContain("sub_bypass");
  });

  it("should suppress 404 errors for missing subscriptions", () => {
    expect(checkoutContent).toContain("statusCode");
    expect(checkoutContent).toContain("404");
  });
});
