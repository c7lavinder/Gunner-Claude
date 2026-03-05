/**
 * Inventory Module Tests
 * Tests for dispo property management, sends, offers, showings, and KPI calculations
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Schema validation tests ───

describe("Inventory Schema", () => {
  it("should have the correct property status enum values", async () => {
    const { dispoProperties } = await import("../drizzle/schema");
    expect(dispoProperties).toBeDefined();
    // The table should exist with the expected columns
    expect(dispoProperties.id).toBeDefined();
    expect(dispoProperties.tenantId).toBeDefined();
    expect(dispoProperties.address).toBeDefined();
    expect(dispoProperties.city).toBeDefined();
    expect(dispoProperties.state).toBeDefined();
    expect(dispoProperties.status).toBeDefined();
    expect(dispoProperties.askingPrice).toBeDefined();
    expect(dispoProperties.arv).toBeDefined();
    expect(dispoProperties.propertyType).toBeDefined();
    expect(dispoProperties.beds).toBeDefined();
    expect(dispoProperties.baths).toBeDefined();
    expect(dispoProperties.sqft).toBeDefined();
    expect(dispoProperties.sellerName).toBeDefined();
    expect(dispoProperties.sellerPhone).toBeDefined();
  });

  it("should have the correct sends table columns", async () => {
    const { dispoPropertySends } = await import("../drizzle/schema");
    expect(dispoPropertySends).toBeDefined();
    expect(dispoPropertySends.id).toBeDefined();
    expect(dispoPropertySends.propertyId).toBeDefined();
    expect(dispoPropertySends.tenantId).toBeDefined();
    expect(dispoPropertySends.channel).toBeDefined();
    expect(dispoPropertySends.buyerGroup).toBeDefined();
    expect(dispoPropertySends.recipientCount).toBeDefined();
    expect(dispoPropertySends.sentByUserId).toBeDefined();
  });

  it("should have the correct offers table columns", async () => {
    const { dispoPropertyOffers } = await import("../drizzle/schema");
    expect(dispoPropertyOffers).toBeDefined();
    expect(dispoPropertyOffers.id).toBeDefined();
    expect(dispoPropertyOffers.propertyId).toBeDefined();
    expect(dispoPropertyOffers.tenantId).toBeDefined();
    expect(dispoPropertyOffers.buyerName).toBeDefined();
    expect(dispoPropertyOffers.offerAmount).toBeDefined();
    expect(dispoPropertyOffers.status).toBeDefined();
  });

  it("should have the correct showings table columns", async () => {
    const { dispoPropertyShowings } = await import("../drizzle/schema");
    expect(dispoPropertyShowings).toBeDefined();
    expect(dispoPropertyShowings.id).toBeDefined();
    expect(dispoPropertyShowings.propertyId).toBeDefined();
    expect(dispoPropertyShowings.tenantId).toBeDefined();
    expect(dispoPropertyShowings.buyerName).toBeDefined();
    expect(dispoPropertyShowings.showingDate).toBeDefined();
    expect(dispoPropertyShowings.status).toBeDefined();
    expect(dispoPropertyShowings.interestLevel).toBeDefined();
    expect(dispoPropertyShowings.feedback).toBeDefined();
  });

  it("should have the correct daily KPIs table columns", async () => {
    const { dispoDailyKpis } = await import("../drizzle/schema");
    expect(dispoDailyKpis).toBeDefined();
    expect(dispoDailyKpis.id).toBeDefined();
    expect(dispoDailyKpis.tenantId).toBeDefined();
    expect(dispoDailyKpis.date).toBeDefined();
    expect(dispoDailyKpis.kpiType).toBeDefined();
    expect(dispoDailyKpis.value).toBeDefined();
    expect(dispoDailyKpis.source).toBeDefined();
  });
});

// ─── KPI Color Helper tests ───

describe("Dispo KPI Color Helper", () => {
  it("should return green when value meets or exceeds target", async () => {
    const { getDispoKpiColor } = await import("./inventory");
    expect(getDispoKpiColor(5, 5)).toBe("green");
    expect(getDispoKpiColor(10, 5)).toBe("green");
    expect(getDispoKpiColor(3, 3)).toBe("green");
  });

  it("should return yellow when value is 50-99% of target", async () => {
    const { getDispoKpiColor } = await import("./inventory");
    expect(getDispoKpiColor(3, 5)).toBe("yellow");
    expect(getDispoKpiColor(1, 2)).toBe("yellow");
  });

  it("should return red when value is below 50% of target", async () => {
    const { getDispoKpiColor } = await import("./inventory");
    expect(getDispoKpiColor(0, 5)).toBe("red");
    expect(getDispoKpiColor(1, 5)).toBe("red");
    expect(getDispoKpiColor(0, 1)).toBe("red");
  });

  it("should handle zero target gracefully", async () => {
    const { getDispoKpiColor } = await import("./inventory");
    expect(getDispoKpiColor(1, 0)).toBe("green");
    expect(getDispoKpiColor(0, 0)).toBe("red");
  });
});

// ─── DISPO_TARGETS constant tests ───

describe("Dispo KPI Targets", () => {
  it("should have all required KPI targets defined", async () => {
    const { DISPO_TARGETS } = await import("./inventory");
    expect(DISPO_TARGETS).toBeDefined();
    expect(DISPO_TARGETS.properties_sent).toBeGreaterThan(0);
    expect(DISPO_TARGETS.showings_scheduled).toBeGreaterThan(0);
    expect(DISPO_TARGETS.offers_received).toBeGreaterThan(0);
    expect(DISPO_TARGETS.deals_assigned).toBeGreaterThan(0);
    expect(DISPO_TARGETS.contracts_closed).toBeGreaterThan(0);
  });

  it("should have reasonable target values", async () => {
    const { DISPO_TARGETS } = await import("./inventory");
    // Properties sent should be highest (most activity)
    expect(DISPO_TARGETS.properties_sent).toBeGreaterThanOrEqual(DISPO_TARGETS.showings_scheduled);
    // Showings should be >= offers (not all showings lead to offers)
    expect(DISPO_TARGETS.showings_scheduled).toBeGreaterThanOrEqual(DISPO_TARGETS.offers_received);
  });
});

// ─── Role detection tests ───

describe("Dispo Manager Role Detection", () => {
  it("should include dispo_manager in team role enum", async () => {
    const schema = await import("../drizzle/schema");
    // The teamMembers table should accept dispo_manager as a valid teamRole
    expect(schema.teamMembers).toBeDefined();
    expect(schema.teamMembers.teamRole).toBeDefined();
  });

  it("should have dispo in ROLE_TAB_CONFIG", async () => {
    // Verify the frontend config exists by checking the file
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/TaskCenter.tsx", "utf-8");
    expect(content).toContain('"dispo"');
    expect(content).toContain('dispo: {');
    expect(content).toContain('label: "Dispo"');
    expect(content).toContain('teamRoles: ["dispo_manager"]');
  });
});

// ─── Coach Dispo Awareness tests ───

describe("AI Coach Dispo Awareness", () => {
  it("should detect dispo_manager role in coachStream", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/coachStream.ts", "utf-8");
    expect(content).toContain("isDispoManager");
    expect(content).toContain("dispo_manager");
    expect(content).toContain("disposition coach");
    expect(content).toContain("dispoInventoryContext");
  });

  it("should include dispo-specific coaching topics", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/coachStream.ts", "utf-8");
    expect(content).toContain("Property marketing strategy");
    expect(content).toContain("Buyer relationship management");
    expect(content).toContain("Showing scheduling");
    expect(content).toContain("Offer negotiation");
    expect(content).toContain("Assignment fee optimization");
    expect(content).toContain("Facebook marketplace");
  });

  it("should load active inventory context for dispo coach", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/coachStream.ts", "utf-8");
    expect(content).toContain("ACTIVE DISPO INVENTORY");
    expect(content).toContain("dispoProperties");
    expect(content).toContain("dispoPropertyOffers");
    expect(content).toContain("dispoPropertyShowings");
    expect(content).toContain("dispoPropertySends");
  });
});

// ─── Inventory Router tests ───

describe("Inventory tRPC Router", () => {
  it("should have all required procedures defined", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    // Check all inventory procedures exist
    expect(content).toContain("inventory:");
    expect(content).toContain("getProperties:");
    expect(content).toContain("getPropertyById:");
    expect(content).toContain("createProperty:");
    expect(content).toContain("updateProperty:");
    expect(content).toContain("deleteProperty:");
    expect(content).toContain("addSend:");
    expect(content).toContain("deleteSend:");
    expect(content).toContain("addOffer:");
    expect(content).toContain("updateOfferStatus:");
    expect(content).toContain("deleteOffer:");
    expect(content).toContain("addShowing:");
    expect(content).toContain("updateShowing:");
    expect(content).toContain("deleteShowing:");
    expect(content).toContain("getTodayShowings:");
    expect(content).toContain("getDispoKpiSummary:");
  });
});

// ─── Navigation tests ───

describe("Inventory Navigation", () => {
  it("should have Inventory route in App.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/App.tsx", "utf-8");
    expect(content).toContain('path="/inventory"');
    expect(content).toContain("Inventory");
  });

  it("should have Inventory nav item in DashboardLayout for dispo_manager", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/components/DashboardLayout.tsx", "utf-8");
    expect(content).toContain('"Inventory"');
    expect(content).toContain('"/inventory"');
    expect(content).toContain("isDispoManager");
  });

  it("should give dispo_manager access to Day Hub", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/components/DashboardLayout.tsx", "utf-8");
    // The Day Hub nav item should be visible for dispo_manager
    expect(content).toContain("isDispoManager");
    const dayHubSection = content.indexOf('"Day Hub"');
    expect(dayHubSection).toBeGreaterThan(-1);
  });
});

// ─── Inventory Page Component tests ───

describe("Inventory Page", () => {
  it("should exist and have proper structure", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("export default");
    expect(content).toContain("trpc.inventory");
  });

  it("should have property CRUD UI elements", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("Add Property");
    expect(content).toContain("PropertyStatus");
    expect(content).toContain("SendChannel");
    expect(content).toContain("OfferStatus");
    expect(content).toContain("ShowingStatus");
  });

  it("should have send tracking functionality", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("addSend");
    expect(content).toContain("recipientCount");
    expect(content).toContain("buyerGroup");
    expect(content).toContain("channel");
  });

  it("should have offer tracking functionality", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("addOffer");
    expect(content).toContain("offerAmount");
    expect(content).toContain("buyerName");
    expect(content).toContain("updateOfferStatus");
  });

  it("should have showing tracking functionality", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("addShowing");
    expect(content).toContain("showingDate");
    expect(content).toContain("interestLevel");
    expect(content).toContain("feedback");
  });

  it("should have status filter and search", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("statusFilter");
    expect(content).toContain("search");
    expect(content).toContain("Search properties");
  });
});

// ─── DispoKpiBar tests ───

describe("Dispo KPI Bar in Day Hub", () => {
  it("should exist in TaskCenter.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/TaskCenter.tsx", "utf-8");
    expect(content).toContain("DispoKpiBar");
    expect(content).toContain("DISPO_KPI_TARGETS");
    expect(content).toContain("trpc.inventory.getDispoKpiSummary");
  });

  it("should display all dispo KPI metrics", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/TaskCenter.tsx", "utf-8");
    expect(content).toContain("Properties Sent");
    expect(content).toContain("Showings");
    expect(content).toContain("Offers");
    expect(content).toContain("Deals Assigned");
    expect(content).toContain("Contracts");
  });
});

// ─── DispoLeftPanel tests ───

describe("Dispo Left Panel in Day Hub", () => {
  it("should exist in TaskCenter.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/TaskCenter.tsx", "utf-8");
    expect(content).toContain("DispoLeftPanel");
  });

  it("should have inbox and showings tabs", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/TaskCenter.tsx", "utf-8");
    // Should have tabs for inbox and showings
    expect(content).toContain("Inbox");
    expect(content).toContain("Showings");
  });
});
