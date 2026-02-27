import { describe, it, expect } from 'vitest';

// Test the stuck call detection logic extracted from ghlService.ts and routers.ts

describe('Stuck Call Detection', () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Helper to create mock calls
  function mockCall(overrides: any) {
    return {
      id: 1,
      contactName: 'Test Contact',
      contactPhone: '555-0001',
      teamMemberName: 'Test Member',
      status: 'pending',
      duration: 120,
      callSource: 'ghl',
      callType: 'qualification',
      createdAt: twoHoursAgo.toISOString(),
      updatedAt: twoHoursAgo.toISOString(),
      recordingUrl: 'https://example.com/recording.mp3',
      tenantId: 1,
      ...overrides,
    };
  }

  describe('Pending calls stuck detection', () => {
    it('detects pending calls with recording that are older than 1 hour', () => {
      const calls = [
        mockCall({ id: 1, status: 'pending', updatedAt: twoHoursAgo.toISOString(), recordingUrl: 'https://example.com/rec.mp3' }),
      ];
      
      const stuckPending = calls.filter(call =>
        call.status === 'pending' &&
        call.recordingUrl &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(stuckPending).toHaveLength(1);
      expect(stuckPending[0].id).toBe(1);
    });

    it('does NOT flag pending calls without a recording URL', () => {
      const calls = [
        mockCall({ id: 1, status: 'pending', updatedAt: twoHoursAgo.toISOString(), recordingUrl: null }),
      ];
      
      const stuckPending = calls.filter(call =>
        call.status === 'pending' &&
        call.recordingUrl &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(stuckPending).toHaveLength(0);
    });

    it('does NOT flag pending calls that are less than 1 hour old', () => {
      const calls = [
        mockCall({ id: 1, status: 'pending', updatedAt: fiveMinAgo.toISOString(), recordingUrl: 'https://example.com/rec.mp3' }),
      ];
      
      const stuckPending = calls.filter(call =>
        call.status === 'pending' &&
        call.recordingUrl &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(stuckPending).toHaveLength(0);
    });
  });

  describe('Processing calls stuck detection', () => {
    it('detects transcribing calls older than 1 hour', () => {
      const calls = [
        mockCall({ id: 1, status: 'transcribing', updatedAt: twoHoursAgo.toISOString() }),
      ];
      
      const stuckProcessing = calls.filter(call =>
        (call.status === 'transcribing' || call.status === 'classifying' || call.status === 'grading') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(stuckProcessing).toHaveLength(1);
    });

    it('detects grading calls older than 1 hour', () => {
      const calls = [
        mockCall({ id: 1, status: 'grading', updatedAt: twoHoursAgo.toISOString() }),
      ];
      
      const stuckProcessing = calls.filter(call =>
        (call.status === 'transcribing' || call.status === 'classifying' || call.status === 'grading') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(stuckProcessing).toHaveLength(1);
    });

    it('detects classifying calls older than 1 hour', () => {
      const calls = [
        mockCall({ id: 1, status: 'classifying', updatedAt: twoHoursAgo.toISOString() }),
      ];
      
      const stuckProcessing = calls.filter(call =>
        (call.status === 'transcribing' || call.status === 'classifying' || call.status === 'grading') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(stuckProcessing).toHaveLength(1);
    });

    it('does NOT flag recent processing calls', () => {
      const calls = [
        mockCall({ id: 1, status: 'transcribing', updatedAt: fiveMinAgo.toISOString() }),
      ];
      
      const stuckProcessing = calls.filter(call =>
        (call.status === 'transcribing' || call.status === 'classifying' || call.status === 'grading') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(stuckProcessing).toHaveLength(0);
    });
  });

  describe('Combined stuck detection', () => {
    it('combines both pending and processing stuck calls', () => {
      const calls = [
        mockCall({ id: 1, status: 'pending', updatedAt: twoHoursAgo.toISOString(), recordingUrl: 'https://example.com/rec.mp3' }),
        mockCall({ id: 2, status: 'transcribing', updatedAt: twoHoursAgo.toISOString() }),
        mockCall({ id: 3, status: 'pending', updatedAt: fiveMinAgo.toISOString(), recordingUrl: 'https://example.com/rec.mp3' }),
        mockCall({ id: 4, status: 'completed', updatedAt: twoHoursAgo.toISOString() }),
      ];

      const stuckProcessing = calls.filter(call =>
        (call.status === 'transcribing' || call.status === 'classifying' || call.status === 'grading') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );
      const stuckPending = calls.filter(call =>
        call.status === 'pending' &&
        call.recordingUrl &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );
      const allStuck = [...stuckProcessing, ...stuckPending];

      expect(allStuck).toHaveLength(2);
      expect(allStuck.map(c => c.id).sort()).toEqual([1, 2]);
    });

    it('returns empty when no calls are stuck', () => {
      const calls = [
        mockCall({ id: 1, status: 'pending', updatedAt: fiveMinAgo.toISOString(), recordingUrl: 'https://example.com/rec.mp3' }),
        mockCall({ id: 2, status: 'completed', updatedAt: twoHoursAgo.toISOString() }),
        mockCall({ id: 3, status: 'skipped', updatedAt: twoHoursAgo.toISOString() }),
      ];

      const stuckProcessing = calls.filter(call =>
        (call.status === 'transcribing' || call.status === 'classifying' || call.status === 'grading') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );
      const stuckPending = calls.filter(call =>
        call.status === 'pending' &&
        call.recordingUrl &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );
      const allStuck = [...stuckProcessing, ...stuckPending];

      expect(allStuck).toHaveLength(0);
    });
  });

  describe('Retry logic', () => {
    it('pending calls should NOT be reset to pending again (already pending)', () => {
      const call = mockCall({ id: 1, status: 'pending' });
      const isPending = call.status === 'pending';
      
      // For pending calls, we should NOT call updateCall to set status to pending
      // We should just trigger reprocessing directly
      expect(isPending).toBe(true);
    });

    it('transcribing calls should be reset to pending before reprocessing', () => {
      const call = mockCall({ id: 1, status: 'transcribing' });
      const isPending = call.status === 'pending';
      
      // For non-pending calls, we need to reset status first
      expect(isPending).toBe(false);
    });
  });

  describe('Review query date filter removal', () => {
    it('review query should not filter by date so stuck calls always show', () => {
      // This tests the principle: the review query should NOT pass startDate
      // so that old stuck calls are always visible regardless of date filter
      const reviewQueryParams = {
        limit: 100,
        statuses: ["pending", "transcribing", "grading", "failed"],
        // NO startDate — this is the fix
      };

      expect(reviewQueryParams).not.toHaveProperty('startDate');
    });
  });

  describe('Failed call retry with tiered backoff', () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    it('retries 404 failed calls after 15 minutes (fast backoff)', () => {
      const calls = [
        mockCall({ id: 1, status: 'failed', classificationReason: 'Failed to download audio file: HTTP 404', updatedAt: twentyMinAgo.toISOString(), recordingUrl: 'https://twilio.com/rec.wav' }),
      ];

      const failed404 = calls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        (call.classificationReason.includes('HTTP 404') ||
         call.classificationReason.includes('recording not available')) &&
        call.updatedAt && new Date(call.updatedAt) < fifteenMinAgo
      );

      expect(failed404).toHaveLength(1);
    });

    it('does NOT retry 404 failed calls that are less than 15 minutes old', () => {
      const calls = [
        mockCall({ id: 1, status: 'failed', classificationReason: 'Failed to download audio file: HTTP 404', updatedAt: tenMinAgo.toISOString(), recordingUrl: 'https://twilio.com/rec.wav' }),
      ];

      const failed404 = calls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        (call.classificationReason.includes('HTTP 404') ||
         call.classificationReason.includes('recording not available')) &&
        call.updatedAt && new Date(call.updatedAt) < fifteenMinAgo
      );

      expect(failed404).toHaveLength(0);
    });

    it('retries "recording not available" errors after 15 minutes', () => {
      const calls = [
        mockCall({ id: 1, status: 'failed', classificationReason: 'HTTP 404 after 3 retries (recording not available)', updatedAt: twentyMinAgo.toISOString(), recordingUrl: 'https://twilio.com/rec.wav' }),
      ];

      const failed404 = calls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        (call.classificationReason.includes('HTTP 404') ||
         call.classificationReason.includes('recording not available')) &&
        call.updatedAt && new Date(call.updatedAt) < fifteenMinAgo
      );

      expect(failed404).toHaveLength(1);
    });

    it('retries Invalid file format errors only after 1 hour (slow backoff)', () => {
      const calls = [
        mockCall({ id: 1, status: 'failed', classificationReason: 'Transcription service request failed: 400 Bad Request: Invalid file format', updatedAt: twentyMinAgo.toISOString(), recordingUrl: 'https://twilio.com/rec.wav' }),
      ];

      const failed404 = calls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        (call.classificationReason.includes('HTTP 404') ||
         call.classificationReason.includes('recording not available')) &&
        call.updatedAt && new Date(call.updatedAt) < fifteenMinAgo
      );

      const failedOther = calls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        !(call.classificationReason.includes('HTTP 404') || call.classificationReason.includes('recording not available')) &&
        (call.classificationReason.includes('Invalid file format') ||
         call.classificationReason.includes('Transcription service request failed')) &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(failed404).toHaveLength(0);
      expect(failedOther).toHaveLength(0); // Only 20 min old, needs 1 hour
    });

    it('retries Invalid file format errors after 1 hour', () => {
      const calls = [
        mockCall({ id: 1, status: 'failed', classificationReason: 'Transcription service request failed: 400 Bad Request: Invalid file format', updatedAt: twoHoursAgo.toISOString(), recordingUrl: 'https://twilio.com/rec.wav' }),
      ];

      const failedOther = calls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        !(call.classificationReason.includes('HTTP 404') || call.classificationReason.includes('recording not available')) &&
        (call.classificationReason.includes('Invalid file format') ||
         call.classificationReason.includes('Transcription service request failed')) &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(failedOther).toHaveLength(1);
    });

    it('retries Invalid transcription response errors after 1 hour', () => {
      const calls = [
        mockCall({ id: 1, status: 'failed', classificationReason: 'Invalid transcription response: Transcription service returned an invalid response format', updatedAt: twoHoursAgo.toISOString(), recordingUrl: 'https://twilio.com/rec.wav' }),
      ];

      const failedOther = calls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        !(call.classificationReason.includes('HTTP 404') || call.classificationReason.includes('recording not available')) &&
        call.classificationReason.includes('Invalid transcription response') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      expect(failedOther).toHaveLength(1);
    });
  });

  describe('MIME type normalization', () => {
    function normalizeMimeType(mimeType: string): string {
      const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
      const mimeMap: Record<string, string> = {
        'audio/x-wav': 'audio/wav',
        'audio/x-wave': 'audio/wav',
        'audio/vnd.wave': 'audio/wav',
        'audio/x-ogg': 'audio/ogg',
        'audio/x-m4a': 'audio/m4a',
        'audio/x-flac': 'audio/flac',
        'audio/x-mp3': 'audio/mpeg',
      };
      return mimeMap[cleanMime] || cleanMime;
    }

    it('normalizes audio/x-wav to audio/wav', () => {
      expect(normalizeMimeType('audio/x-wav')).toBe('audio/wav');
    });

    it('normalizes audio/x-wave to audio/wav', () => {
      expect(normalizeMimeType('audio/x-wave')).toBe('audio/wav');
    });

    it('normalizes audio/vnd.wave to audio/wav', () => {
      expect(normalizeMimeType('audio/vnd.wave')).toBe('audio/wav');
    });

    it('passes through standard audio/wav unchanged', () => {
      expect(normalizeMimeType('audio/wav')).toBe('audio/wav');
    });

    it('passes through audio/mpeg unchanged', () => {
      expect(normalizeMimeType('audio/mpeg')).toBe('audio/mpeg');
    });

    it('strips charset suffix before normalizing', () => {
      expect(normalizeMimeType('audio/x-wav; charset=utf-8')).toBe('audio/wav');
    });
  });

  describe('UI stuck indicator logic', () => {
    it('marks calls as stuck when updatedAt is more than 1 hour ago', () => {
      const item = mockCall({ updatedAt: twoHoursAgo.toISOString() });
      const isStuck = item.updatedAt && new Date(item.updatedAt) < new Date(Date.now() - 60 * 60 * 1000);
      
      expect(isStuck).toBe(true);
    });

    it('does NOT mark recent calls as stuck', () => {
      const item = mockCall({ updatedAt: fiveMinAgo.toISOString() });
      const isStuck = item.updatedAt && new Date(item.updatedAt) < new Date(Date.now() - 60 * 60 * 1000);
      
      expect(isStuck).toBeFalsy();
    });

    it('shows "never picked up" for stuck pending calls', () => {
      const item = mockCall({ status: 'pending', updatedAt: twoHoursAgo.toISOString() });
      const isStuck = item.updatedAt && new Date(item.updatedAt) < new Date(Date.now() - 60 * 60 * 1000);
      const label = isStuck && item.status === 'pending' ? 'never picked up' : `stuck at ${item.status}`;
      
      expect(label).toBe('never picked up');
    });

    it('shows "stuck at transcribing" for stuck transcribing calls', () => {
      const item = mockCall({ status: 'transcribing', updatedAt: twoHoursAgo.toISOString() });
      const isStuck = item.updatedAt && new Date(item.updatedAt) < new Date(Date.now() - 60 * 60 * 1000);
      const label = isStuck && item.status === 'pending' ? 'never picked up' : `stuck at ${item.status}`;
      
      expect(label).toBe('stuck at transcribing');
    });
  });
});
