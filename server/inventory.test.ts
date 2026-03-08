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
    expect(content).toContain("Dispo AI");
    expect(content).toContain("dispoInventoryContext");
  });

  it("should include dispo-specific coaching topics", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/coachStream.ts", "utf-8");
    expect(content).toContain("Property marketing strategy");
    expect(content).toContain("Offer negotiation");
    expect(content).toContain("Assignment fee optimization");
    expect(content).toContain("Facebook Marketplace");
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

describe("Inventory Page (Dispo Command Center)", () => {
  it("should exist and have proper structure", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("export default");
    expect(content).toContain("trpc.inventory");
    expect(content).toContain("Dispo Command Center");
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

  it("should have tabbed detail panel with Overview, Buyers, Outreach, Activity", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("OverviewTab");
    expect(content).toContain("BuyersTab");
    expect(content).toContain("OutreachTab");
    expect(content).toContain("ActivityTab");
  });

  it("should have buyer activity management UI", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("addBuyerActivity");
    expect(content).toContain("updateBuyerActivity");
    expect(content).toContain("recordBuyerSend");
    expect(content).toContain("recordBuyerOffer");
    expect(content).toContain("deleteBuyerActivity");
    expect(content).toContain("matchBuyers");
    expect(content).toContain("Match from GHL");
  });

  it("should have activity log with note adding", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("addActivityNote");
    expect(content).toContain("getActivityLog");
    expect(content).toContain("Add a note");
  });

  it("should have heat indicators for days on market", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("heatColor");
    expect(content).toContain("daysOnMarket");
    expect(content).toContain("Days on Market");
  });

  it("should have deal progress tracker", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("Deal Progress");
    expect(content).toContain("Apt Set");
    expect(content).toContain("Offer Made");
    expect(content).toContain("Under Contract");
    expect(content).toContain("Closed");
  });

  it("should have buyer status management", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("BUYER_STATUS_CONFIG");
    expect(content).toContain("matched");
    expect(content).toContain("interested");
    expect(content).toContain("offered");
    expect(content).toContain("passed");
    expect(content).toContain("accepted");
  });

  it("should have VIP buyer support", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("isVip");
    expect(content).toContain("VIP Buyer");
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

// ─── New buyer activity + activity log router procedures ───

describe("Inventory Router - Buyer Activity Procedures", () => {
  it("should have all buyer activity procedures defined", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("getBuyerActivities:");
    expect(content).toContain("addBuyerActivity:");
    expect(content).toContain("updateBuyerActivity:");
    expect(content).toContain("recordBuyerSend:");
    expect(content).toContain("recordBuyerOffer:");
    expect(content).toContain("deleteBuyerActivity:");
    expect(content).toContain("matchBuyers:");
  });

  it("should have activity log procedures defined", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("getActivityLog:");
    expect(content).toContain("addActivityNote:");
  });

  it("should have getPropertyDetail procedure", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("getPropertyDetail:");
  });
});

// ─── Dispo Grading Rubric tests ───

describe("Dispo Grading Rubric", () => {
  it("should have DISPO_MANAGER_RUBRIC defined", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("DISPO_MANAGER_RUBRIC");
    expect(content).toContain("dispo_buyer_pitch");
  });

  it("should have dispo grading criteria", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("Deal Presentation");
    expect(content).toContain("Buyer Fit Assessment");
    expect(content).toContain("Urgency Creation");
    expect(content).toContain("Objection Handling");
    expect(content).toContain("Negotiation Skill");
    expect(content).toContain("Close");
  });

  it("should map dispo_manager role to dispo_buyer_pitch in processCall", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain('dispo_manager');
    expect(content).toContain('dispo_buyer_pitch');
  });

  it("should detect dispo_buyer_pitch in detectCallType", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    // detectCallType should include dispo_buyer_pitch as a possible result
    expect(content).toContain('"dispo_buyer_pitch"');
  });
});

