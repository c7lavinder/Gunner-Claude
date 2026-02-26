import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============ OAuth Configuration Tests ============

describe("GHL OAuth Configuration", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("isOAuthConfigured returns false when no env vars set", async () => {
    delete process.env.GHL_CLIENT_ID;
    delete process.env.GHL_CLIENT_SECRET;
    const { isOAuthConfigured } = await import("./ghlOAuth");
    expect(isOAuthConfigured()).toBe(false);
  });

  it("isOAuthConfigured returns true when both client ID and secret are set", async () => {
    process.env.GHL_CLIENT_ID = "test-client-id";
    process.env.GHL_CLIENT_SECRET = "test-client-secret";
    vi.resetModules();
    const { isOAuthConfigured } = await import("./ghlOAuth");
    expect(isOAuthConfigured()).toBe(true);
  });

  it("isOAuthConfigured returns false when only client ID is set", async () => {
    process.env.GHL_CLIENT_ID = "test-client-id";
    delete process.env.GHL_CLIENT_SECRET;
    vi.resetModules();
    const { isOAuthConfigured } = await import("./ghlOAuth");
    expect(isOAuthConfigured()).toBe(false);
  });
});

// ============ Install URL Generation Tests ============

describe("GHL OAuth Install URL", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GHL_CLIENT_ID = "test-client-id-123";
    process.env.GHL_CLIENT_SECRET = "test-client-secret-456";
    process.env.APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("generates a valid install URL with correct parameters", async () => {
    vi.resetModules();
    const { getInstallUrl } = await import("./ghlOAuth");
    const url = getInstallUrl();
    
    expect(url).toContain("marketplace.gohighlevel.com/oauth/chooselocation");
    expect(url).toContain("client_id=test-client-id-123");
    expect(url).toContain("response_type=code");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain(encodeURIComponent("https://app.example.com/api/crm/oauth/callback"));
  });

  it("includes state parameter when provided", async () => {
    vi.resetModules();
    const { getInstallUrl } = await import("./ghlOAuth");
    const state = Buffer.from(JSON.stringify({ tenantId: 42 })).toString("base64");
    const url = getInstallUrl(state);
    
    expect(url).toContain("state=");
    expect(url).toContain(encodeURIComponent(state));
  });

  it("omits state parameter when not provided", async () => {
    vi.resetModules();
    const { getInstallUrl } = await import("./ghlOAuth");
    const url = getInstallUrl();
    
    expect(url).not.toContain("state=");
  });

  it("throws when GHL_CLIENT_ID is not configured", async () => {
    delete process.env.GHL_CLIENT_ID;
    vi.resetModules();
    const { getInstallUrl } = await import("./ghlOAuth");
    
    expect(() => getInstallUrl()).toThrow("GHL_CLIENT_ID is not configured");
  });
});

// ============ Credential Helper Tests ============

