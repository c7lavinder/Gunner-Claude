import { db } from "../_core/db";
import { ENV } from "../_core/env";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const GHL_AUTH_BASE = "https://marketplace.leadconnectorhq.com";
const GHL_API_BASE = "https://services.leadconnectorhq.com";

export function getGhlOAuthUrl(tenantId: number, redirectUri: string): string | null {
  if (!ENV.ghlClientId) return null;
  const state = Buffer.from(JSON.stringify({ tenantId })).toString("base64url");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ENV.ghlClientId,
    redirect_uri: redirectUri,
    scope: "contacts.readonly contacts.write opportunities.readonly opportunities.write conversations.readonly conversations/message.write locations.readonly workflows.readonly calendars.readonly calendars/events.write",
    state,
  });
  return `${GHL_AUTH_BASE}/oauth/chooselocation?${params}`;
}

export async function exchangeGhlCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  locationId: string;
  userId: string;
}> {
  const res = await fetch(`${GHL_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.ghlClientId,
      client_secret: ENV.ghlClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL OAuth token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    locationId: string;
    userId: string;
  }>;
}

export async function refreshGhlToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(`${GHL_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.ghlClientId,
      client_secret: ENV.ghlClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

export async function saveGhlTokens(
  tenantId: number,
  locationId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const crmConfig = JSON.stringify({
    locationId,
    accessToken,
    refreshToken,
    tokenExpiresAt: expiresAt,
    oauthConnected: true,
  });
  await db.update(tenants).set({
    crmType: "ghl",
    crmConfig,
    crmConnected: "true",
    updatedAt: new Date(),
  }).where(eq(tenants.id, tenantId));
}

export async function registerGhlWebhooks(
  locationId: string,
  accessToken: string,
  webhookUrl: string
): Promise<void> {
  const events = [
    "CallCompleted",
    "ContactUpdate",
    "OpportunityStageUpdate",
    "AppointmentScheduled",
  ];

  for (const eventType of events) {
    try {
      const res = await fetch(`${GHL_API_BASE}/webhooks/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({
          url: webhookUrl,
          locationId,
          events: [eventType],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[ghl-webhook] Failed to register ${eventType}: ${text}`);
      } else {
        console.log(`[ghl-webhook] Registered ${eventType} for location ${locationId}`);
      }
    } catch (e) {
      console.error(`[ghl-webhook] Error registering ${eventType}:`, e);
    }
  }
}

export async function getGhlSyncHealth(tenantId: number): Promise<{
  connected: boolean;
  oauthActive: boolean;
  tokenExpiry: string | null;
  lastSync: string | null;
  webhooksRegistered: boolean;
}> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant?.crmConfig || tenant.crmType !== "ghl") {
    return { connected: false, oauthActive: false, tokenExpiry: null, lastSync: null, webhooksRegistered: false };
  }

  try {
    const config = JSON.parse(tenant.crmConfig) as Record<string, unknown>;
    const oauthActive = !!config.oauthConnected;
    const tokenExpiry = config.tokenExpiresAt ? String(config.tokenExpiresAt) : null;
    const lastSync = tenant.lastGhlSync?.toISOString() ?? null;
    return {
      connected: tenant.crmConnected === "true",
      oauthActive,
      tokenExpiry,
      lastSync,
      webhooksRegistered: oauthActive,
    };
  } catch {
    return { connected: false, oauthActive: false, tokenExpiry: null, lastSync: null, webhooksRegistered: false };
  }
}