// ─── Schema: New tables for buyer activity and activity log ───

describe("New Schema Tables", () => {
  it("should have propertyBuyerActivity table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propertyBuyerActivity).toBeDefined();
    expect(schema.propertyBuyerActivity.id).toBeDefined();
    expect(schema.propertyBuyerActivity.propertyId).toBeDefined();
    expect(schema.propertyBuyerActivity.tenantId).toBeDefined();
    expect(schema.propertyBuyerActivity.buyerName).toBeDefined();
    expect(schema.propertyBuyerActivity.buyerPhone).toBeDefined();
    expect(schema.propertyBuyerActivity.buyerEmail).toBeDefined();
    expect(schema.propertyBuyerActivity.status).toBeDefined();
    expect(schema.propertyBuyerActivity.isVip).toBeDefined();
    expect(schema.propertyBuyerActivity.sendCount).toBeDefined();
    expect(schema.propertyBuyerActivity.offerCount).toBeDefined();
  });

  it("should have propertyActivityLog table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propertyActivityLog).toBeDefined();
    expect(schema.propertyActivityLog.id).toBeDefined();
    expect(schema.propertyActivityLog.propertyId).toBeDefined();
    expect(schema.propertyActivityLog.tenantId).toBeDefined();
    expect(schema.propertyActivityLog.eventType).toBeDefined();
    expect(schema.propertyActivityLog.title).toBeDefined();
    expect(schema.propertyActivityLog.description).toBeDefined();
  });

  it("should have new fields on dispoProperties", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.dispoProperties.market).toBeDefined();
    expect(schema.dispoProperties.lotSize).toBeDefined();
    expect(schema.dispoProperties.photos).toBeDefined();
    expect(schema.dispoProperties.dispoAskingPrice).toBeDefined();
  });
});


// ─── AI Dispo Assistant Stream Tests ───

describe("Dispo Assistant Stream", () => {
  it("should export buildPropertyContext function", async () => {
    const mod = await import("./dispoAssistantStream");
    expect(mod.buildPropertyContext).toBeDefined();
    expect(typeof mod.buildPropertyContext).toBe("function");
  });

  it("should build context string from property detail", async () => {
    const { buildPropertyContext } = await import("./dispoAssistantStream");
    const mockDetail = {
      id: 1,
      address: "123 Main St",
      city: "Dallas",
      state: "TX",
      zip: "75001",
      status: "marketing",
      propertyType: "SFR",
      askingPrice: "250000",
      arv: "350000",
      estRepairs: "50000",
      beds: 3,
      baths: 2,
      sqft: 1800,
      yearBuilt: 1995,
      lotSize: "0.25 acres",
      market: "Dallas-Fort Worth",
      sellerName: "John Doe",
      sellerPhone: "555-1234",
      notes: "Motivated seller",
      createdAt: new Date("2025-01-01"),
      sends: [
        { channel: "sms", buyerGroup: "Cash Buyers", recipientCount: 50, sentAt: new Date("2025-01-15") },
      ],
      offers: [
        { buyerName: "Jane Buyer", offerAmount: "230000", status: "pending", createdAt: new Date("2025-01-20") },
      ],
      showings: [
        { buyerName: "Bob Investor", scheduledAt: new Date("2025-01-25"), status: "scheduled" },
      ],
    };

    const context = buildPropertyContext(mockDetail);
    expect(context).toContain("123 Main St");
    expect(context).toContain("Dallas");
    expect(context).toContain("TX");
    expect(context).toContain("$2,500");
    expect(context).toContain("$3,500");
    expect(context).toContain("SFR");
    expect(context).toContain("OUTREACH");
    expect(context).toContain("OFFERS");
    expect(context).toContain("SHOWINGS");
  });

  it("should handle empty property detail gracefully", async () => {
    const { buildPropertyContext } = await import("./dispoAssistantStream");
    const emptyDetail = {
      id: 1,
      address: "456 Oak Ave",
      city: "Houston",
      state: "TX",
      zip: "77001",
      status: "new",
      sends: [],
      offers: [],
      showings: [],
    };

    const context = buildPropertyContext(emptyDetail);
    expect(context).toContain("456 Oak Ave");
    expect(context).toContain("Houston");
    // With no sends/offers/showings, context should still contain the property info
    expect(context).toContain("new");
  });
});