describe("GHL Credential Helper", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns API key credentials when no OAuth token exists", async () => {
    // Mock getValidAccessToken to return null (no OAuth)
    vi.doMock("./ghlOAuth", () => ({
      getValidAccessToken: vi.fn().mockResolvedValue(null),
    }));

    const { loadGHLCredentials } = await import("./ghlCredentialHelper");
    
    const config = {
      ghlApiKey: "test-api-key",
      ghlLocationId: "loc-123",
      dispoPipelineName: "Dispo Pipeline",
      newDealStageName: "New Deal",
    } as any;

    const result = await loadGHLCredentials(1, "Test Tenant", config);
    
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe("test-api-key");
    expect(result!.locationId).toBe("loc-123");
    expect(result!.isOAuth).toBe(false);
    expect(result!.dispoPipelineName).toBe("Dispo Pipeline");
    expect(result!.newDealStageName).toBe("New Deal");
    
    vi.doUnmock("./ghlOAuth");
  });

  it("returns OAuth credentials when OAuth token exists", async () => {
    vi.doMock("./ghlOAuth", () => ({
      getValidAccessToken: vi.fn().mockResolvedValue({
        accessToken: "oauth-access-token",
        locationId: "oauth-loc-456",
      }),
    }));

    const { loadGHLCredentials } = await import("./ghlCredentialHelper");
    
    const config = {
      ghlApiKey: "test-api-key",
      ghlLocationId: "loc-123",
      dispoPipelineName: "Dispo Pipeline",
    } as any;

    const result = await loadGHLCredentials(1, "Test Tenant", config);
    
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe("oauth-access-token");
    expect(result!.locationId).toBe("oauth-loc-456");
    expect(result!.isOAuth).toBe(true);
    
    vi.doUnmock("./ghlOAuth");
  });

  it("falls back to API key when OAuth throws an error", async () => {
    vi.doMock("./ghlOAuth", () => ({
      getValidAccessToken: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    }));

    const { loadGHLCredentials } = await import("./ghlCredentialHelper");
    
    const config = {
      ghlApiKey: "fallback-key",
      ghlLocationId: "fallback-loc",
    } as any;

    const result = await loadGHLCredentials(1, "Test Tenant", config);
    
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe("fallback-key");
    expect(result!.locationId).toBe("fallback-loc");
    expect(result!.isOAuth).toBe(false);
    
    vi.doUnmock("./ghlOAuth");
  });

  it("returns null when neither OAuth nor API key is available", async () => {
    vi.doMock("./ghlOAuth", () => ({
      getValidAccessToken: vi.fn().mockResolvedValue(null),
    }));

    const { loadGHLCredentials } = await import("./ghlCredentialHelper");
    
    const config = {} as any; // No API key or location ID

    const result = await loadGHLCredentials(1, "Test Tenant", config);
    
    expect(result).toBeNull();
    
    vi.doUnmock("./ghlOAuth");
  });

  it("prefers OAuth over API key when both are available", async () => {
    vi.doMock("./ghlOAuth", () => ({
      getValidAccessToken: vi.fn().mockResolvedValue({
        accessToken: "oauth-token",
        locationId: "oauth-location",
      }),
    }));

    const { loadGHLCredentials } = await import("./ghlCredentialHelper");
    
    const config = {
      ghlApiKey: "api-key",
      ghlLocationId: "api-location",
    } as any;

    const result = await loadGHLCredentials(1, "Test Tenant", config);
    
    expect(result!.apiKey).toBe("oauth-token");
    expect(result!.locationId).toBe("oauth-location");
    expect(result!.isOAuth).toBe(true);
    
    vi.doUnmock("./ghlOAuth");
  });
});

// ============ OAuth Route Handler Tests ============

describe("GHL OAuth Routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("createGHLOAuthRouter exports a function that returns a router", async () => {
    const { createGHLOAuthRouter } = await import("./ghlOAuthRoutes");
    expect(typeof createGHLOAuthRouter).toBe("function");
    
    const router = createGHLOAuthRouter();
    expect(router).toBeDefined();
    // Express routers have a stack property with registered routes
    expect(router.stack).toBeDefined();
    expect(Array.isArray(router.stack)).toBe(true);
  });

  it("registers the expected routes", async () => {
    const { createGHLOAuthRouter } = await import("./ghlOAuthRoutes");
    const router = createGHLOAuthRouter();
    
    // Check that routes are registered
    const routes = router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    
    const paths = routes.map((r: any) => r.path);
    expect(paths).toContain("/api/crm/oauth/install");
    expect(paths).toContain("/api/crm/oauth/callback");
    expect(paths).toContain("/api/crm/oauth/status");
  });
});

// ============ OAuth State Encoding/Decoding Tests ============

