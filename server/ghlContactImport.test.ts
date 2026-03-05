import { describe, it, expect } from "vitest";
import {
  normalizeSource,
  extractTagValue,
  parseContactTags,
} from "./ghlContactImport";

// ============ SOURCE NORMALIZATION ============

describe("normalizeSource", () => {
  it("normalizes PropertyLeads variants", () => {
    expect(normalizeSource("propertyleads")).toBe("PropertyLeads");
    expect(normalizeSource("Property Leads")).toBe("PropertyLeads");
    expect(normalizeSource("property leads")).toBe("PropertyLeads");
  });

  it("normalizes MotivatedSellers variants", () => {
    expect(normalizeSource("motivated sellers")).toBe("MotivatedSellers");
    expect(normalizeSource("motivated")).toBe("MotivatedSellers");
  });

  it("normalizes BatchDialer variants", () => {
    expect(normalizeSource("batchdialer")).toBe("BatchDialer");
    expect(normalizeSource("Batch Dialer")).toBe("BatchDialer");
    expect(normalizeSource("batch")).toBe("BatchDialer");
    expect(normalizeSource("cold call")).toBe("BatchDialer");
    expect(normalizeSource("cold calling")).toBe("BatchDialer");
  });

  it("normalizes BatchLeads variants", () => {
    expect(normalizeSource("batchleads")).toBe("BatchLeads");
    expect(normalizeSource("Batch Leads")).toBe("BatchLeads");
  });

  it("normalizes Web Form variants", () => {
    expect(normalizeSource("web form")).toBe("Web Form");
    expect(normalizeSource("webform")).toBe("Web Form");
    expect(normalizeSource("website")).toBe("Web Form");
    expect(normalizeSource("form")).toBe("Web Form");
    expect(normalizeSource("landing page")).toBe("Web Form");
  });

  it("normalizes Referral variants", () => {
    expect(normalizeSource("referral")).toBe("Referral");
    expect(normalizeSource("referrals")).toBe("Referral");
    expect(normalizeSource("referred")).toBe("Referral");
    expect(normalizeSource("word of mouth")).toBe("Referral");
  });

  it("normalizes Direct Mail variants", () => {
    expect(normalizeSource("direct mail")).toBe("Direct Mail");
    expect(normalizeSource("directmail")).toBe("Direct Mail");
    expect(normalizeSource("mail")).toBe("Direct Mail");
    expect(normalizeSource("mailer")).toBe("Direct Mail");
  });

  it("normalizes Driving for Dollars variants", () => {
    expect(normalizeSource("driving for dollars")).toBe("Driving for Dollars");
    expect(normalizeSource("d4d")).toBe("Driving for Dollars");
    expect(normalizeSource("dfd")).toBe("Driving for Dollars");
  });

  it("normalizes Bandit Signs variants", () => {
    expect(normalizeSource("bandit sign")).toBe("Bandit Signs");
    expect(normalizeSource("bandit signs")).toBe("Bandit Signs");
    expect(normalizeSource("bandit")).toBe("Bandit Signs");
  });

  it("normalizes Social Media variants", () => {
    expect(normalizeSource("facebook")).toBe("Social Media");
    expect(normalizeSource("instagram")).toBe("Social Media");
    expect(normalizeSource("social media")).toBe("Social Media");
    expect(normalizeSource("social")).toBe("Social Media");
  });

  it("returns original value for unknown sources", () => {
    expect(normalizeSource("Custom Source")).toBe("Custom Source");
    expect(normalizeSource("My Special Lead Gen")).toBe("My Special Lead Gen");
  });

  it("returns Unknown for empty input", () => {
    expect(normalizeSource("")).toBe("Unknown");
  });

  it("is case-insensitive", () => {
    expect(normalizeSource("PROPERTYLEADS")).toBe("PropertyLeads");
    expect(normalizeSource("BatchDialer")).toBe("BatchDialer");
    expect(normalizeSource("REFERRAL")).toBe("Referral");
  });
});

// ============ TAG EXTRACTION ============

describe("extractTagValue", () => {
  it("extracts a tagged value by prefix", () => {
    const tags = ["source:PropertyLeads", "market:Nashville", "type:House"];
    expect(extractTagValue(tags, "source")).toBe("PropertyLeads");
    expect(extractTagValue(tags, "market")).toBe("Nashville");
    expect(extractTagValue(tags, "type")).toBe("House");
  });

  it("is case-insensitive for prefix", () => {
    const tags = ["Source:PropertyLeads", "MARKET:Nashville"];
    expect(extractTagValue(tags, "source")).toBe("PropertyLeads");
    expect(extractTagValue(tags, "market")).toBe("Nashville");
  });

  it("returns null when tag not found", () => {
    const tags = ["source:PropertyLeads"];
    expect(extractTagValue(tags, "market")).toBeNull();
    expect(extractTagValue(tags, "type")).toBeNull();
  });

  it("handles empty tags array", () => {
    expect(extractTagValue([], "source")).toBeNull();
  });

  it("handles tags with spaces after colon", () => {
    const tags = ["source: PropertyLeads"];
    expect(extractTagValue(tags, "source")).toBe("PropertyLeads");
  });
});

// ============ FULL TAG PARSING ============

describe("parseContactTags", () => {
  it("parses all classification fields from tags", () => {
    const tags = ["source:BatchDialer", "market:Nashville", "type:House", "status:active"];
    const result = parseContactTags(tags);
    expect(result.source).toBe("BatchDialer");
    expect(result.market).toBe("Nashville");
    expect(result.buyBoxType).toBe("House");
  });

  it("normalizes source values", () => {
    const tags = ["source:cold calling", "market:Atlanta"];
    const result = parseContactTags(tags);
    expect(result.source).toBe("BatchDialer"); // cold calling -> BatchDialer
    expect(result.market).toBe("Atlanta");
  });

  it("returns null for missing fields", () => {
    const tags = ["random-tag", "another-tag"];
    const result = parseContactTags(tags);
    expect(result.source).toBeNull();
    expect(result.market).toBeNull();
    expect(result.buyBoxType).toBeNull();
  });

  it("handles empty tags", () => {
    const result = parseContactTags([]);
    expect(result.source).toBeNull();
    expect(result.market).toBeNull();
    expect(result.buyBoxType).toBeNull();
  });

  it("handles mixed tagged and untagged values", () => {
    const tags = ["VIP", "source:Referral", "hot-lead", "market:Memphis"];
    const result = parseContactTags(tags);
    expect(result.source).toBe("Referral");
    expect(result.market).toBe("Memphis");
    expect(result.buyBoxType).toBeNull();
  });
});