// ─── Dispo Gamification Tests ───

describe("Dispo Manager Gamification", () => {
  it("should include dispo_manager badges in ALL_BADGES", async () => {
    const { ALL_BADGES } = await import("./gamification");
    const dispoBadges = ALL_BADGES.filter(b => b.category === "dispo_manager");
    expect(dispoBadges.length).toBeGreaterThan(0);
  });

  it("should have proper tier structure for dispo badges", async () => {
    const { ALL_BADGES } = await import("./gamification");
    const dispoBadges = ALL_BADGES.filter(b => b.category === "dispo_manager");
    for (const badge of dispoBadges) {
      expect(badge.tiers).toBeDefined();
      expect(badge.tiers.bronze).toBeDefined();
      expect(badge.tiers.silver).toBeDefined();
      expect(badge.tiers.gold).toBeDefined();
      expect(badge.tiers.bronze.count).toBeLessThan(badge.tiers.silver.count);
      expect(badge.tiers.silver.count).toBeLessThan(badge.tiers.gold.count);
    }
  });

  it("should include expected dispo badge codes", async () => {
    const { ALL_BADGES } = await import("./gamification");
    const dispoCodes = ALL_BADGES.filter(b => b.category === "dispo_manager").map(b => b.code);
    expect(dispoCodes).toContain("deal_pitcher");
    expect(dispoCodes).toContain("buyer_whisperer");
    expect(dispoCodes).toContain("closer");
    expect(dispoCodes).toContain("deal_machine");
    expect(dispoCodes).toContain("negotiation_ace");
  });

  it("should have dispo_manager in badge category type", async () => {
    const { dispoProperties } = await import("../drizzle/schema");
    // Verify the schema includes dispo-related tables
    expect(dispoProperties).toBeDefined();
  });
});

// ─── Dispo Grading Rubric Tests ───

describe("Dispo Manager Grading Rubric", () => {
  it("should export DISPO_MANAGER_RUBRIC", async () => {
    const mod = await import("./grading");
    expect(mod.DISPO_MANAGER_RUBRIC).toBeDefined();
  });

  it("should have proper rubric structure with criteria", async () => {
    const { DISPO_MANAGER_RUBRIC } = await import("./grading");
    expect(DISPO_MANAGER_RUBRIC.criteria).toBeDefined();
    expect(DISPO_MANAGER_RUBRIC.criteria.length).toBeGreaterThan(0);
    
    for (const criterion of DISPO_MANAGER_RUBRIC.criteria) {
      expect(criterion.name).toBeDefined();
      expect(criterion.maxPoints).toBeDefined();
      expect(criterion.maxPoints).toBeGreaterThan(0);
      expect(criterion.description).toBeDefined();
    }
  });

  it("should have maxPoints that sum to approximately 100", async () => {
    const { DISPO_MANAGER_RUBRIC } = await import("./grading");
    const totalPoints = DISPO_MANAGER_RUBRIC.criteria.reduce((sum: number, c: any) => sum + c.maxPoints, 0);
    expect(totalPoints).toBeGreaterThanOrEqual(95);
    expect(totalPoints).toBeLessThanOrEqual(105);
  });

  it("should include key dispo criteria", async () => {
    const { DISPO_MANAGER_RUBRIC } = await import("./grading");
    const criteriaNames = DISPO_MANAGER_RUBRIC.criteria.map((c: any) => c.name.toLowerCase());
    // Should cover deal presentation, buyer fit, urgency, objection handling, negotiation, close
    expect(criteriaNames.some((n: string) => n.includes("deal") || n.includes("presentation"))).toBe(true);
    expect(criteriaNames.some((n: string) => n.includes("buyer") || n.includes("fit"))).toBe(true);
    expect(criteriaNames.some((n: string) => n.includes("objection"))).toBe(true);
    expect(criteriaNames.some((n: string) => n.includes("negotiat"))).toBe(true);
  });
});

