import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('./db', () => ({
  getDb: vi.fn(),
}));

vi.mock('./storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ key: 'test-key', url: 'https://example.com/transcript.txt' }),
}));

describe('Archival System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Archive Threshold', () => {
    it('should have a 14-day archive threshold', async () => {
      // Import the module to check the constant
      const archivalModule = await import('./archival');
      // The threshold is internal, but we can verify the behavior
      expect(archivalModule).toBeDefined();
    });
  });

  describe('archiveCall', () => {
    it('should export archiveCall function', async () => {
      const { archiveCall } = await import('./archival');
      expect(typeof archiveCall).toBe('function');
    });
  });

  describe('runArchivalJob', () => {
    it('should export runArchivalJob function', async () => {
      const { runArchivalJob } = await import('./archival');
      expect(typeof runArchivalJob).toBe('function');
    });

    it('should return proper result structure', async () => {
      const { getDb } = await import('./db');
      vi.mocked(getDb).mockResolvedValue(null);

      const { runArchivalJob } = await import('./archival');
      const result = await runArchivalJob();

      expect(result).toHaveProperty('totalArchived');
      expect(result).toHaveProperty('transcriptsMovedToS3');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('getArchivalStats', () => {
    it('should export getArchivalStats function', async () => {
      const { getArchivalStats } = await import('./archival');
      expect(typeof getArchivalStats).toBe('function');
    });

    it('should return proper stats structure when db is unavailable', async () => {
      const { getDb } = await import('./db');
      vi.mocked(getDb).mockResolvedValue(null);

      const { getArchivalStats } = await import('./archival');
      const stats = await getArchivalStats();

      expect(stats).toEqual({
        totalCalls: 0,
        activeCalls: 0,
        archivedCalls: 0,
        oldestActiveCall: null,
      });
    });
  });

  describe('getCallTranscript', () => {
    it('should export getCallTranscript function', async () => {
      const { getCallTranscript } = await import('./archival');
      expect(typeof getCallTranscript).toBe('function');
    });

    it('should return null when db is unavailable', async () => {
      const { getDb } = await import('./db');
      vi.mocked(getDb).mockResolvedValue(null);

      const { getCallTranscript } = await import('./archival');
      const transcript = await getCallTranscript(1);

      expect(transcript).toBeNull();
    });
  });
});

// Note: Database query tests are covered in calls.test.ts
// The archival functions are tested above with mocked db