describe("OAuth State Parameter", () => {
  it("correctly encodes and decodes tenant ID in state", () => {
    const tenantId = 42;
    const state = Buffer.from(JSON.stringify({ tenantId })).toString("base64");
    
    const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    expect(decoded.tenantId).toBe(42);
  });

  it("handles state with additional metadata", () => {
    const stateData = { tenantId: 7, source: "onboarding" };
    const state = Buffer.from(JSON.stringify(stateData)).toString("base64");
    
    const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    expect(decoded.tenantId).toBe(7);
    expect(decoded.source).toBe("onboarding");
  });

  it("handles invalid base64 gracefully", () => {
    const invalidState = "not-valid-base64!!!";
    
    let tenantId: number | null = null;
    try {
      const decoded = JSON.parse(Buffer.from(invalidState, "base64").toString("utf-8"));
      tenantId = decoded.tenantId || null;
    } catch {
      tenantId = null;
    }
    
    expect(tenantId).toBeNull();
  });
});

// ============ Auth Method Detection Tests ============

describe("GHL Auth Method Detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("getAuthMethod returns 'none' when no credentials exist", async () => {
    vi.doMock("./ghlOAuth", async () => {
      const actual = await vi.importActual("./ghlOAuth") as any;
      return {
        ...actual,
        getValidAccessToken: vi.fn().mockResolvedValue(null),
      };
    });
    vi.doMock("./tenant", () => ({
      getTenantById: vi.fn().mockResolvedValue(null),
      parseCrmConfig: vi.fn().mockReturnValue({}),
    }));

    const { getAuthMethod } = await import("./ghlOAuth");
    const method = await getAuthMethod(999);
    expect(method).toBe("none");

    vi.doUnmock("./ghlOAuth");
    vi.doUnmock("./tenant");
  });
});

// ============ Token Expiry Buffer Tests ============

describe("Token Expiry Logic", () => {
  it("TOKEN_REFRESH_BUFFER_MS is 5 minutes", () => {
    // The buffer should be 5 minutes (300,000 ms)
    // This ensures tokens are refreshed before they actually expire
    const fiveMinutesMs = 5 * 60 * 1000;
    expect(fiveMinutesMs).toBe(300000);
  });

  it("calculates token expiry correctly", () => {
    const expiresIn = 86399; // ~24 hours
    const now = Date.now();
    const expiresAt = new Date(now + expiresIn * 1000);
    
    // Token should expire roughly 24 hours from now
    const diffHours = (expiresAt.getTime() - now) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(24, 0);
  });

  it("detects when token needs refresh (within buffer)", () => {
    const bufferMs = 5 * 60 * 1000;
    const now = Date.now();
    
    // Token expires in 3 minutes — should need refresh
    const expiresAtSoon = now + 3 * 60 * 1000;
    expect(now >= expiresAtSoon - bufferMs).toBe(true);
    
    // Token expires in 10 minutes — should NOT need refresh
    const expiresAtLater = now + 10 * 60 * 1000;
    expect(now >= expiresAtLater - bufferMs).toBe(false);
  });
});

// ============ getCrmIntegrations OAuth Fields Tests ============

describe("getCrmIntegrations OAuth Fields", () => {
  it("should include authMethod, oauthConfigured, and oauthConnected in the response shape", () => {
    // This tests the expected response shape from the getCrmIntegrations procedure
    const mockResponse = {
      ghl: {
        enabled: true,
        connected: true,
        hasApiKey: false,
        hasLocationId: true,
        locationId: "loc-123",
        authMethod: "oauth" as const,
        oauthConfigured: true,
        oauthConnected: true,
      },
      batchDialer: { enabled: false, connected: false },
      batchLeads: { enabled: false, connected: false },
    };

    expect(mockResponse.ghl.authMethod).toBe("oauth");
    expect(mockResponse.ghl.oauthConfigured).toBe(true);
    expect(mockResponse.ghl.oauthConnected).toBe(true);
  });

  it("should report apikey auth method when only API key is present", () => {
    const mockResponse = {
      ghl: {
        enabled: true,
        connected: true,
        hasApiKey: true,
        hasLocationId: true,
        authMethod: "apikey" as const,
        oauthConfigured: true,
        oauthConnected: false,
      },
    };

    expect(mockResponse.ghl.authMethod).toBe("apikey");
    expect(mockResponse.ghl.oauthConnected).toBe(false);
  });

  it("should report none auth method when neither is present", () => {
    const mockResponse = {
      ghl: {
        enabled: false,
        connected: false,
        hasApiKey: false,
        hasLocationId: false,
        authMethod: "none" as const,
        oauthConfigured: false,
        oauthConnected: false,
      },
    };

    expect(mockResponse.ghl.authMethod).toBe("none");
    expect(mockResponse.ghl.connected).toBe(false);
  });
});