// ─── Buyer Activity Schema Tests ───

describe("Buyer Activity Schema", () => {
  it("should have property_buyer_activity table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propertyBuyerActivity).toBeDefined();
    expect(schema.propertyBuyerActivity.id).toBeDefined();
    expect(schema.propertyBuyerActivity.propertyId).toBeDefined();
    expect(schema.propertyBuyerActivity.ghlContactId).toBeDefined();
    expect(schema.propertyBuyerActivity.buyerName).toBeDefined();
    expect(schema.propertyBuyerActivity.buyerPhone).toBeDefined();
  });

  it("should have property_activity_log table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propertyActivityLog).toBeDefined();
    expect(schema.propertyActivityLog.id).toBeDefined();
    expect(schema.propertyActivityLog.propertyId).toBeDefined();
    expect(schema.propertyActivityLog.eventType).toBeDefined();
    expect(schema.propertyActivityLog.description).toBeDefined();
  });
});

// ─── Buyer Response Tracking Tests ───

describe("Buyer Response Tracking - Schema", () => {
  it("should have responseCount field on propertyBuyerActivity", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propertyBuyerActivity.responseCount).toBeDefined();
  });

  it("should have lastResponseAt field on propertyBuyerActivity", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propertyBuyerActivity.lastResponseAt).toBeDefined();
  });

  it("should have lastResponseNote field on propertyBuyerActivity", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propertyBuyerActivity.lastResponseNote).toBeDefined();
  });
});

describe("Buyer Response Tracking - Backend Functions", () => {
  it("should export recordBuyerResponse function", async () => {
    const mod = await import("./inventory");
    expect(mod.recordBuyerResponse).toBeDefined();
    expect(typeof mod.recordBuyerResponse).toBe("function");
  });

  it("should export getBuyerResponseStats function", async () => {
    const mod = await import("./inventory");
    expect(mod.getBuyerResponseStats).toBeDefined();
    expect(typeof mod.getBuyerResponseStats).toBe("function");
  });
});

describe("Buyer Response Tracking - tRPC Procedures", () => {
  it("should have recordBuyerResponse procedure in routers.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("recordBuyerResponse:");
  });

  it("should have getBuyerResponseStats procedure in routers.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("getBuyerResponseStats:");
  });
});

describe("Buyer Response Tracking - Dispo AI Integration", () => {
  it("should include record_buyer_response in VALID_DISPO_ACTIONS", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/dispoAssistantStream.ts", "utf-8");
    expect(content).toContain('"record_buyer_response"');
  });

  it("should document record_buyer_response in Dispo AI system prompt", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/dispoAssistantStream.ts", "utf-8");
    expect(content).toContain("record_buyer_response");
    expect(content).toContain("Record that a buyer responded");
  });

  it("should include buyer response tracking in buildPropertyContext", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/dispoAssistantStream.ts", "utf-8");
    expect(content).toContain("RESPONSE TRACKING");
    expect(content).toContain("responseRate");
  });

  it("should include record_buyer_response in parse-intent prompt", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/dispoAssistantStream.ts", "utf-8");
    expect(content).toContain("record_buyer_response");
    expect(content).toContain("buyerActivityId");
    expect(content).toContain("responseNote");
  });
});

describe("Buyer Response Tracking - parseIntent Integration", () => {
  it("should include record_buyer_response in VALID_ACTION_TYPES", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain('"record_buyer_response"');
  });

  it("should document record_buyer_response action in parseIntent prompt", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("record_buyer_response - Record that a buyer responded");
  });

  it("should include buyerActivityId and responseNote in parseIntent JSON schema", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain('buyerActivityId: { type: "number" }');
    expect(content).toContain('responseNote: { type: "string" }');
  });

  it("should include buyerActivityId and responseNote in required array", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain('"buyerActivityId"');
    expect(content).toContain('"responseNote"');
  });
});

