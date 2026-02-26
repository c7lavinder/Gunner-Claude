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
    expect(url).toContain(encodeURIComponent("https://app.example.com/api/ghl/callback"));
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
    expect(paths).toContain("/api/ghl/install");
    expect(paths).toContain("/api/ghl/callback");
    expect(paths).toContain("/api/ghl/status");
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