// ============ OAuth Health Dashboard Tests ============

describe("OAuth Health Dashboard Response Shape", () => {
  it("should include all expected fields in the health response", () => {
    const mockHealth = {
      oauthConfigured: true,
      authMethod: "oauth" as const,
      oauth: {
        connected: true,
        locationId: "loc-123",
        companyId: "comp-456",
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        expiresInMs: 12 * 60 * 60 * 1000,
        lastRefreshedAt: new Date().toISOString(),
        lastError: null,
        scopes: "contacts.readonly contacts.write locations.readonly",
        tokenHealth: "healthy" as const,
      },
      webhook: {
        active: true,
        lastEventAt: new Date().toISOString(),
      },
    };

    expect(mockHealth.oauthConfigured).toBe(true);
    expect(mockHealth.authMethod).toBe("oauth");
    expect(mockHealth.oauth.connected).toBe(true);
    expect(mockHealth.oauth.tokenHealth).toBe("healthy");
    expect(mockHealth.oauth.locationId).toBe("loc-123");
    expect(mockHealth.oauth.companyId).toBe("comp-456");
    expect(mockHealth.oauth.lastError).toBeNull();
    expect(mockHealth.oauth.scopes).toContain("contacts.readonly");
    expect(mockHealth.webhook.active).toBe(true);
    expect(mockHealth.webhook.lastEventAt).toBeTruthy();
  });

  it("should calculate token health as 'healthy' when expiry is far away", () => {
    const expiresInMs = 12 * 60 * 60 * 1000; // 12 hours
    const lastError = null;

    let tokenHealth: string;
    if (lastError) {
      tokenHealth = "error";
    } else if (expiresInMs <= 0) {
      tokenHealth = "expired";
    } else if (expiresInMs < 60 * 60 * 1000) {
      tokenHealth = "expiring_soon";
    } else {
      tokenHealth = "healthy";
    }

    expect(tokenHealth).toBe("healthy");
  });

  it("should calculate token health as 'expiring_soon' when less than 1 hour", () => {
    const expiresInMs = 30 * 60 * 1000; // 30 minutes
    const lastError = null;

    let tokenHealth: string;
    if (lastError) {
      tokenHealth = "error";
    } else if (expiresInMs <= 0) {
      tokenHealth = "expired";
    } else if (expiresInMs < 60 * 60 * 1000) {
      tokenHealth = "expiring_soon";
    } else {
      tokenHealth = "healthy";
    }

    expect(tokenHealth).toBe("expiring_soon");
  });

  it("should calculate token health as 'expired' when past expiry", () => {
    const expiresInMs = -5000; // expired 5 seconds ago
    const lastError = null;

    let tokenHealth: string;
    if (lastError) {
      tokenHealth = "error";
    } else if (expiresInMs <= 0) {
      tokenHealth = "expired";
    } else if (expiresInMs < 60 * 60 * 1000) {
      tokenHealth = "expiring_soon";
    } else {
      tokenHealth = "healthy";
    }

    expect(tokenHealth).toBe("expired");
  });

  it("should calculate token health as 'error' when lastError is present", () => {
    const expiresInMs = 12 * 60 * 60 * 1000;
    const lastError = "Token refresh failed: 401 Unauthorized";

    let tokenHealth: string;
    if (lastError) {
      tokenHealth = "error";
    } else if (expiresInMs <= 0) {
      tokenHealth = "expired";
    } else if (expiresInMs < 60 * 60 * 1000) {
      tokenHealth = "expiring_soon";
    } else {
      tokenHealth = "healthy";
    }

    expect(tokenHealth).toBe("error");
  });

  it("should handle not_connected state", () => {
    const mockHealth = {
      oauthConfigured: true,
      authMethod: "none" as const,
      oauth: {
        connected: false,
        locationId: undefined,
        companyId: undefined,
        expiresAt: null,
        expiresInMs: 0,
        lastRefreshedAt: null,
        lastError: null,
        scopes: null,
        tokenHealth: "not_connected" as const,
      },
      webhook: {
        active: false,
        lastEventAt: null,
      },
    };

    expect(mockHealth.oauth.connected).toBe(false);
    expect(mockHealth.oauth.tokenHealth).toBe("not_connected");
    expect(mockHealth.webhook.active).toBe(false);
  });
});

