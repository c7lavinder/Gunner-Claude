import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('./selfServeAuth', () => ({
  verifySessionToken: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('./_core/sdk', () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

describe('Context Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cookie Parsing', () => {
    it('should parse auth_token cookie correctly', async () => {
      const { verifySessionToken, getUserById } = await import('./selfServeAuth');
      const { createContext } = await import('./_core/context');
      
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        tenantId: 1,
        role: 'admin',
        isTenantAdmin: 'true',
      };
      
      vi.mocked(verifySessionToken).mockReturnValue({ userId: 1, tenantId: 1 });
      vi.mocked(getUserById).mockResolvedValue(mockUser as any);
      
      const mockReq = {
        headers: {
          cookie: 'auth_token=test-jwt-token',
        },
      } as any;
      
      const mockRes = {} as any;
      
      const context = await createContext({ req: mockReq, res: mockRes });
      
      expect(context.user).toBeDefined();
      expect(context.user?.id).toBe(1);
      expect(verifySessionToken).toHaveBeenCalledWith('test-jwt-token');
      expect(getUserById).toHaveBeenCalledWith(1);
    });

    it('should fall back to Manus OAuth if auth_token is not present', async () => {
      const { verifySessionToken, getUserById } = await import('./selfServeAuth');
      const { sdk } = await import('./_core/sdk');
      const { createContext } = await import('./_core/context');
      
      const mockManusUser = {
        id: 2,
        name: 'Manus User',
        email: 'manus@example.com',
        openId: 'manus-open-id',
      };
      
      vi.mocked(verifySessionToken).mockReturnValue(null);
      vi.mocked(sdk.authenticateRequest).mockResolvedValue(mockManusUser as any);
      
      const mockReq = {
        headers: {
          cookie: 'app_session_id=manus-jwt-token',
        },
      } as any;
      
      const mockRes = {} as any;
      
      const context = await createContext({ req: mockReq, res: mockRes });
      
      expect(context.user).toBeDefined();
      expect(context.user?.id).toBe(2);
      expect(sdk.authenticateRequest).toHaveBeenCalled();
    });

    it('should return null user if both auth methods fail', async () => {
      const { verifySessionToken, getUserById } = await import('./selfServeAuth');
      const { sdk } = await import('./_core/sdk');
      const { createContext } = await import('./_core/context');
      
      vi.mocked(verifySessionToken).mockReturnValue(null);
      vi.mocked(sdk.authenticateRequest).mockRejectedValue(new Error('Not authenticated'));
      
      const mockReq = {
        headers: {},
      } as any;
      
      const mockRes = {} as any;
      
      const context = await createContext({ req: mockReq, res: mockRes });
      
      expect(context.user).toBeNull();
    });
  });
});
