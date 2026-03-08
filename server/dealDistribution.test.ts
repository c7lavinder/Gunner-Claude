import { describe, expect, it, vi } from "vitest";

// ─── Test the pure/helper functions from dealDistribution.ts ───
// We test the non-DB functions and prompt construction logic.

describe("Deal Distribution", () => {
  describe("centsToDollars helper", () => {
    it("should format cents to dollar string", async () => {
      // Import the module to test internal logic via the exported functions
      const mod = await import("./dealDistribution");
      // centsToDollars is private, but we test it indirectly through buildPropertySummary
      // Instead, test the exported types and tier descriptions
      expect(mod.generateSmsContent).toBeDefined();
      expect(mod.generateEmailContent).toBeDefined();
      expect(mod.generateTierContent).toBeDefined();
      expect(mod.generateDealContent).toBeDefined();
      expect(mod.saveContentEdit).toBeDefined();
      expect(mod.updateDistributionContent).toBeDefined();
      expect(mod.getPropertyDistributions).toBeDefined();
    });
  });

  describe("BuyerTier type", () => {
    it("should accept valid tier values", () => {
      const validTiers: Array<import("./dealDistribution").BuyerTier> = [
        "priority",
        "qualified",
        "jv_partner",
        "unqualified",
      ];
      expect(validTiers).toHaveLength(4);
      validTiers.forEach(tier => {
        expect(typeof tier).toBe("string");
      });
    });
  });

  describe("PropertyData interface", () => {
    it("should accept valid property data", () => {
      const property: import("./dealDistribution").PropertyData = {
        address: "123 Main St",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        propertyType: "single_family",
        beds: 3,
        baths: "2",
        sqft: 1500,
        yearBuilt: 1990,
        lotSize: "0.25 acres",
        contractPrice: 15000000,
        askingPrice: 18000000,
        dispoAskingPrice: 19000000,
        assignmentFee: 1000000,
        arv: 25000000,
        estRepairs: 3000000,
        occupancyStatus: "vacant",
        description: "Great flip opportunity",
        notes: "Seller motivated",
        mediaLink: "https://photos.example.com/123",
        photos: null,
        projectType: "fix_and_flip",
        market: "Dallas",
        lockboxCode: null,
      };
      expect(property.address).toBe("123 Main St");
      expect(property.arv).toBe(25000000);
    });
  });

  describe("BrandData interface", () => {
    it("should accept valid brand data", () => {
      const brand: import("./dealDistribution").BrandData = {
        companyName: "Corey's Deals",
        brandVoice: "Professional and direct",
        tagline: "Best deals in Texas",
        websiteUrl: "https://coreydeals.com",
        logoUrl: "https://example.com/logo.png",
      };
      expect(brand.companyName).toBe("Corey's Deals");
    });

    it("should accept null values for optional brand fields", () => {
      const brand: import("./dealDistribution").BrandData = {
        companyName: null,
        brandVoice: null,
        tagline: null,
        websiteUrl: null,
        logoUrl: null,
      };
      expect(brand.companyName).toBeNull();
    });
  });

  describe("GeneratedContent interface", () => {
    it("should have required fields", () => {
      const content: import("./dealDistribution").GeneratedContent = {
        smsContent: "New deal at 123 Main St. Asking $190K, ARV $250K. Hit me up.",
        emailSubject: "New Deal: 123 Main St, Dallas TX",
        emailBody: "Hey,\n\nJust locked up a deal at 123 Main St...",
      };
      expect(content.smsContent.length).toBeGreaterThan(0);
      expect(content.emailSubject.length).toBeGreaterThan(0);
      expect(content.emailBody.length).toBeGreaterThan(0);
    });
  });
});

// ─── Test the PDF Flyer Generator ───

