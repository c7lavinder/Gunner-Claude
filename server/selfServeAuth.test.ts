import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from './selfServeAuth';

describe('Self-Serve Auth', () => {
  describe('Password Hashing', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are ~60 chars
    });

    it('should verify a correct password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword456';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('Session Tokens', () => {
    it('should create a valid session token', () => {
      const userId = 123;
      const tenantId = 456;
      
      const token = createSessionToken(userId, tenantId);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should verify a valid session token', () => {
      const userId = 123;
      const tenantId = 456;
      
      const token = createSessionToken(userId, tenantId);
      const decoded = verifySessionToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(userId);
      expect(decoded?.tenantId).toBe(tenantId);
    });

    it('should handle null tenantId', () => {
      const userId = 123;
      const tenantId = null;
      
      const token = createSessionToken(userId, tenantId);
      const decoded = verifySessionToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(userId);
      expect(decoded?.tenantId).toBe(null);
    });

    it('should reject an invalid token', () => {
      const invalidToken = 'invalid.token.here';
      
      const decoded = verifySessionToken(invalidToken);
      
      expect(decoded).toBe(null);
    });

    it('should reject a tampered token', () => {
      const userId = 123;
      const tenantId = 456;
      
      const token = createSessionToken(userId, tenantId);
      // Tamper with the token by changing a character
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      
      const decoded = verifySessionToken(tamperedToken);
      
      expect(decoded).toBe(null);
    });
  });
});