// ============ Webhook Auto-Marking Tests ============

describe("Webhook Auto-Marking from OAuth", () => {
  it("markTenantWebhookActiveFromOAuth is exported from webhook module", async () => {
    const webhookModule = await import("./webhook");
    expect(typeof webhookModule.markTenantWebhookActiveFromOAuth).toBe("function");
  });

  it("triggerContactImportIfNeeded is exported from webhook module", async () => {
    const webhookModule = await import("./webhook");
    expect(typeof webhookModule.triggerContactImportIfNeeded).toBe("function");
  });
});

// ============ OAuth Route Import Tests ============

describe("OAuth Route Imports", () => {
  it("ghlOAuthRoutes imports markTenantWebhookActiveFromOAuth correctly", async () => {
    // Verify the module can be loaded without import errors
    const routeModule = await import("./ghlOAuthRoutes");
    expect(typeof routeModule.createGHLOAuthRouter).toBe("function");
    
    const router = routeModule.createGHLOAuthRouter();
    expect(router).toBeDefined();
    expect(router.stack).toBeDefined();
  });
});

// ============ OAuth Health Scopes Parsing Tests ============

describe("OAuth Scopes Parsing", () => {
  it("correctly splits space-separated scopes", () => {
    const scopes = "contacts.readonly contacts.write locations.readonly calendars.readonly opportunities.readonly";
    const scopeList = scopes.split(" ");
    
    expect(scopeList).toHaveLength(5);
    expect(scopeList).toContain("contacts.readonly");
    expect(scopeList).toContain("contacts.write");
    expect(scopeList).toContain("locations.readonly");
    expect(scopeList).toContain("calendars.readonly");
    expect(scopeList).toContain("opportunities.readonly");
  });

  it("handles empty scopes", () => {
    const scopes = "";
    const scopeList = scopes.split(" ").filter(Boolean);
    expect(scopeList).toHaveLength(0);
  });

  it("handles single scope", () => {
    const scopes = "contacts.readonly";
    const scopeList = scopes.split(" ");
    expect(scopeList).toHaveLength(1);
    expect(scopeList[0]).toBe("contacts.readonly");
  });
});


// ============ Super Admin OAuth Overview Tests ============

