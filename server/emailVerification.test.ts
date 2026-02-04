import { describe, it, expect, vi } from 'vitest';
import { verifyEmailToken } from './selfServeAuth';

// Mock the email service
vi.mock('./emailService', () => ({
  sendEmailVerification: vi.fn().mockResolvedValue(true),
}));

describe('Email Verification', () => {
  describe('verifyEmailToken', () => {
    it('should return error for invalid token', async () => {
      const result = await verifyEmailToken('invalid-token-12345');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for empty token', async () => {
      const result = await verifyEmailToken('');
      
      expect(result.success).toBe(false);
    });

    it('should return error for malformed token', async () => {
      const result = await verifyEmailToken('not-a-valid-uuid-format');
      
      expect(result.success).toBe(false);
    });
  });

  describe('Email verification flow', () => {
    it('should have verification endpoints defined', () => {
      // Verify the functions are exported and callable
      expect(typeof verifyEmailToken).toBe('function');
    });
  });
});
