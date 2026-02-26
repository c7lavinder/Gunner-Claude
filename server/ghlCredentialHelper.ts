/**
 * GHL Credential Helper
 * 
 * Provides a unified way to load GHL credentials for any tenant,
 * checking OAuth tokens first, then falling back to legacy API keys.
 * 
 * Used by ghlService.ts polling loops and opportunityDetection.ts
 * to load credentials before making API calls.
 */

import { parseCrmConfig, getTenantById, type TenantCrmConfig } from "./tenant";
import { getValidAccessToken } from "./ghlOAuth";

interface GHLPollingCredentials {
  apiKey: string;
  locationId: string;
  tenantId: number;
  tenantName: string;
  isOAuth: boolean;
  dispoPipelineName?: string;
  newDealStageName?: string;
}

/**
 * Load GHL credentials for a tenant, checking OAuth first then API key.
 * Returns null if no credentials are available.
 */
export async function loadGHLCredentials(
  tenantId: number,
  tenantName: string,
  config: TenantCrmConfig
): Promise<GHLPollingCredentials | null> {
  // Layer 1: Check OAuth tokens (Marketplace app)
  try {
    const oauthToken = await getValidAccessToken(tenantId);
    if (oauthToken) {
      return {
        apiKey: oauthToken.accessToken,
        locationId: oauthToken.locationId,
        tenantId,
        tenantName,
        isOAuth: true,
        dispoPipelineName: config.dispoPipelineName,
        newDealStageName: config.newDealStageName,
      };
    }
  } catch (err) {
    console.warn(`[GHL] OAuth token lookup failed for tenant ${tenantId}, trying API key:`, err);
  }

  // Layer 2: Fall back to legacy API key
  if (config.ghlApiKey && config.ghlLocationId) {
    return {
      apiKey: config.ghlApiKey,
      locationId: config.ghlLocationId,
      tenantId,
      tenantName,
      isOAuth: false,
      dispoPipelineName: config.dispoPipelineName,
      newDealStageName: config.newDealStageName,
    };
  }

  return null;
}
