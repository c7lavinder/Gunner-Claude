/**
 * GHL OAuth Express Routes
 * 
 * Handles the OAuth install flow for GHL Marketplace App:
 * 
 * GET /api/ghl/install
 *   → Redirects user to GHL authorization page (location picker)
 *   → Accepts optional ?tenantId query param to link installation to a tenant
 * 
 * GET /api/ghl/callback
 *   → Receives authorization code from GHL after user approves
 *   → Exchanges code for access/refresh tokens
 *   → Stores tokens and links to tenant
 *   → Redirects user back to app with success/error status
 */

import { Router, Request, Response } from "express";
import {
  getInstallUrl,
  exchangeCodeForTokens,
  storeTokens,
  isOAuthConfigured,
  findTenantByOAuthLocation,
} from "./ghlOAuth";
import { getTenantsWithCrm, parseCrmConfig, getTenantById, updateTenantSettings } from "./tenant";
import { triggerContactImportIfNeeded } from "./webhook";

export function createGHLOAuthRouter(): Router {
  const router = Router();

  /**
   * GET /api/ghl/install
   * 
   * Initiates the GHL OAuth flow by redirecting to GHL's authorization page.
   * 
   * Query params:
   *   tenantId (optional): Links the installation to a specific tenant
   *   
   * The tenantId is encoded in the OAuth state parameter and recovered in the callback.
   */
  router.get("/api/ghl/install", (req: Request, res: Response) => {
    if (!isOAuthConfigured()) {
      return res.status(503).json({
        error: "GHL Marketplace integration is not configured. Contact support.",
      });
    }

    try {
      // Encode tenantId in state for recovery after callback
      const tenantId = req.query.tenantId as string | undefined;
      const state = tenantId ? Buffer.from(JSON.stringify({ tenantId: parseInt(tenantId) })).toString("base64") : undefined;

      const installUrl = getInstallUrl(state);
      console.log(`[GHL OAuth] Redirecting to install URL${tenantId ? ` for tenant ${tenantId}` : ""}`);
      
      return res.redirect(installUrl);
    } catch (error: any) {
      console.error("[GHL OAuth] Install redirect error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/ghl/callback
   * 
   * OAuth callback handler. GHL redirects here after user approves the app.
   * 
   * Query params:
   *   code: Authorization code to exchange for tokens
   *   state: Base64-encoded state with tenantId (if provided during install)
   *   error: Error code if user denied access
   */
  router.get("/api/ghl/callback", async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    // Handle user denial
    if (oauthError) {
      console.log(`[GHL OAuth] User denied access: ${oauthError}`);
      return res.redirect("/?ghl_oauth=denied");
    }

    if (!code || typeof code !== "string") {
      console.error("[GHL OAuth] Callback missing authorization code");
      return res.redirect("/?ghl_oauth=error&reason=missing_code");
    }

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await exchangeCodeForTokens(code);
      
      if (!tokenResponse.locationId) {
        console.error("[GHL OAuth] Token response missing locationId");
        return res.redirect("/?ghl_oauth=error&reason=missing_location");
      }

      // Recover tenantId from state parameter
      let tenantId: number | null = null;
      
      if (state && typeof state === "string") {
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
          tenantId = decoded.tenantId || null;
        } catch {
          console.warn("[GHL OAuth] Failed to decode state parameter");
        }
      }

      // If no tenantId from state, try to find existing tenant by locationId
      if (!tenantId) {
        // Check OAuth tokens table
        tenantId = await findTenantByOAuthLocation(tokenResponse.locationId);
      }

      if (!tenantId) {
        // Check crmConfig for legacy tenants with this locationId
        const crmTenants = await getTenantsWithCrm();
        for (const t of crmTenants) {
          const config = parseCrmConfig(t);
          if (config.ghlLocationId === tokenResponse.locationId) {
            tenantId = t.id;
            break;
          }
        }
      }

      if (!tenantId) {
        // No matching tenant found — user needs to complete onboarding first
        // Store the token data in a temporary way so the onboarding can pick it up
        console.warn(`[GHL OAuth] No tenant found for location ${tokenResponse.locationId}. Redirecting to onboarding.`);
        
        // Encode the location info in the redirect so the frontend can use it
        const params = new URLSearchParams({
          ghl_oauth: "pending",
          locationId: tokenResponse.locationId,
          companyId: tokenResponse.companyId || "",
        });
        return res.redirect(`/?${params.toString()}`);
      }

      // Store the OAuth tokens
      await storeTokens(tenantId, tokenResponse);

      // Update tenant CRM config with locationId (if not already set)
      const tenant = await getTenantById(tenantId);
      if (tenant) {
        const existingConfig = parseCrmConfig(tenant);
        if (!existingConfig.ghlLocationId || existingConfig.ghlLocationId !== tokenResponse.locationId) {
          existingConfig.ghlLocationId = tokenResponse.locationId;
          await updateTenantSettings(tenantId, {
            crmType: "ghl",
            crmConfig: JSON.stringify(existingConfig),
            crmConnected: "true",
          });
        }
        
        // Also ensure crmConnected is true
        if (tenant.crmConnected !== "true") {
          await updateTenantSettings(tenantId, { crmConnected: "true" });
        }
      }

      // Trigger batch contact import
      triggerContactImportIfNeeded(tenantId).catch(err => {
        console.error(`[GHL OAuth] Failed to trigger contact import for tenant ${tenantId}:`, err);
      });

      console.log(`[GHL OAuth] Successfully connected tenant ${tenantId} to location ${tokenResponse.locationId}`);
      
      // Redirect back to the app with success
      return res.redirect(`/?ghl_oauth=success&locationId=${tokenResponse.locationId}`);
    } catch (error: any) {
      console.error("[GHL OAuth] Callback error:", error);
      return res.redirect(`/?ghl_oauth=error&reason=${encodeURIComponent(error.message?.substring(0, 100) || "unknown")}`);
    }
  });

  /**
   * GET /api/ghl/status
   * 
   * Returns the OAuth connection status for the current user's tenant.
   * Used by the frontend to show connection state.
   */
  router.get("/api/ghl/status", async (req: Request, res: Response) => {
    // This is a simple status endpoint — auth is handled at the tRPC level
    // For now, return whether OAuth is configured at the app level
    return res.json({
      oauthConfigured: isOAuthConfigured(),
    });
  });

  return router;
}
