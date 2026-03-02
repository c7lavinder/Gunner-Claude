/**
 * GHL OAuth 2.0 Token Management Service
 * 
 * Handles the full OAuth lifecycle for GHL Marketplace App integration:
 * - Authorization URL generation for install flow
 * - Authorization code exchange for access/refresh tokens
 * - Automatic token refresh before expiry
 * - Token storage and retrieval per tenant
 * - Backward compatibility with API key model
 * 
 * Token endpoint: https://services.leadconnectorhq.com/oauth/token
 * Access tokens expire after ~24 hours (86399 seconds).
 * Refresh tokens are single-use and valid for 1 year.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { ghlOAuthTokens, tenants } from "../drizzle/schema";
import { parseCrmConfig } from "./tenant";

const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
const GHL_AUTH_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";

// Buffer time before token expiry to trigger refresh (5 minutes)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ============ ENVIRONMENT ============

function getOAuthConfig() {
  const clientId = process.env.GHL_CLIENT_ID;
  const clientSecret = process.env.GHL_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || "";
  
  return { clientId, clientSecret, appUrl };
}

/**
 * Check if GHL OAuth is configured (client ID and secret are set).
 * Returns false if using legacy API key model only.
 */
export function isOAuthConfigured(): boolean {
  const { clientId, clientSecret } = getOAuthConfig();
  return !!(clientId && clientSecret);
}

// ============ AUTHORIZATION URL ============

/**
 * Generate the GHL Marketplace install URL.
 * This URL redirects the user to GHL where they choose a location,
 * then GHL redirects back to our callback with an authorization code.
 */
// All scopes required by Gunner based on GHL API endpoints used across the codebase
const GHL_REQUIRED_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "conversations.readonly",
  "conversations/message.readonly",
  "conversations/message.write",
  "opportunities.readonly",
  "opportunities.write",
  "users.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
  "calendars/events.write",
  "workflows.readonly",
  "locations.readonly",
];

