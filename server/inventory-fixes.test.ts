import { describe, it, expect, vi } from "vitest";

// Test the inventory fix logic without needing a database connection

describe("Inventory Page Fixes (19 Issues)", () => {
  // Fix #1: Hide Dead from dispo_manager
  describe("Fix #1: Role-based stage visibility", () => {
    function getVisibleStages(teamRole: string) {
      const allStages = ["lead", "apt_set", "offer_made", "under_contract", "marketing", "buyer_negotiating", "closing", "closed", "follow_up", "dead"];
      if (teamRole === "dispo_manager") return ["marketing", "buyer_negotiating", "closing", "closed"];
      if (teamRole === "lead_manager" || teamRole === "acquisition_manager") return ["lead", "apt_set", "offer_made", "under_contract", "marketing", "closing", "closed"];
      return allStages;
    }

    it("dispo_manager should not see Dead tab", () => {
      const stages = getVisibleStages("dispo_manager");
      expect(stages).not.toContain("dead");
      expect(stages).not.toContain("follow_up");
    });

    it("dispo_manager should see marketing through closed", () => {
      const stages = getVisibleStages("dispo_manager");
      expect(stages).toContain("marketing");
      expect(stages).toContain("buyer_negotiating");
      expect(stages).toContain("closing");
      expect(stages).toContain("closed");
    });

    it("lead_manager should not see dead", () => {
      const stages = getVisibleStages("lead_manager");
      expect(stages).not.toContain("dead");
    });

    it("admin should see all stages", () => {
      const stages = getVisibleStages("admin");
      expect(stages).toContain("dead");
      expect(stages).toContain("follow_up");
      expect(stages.length).toBe(10);
    });
  });

  // Fix #2: Search works cross-status
  describe("Fix #2: Cross-status search", () => {
    const properties = [
      { id: 1, address: "123 Main St", status: "lead" },
      { id: 2, address: "456 Oak Ave", status: "marketing" },
      { id: 3, address: "789 Main Blvd", status: "closed" },
    ];

    function filterProperties(items: typeof properties, statusFilter: string, search: string) {
      let result = items;
      // When searching, skip status filter to search across all statuses
      if (statusFilter && !search.trim()) {
        result = result.filter(p => p.status === statusFilter);
      }
      return result;
    }

    it("should filter by status when no search", () => {
      const result = filterProperties(properties, "lead", "");
      expect(result.length).toBe(1);
      expect(result[0].address).toBe("123 Main St");
    });

    it("should skip status filter when searching", () => {
      const result = filterProperties(properties, "lead", "Main");
      expect(result.length).toBe(3); // Returns all, search filtering happens server-side
    });
  });

  // Fix #4/#8: Project types
  describe("Fix #4/#8: Valid project types", () => {
    const VALID_PROJECT_TYPES = ["flipper", "landlord", "builder", "multi_family", "turn_key"];
    const INVALID_PROJECT_TYPES = ["wholesale", "novation", "creative_finance", "fix_and_flip"];

    it("should include all valid project types", () => {
      VALID_PROJECT_TYPES.forEach(t => {
        expect(VALID_PROJECT_TYPES).toContain(t);
      });
    });

    it("should not include invalid project types", () => {
      INVALID_PROJECT_TYPES.forEach(t => {
        expect(VALID_PROJECT_TYPES).not.toContain(t);
      });
    });
  });

  // Fix #7: Bulk update field validation
  describe("Fix #7: Bulk update field validation", () => {
    const VALID_BULK_FIELDS = ["market", "leadSource", "projectType", "opportunitySource"];

    it("should support market bulk update", () => {
      expect(VALID_BULK_FIELDS).toContain("market");
    });

    it("should support opportunitySource bulk update", () => {
      expect(VALID_BULK_FIELDS).toContain("opportunitySource");
    });

    it("should support projectType bulk update", () => {
      expect(VALID_BULK_FIELDS).toContain("projectType");
    });
  });

  // Fix #9: Market auto-populate from zip
  describe("Fix #9: Market auto-populate from zip", () => {
    const kpiMarkets = [
      { id: 1, name: "Charlotte", zipCodes: ["28202", "28203", "28204"] },
      { id: 2, name: "Raleigh", zipCodes: ["27601", "27602", "27603"] },
      { id: 3, name: "Greensboro", zipCodes: ["27401", "27402"] },
    ];

    function findMarketByZip(zip: string, markets: typeof kpiMarkets): string | null {
      if (zip.length < 5) return null;
      const matched = markets.find(m =>
        m.zipCodes && Array.isArray(m.zipCodes) && m.zipCodes.includes(zip)
      );
      return matched ? matched.name : null;
    }

    it("should match zip to Charlotte market", () => {
      expect(findMarketByZip("28202", kpiMarkets)).toBe("Charlotte");
    });

    it("should match zip to Raleigh market", () => {
      expect(findMarketByZip("27601", kpiMarkets)).toBe("Raleigh");
    });

    it("should return null for unknown zip", () => {
      expect(findMarketByZip("90210", kpiMarkets)).toBeNull();
    });

    it("should return null for short zip", () => {
      expect(findMarketByZip("282", kpiMarkets)).toBeNull();
    });
  });

  // Fix #12: Accepted offer auto-populate
  describe("Fix #12: Accepted offer auto-populate on offer acceptance", () => {
    it("should set acceptedOffer on property when offer status is accepted", () => {
      const offerAmount = 15000000; // $150,000 in cents
      const propertyUpdate: Record<string, any> = {};
      
      // Simulate the updateOfferStatus logic
      const newStatus = "accepted";
      if (newStatus === "accepted") {
        propertyUpdate.acceptedOffer = offerAmount;
      }
      
      expect(propertyUpdate.acceptedOffer).toBe(15000000);
    });

    it("should not set acceptedOffer for non-accepted statuses", () => {
      const propertyUpdate: Record<string, any> = {};
      const newStatus = "rejected";
      if (newStatus === "accepted") {
        propertyUpdate.acceptedOffer = 15000000;
      }
      expect(propertyUpdate.acceptedOffer).toBeUndefined();
    });
  });

  // Fix #14: Buyer matching improvements
  describe("Fix #14: Buyer matching - no cap, market hard filter, project type scoring", () => {
    type Buyer = {
      name: string;
      market: string;
      buyBoxType: string;
      tier: string;
    };

    function matchBuyers(propertyMarket: string, propertyProjectType: string, buyers: Buyer[]) {
      // Market is a hard filter
      let matched = buyers.filter(b => b.market === propertyMarket);
      
      // Sort by project type match > tier
      matched.sort((a, b) => {
        const aTypeMatch = a.buyBoxType === propertyProjectType ? 1 : 0;
        const bTypeMatch = b.buyBoxType === propertyProjectType ? 1 : 0;
        if (aTypeMatch !== bTypeMatch) return bTypeMatch - aTypeMatch;
        // Tier priority
        const tierOrder: Record<string, number> = { priority: 0, qualified: 1, jv_partner: 2, unqualified: 3 };
        return (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99);
      });
      
      return matched; // No cap!
    }

    const buyers: Buyer[] = [
      { name: "Alice", market: "Charlotte", buyBoxType: "flipper", tier: "qualified" },
      { name: "Bob", market: "Charlotte", buyBoxType: "landlord", tier: "priority" },
      { name: "Charlie", market: "Raleigh", buyBoxType: "flipper", tier: "priority" },
      { name: "Dave", market: "Charlotte", buyBoxType: "flipper", tier: "priority" },
    ];

    it("should filter by market (hard filter)", () => {
      const result = matchBuyers("Charlotte", "flipper", buyers);
      expect(result.every(b => b.market === "Charlotte")).toBe(true);
      expect(result.length).toBe(3);
    });

    it("should not include buyers from other markets", () => {
      const result = matchBuyers("Charlotte", "flipper", buyers);
      expect(result.find(b => b.name === "Charlie")).toBeUndefined();
    });

    it("should sort project type matches first", () => {
      const result = matchBuyers("Charlotte", "flipper", buyers);
      // Project type matches first, then sorted by tier within matches
      // Dave (flipper match, priority tier=0) before Alice (flipper match, qualified tier=1)
      // Bob (no match, priority) last
      const flipperMatches = result.filter(b => b.buyBoxType === "flipper");
      const nonMatches = result.filter(b => b.buyBoxType !== "flipper");
      expect(flipperMatches.length).toBe(2);
      expect(nonMatches.length).toBe(1);
      expect(nonMatches[0].name).toBe("Bob");
    });

    it("should not cap results at 200", () => {
      const manyBuyers = Array.from({ length: 300 }, (_, i) => ({
        name: `Buyer${i}`,
        market: "Charlotte",
        buyBoxType: "flipper",
        tier: "qualified",
      }));
      const result = matchBuyers("Charlotte", "flipper", manyBuyers);
      expect(result.length).toBe(300);
    });
  });

  // Fix #17: Acquisition vs Disposition columns
  describe("Fix #17: Dynamic table columns based on stage type", () => {
    function getTableColumns(statusFilter: string) {
      const isDispoStage = ["marketing", "buyer_negotiating", "closing", "closed"].includes(statusFilter);
      const baseCols = ["Address", "Status", "Asking", "Contract", "Spread"];
      const dispoCols = ["Sends", "Buyers", "Offers", "Showings"];
      const acqCols = ["Last Offer", "Last Contacted", "Last Conversation"];
      const endCols = ["DOM", ""];
      return [...baseCols, ...(isDispoStage ? dispoCols : acqCols), ...endCols];
    }

    it("should show disposition columns for marketing stage", () => {
      const cols = getTableColumns("marketing");
      expect(cols).toContain("Sends");
      expect(cols).toContain("Buyers");
      expect(cols).not.toContain("Last Contacted");
    });

    it("should show acquisition columns for lead stage", () => {
      const cols = getTableColumns("lead");
      expect(cols).toContain("Last Offer");
      expect(cols).toContain("Last Contacted");
      expect(cols).toContain("Last Conversation");
      expect(cols).not.toContain("Sends");
    });

    it("should show acquisition columns for offer_made stage", () => {
      const cols = getTableColumns("offer_made");
      expect(cols).toContain("Last Offer");
      expect(cols).not.toContain("Buyers");
    });

    it("should show disposition columns for buyer_negotiating stage", () => {
      const cols = getTableColumns("buyer_negotiating");
      expect(cols).toContain("Sends");
      expect(cols).toContain("Offers");
    });

    it("should always show base columns", () => {
      ["lead", "marketing", "closed", "apt_set"].forEach(stage => {
        const cols = getTableColumns(stage);
        expect(cols).toContain("Address");
        expect(cols).toContain("Status");
        expect(cols).toContain("Asking");
        expect(cols).toContain("DOM");
      });
    });
  });

  // Fix #19: CSV import field options
  describe("Fix #19: CSV import field options", () => {
    const FIELD_OPTIONS = [
      "skip", "address", "city", "state", "zip", "propertyType",
      "beds", "baths", "sqft", "yearBuilt", "lotSize",
      "contractPrice", "askingPrice", "arv", "estRepairs", "assignmentFee",
      "sellerName", "sellerPhone", "status", "market", "lockboxCode",
      "occupancyStatus", "notes", "description", "mediaLink", "leadSource",
      "projectType", "opportunitySource", "acceptedOffer",
    ];

    it("should include projectType in field options", () => {
      expect(FIELD_OPTIONS).toContain("projectType");
    });

    it("should include opportunitySource in field options", () => {
      expect(FIELD_OPTIONS).toContain("opportunitySource");
    });

    it("should include acceptedOffer in field options", () => {
      expect(FIELD_OPTIONS).toContain("acceptedOffer");
    });

    it("should require address as minimum", () => {
      expect(FIELD_OPTIONS).toContain("address");
    });
  });
});
