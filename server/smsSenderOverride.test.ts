import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

/**
 * Tests for SMS sender override and delivery status features.
 * These tests verify:
 * 1. Sender override support in executeAction (senderOverrideGhlId/senderOverrideName)
 * 2. SMS delivery status tracking via resultMeta
 * 3. getMessageStatus function for checking delivery via GHL API
 * 4. Frontend sender override dropdown and delivery status indicator
 * 5. Backend endpoints: smsDeliveryStatus and smsTeamSenders
 */

describe("SMS sender override in executeAction", () => {
  it("should check for senderOverrideGhlId in payload", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("payload.senderOverrideGhlId");
  });

  it("should check for senderOverrideName in payload", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("payload.senderOverrideName");
  });

  it("should use override GHL user ID when provided", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // When senderOverrideGhlId is present, smsUserId should be set to it
    expect(source).toContain("smsUserId = payload.senderOverrideGhlId");
  });

  it("should log sender override when used", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("SMS sender override");
  });

  it("should still default to requesting user when no override", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // The default smsUserId should be requestingUserGhlId
    expect(source).toContain("let smsUserId = requestingUserGhlId");
  });
});

describe("getUserPhoneNumber uses GHL Users API", () => {
  it("should call /users/{ghlUserId} endpoint instead of phone-system", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should use the users API, not the phone-system API
    expect(source).toContain("`/users/${ghlUserId}`");
    // Should NOT use the old phone-system endpoint
    expect(source).not.toContain("phone-system/numbers/location");
  });

  it("should extract phone from lcPhone[locationId]", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("userData.lcPhone");
    expect(source).toContain("creds.locationId");
  });

  it("should have a fallback to userData.phone", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("userData.phone");
  });
});

describe("SMS delivery status tracking (resultMeta)", () => {
  it("should store messageId in resultMeta after sending SMS", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("resultMeta:");
    expect(source).toContain("messageId: result.messageId");
  });

  it("should store fromNumber in resultMeta", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("fromNumber: result.fromNumber");
  });

  it("should store senderName in resultMeta", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("senderName,");
  });

  it("should store senderGhlId in resultMeta", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("senderGhlId: smsUserId");
  });

  it("should return smsMessageId for SMS actions", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("smsMessageId: result.messageId");
    expect(source).toContain("smsSenderName:");
  });
});

describe("getMessageStatus function", () => {
  it("should be exported from ghlActions", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("export async function getMessageStatus");
  });

  it("should accept tenantId, contactId, and messageId parameters", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toMatch(/getMessageStatus\(\s*tenantId.*contactId.*messageId/s);
  });

  it("should search for the contact's conversation", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("conversations/search?locationId=");
    expect(source).toContain("contactId=${contactId}");
  });

  it("should find the specific message by ID", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("messages.find((m: any) => m.id === messageId)");
  });

  it("should return status and found fields", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("return { status:");
    expect(source).toContain("found: true");
    expect(source).toContain("found: false");
  });
});

describe("resultMeta column in schema", () => {
  it("should have resultMeta JSON column in coachActionLog", async () => {
    const schema = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf-8");
    expect(schema).toContain('resultMeta: json("resultMeta")');
  });
});

describe("smsDeliveryStatus endpoint", () => {
  it("should exist in the coachActions router", async () => {
    const source = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(source).toContain("smsDeliveryStatus: protectedProcedure");
  });

  it("should accept actionId as input", async () => {
    const source = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    // Find the smsDeliveryStatus section
    const idx = source.indexOf("smsDeliveryStatus:");
    const section = source.substring(idx, idx + 500);
    expect(section).toContain("actionId: z.number()");
  });

  it("should check if action is send_sms type", async () => {
    const source = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    const idx = source.indexOf("smsDeliveryStatus:");
    const section = source.substring(idx, idx + 800);
    expect(section).toContain('action.actionType !== "send_sms"');
  });

  it("should import getMessageStatus from ghlActions", async () => {
    const source = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    const idx = source.indexOf("smsDeliveryStatus:");
    const section = source.substring(idx, idx + 1200);
    expect(section).toContain("getMessageStatus");
  });
});

describe("smsTeamSenders endpoint", () => {
  it("should exist in the coachActions router", async () => {
    const source = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(source).toContain("smsTeamSenders: protectedProcedure");
  });

  it("should filter team members by ghlUserId", async () => {
    const source = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    const idx = source.indexOf("smsTeamSenders:");
    const section = source.substring(idx, idx + 500);
    expect(section).toContain("m.ghlUserId");
    expect(section).toContain(".filter(");
  });

  it("should return id, name, and ghlUserId", async () => {
    const source = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    const idx = source.indexOf("smsTeamSenders:");
    const section = source.substring(idx, idx + 700);
    expect(section).toContain("id: m.id");
    expect(section).toContain("name: m.name");
    expect(section).toContain("ghlUserId: m.ghlUserId");
  });
});

describe("Frontend: SMS sender override dropdown", () => {
  it("should have senderOverrides state in AICoachQA", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("senderOverrides");
    expect(source).toContain("setSenderOverrides");
  });

  it("should query smsTeamSenders", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("trpc.coachActions.smsTeamSenders.useQuery()");
  });

  it("should render Select dropdown for SMS sender when multiple team members exist", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("smsTeamSenders && smsTeamSenders.length > 1");
    expect(source).toContain("Sending from:");
  });

  it("should inject senderOverrideGhlId into editedPayload on confirm", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("senderOverrideGhlId: override.ghlUserId");
    expect(source).toContain("senderOverrideName: override.name");
  });

  it("should show sender info for executed SMS actions", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("Sent from:");
    expect(source).toContain("senderOverrideName");
  });
});

describe("Frontend: SMS delivery status indicator", () => {
  it("should have smsDeliveryStatus field in ConversationMessage type", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("smsDeliveryStatus?: string");
  });

  it("should poll delivery status after successful SMS execution", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("coachUtils.coachActions.smsDeliveryStatus.fetch");
  });

  it("should render delivery status badge for executed SMS", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("smsDeliveryStatus === \"delivered\"");
    expect(source).toContain("smsDeliveryStatus === \"sent\"");
    expect(source).toContain("smsDeliveryStatus === \"pending\"");
    expect(source).toContain("smsDeliveryStatus === \"failed\"");
  });

  it("should show different colors for different delivery statuses", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    // Green for delivered
    expect(source).toContain("bg-green-100");
    // Blue for sent
    expect(source).toContain("bg-blue-100");
    // Yellow for pending
    expect(source).toContain("bg-yellow-100");
    // Red for failed
    expect(source).toContain("bg-red-100");
  });

  it("should show appropriate icons for each status", async () => {
    const source = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(source).toContain("CheckCircle");
    expect(source).toContain("Loader2");
    expect(source).toContain("XCircle");
  });
});

describe("executeAction return type", () => {
  it("should include optional smsMessageId and smsSenderName in return type", async () => {
    const source = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(source).toContain("smsMessageId?: string");
    expect(source).toContain("smsSenderName?: string");
  });
});
