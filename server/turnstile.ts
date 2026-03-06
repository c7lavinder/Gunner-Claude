/**
 * Cloudflare Turnstile Server-Side Verification
 * 
 * Validates Turnstile tokens sent from the frontend to prevent bot signups.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

import { ENV } from "./_core/env";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Verify a Turnstile token with Cloudflare's siteverify API.
 * 
 * @param token - The turnstile response token from the frontend widget
 * @param remoteIp - Optional client IP for additional validation
 * @returns true if the token is valid, false otherwise
 */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  if (!ENV.turnstileSecretKey) {
    console.warn("[Turnstile] No secret key configured — skipping verification");
    // If no key is configured, allow through (graceful degradation)
    // This should only happen in development
    return true;
  }

  try {
    const body: Record<string, string> = {
      secret: ENV.turnstileSecretKey,
      response: token,
    };

    if (remoteIp) {
      body.remoteip = remoteIp;
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      console.error(`[Turnstile] Verification API returned ${response.status}`);
      return false;
    }

    const result: TurnstileVerifyResponse = await response.json();

    if (!result.success) {
      console.warn("[Turnstile] Token verification failed:", result["error-codes"]);
      return false;
    }

    console.log(`[Turnstile] Token verified successfully (hostname: ${result.hostname})`);
    return true;
  } catch (error) {
    console.error("[Turnstile] Verification error:", error);
    // On network error, reject to be safe
    return false;
  }
}
