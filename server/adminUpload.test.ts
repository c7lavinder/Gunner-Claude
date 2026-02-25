import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to ensure manual call upload is restricted to admin-only users.
 * Both backend (role check) and frontend (UI hidden for non-admins) are verified.
 */

describe("Manual Upload Admin-Only Restriction", () => {
  describe("Backend: routers.ts uploadManual", () => {
    const routersContent = fs.readFileSync(
      path.join(__dirname, "routers.ts"),
      "utf-8"
    );

    it("should have admin-only role check in uploadManual handler", () => {
      // The uploadManual mutation should check ctx.user.role !== "admin"
      expect(routersContent).toContain('ctx.user.role !== "admin"');
    });

    it("should throw FORBIDDEN error for non-admin users", () => {
      expect(routersContent).toContain("Only admins can manually upload calls");
      expect(routersContent).toContain('code: "FORBIDDEN"');
    });

    it("should have ADMIN ONLY comment on the uploadManual handler", () => {
      expect(routersContent).toContain("ADMIN ONLY");
    });

    it("should have deduplication check for manual uploads", () => {
      expect(routersContent).toContain("Deduplication");
      expect(routersContent).toContain("Duplicate detected");
    });

    it("should check for recent duplicates within 30 minutes", () => {
      expect(routersContent).toContain("30 * 60 * 1000");
    });
  });

  describe("Frontend: CallInbox.tsx ManualUploadDialog", () => {
    const callInboxContent = fs.readFileSync(
      path.join(__dirname, "../client/src/pages/CallInbox.tsx"),
      "utf-8"
    );

    it("should wrap ManualUploadDialog with admin role check", () => {
      // The ManualUploadDialog rendering (not definition) should be wrapped with admin check
      // Find the usage: <ManualUploadDialog onSuccess={handleRefresh} />
      const usageIndex = callInboxContent.indexOf("<ManualUploadDialog");
      expect(usageIndex).toBeGreaterThan(-1);
      // Find the nearest role check before the usage (may be up to 1200 chars away if inside a dropdown)
      const beforeUsage = callInboxContent.substring(Math.max(0, usageIndex - 1200), usageIndex);
      expect(beforeUsage).toContain("role");
      expect(beforeUsage).toContain("admin");
    });
  });

  describe("Frontend: LeadGenDashboard.tsx Upload Dialog", () => {
    const leadGenContent = fs.readFileSync(
      path.join(__dirname, "../client/src/pages/LeadGenDashboard.tsx"),
      "utf-8"
    );

    it("should wrap upload dialog with admin role check", () => {
      // The upload dialog should only render for admin/super_admin
      const uploadIndex = leadGenContent.indexOf("Upload Call");
      const beforeUpload = leadGenContent.substring(Math.max(0, uploadIndex - 300), uploadIndex);
      expect(beforeUpload).toContain("role");
      expect(beforeUpload).toContain("admin");
    });
  });
});