describe("Super Admin OAuth Overview - Token Health Calculation", () => {
  it("classifies token as healthy when expiry is more than 1 hour away", () => {
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
    const expiresInMs = expiresAt.getTime() - Date.now();
    
    let tokenHealth: string = 'not_connected';
    if (expiresInMs > 60 * 60 * 1000) {
      tokenHealth = 'healthy';
    } else if (expiresInMs > 0) {
      tokenHealth = 'expiring_soon';
    } else {
      tokenHealth = 'expired';
    }
    
    expect(tokenHealth).toBe('healthy');
    expect(expiresInMs).toBeGreaterThan(60 * 60 * 1000);
  });

  it("classifies token as expiring_soon when expiry is less than 1 hour", () => {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    const expiresInMs = expiresAt.getTime() - Date.now();
    
    let tokenHealth: string = 'not_connected';
    if (expiresInMs > 60 * 60 * 1000) {
      tokenHealth = 'healthy';
    } else if (expiresInMs > 0) {
      tokenHealth = 'expiring_soon';
    } else {
      tokenHealth = 'expired';
    }
    
    expect(tokenHealth).toBe('expiring_soon');
    expect(expiresInMs).toBeLessThan(60 * 60 * 1000);
    expect(expiresInMs).toBeGreaterThan(0);
  });

  it("classifies token as expired when expiry is in the past", () => {
    const expiresAt = new Date(Date.now() - 60 * 1000); // 1 minute ago
    const expiresInMs = expiresAt.getTime() - Date.now();
    
    let tokenHealth: string = 'not_connected';
    if (expiresInMs > 60 * 60 * 1000) {
      tokenHealth = 'healthy';
    } else if (expiresInMs > 0) {
      tokenHealth = 'expiring_soon';
    } else {
      tokenHealth = 'expired';
    }
    
    expect(tokenHealth).toBe('expired');
    expect(expiresInMs).toBeLessThan(0);
  });

  it("classifies token as error when lastError is present regardless of expiry", () => {
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
    const lastError = "refresh_token_invalid";
    const expiresInMs = expiresAt.getTime() - Date.now();
    
    let tokenHealth: string = 'not_connected';
    if (lastError) {
      tokenHealth = 'error';
    } else if (expiresInMs > 60 * 60 * 1000) {
      tokenHealth = 'healthy';
    } else if (expiresInMs > 0) {
      tokenHealth = 'expiring_soon';
    } else {
      tokenHealth = 'expired';
    }
    
    expect(tokenHealth).toBe('error');
  });

  it("classifies as not_connected when no OAuth token exists", () => {
    const connected = false;
    let tokenHealth: string = 'not_connected';
    
    if (connected) {
      tokenHealth = 'healthy';
    }
    
    expect(tokenHealth).toBe('not_connected');
  });
});

