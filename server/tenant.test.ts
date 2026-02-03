import { describe, it, expect } from 'vitest';
import { isPlatformOwner, getTenantIdFromUser } from './tenant';

describe('Tenant Module', () => {
  describe('isPlatformOwner', () => {
    it('should return true for platform owner openId', () => {
      const result = isPlatformOwner('U3JEthPNs4UbYRrgRBbShj');
      expect(result).toBe(true);
    });

    it('should return false for non-owner openId', () => {
      const result = isPlatformOwner('some-other-id');
      expect(result).toBe(false);
    });

    it('should return false for empty openId', () => {
      const result = isPlatformOwner('');
      expect(result).toBe(false);
    });
  });

  describe('getTenantIdFromUser', () => {
    it('should return tenantId when present', () => {
      const result = getTenantIdFromUser({ tenantId: 123 });
      expect(result).toBe(123);
    });

    it('should return null when tenantId is null', () => {
      const result = getTenantIdFromUser({ tenantId: null });
      expect(result).toBeNull();
    });

    it('should return null when tenantId is undefined', () => {
      const result = getTenantIdFromUser({});
      expect(result).toBeNull();
    });
  });
});