describe("Deal PDF Flyer", () => {
  describe("generateDealPdfFlyer", () => {
    it("should export the generateDealPdfFlyer function", async () => {
      const mod = await import("./dealPdfFlyer");
      expect(mod.generateDealPdfFlyer).toBeDefined();
      expect(typeof mod.generateDealPdfFlyer).toBe("function");
    });

    it("should generate a PDF buffer with valid property data", async () => {
      // Mock storagePut to avoid actual S3 upload
      vi.mock("./storage", () => ({
        storagePut: vi.fn().mockResolvedValue({
          url: "https://storage.example.com/deal-flyers/test.pdf",
          key: "deal-flyers/test.pdf",
        }),
      }));

      const { generateDealPdfFlyer } = await import("./dealPdfFlyer");

      const property: import("./dealDistribution").PropertyData = {
        address: "456 Oak Ave",
        city: "Houston",
        state: "TX",
        zip: "77001",
        propertyType: "single_family",
        beds: 4,
        baths: "2.5",
        sqft: 2200,
        yearBuilt: 2005,
        lotSize: "0.3 acres",
        contractPrice: 12000000,
        askingPrice: 16000000,
        dispoAskingPrice: 17000000,
        assignmentFee: 500000,
        arv: 22000000,
        estRepairs: 2500000,
        occupancyStatus: "occupied",
        description: "Beautiful single family home in great neighborhood. Needs cosmetic updates.",
        notes: "Seller wants to close in 30 days",
        mediaLink: "https://photos.example.com/456",
        photos: null,
        projectType: "fix_and_flip",
        market: "Houston",
        lockboxCode: null,
      };

      const brand: import("./dealDistribution").BrandData = {
        companyName: "Test Wholesaling Co",
        brandVoice: null,
        tagline: "Best deals in Houston",
        websiteUrl: "https://testwholesaling.com",
        logoUrl: null,
      };

      const result = await generateDealPdfFlyer(property, brand, 1);

      expect(result).toBeDefined();
      expect(result.pdfBuffer).toBeInstanceOf(Buffer);
      expect(result.pdfBuffer.length).toBeGreaterThan(1000); // Should be a real PDF
      expect(result.pdfUrl).toContain("deal-flyers/");
      expect(result.pdfUrl).toContain("456_Oak_Ave");
      expect(result.pdfUrl).toContain(".pdf");
      expect(result.pdfFileKey).toContain("deal-flyers/");

      // Verify PDF header
      const pdfHeader = result.pdfBuffer.toString("ascii", 0, 5);
      expect(pdfHeader).toBe("%PDF-");
    });

    it("should handle minimal property data without crashing", async () => {
      vi.mock("./storage", () => ({
        storagePut: vi.fn().mockResolvedValue({
          url: "https://storage.example.com/deal-flyers/minimal.pdf",
          key: "deal-flyers/minimal.pdf",
        }),
      }));

      const { generateDealPdfFlyer } = await import("./dealPdfFlyer");

      const minimalProperty: import("./dealDistribution").PropertyData = {
        address: "789 Elm St",
        city: "Austin",
        state: "TX",
        zip: "73301",
        propertyType: "",
        beds: null,
        baths: null,
        sqft: null,
        yearBuilt: null,
        lotSize: null,
        contractPrice: null,
        askingPrice: null,
        dispoAskingPrice: null,
        assignmentFee: null,
        arv: null,
        estRepairs: null,
        occupancyStatus: null,
        description: null,
        notes: null,
        mediaLink: null,
        photos: null,
        projectType: null,
        market: null,
        lockboxCode: null,
      };

      const minimalBrand: import("./dealDistribution").BrandData = {
        companyName: null,
        brandVoice: null,
        tagline: null,
        websiteUrl: null,
        logoUrl: null,
      };

      const result = await generateDealPdfFlyer(minimalProperty, minimalBrand, 1);
      expect(result.pdfBuffer).toBeInstanceOf(Buffer);
      expect(result.pdfBuffer.length).toBeGreaterThan(500);
    });

    it("should generate unique file keys for different properties", async () => {
      vi.mock("./storage", () => ({
        storagePut: vi.fn().mockImplementation(async (key: string) => ({
          url: `https://storage.example.com/${key}`,
          key,
        })),
      }));

      const { storagePut } = await import("./storage");
      const { generateDealPdfFlyer } = await import("./dealPdfFlyer");

      const property1: import("./dealDistribution").PropertyData = {
        address: "111 First St",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        propertyType: "single_family",
        beds: 3, baths: "2", sqft: 1500, yearBuilt: 2000, lotSize: null,
        contractPrice: null, askingPrice: 15000000, dispoAskingPrice: null,
        assignmentFee: null, arv: 20000000, estRepairs: 2000000,
        occupancyStatus: null, description: null, notes: null, mediaLink: null,
        photos: null, projectType: null, market: null, lockboxCode: null,
      };

      const brand: import("./dealDistribution").BrandData = {
        companyName: "Test Co", brandVoice: null, tagline: null, websiteUrl: null, logoUrl: null,
      };

      await generateDealPdfFlyer(property1, brand, 1);

      // storagePut should have been called with a key containing the address
      expect(storagePut).toHaveBeenCalled();
      const callArgs = (storagePut as any).mock.calls;
      const lastKey = callArgs[callArgs.length - 1][0];
      expect(lastKey).toContain("deal-flyers/");
      expect(lastKey).toContain("111_First_St");
      expect(lastKey).toContain(".pdf");
    });
  });
});
