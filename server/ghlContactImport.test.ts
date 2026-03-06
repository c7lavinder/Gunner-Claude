import { describe, it, expect } from "vitest";
import {
  normalizeSource,
} from "./ghlContactImport";
import * as fs from "fs";
import * as path from "path";

// Read source files for structural assertions
const importSource = fs.readFileSync(path.join(__dirname, "ghlContactImport.ts"), "utf-8");
const webhookSource = fs.readFileSync(path.join(__dirname, "webhook.ts"), "utf-8");

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

// ============ STAGE MAPPING (Sales Process Pipeline) ============

describe("Stage mapping — Sales Process Pipeline", () => {
  it("maps New Lead / Warm Leads / Hot Leads to 'lead'", () => {
    // These are the CREATION stages
    expect(importSource).toContain('"new lead": "lead"');
    expect(importSource).toContain('"warm lead": "lead"');
    expect(importSource).toContain('"warm leads": "lead"');
    expect(importSource).toContain('"hot lead": "lead"');
    expect(importSource).toContain('"hot leads": "lead"');
  });

  it("maps appointment stages to 'apt_set'", () => {
    expect(importSource).toContain('"pending apt": "apt_set"');
    expect(importSource).toContain('"walkthrough apt scheduled": "apt_set"');
    expect(importSource).toContain('"offer apt scheduled": "apt_set"');
  });

  it("maps Made Offer to 'offer_made'", () => {
    expect(importSource).toContain('"made offer": "offer_made"');
  });

  it("maps Under Contract to 'under_contract'", () => {
    expect(importSource).toContain('"under contract": "under_contract"');
  });

  it("maps Purchased to 'closed' (not under_contract)", () => {
    expect(importSource).toContain('"purchased": "closed"');
  });

  it("maps follow-up stages to 'follow_up'", () => {
    expect(importSource).toContain('"1 month follow up": "follow_up"');
    expect(importSource).toContain('"4 month follow up": "follow_up"');
    expect(importSource).toContain('"1 year follow up": "follow_up"');
    expect(importSource).toContain('"ghosted lead": "follow_up"');
  });

  it("maps dead stages to 'dead'", () => {
    expect(importSource).toContain('"agreement not closed": "dead"');
    expect(importSource).toContain('"sold": "dead"');
    expect(importSource).toContain('"do not want": "dead"');
  });
});

// ============ STAGE MAPPING (Dispo Pipeline) ============

describe("Stage mapping — Dispo Pipeline", () => {
  it("maps marketing stages correctly", () => {
    expect(importSource).toContain('"new deal": "marketing"');
    expect(importSource).toContain('"clear to send out": "marketing"');
    expect(importSource).toContain('"sent to buyers": "marketing"');
  });

  it("maps <1 Day — Need to Terminate to 'marketing' by default", () => {
    expect(importSource).toContain('"<1 day');
    expect(importSource).toContain('need to terminate": "marketing"');
  });

  it("maps buyer negotiating stages correctly", () => {
    expect(importSource).toContain('"offers received": "buyer_negotiating"');
    expect(importSource).toContain('"with jv partner": "buyer_negotiating"');
  });

  it("maps closing stages correctly", () => {
    expect(importSource).toContain('"uc w/ buyer": "closing"');
    expect(importSource).toContain('"working w/ title": "closing"');
  });

  it("maps Closed to 'closed'", () => {
    expect(importSource).toContain('"closed": "closed"');
  });
});

// ============ CREATION FILTER ============

describe("Creation filter — only New Lead / Warm / Hot create properties", () => {
  it("defines CREATION_STAGES set with only lead entry stages", () => {
    expect(importSource).toContain("CREATION_STAGES");
    expect(importSource).toMatch(/CREATION_STAGES.*new Set/s);
  });

  it("only creates properties from creation stages (not dispo)", () => {
    // The creation logic must check isCreationStage AND !isDispo
    expect(importSource).toContain("isCreationStage(opp.stageName) && !opp.isDispo");
  });

  it("skips non-creation stages when no existing property exists", () => {
    // Non-creation stages without an existing property should be skipped
    expect(importSource).toContain("Not a creation stage OR is Dispo pipeline");
  });
});

// ============ SOURCE FROM OPPORTUNITY ============

describe("Source from opportunity (not tags)", () => {
  it("pulls source from opp.source, not contact tags", () => {
    // The import should use opp.source, not parseContactTags
    expect(importSource).toContain("opp.source");
    expect(importSource).not.toContain("parseContactTags(contact.tags)");
    expect(importSource).not.toContain("tagData.source");
  });

  it("does not export tag parsing functions (no longer needed)", () => {
    // parseContactTags and extractTagValue should not be exported
    expect(importSource).not.toContain("export function parseContactTags");
    expect(importSource).not.toContain("export function extractTagValue");
  });

  it("normalizes opportunity source through normalizeSource", () => {
    expect(importSource).toContain("normalizeSource(opp.source)");
  });
});

// ============ BOTH PIPELINES ============

describe("Multi-pipeline scanning", () => {
  it("scans both Sales Process and Dispo pipelines", () => {
    expect(importSource).toContain("sales process");
    expect(importSource).toContain("dispo");
    expect(importSource).toContain("pipelinesToScan");
  });

  it("tracks isDispo flag per pipeline", () => {
    expect(importSource).toContain("isDispo");
  });
});

// ============ WEBHOOK STAGE MAPPING CONSISTENCY ============

describe("Webhook stage mapping matches import mapping", () => {
  it("webhook has all Sales Process stages", () => {
    expect(webhookSource).toContain('"pending apt": "apt_set"');
    expect(webhookSource).toContain('"walkthrough apt scheduled": "apt_set"');
    expect(webhookSource).toContain('"offer apt scheduled": "apt_set"');
    expect(webhookSource).toContain('"made offer": "offer_made"');
    expect(webhookSource).toContain('"purchased": "closed"');
    expect(webhookSource).toContain('"1 month follow up": "follow_up"');
    expect(webhookSource).toContain('"4 month follow up": "follow_up"');
    expect(webhookSource).toContain('"1 year follow up": "follow_up"');
    expect(webhookSource).toContain('"ghosted lead": "follow_up"');
    expect(webhookSource).toContain('"agreement not closed": "dead"');
    expect(webhookSource).toContain('"sold": "dead"');
    expect(webhookSource).toContain('"do not want": "dead"');
  });

  it("webhook has all Dispo Pipeline stages", () => {
    expect(webhookSource).toContain('"new deal": "marketing"');
    expect(webhookSource).toContain('"clear to send out": "marketing"');
    expect(webhookSource).toContain('"sent to buyers": "marketing"');
    expect(webhookSource).toContain('"offers received": "buyer_negotiating"');
    expect(webhookSource).toContain('"with jv partner": "buyer_negotiating"');
    expect(webhookSource).toContain('"uc w/ buyer": "closing"');
    expect(webhookSource).toContain('"working w/ title": "closing"');
  });

  it("webhook maps Warm/Hot leads to 'lead' (not apt_set)", () => {
    expect(webhookSource).toContain('"warm lead": "lead"');
    expect(webhookSource).toContain('"warm leads": "lead"');
    expect(webhookSource).toContain('"hot lead": "lead"');
    expect(webhookSource).toContain('"hot leads": "lead"');
  });
});
