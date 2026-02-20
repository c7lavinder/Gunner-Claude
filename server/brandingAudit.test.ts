import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to verify all hardcoded tenant-specific values and Manus branding
 * have been removed from user-facing code.
 */

// Helper to recursively get all files in a directory
function getAllFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .manus-logs, dist
      if (["node_modules", ".manus-logs", "dist", ".git"].includes(entry.name)) continue;
      files.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

const projectRoot = path.resolve(__dirname, "..");
const clientSrcDir = path.join(projectRoot, "client", "src");
const serverDir = path.join(projectRoot, "server");

describe("Manus branding removal", () => {
  it("should not have 'manuscdn' URLs in client source files", () => {
    const files = getAllFiles(clientSrcDir, [".tsx", ".ts", ".css"]);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toContain("manuscdn");
    }
  });

  it("should not have 'Login with Manus' text in client source files", () => {
    const files = getAllFiles(clientSrcDir, [".tsx", ".ts"]);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toContain("Login with Manus");
      expect(content).not.toContain("login with Manus");
    }
  });

  it("should not have 'manus.space' in client source files", () => {
    const files = getAllFiles(clientSrcDir, [".tsx", ".ts"]);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toContain("manus.space");
    }
  });

  it("should not have 'manuscdn' in server files", () => {
    const files = getAllFiles(serverDir, [".ts"]);
    for (const file of files) {
      // Skip test files and _core framework files
      if (file.endsWith(".test.ts") || file.includes("_core")) continue;
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toContain("manuscdn");
    }
  });
});

describe("Trial period consistency", () => {
  it("should not have '3-day' or '3 day' trial references in client source files", () => {
    const files = getAllFiles(clientSrcDir, [".tsx", ".ts"]);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      // Match "3-day" or "3 day" in trial context
      const matches = content.match(/3[- ]day\s*(free\s*)?trial/gi);
      expect(matches).toBeNull();
    }
  });
});

describe("Hardcoded tenant values removed", () => {
  it("should not have hardcoded Railway webhook URL in server files", () => {
    const files = getAllFiles(serverDir, [".ts"]);
    for (const file of files) {
      if (file.endsWith(".test.ts")) continue;
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toContain("gunner-engine-production.up.railway.app");
    }
  });

  it("should not have hardcoded Google OAuth ID in isPlatformOwner", () => {
    const tenantFile = path.join(serverDir, "tenant.ts");
    const content = fs.readFileSync(tenantFile, "utf-8");
    // Should use env var, not hardcoded ID
    expect(content).not.toMatch(/isPlatformOwner.*310519663328210645/);
  });

  it("should not have hardcoded team member names in KPI module", () => {
    const kpiFile = path.join(serverDir, "kpi.ts");
    const content = fs.readFileSync(kpiFile, "utf-8");
    // Should not have hardcoded name lists
    expect(content).not.toMatch(/["']chris["']/i);
    expect(content).not.toMatch(/["']daniel["']/i);
    expect(content).not.toMatch(/["']esteban["']/i);
  });

  it("should not have hardcoded pipeline stage names in opportunityDetection", () => {
    const odFile = path.join(serverDir, "opportunityDetection.ts");
    const content = fs.readFileSync(odFile, "utf-8");
    // Should not have hardcoded stage arrays
    expect(content).not.toMatch(/ACTIVE_DEAL_STAGES\s*=\s*\[/);
    expect(content).not.toMatch(/FOLLOW_UP_STAGES\s*=\s*\[/);
    expect(content).not.toMatch(/DEAD_STAGES\s*=\s*\[/);
  });

  it("should use env var for email logo URL", () => {
    const emailFile = path.join(serverDir, "emailService.ts");
    const content = fs.readFileSync(emailFile, "utf-8");
    // Should reference EMAIL_LOGO_URL env var
    expect(content).toMatch(/EMAIL_LOGO_URL/);
  });

  it("should use env var for APP_URL in email templates", () => {
    const templateFile = path.join(serverDir, "emailTemplates.ts");
    const content = fs.readFileSync(templateFile, "utf-8");
    // Should reference APP_URL env var
    expect(content).toMatch(/APP_URL/);
  });
});

describe("Grading prompts use dynamic industry", () => {
  it("should accept industry parameter in grading functions", () => {
    const gradingFile = path.join(serverDir, "grading.ts");
    const content = fs.readFileSync(gradingFile, "utf-8");
    // Should have industry parameter or tenantIndustry variable
    expect(content).toMatch(/tenantIndustry|industry/);
  });
});

describe("Onboarding completeness", () => {
  it("should collect stage classification in onboarding form", () => {
    const onboardingFile = path.join(clientSrcDir, "pages", "Onboarding.tsx");
    const content = fs.readFileSync(onboardingFile, "utf-8");
    expect(content).toContain("activeStages");
    expect(content).toContain("followUpStages");
    expect(content).toContain("deadStages");
  });

  it("should collect industry in onboarding form", () => {
    const onboardingFile = path.join(clientSrcDir, "pages", "Onboarding.tsx");
    const content = fs.readFileSync(onboardingFile, "utf-8");
    expect(content).toContain("industry");
  });

  it("should have advanced config section in tenant settings", () => {
    const settingsFile = path.join(clientSrcDir, "pages", "TenantSettings.tsx");
    const content = fs.readFileSync(settingsFile, "utf-8");
    expect(content).toContain("stageClassification");
    expect(content).toContain("industry");
    expect(content).toContain("engineWebhookUrl");
  });
});