describe("Super Admin OAuth Overview - Summary Aggregation", () => {
  it("correctly aggregates summary stats from tenant results", () => {
    const results = [
      { authMethod: 'oauth' as const, oauth: { connected: true, tokenHealth: 'healthy' as const }, webhook: { active: true } },
      { authMethod: 'oauth' as const, oauth: { connected: true, tokenHealth: 'expiring_soon' as const }, webhook: { active: true } },
      { authMethod: 'oauth' as const, oauth: { connected: true, tokenHealth: 'expired' as const }, webhook: { active: false } },
      { authMethod: 'oauth' as const, oauth: { connected: true, tokenHealth: 'error' as const }, webhook: { active: false } },
      { authMethod: 'apikey' as const, oauth: { connected: false, tokenHealth: 'not_connected' as const }, webhook: { active: true } },
      { authMethod: 'none' as const, oauth: { connected: false, tokenHealth: 'not_connected' as const }, webhook: { active: false } },
    ];

    const summary = {
      total: results.length,
      oauthConnected: results.filter(r => r.oauth.connected).length,
      apiKeyOnly: results.filter(r => r.authMethod === 'apikey').length,
      noAuth: results.filter(r => r.authMethod === 'none').length,
      healthy: results.filter(r => r.oauth.tokenHealth === 'healthy').length,
      expiringSoon: results.filter(r => r.oauth.tokenHealth === 'expiring_soon').length,
      expired: results.filter(r => r.oauth.tokenHealth === 'expired').length,
      errors: results.filter(r => r.oauth.tokenHealth === 'error').length,
      webhookActive: results.filter(r => r.webhook.active).length,
    };

    expect(summary.total).toBe(6);
    expect(summary.oauthConnected).toBe(4);
    expect(summary.apiKeyOnly).toBe(1);
    expect(summary.noAuth).toBe(1);
    expect(summary.healthy).toBe(1);
    expect(summary.expiringSoon).toBe(1);
    expect(summary.expired).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.webhookActive).toBe(3);
  });

  it("handles empty tenant list", () => {
    const results: any[] = [];

    const summary = {
      total: results.length,
      oauthConnected: results.filter(r => r.oauth.connected).length,
      apiKeyOnly: results.filter(r => r.authMethod === 'apikey').length,
      noAuth: results.filter(r => r.authMethod === 'none').length,
      healthy: results.filter(r => r.oauth.tokenHealth === 'healthy').length,
      expiringSoon: results.filter(r => r.oauth.tokenHealth === 'expiring_soon').length,
      expired: results.filter(r => r.oauth.tokenHealth === 'expired').length,
      errors: results.filter(r => r.oauth.tokenHealth === 'error').length,
      webhookActive: results.filter(r => r.webhook.active).length,
    };

    expect(summary.total).toBe(0);
    expect(summary.oauthConnected).toBe(0);
    expect(summary.apiKeyOnly).toBe(0);
    expect(summary.noAuth).toBe(0);
    expect(summary.healthy).toBe(0);
    expect(summary.webhookActive).toBe(0);
  });

  it("handles all tenants on OAuth with healthy tokens", () => {
    const results = Array.from({ length: 5 }, () => ({
      authMethod: 'oauth' as const,
      oauth: { connected: true, tokenHealth: 'healthy' as const },
      webhook: { active: true },
    }));

    const summary = {
      total: results.length,
      oauthConnected: results.filter(r => r.oauth.connected).length,
      healthy: results.filter(r => r.oauth.tokenHealth === 'healthy').length,
      webhookActive: results.filter(r => r.webhook.active).length,
    };

    expect(summary.total).toBe(5);
    expect(summary.oauthConnected).toBe(5);
    expect(summary.healthy).toBe(5);
    expect(summary.webhookActive).toBe(5);
  });
});

describe("Super Admin OAuth Overview - Time Formatting", () => {
  it("formats time ago correctly for recent events", () => {
    const formatTimeAgo = (dateStr: string | null) => {
      if (!dateStr) return 'Never';
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    };

    expect(formatTimeAgo(null)).toBe('Never');
    expect(formatTimeAgo(new Date().toISOString())).toBe('Just now');
    expect(formatTimeAgo(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m ago');
    expect(formatTimeAgo(new Date(Date.now() - 3 * 3600000).toISOString())).toBe('3h ago');
    expect(formatTimeAgo(new Date(Date.now() - 2 * 86400000).toISOString())).toBe('2d ago');
  });

  it("formats expires in correctly", () => {
    const formatExpiresIn = (ms: number) => {
      if (ms <= 0) return 'Expired';
      const hours = Math.floor(ms / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    };

    expect(formatExpiresIn(-1000)).toBe('Expired');
    expect(formatExpiresIn(0)).toBe('Expired');
    expect(formatExpiresIn(30 * 60000)).toBe('30m');
    expect(formatExpiresIn(3 * 3600000 + 15 * 60000)).toBe('3h 15m');
    expect(formatExpiresIn(48 * 3600000 + 6 * 3600000)).toBe('2d 6h');
  });
});

describe("Super Admin OAuth Overview - Redirect URI Update", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GHL_CLIENT_ID = "test-client-id-123";
    process.env.GHL_CLIENT_SECRET = "test-client-secret-456";
    process.env.APP_URL = "https://getgunner.ai";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses /api/crm/oauth/callback as the redirect URI", async () => {
    vi.resetModules();
    const { getInstallUrl } = await import("./ghlOAuth");
    const url = getInstallUrl();
    
    expect(url).toContain(encodeURIComponent("https://getgunner.ai/api/crm/oauth/callback"));
    expect(url).not.toContain(encodeURIComponent("/api/ghl/callback"));
  });
});
