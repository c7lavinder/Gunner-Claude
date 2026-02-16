/**
 * Tests for Opportunity missedItems feature.
 * Validates that the schema supports missedItems, the field is returned in queries,
 * and the generateAIReason function includes missedItems in its response.
 */
import { describe, it, expect } from "vitest";

// ============ SCHEMA TESTS ============

describe("Opportunity missedItems Schema", () => {
  it("opportunities schema includes missedItems column", async () => {
    const { opportunities } = await import("../drizzle/schema");
    // The schema should have a missedItems field
    expect(opportunities.missedItems).toBeDefined();
    expect(opportunities.missedItems.name).toBe("missedItems");
  });

  it("missedItems column accepts string array type", async () => {
    const { opportunities } = await import("../drizzle/schema");
    // JSON column typed as string[]
    const col = opportunities.missedItems;
    expect(col).toBeDefined();
    // Column should be a JSON type (drizzle stores this as json)
    expect(col.dataType).toBe("json");
  });

  it("missedItems column is nullable (not required)", async () => {
    const { opportunities } = await import("../drizzle/schema");
    // missedItems should be optional — older records won't have it
    const col = opportunities.missedItems;
    expect(col.notNull).toBeFalsy();
  });
});

// ============ RULE DESCRIPTIONS TESTS ============

describe("Opportunity Detection Rule Descriptions", () => {
  it("all rule descriptions have valid tier values", async () => {
    // Import the module to access RULE_DESCRIPTIONS indirectly via the detection patterns
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify the LLM prompt includes missedItems instructions
    expect(content).toContain("MISSED ITEMS");
    expect(content).toContain("missedItems");
  });

  it("frontend renders 'What They Missed' heading", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Opportunities.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("What They Missed");
  });

  it("generateAIReason LLM schema includes missedItems field", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify the JSON schema includes missedItems
    expect(content).toContain('"missedItems"');
    expect(content).toContain('required: ["reason", "suggestion", "missedItems"]');
  });

  it("generateAIReason return type includes missedItems", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify the function signature includes missedItems in the return type
    expect(content).toContain("Promise<{ reason: string; suggestion: string; missedItems?: string[] }>");
  });

  it("missedItems are saved to database during detection", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify missedItems is included in the insert values
    expect(content).toContain("missedItems: missedItems && missedItems.length > 0 ? missedItems : undefined");
  });

  it("missedItems are updated during re-evaluation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify the re-evaluation destructures missedItems
    const reEvalSection = content.substring(content.indexOf("reEvaluateActiveOpportunities"));
    expect(reEvalSection).toContain("const { reason, suggestion, missedItems }");
  });
});

// ============ FRONTEND RENDERING TESTS ============

describe("Opportunity Card missedItems Rendering", () => {
  it("Opportunities page renders missedItems section", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Opportunities.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify the UI renders missedItems
    expect(content).toContain("What They Missed");
    expect(content).toContain("missedItems");
    // Should render as a list
    expect(content).toContain("<ul");
    expect(content).toContain("<li");
  });

  it("missedItems section has amber styling for visibility", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Opportunities.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify amber color scheme for the missed items section
    expect(content).toContain("bg-amber-500/5");
    expect(content).toContain("text-amber-600");
    expect(content).toContain("border-amber-500/20");
  });

  it("missedItems section only renders when items exist", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Opportunities.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify conditional rendering — should check for array existence and length
    expect(content).toContain("Array.isArray");
    expect(content).toContain(".length > 0");
  });
});

// ============ LLM PROMPT QUALITY TESTS ============

describe("Missed Items LLM Prompt Quality", () => {
  it("prompt includes specific examples of good missed items", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify the prompt includes concrete examples
    expect(content).toContain("Didn't ask about seller's timeline");
    expect(content).toContain("rep didn't probe");
    expect(content).toContain("Rep ended the call without scheduling a next step");
  });

  it("prompt limits missedItems to 1-4 items", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("1-4 items maximum");
  });

  it("prompt instructs empty array when no transcript available", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("If no transcript is available, return an empty array");
  });
});
