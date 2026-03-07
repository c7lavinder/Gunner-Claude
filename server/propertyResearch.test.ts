import { describe, it, expect, vi } from "vitest";
import { buildPropertyContext } from "./dispoAssistantStream";

describe("Property Research", () => {
  describe("buildPropertyContext", () => {
    it("includes property research data when available", () => {
      const detail = {
        address: "123 Main St",
        city: "Nashville",
        state: "TN",
        zip: "37201",
        status: "marketing",
        askingPrice: 15000000, // $150,000 in cents
        daysOnMarket: 14,
        propertyResearch: {
          zestimate: 180000,
          taxAssessment: 160000,
          taxAmount: 2400,
          ownerName: "John Smith",
          deedDate: "2020-05-15",
          legalDescription: "Lot 5, Block 3, Maple Estates",
          recentComps: [
            { address: "125 Main St", soldPrice: 175000, soldDate: "2025-11-01", sqft: 1800, beds: 3, baths: 2 },
          ],
          priceHistory: [
            { date: "2020-05-15", price: 140000, event: "Sold" },
          ],
          neighborhoodInfo: "Quiet residential area near downtown Nashville",
          streetViewUrl: "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.16,-86.78",
          zillowUrl: "https://www.zillow.com/homes/123-main-st-nashville-tn_rb/",
          additionalNotes: "Good investment area with rising values",
        },
      };

      const context = buildPropertyContext(detail);

      // Should include research section
      expect(context).toContain("PROPERTY RESEARCH");
      expect(context).toContain("Zestimate: $180,000");
      expect(context).toContain("Tax Assessment: $160,000");
      expect(context).toContain("Annual Tax: $2,400");
      expect(context).toContain("Owner (public records): John Smith");
      expect(context).toContain("Deed Date: 2020-05-15");
      expect(context).toContain("Legal Description: Lot 5, Block 3, Maple Estates");
      expect(context).toContain("COMPS");
      expect(context).toContain("125 Main St");
      expect(context).toContain("$175,000");
      expect(context).toContain("PRICE HISTORY");
      expect(context).toContain("Sold");
      expect(context).toContain("Neighborhood");
      expect(context).toContain("Quiet residential area");
      expect(context).toContain("Zillow:");
      expect(context).toContain("Street View:");
    });

    it("handles missing property research gracefully", () => {
      const detail = {
        address: "456 Oak Ave",
        city: "Memphis",
        state: "TN",
        zip: "38101",
        status: "lead",
        daysOnMarket: 0,
      };

      const context = buildPropertyContext(detail);

      // Should NOT include research section
      expect(context).not.toContain("PROPERTY RESEARCH");
      // Should still have basic property info
      expect(context).toContain("456 Oak Ave");
      expect(context).toContain("Memphis");
    });

    it("handles partial research data", () => {
      const detail = {
        address: "789 Elm St",
        city: "Chattanooga",
        state: "TN",
        zip: "37401",
        status: "marketing",
        daysOnMarket: 5,
        propertyResearch: {
          zestimate: 120000,
          // No tax, no comps, no owner
          neighborhoodInfo: "Growing area",
        },
      };

      const context = buildPropertyContext(detail);

      expect(context).toContain("PROPERTY RESEARCH");
      expect(context).toContain("Zestimate: $120,000");
      expect(context).toContain("Growing area");
      // Should NOT include sections with no data
      expect(context).not.toContain("Tax Assessment");
      expect(context).not.toContain("COMPS");
    });

    it("returns fallback for null detail", () => {
      const context = buildPropertyContext(null);
      expect(context).toBe("No property selected.");
    });
  });
});

describe("Buyer Matching Enhancements", () => {
  it("should have buyerTier, responseSpeed, verifiedFunding, hasPurchasedBefore in contact_cache schema", async () => {
    // Verify the schema has the new columns
    const schema = await import("../drizzle/schema");
    const columns = Object.keys(schema.contactCache);
    
    // These columns should exist in the schema definition
    expect(columns).toContain("buyerTier");
    expect(columns).toContain("responseSpeed");
    expect(columns).toContain("verifiedFunding");
    expect(columns).toContain("hasPurchasedBefore");
    expect(columns).toContain("secondaryMarket");
  });

  it("should have propertyResearch in dispoProperties schema", async () => {
    const schema = await import("../drizzle/schema");
    const columns = Object.keys(schema.dispoProperties);
    
    expect(columns).toContain("propertyResearch");
    expect(columns).toContain("researchUpdatedAt");
  });
});
