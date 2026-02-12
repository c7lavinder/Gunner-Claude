import { describe, it, expect } from 'vitest';

/**
 * Tests for Lead Manager call visibility scoping.
 * 
 * Business rules:
 * - Admin: sees all calls within their tenant
 * - Acquisition Manager: sees own calls + assigned Lead Manager calls
 * - Lead Manager: sees own calls + assigned Lead Generator calls
 * - Lead Generator: sees only own calls
 */

// Import the functions we're testing
import { getViewableTeamMemberIds } from './db';

describe('Lead Manager Call Visibility', () => {
  describe('getViewableTeamMemberIds', () => {
    it('should return "all" for admin role', async () => {
      const result = await getViewableTeamMemberIds({
        teamRole: 'admin',
        teamMemberId: 1,
        tenantId: 1,
      });
      expect(result).toBe('all');
    });

    it('should return own ID for lead_generator role', async () => {
      const result = await getViewableTeamMemberIds({
        teamRole: 'lead_generator',
        teamMemberId: 42,
        tenantId: 1,
      });
      // Lead generators should see only their own calls
      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain(42);
      // Should only contain their own ID (no others unless assigned)
      if (Array.isArray(result)) {
        expect(result[0]).toBe(42);
      }
    });

    it('should include own ID for lead_manager role', async () => {
      const result = await getViewableTeamMemberIds({
        teamRole: 'lead_manager',
        teamMemberId: 10,
        tenantId: 1,
      });
      // Lead managers should always see their own calls
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toContain(10);
      }
    });

    it('should include own ID for acquisition_manager role', async () => {
      const result = await getViewableTeamMemberIds({
        teamRole: 'acquisition_manager',
        teamMemberId: 5,
        tenantId: 1,
      });
      // Acquisition managers should always see their own calls
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toContain(5);
      }
    });

    it('should return empty array when no teamMemberId provided for non-admin', async () => {
      const result = await getViewableTeamMemberIds({
        teamRole: 'lead_manager',
        tenantId: 1,
      });
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(0);
      }
    });
  });

  describe('getLeadGeneratorsForLeadManager', () => {
    it('should be exported from db module', async () => {
      const { getLeadGeneratorsForLeadManager } = await import('./db');
      expect(typeof getLeadGeneratorsForLeadManager).toBe('function');
    });

    it('should return an array', async () => {
      const { getLeadGeneratorsForLeadManager } = await import('./db');
      // Use a non-existent ID to test the function returns empty array
      const result = await getLeadGeneratorsForLeadManager(99999);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Permission hierarchy validation', () => {
    it('admin should have broader access than lead_manager', async () => {
      const adminResult = await getViewableTeamMemberIds({
        teamRole: 'admin',
        teamMemberId: 1,
        tenantId: 1,
      });
      
      const lmResult = await getViewableTeamMemberIds({
        teamRole: 'lead_manager',
        teamMemberId: 1,
        tenantId: 1,
      });
      
      // Admin gets 'all', lead_manager gets a limited array
      expect(adminResult).toBe('all');
      expect(Array.isArray(lmResult)).toBe(true);
    });

    it('lead_generator should have narrower access than lead_manager', async () => {
      const lgResult = await getViewableTeamMemberIds({
        teamRole: 'lead_generator',
        teamMemberId: 42,
        tenantId: 1,
      });
      
      // Lead generator should only see themselves
      expect(Array.isArray(lgResult)).toBe(true);
      if (Array.isArray(lgResult)) {
        expect(lgResult).toEqual([42]);
      }
    });
  });
});