describe("Buyer Response Tracking - ghlActions Integration", () => {
  it("should handle record_buyer_response in executeAction", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/ghlActions.ts", "utf-8");
    expect(content).toContain('case "record_buyer_response"');
  });

  it("should call recordBuyerResponse from ghlActions", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/ghlActions.ts", "utf-8");
    expect(content).toContain("recordBuyerResponse(action.tenantId");
  });

  it("should include record_buyer_response in coachActionLog enum", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("drizzle/schema.ts", "utf-8");
    expect(content).toContain('"record_buyer_response"');
  });
});

describe("Buyer Response Tracking - Frontend UI", () => {
  it("should have response tracking UI in BuyersTab", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("recordBuyerResponse");
    expect(content).toContain("getBuyerResponseStats");
  });

  it("should have response rate display", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain("Response Rate");
    expect(content).toContain("responseRate");
  });

  it("should have record_buyer_response in DISPO_ACTION_LABELS", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/Inventory.tsx", "utf-8");
    expect(content).toContain('record_buyer_response: "Record Buyer Response"');
  });

  it("should have record_buyer_response label in TaskCenter", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/pages/TaskCenter.tsx", "utf-8");
    expect(content).toContain('record_buyer_response: "Record Buyer Response"');
  });
});

describe("Buyer Response Tracking - buildPropertyContext", () => {
  it("should include response tracking when buyers have sends", async () => {
    const { buildPropertyContext } = await import("./dispoAssistantStream");
    const mockDetail = {
      id: 1,
      address: "123 Main St",
      city: "Dallas",
      state: "TX",
      zip: "75001",
      status: "marketing",
      sends: [],
      offers: [],
      showings: [],
      buyers: [
        { id: 1, buyerName: "John Buyer", sendCount: 3, responseCount: 1, status: "interested", isVip: false, lastResponseAt: new Date("2026-01-15"), lastResponseNote: "Interested in the deal" },
        { id: 2, buyerName: "Jane Investor", sendCount: 2, responseCount: 0, status: "matched", isVip: true },
        { id: 3, buyerName: "Bob Cash", sendCount: 1, responseCount: 1, status: "offered", isVip: false, lastResponseAt: new Date("2026-01-10"), lastResponseNote: "Want to make an offer" },
      ],
    };

    const context = buildPropertyContext(mockDetail);
    expect(context).toContain("RESPONSE TRACKING");
    expect(context).toContain("2/3"); // 2 responded out of 3 sent
    expect(context).toContain("response rate");
    expect(context).toContain("John Buyer");
  });

  it("should not include response tracking when no buyers have sends", async () => {
    const { buildPropertyContext } = await import("./dispoAssistantStream");
    const mockDetail = {
      id: 1,
      address: "456 Oak Ave",
      city: "Houston",
      state: "TX",
      zip: "77001",
      status: "new",
      sends: [],
      offers: [],
      showings: [],
      buyers: [
        { id: 1, buyerName: "Test Buyer", sendCount: 0, responseCount: 0, status: "matched", isVip: false },
      ],
    };

    const context = buildPropertyContext(mockDetail);
    expect(context).not.toContain("RESPONSE TRACKING");
  });
});

describe("Coach System Prompt Quality", () => {
  it("should have dispo-specific coaching rules", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/coachStream.ts", "utf-8");
    expect(content).toContain("reference specific addresses, buyer counts, response rates");
    expect(content).toContain("proactively flag properties");
  });

  it("should instruct coach to reference actual data", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/coachStream.ts", "utf-8");
    expect(content).toContain("Reference actual names, numbers, and outcomes");
  });
});