export function getInstallUrl(state?: string): string {
  const { clientId, appUrl } = getOAuthConfig();
  if (!clientId) {
    throw new Error("GHL_CLIENT_ID is not configured");
  }

  // Use /setup/oauth/callback to match the redirect URL registered in GHL Marketplace.
  // The /setup/oauth/callback route redirects to /api/crm/oauth/callback internally.
  const redirectUri = `${appUrl}/setup/oauth/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri,
    client_id: clientId,
    scope: GHL_REQUIRED_SCOPES.join(" "),
  });

  if (state) {
    params.set("state", state);
  }

  return `${GHL_AUTH_URL}?${params.toString()}`;
}

// ============ TOKEN EXCHANGE ============

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  userType: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
}

/**
 * Exchange an authorization code for access and refresh tokens.
 * Called after the user completes the GHL OAuth flow.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, appUrl } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("GHL OAuth credentials not configured (GHL_CLIENT_ID, GHL_CLIENT_SECRET)");
  }

  const redirectUri = `${appUrl}/setup/oauth/callback`;

  const response = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: "Location",
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[GHL OAuth] Token exchange failed:", response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as TokenResponse;
  console.log(`[GHL OAuth] Token exchange successful for location ${data.locationId}`);
  return data;
}

/**
 * Refresh an expired access token using the refresh token.
 * Returns new access + refresh token pair (refresh tokens are single-use).
 */
async function refreshTokenFromGHL(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret, appUrl } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("GHL OAuth credentials not configured");
  }

  const redirectUri = `${appUrl}/setup/oauth/callback`;

  const response = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      user_type: "Location",
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[GHL OAuth] Token refresh failed:", response.status, errorText);
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as TokenResponse;
  console.log(`[GHL OAuth] Token refreshed for location ${data.locationId}`);
  return data;
}

// ============ TOKEN STORAGE ============

/**
 * Store OAuth tokens for a tenant after successful authorization.
 * If tokens already exist for this tenant+location, they are updated.
 */
export async function storeTokens(
  tenantId: number,
  tokenResponse: TokenResponse
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

  // Check if tokens already exist for this tenant
  const [existing] = await db
    .select()
    .from(ghlOAuthTokens)
    .where(
      and(
        eq(ghlOAuthTokens.tenantId, tenantId),
        eq(ghlOAuthTokens.locationId, tokenResponse.locationId || "")
      )
    );

  if (existing) {
    // Update existing tokens
    await db
      .update(ghlOAuthTokens)
      .set({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
        scopes: tokenResponse.scope,
        companyId: tokenResponse.companyId,
        ghlUserId: tokenResponse.userId,
        userType: tokenResponse.userType || "Location",
        isActive: "true",
        lastRefreshedAt: new Date(),
        lastError: null,
      })
      .where(eq(ghlOAuthTokens.id, existing.id));
    
    console.log(`[GHL OAuth] Updated tokens for tenant ${tenantId}, location ${tokenResponse.locationId}`);
  } else {
    // Insert new tokens
    await db.insert(ghlOAuthTokens).values({
      tenantId,
      locationId: tokenResponse.locationId || "",
      companyId: tokenResponse.companyId,
      ghlUserId: tokenResponse.userId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
      scopes: tokenResponse.scope,
      userType: tokenResponse.userType || "Location",
      isActive: "true",
      lastRefreshedAt: new Date(),
    });
    
    console.log(`[GHL OAuth] Stored new tokens for tenant ${tenantId}, location ${tokenResponse.locationId}`);
  }
}

/**
 * Get a valid access token for a tenant.
 * Automatically refreshes the token if it's expired or about to expire.
 * Returns null if no OAuth tokens exist for this tenant.
 */
export async function getValidAccessToken(tenantId: number): Promise<{
  accessToken: string;
  locationId: string;
} | null> {
  const db = await getDb();
  if (!db) return null;

  // Find active tokens for this tenant
  const [tokenRow] = await db
    .select()
    .from(ghlOAuthTokens)
    .where(
      and(
        eq(ghlOAuthTokens.tenantId, tenantId),
        eq(ghlOAuthTokens.isActive, "true")
      )
    );

  if (!tokenRow) return null;

  // Check if token needs refresh (expired or within buffer)
  const now = Date.now();
  const expiresAtMs = tokenRow.expiresAt.getTime();
  
  if (now >= expiresAtMs - TOKEN_REFRESH_BUFFER_MS) {
    // Token is expired or about to expire — refresh it
    try {
      const newTokens = await refreshTokenFromGHL(tokenRow.refreshToken);
      
      // Store the new tokens
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
      await db
        .update(ghlOAuthTokens)
        .set({
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresAt: newExpiresAt,
          scopes: newTokens.scope,
          lastRefreshedAt: new Date(),
          lastError: null,
        })
        .where(eq(ghlOAuthTokens.id, tokenRow.id));

      return {
        accessToken: newTokens.access_token,
        locationId: tokenRow.locationId,
      };
    } catch (error: any) {
      // Record the error but don't deactivate — the refresh token might still work
      console.error(`[GHL OAuth] Token refresh failed for tenant ${tenantId}:`, error.message);
      await db
        .update(ghlOAuthTokens)
        .set({ lastError: error.message })
        .where(eq(ghlOAuthTokens.id, tokenRow.id));

      // If the token hasn't actually expired yet, return it anyway
      if (now < expiresAtMs) {
        return {
          accessToken: tokenRow.accessToken,
          locationId: tokenRow.locationId,
        };
      }

      return null;
    }
  }

  // Token is still valid
  return {
    accessToken: tokenRow.accessToken,
    locationId: tokenRow.locationId,
  };
}

/**
 * Proactively refresh all OAuth tokens that are within 2 hours of expiry.
 * Called at the start of each polling cycle to ensure tokens are fresh.
 * This prevents the scenario where no API calls happen for 24+ hours
 * and the token silently expires.
 */
export async function proactiveRefreshAllTokens(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Find all active tokens
    const activeTokens = await db
      .select()
      .from(ghlOAuthTokens)
      .where(eq(ghlOAuthTokens.isActive, "true"));

    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const now = Date.now();

    for (const tokenRow of activeTokens) {
      const expiresAtMs = tokenRow.expiresAt.getTime();
      const timeUntilExpiry = expiresAtMs - now;

      // Refresh if token expires within 2 hours
      if (timeUntilExpiry <= TWO_HOURS_MS) {
        try {
          console.log(`[GHL OAuth] Proactive refresh for tenant ${tokenRow.tenantId} (expires in ${Math.round(timeUntilExpiry / 60000)}min)`);
          const newTokens = await refreshTokenFromGHL(tokenRow.refreshToken);
          const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

          await db
            .update(ghlOAuthTokens)
            .set({
              accessToken: newTokens.access_token,
              refreshToken: newTokens.refresh_token,
              expiresAt: newExpiresAt,
              scopes: newTokens.scope,
              lastRefreshedAt: new Date(),
              lastError: null,
            })
            .where(eq(ghlOAuthTokens.id, tokenRow.id));

          console.log(`[GHL OAuth] Proactive refresh succeeded for tenant ${tokenRow.tenantId}, new expiry: ${newExpiresAt.toISOString()}`);
        } catch (error: any) {
          console.error(`[GHL OAuth] Proactive refresh FAILED for tenant ${tokenRow.tenantId}:`, error.message);
          await db
            .update(ghlOAuthTokens)
            .set({ lastError: `Proactive refresh failed: ${error.message}` })
            .where(eq(ghlOAuthTokens.id, tokenRow.id));
        }
      }
    }
  } catch (error) {
    console.error(`[GHL OAuth] Error during proactive token refresh:`, error);
  }
}

/**
 * Get the OAuth connection status for a tenant.
 * Used by the UI to show connection state.
 */
export async function getOAuthStatus(tenantId: number): Promise<{
  connected: boolean;
  locationId?: string;
  companyId?: string;
  expiresAt?: Date;
  lastRefreshedAt?: Date;
  lastError?: string;
  scopes?: string;
}> {
  const db = await getDb();
  if (!db) return { connected: false };

  const [tokenRow] = await db
    .select()
    .from(ghlOAuthTokens)
    .where(
      and(
        eq(ghlOAuthTokens.tenantId, tenantId),
        eq(ghlOAuthTokens.isActive, "true")
      )
    );

  if (!tokenRow) return { connected: false };

  return {
    connected: true,
    locationId: tokenRow.locationId,
    companyId: tokenRow.companyId || undefined,
    expiresAt: tokenRow.expiresAt,
    lastRefreshedAt: tokenRow.lastRefreshedAt || undefined,
    lastError: tokenRow.lastError || undefined,
    scopes: tokenRow.scopes || undefined,
  };
}

/**
 * Disconnect OAuth for a tenant (deactivate tokens).
 * Does not delete tokens — just marks them inactive for audit trail.
 */
export async function disconnectOAuth(tenantId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(ghlOAuthTokens)
    .set({ isActive: "false" })
    .where(eq(ghlOAuthTokens.tenantId, tenantId));

  console.log(`[GHL OAuth] Disconnected OAuth for tenant ${tenantId}`);
}

/**
 * Handle a 401 response from GHL API by attempting token refresh.
 * Called by ghlFetch when it gets a 401 — indicates token may have been revoked or expired.
 * Returns a new access token if refresh succeeds, null otherwise.
 */
export async function handleTokenRefreshOn401(tenantId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const [tokenRow] = await db
    .select()
    .from(ghlOAuthTokens)
    .where(
      and(
        eq(ghlOAuthTokens.tenantId, tenantId),
        eq(ghlOAuthTokens.isActive, "true")
      )
    );

  if (!tokenRow) return null;

  try {
    const newTokens = await refreshTokenFromGHL(tokenRow.refreshToken);
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
    
    await db
      .update(ghlOAuthTokens)
      .set({
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        expiresAt: newExpiresAt,
        scopes: newTokens.scope,
        lastRefreshedAt: new Date(),
        lastError: null,
      })
      .where(eq(ghlOAuthTokens.id, tokenRow.id));

    return newTokens.access_token;
  } catch (error: any) {
    console.error(`[GHL OAuth] 401 recovery refresh failed for tenant ${tenantId}:`, error.message);
    await db
      .update(ghlOAuthTokens)
      .set({ lastError: `401 recovery failed: ${error.message}` })
      .where(eq(ghlOAuthTokens.id, tokenRow.id));
    return null;
  }
}

// ============ TENANT LOOKUP BY LOCATION ============

/**
 * Find a tenant by GHL location ID from OAuth tokens.
 * Used during OAuth callback to link the installation to an existing tenant.
 */
export async function findTenantByOAuthLocation(locationId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [tokenRow] = await db
    .select({ tenantId: ghlOAuthTokens.tenantId })
    .from(ghlOAuthTokens)
    .where(
      and(
        eq(ghlOAuthTokens.locationId, locationId),
        eq(ghlOAuthTokens.isActive, "true")
      )
    );

  return tokenRow?.tenantId || null;
}

/**
 * Determine the authentication method for a tenant.
 * Returns 'oauth' if OAuth tokens exist, 'apikey' if using legacy API key, or 'none'.
 */
export async function getAuthMethod(tenantId: number): Promise<"oauth" | "apikey" | "none"> {
  // Check OAuth tokens first
  const oauthToken = await getValidAccessToken(tenantId);
  if (oauthToken) return "oauth";

  // Check legacy API key
  const { getTenantById } = await import("./tenant");
  const tenant = await getTenantById(tenantId);
  if (tenant?.crmConfig) {
    const config = parseCrmConfig(tenant);
    if (config.ghlApiKey && config.ghlLocationId) return "apikey";
  }

  return "none";
}
