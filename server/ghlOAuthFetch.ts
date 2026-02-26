/**
 * OAuth-Aware GHL Fetch Wrapper
 * 
 * Wraps any GHL API fetch call with automatic 401 → token refresh → retry logic.
 * Used by ghlService.ts, opportunityDetection.ts, and webhook.ts to ensure
 * all direct fetch calls handle expired OAuth tokens gracefully.
 * 
 * For ghlActions.ts, the existing ghlFetch already has this logic built in.
 * 
 * All fetch calls have a 30-second timeout via AbortController to prevent
 * hung requests from blocking the entire polling loop.
 */

import { handleTokenRefreshOn401 } from "./ghlOAuth";

/** Default timeout for GHL API requests (30 seconds) */
const FETCH_TIMEOUT_MS = 30_000;

interface OAuthFetchOptions {
  /** The tenant ID for OAuth token lookup. Required for 401 retry. */
  tenantId: number;
  /** Whether the credentials are from OAuth (vs legacy API key). */
  isOAuth: boolean;
  /** The current API key / access token. */
  apiKey: string;
  /** Callback to update the caller's credential reference after refresh. */
  onTokenRefreshed?: (newToken: string) => void;
  /** Custom timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * Fetch with an AbortController timeout to prevent hung requests.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(`GHL API request timed out after ${timeoutMs / 1000}s: ${options.method || "GET"} ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a GHL API fetch with automatic 401 retry for OAuth tokens.
 * 
 * Usage:
 *   const response = await oauthAwareFetch(url, fetchOptions, oauthOptions);
 * 
 * If the initial request returns 401 and the credentials are OAuth-based,
 * this function will:
 * 1. Attempt to refresh the OAuth token
 * 2. Retry the request with the new token
 * 3. Call onTokenRefreshed so the caller can update its credential reference
 * 
 * For non-OAuth credentials (legacy API keys), 401s are returned as-is.
 * 
 * All requests have a 30-second timeout to prevent hung connections from
 * blocking the polling loop.
 */
export async function oauthAwareFetch(
  url: string,
  fetchOptions: RequestInit,
  oauthOpts: OAuthFetchOptions
): Promise<Response> {
  const timeout = oauthOpts.timeoutMs || FETCH_TIMEOUT_MS;
  const response = await fetchWithTimeout(url, fetchOptions, timeout);

  // If not a 401, or not OAuth, return as-is
  if (response.status !== 401 || !oauthOpts.isOAuth || !oauthOpts.tenantId) {
    return response;
  }

  // Attempt OAuth token refresh
  console.log(`[GHL OAuth Fetch] 401 on ${fetchOptions.method || "GET"} ${url} — attempting token refresh for tenant ${oauthOpts.tenantId}`);
  
  const newToken = await handleTokenRefreshOn401(oauthOpts.tenantId);
  if (!newToken) {
    console.error(`[GHL OAuth Fetch] Token refresh failed for tenant ${oauthOpts.tenantId} — returning original 401`);
    return response;
  }

  // Notify caller of the new token so they can update their reference
  if (oauthOpts.onTokenRefreshed) {
    oauthOpts.onTokenRefreshed(newToken);
  }

  // Retry with the new token
  const retryHeaders = new Headers(fetchOptions.headers);
  retryHeaders.set("Authorization", `Bearer ${newToken}`);

  const retryResponse = await fetchWithTimeout(url, {
    ...fetchOptions,
    headers: retryHeaders,
  }, timeout);

  if (retryResponse.ok) {
    console.log(`[GHL OAuth Fetch] Retry succeeded after token refresh for tenant ${oauthOpts.tenantId}`);
  } else {
    console.error(`[GHL OAuth Fetch] Retry failed with ${retryResponse.status} after token refresh for tenant ${oauthOpts.tenantId}`);
  }

  return retryResponse;
}
