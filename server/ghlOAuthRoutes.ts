/**
 * GHL OAuth Express Routes
 * 
 * Handles the OAuth install flow for GHL Marketplace App:
 * 
 * GET /api/crm/oauth/install
 *   → Redirects user to GHL authorization page (location picker)
 *   → Accepts optional ?tenantId query param to link installation to a tenant
 * 
 * GET /api/crm/oauth/callback
 *   → Receives authorization code from GHL after user approves
 *   → Exchanges code for access/refresh tokens
 *   → Stores tokens and links to tenant
 *   → Redirects user back to app with success/error status
 * 
 * Note: Routes use /api/crm/oauth/* path to avoid GHL Marketplace validation
 * rejecting URLs that contain "ghl" or "highlevel" substrings.
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
import { triggerContactImportIfNeeded, markTenantWebhookActiveFromOAuth } from "./webhook";

export function createGHLOAuthRouter(): Router {
  const router = Router();

  /**
   * GET /api/crm/oauth/install
   * 
   * Initiates the GHL OAuth flow by redirecting to GHL's authorization page.
   * 
   * Query params:
   *   tenantId (optional): Links the installation to a specific tenant
   *   
   * The tenantId is encoded in the OAuth state parameter and recovered in the callback.
   */
  router.get("/api/crm/oauth/install", (req: Request, res: Response) => {
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
      console.log(`[CRM OAuth] Redirecting to install URL${tenantId ? ` for tenant ${tenantId}` : ""}`);
      
      return res.redirect(installUrl);
    } catch (error: any) {
      console.error("[CRM OAuth] Install redirect error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/crm/oauth/callback
   * 
   * OAuth callback handler. GHL redirects here after user approves the app.
   * 
   * Query params:
   *   code: Authorization code to exchange for tokens
   *   state: Base64-encoded state with tenantId (if provided during install)
   *   error: Error code if user denied access
   */
  router.get("/api/crm/oauth/callback", async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    // Handle user denial
    if (oauthError) {
      console.log(`[CRM OAuth] User denied access: ${oauthError}`);
      return res.redirect("/?ghl_oauth=denied");
    }

    if (!code || typeof code !== "string") {
      console.error("[CRM OAuth] Callback missing authorization code");
      return res.redirect("/?ghl_oauth=error&reason=missing_code");
    }

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await exchangeCodeForTokens(code);
      
      if (!tokenResponse.locationId) {
        console.error("[CRM OAuth] Token response missing locationId");
        return res.redirect("/?ghl_oauth=error&reason=missing_location");
      }

      // Recover tenantId from state parameter
      let tenantId: number | null = null;
      
      if (state && typeof state === "string") {
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
          tenantId = decoded.tenantId || null;
        } catch {
          console.warn("[CRM OAuth] Failed to decode state parameter");
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
        console.warn(`[CRM OAuth] No tenant found for location ${tokenResponse.locationId}. Redirecting to onboarding.`);
        
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

      // Mark tenant as webhook-active (Marketplace apps get automatic webhooks from GHL)
      markTenantWebhookActiveFromOAuth(tenantId).catch((err: any) => {
        console.error(`[CRM OAuth] Failed to mark webhook active for tenant ${tenantId}:`, err);
      });

      // Trigger batch contact import
      triggerContactImportIfNeeded(tenantId).catch(err => {
        console.error(`[CRM OAuth] Failed to trigger contact import for tenant ${tenantId}:`, err);
      });

      console.log(`[CRM OAuth] Successfully connected tenant ${tenantId} to location ${tokenResponse.locationId}`);
      
      // Redirect back to the app with success
      return res.redirect(`/?ghl_oauth=success&locationId=${tokenResponse.locationId}`);
    } catch (error: any) {
      console.error("[CRM OAuth] Callback error:", error);
      return res.redirect(`/?ghl_oauth=error&reason=${encodeURIComponent(error.message?.substring(0, 100) || "unknown")}`);
    }
  });

  /**
   * GET /setup/oauth/callback
   * 
   * Alias for /api/crm/oauth/callback to match the existing GHL Marketplace redirect URL
   * (configured when the app was on Railway). This avoids needing to update the
   * locked redirect URL in the live GHL Marketplace app settings.
   */
  router.get("/setup/oauth/callback", async (req: Request, res: Response) => {
    // Redirect to the canonical callback path, preserving all query params
    const qs = req.originalUrl.split("?")[1];
    return res.redirect(`/api/crm/oauth/callback${qs ? `?${qs}` : ""}`);
  });

  /**
   * GET /api/crm/oauth/status
   * 
   * Returns the OAuth connection status for the current user's tenant.
   * Used by the frontend to show connection state.
   */
  router.get("/api/crm/oauth/status", async (req: Request, res: Response) => {
    // This is a simple status endpoint — auth is handled at the tRPC level
    // For now, return whether OAuth is configured at the app level
    return res.json({
      oauthConfigured: isOAuthConfigured(),
    });
  });

  return router;
}
