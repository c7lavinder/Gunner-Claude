import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the no-recording retry logic in retryStuckCalls.
 * 
 * The core issue: When GHL sync finds a call with meaningful duration (>30s)
 * but the recording API returns 404, the call gets saved as "skipped" with no
 * recordingUrl. The retryStuckCalls function should now detect these and
 * automatically attempt to re-fetch the recording via resyncCallRecording.
 */

// Mock data for testing the filter logic
const makeCall = (overrides: Partial<{
  id: number;
  status: string;
  recordingUrl: string | null;
  ghlCallId: string | null;
  duration: number;
  classificationReason: string | null;
  updatedAt: Date;
  createdAt: Date;
  contactName: string;
}> = {}) => ({
  id: overrides.id ?? 1,
  status: overrides.status ?? "skipped",
  recordingUrl: 'recordingUrl' in overrides ? overrides.recordingUrl : null,
  ghlCallId: 'ghlCallId' in overrides ? overrides.ghlCallId : "abc123",
  duration: overrides.duration ?? 139,
  classificationReason: 'classificationReason' in overrides ? overrides.classificationReason : "No recording available from GHL (call 139s with Test Contact)",
  updatedAt: overrides.updatedAt ?? new Date(Date.now() - 20 * 60 * 1000), // 20 min ago
  createdAt: overrides.createdAt ?? new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
  contactName: overrides.contactName ?? "Test Contact",
});

// The filter logic extracted from retryStuckCalls for testability
function filterSkippedNoRecording(allCalls: ReturnType<typeof makeCall>[]) {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  return allCalls.filter((call: any) =>
    call.status === 'skipped' &&
    !call.recordingUrl &&
    call.ghlCallId && // Must be a GHL call to re-fetch
    call.duration && call.duration > 30 && // Only retry calls with meaningful duration
    call.classificationReason &&
    call.classificationReason.includes('No recording available') &&
    call.updatedAt && new Date(call.updatedAt) < fifteenMinAgo &&
    call.createdAt && new Date(call.createdAt) > sixHoursAgo // Only retry recent calls (within 6 hours)
  );
}

describe("No-Recording Retry Filter Logic", () => {
  it("should match a skipped call with no recording, meaningful duration, and recent creation", () => {
    const calls = [makeCall()];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("should NOT match calls with short duration (<=30s)", () => {
    const calls = [makeCall({ duration: 15 })];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should NOT match calls that already have a recording URL", () => {
    const calls = [makeCall({ recordingUrl: "https://s3.example.com/recording.mp3" })];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should NOT match calls without a GHL call ID (e.g., BatchDialer calls)", () => {
    // In the DB, ghlCallId is null for non-GHL calls. The filter checks `call.ghlCallId` which
    // is falsy for null/undefined/empty string.
    const calls = [makeCall({ ghlCallId: null })]; 
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should NOT match calls that were updated less than 15 minutes ago", () => {
    const calls = [makeCall({ updatedAt: new Date(Date.now() - 5 * 60 * 1000) })]; // 5 min ago
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should NOT match calls created more than 6 hours ago", () => {
    const calls = [makeCall({ createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000) })]; // 8 hours ago
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should NOT match calls with a different classification reason", () => {
    const calls = [makeCall({ classificationReason: "Could not match team member (GHL userId: abc)" })];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should NOT match calls with status other than skipped", () => {
    const calls = [makeCall({ status: "completed" })];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should NOT match calls with status 'failed' (those are handled by the existing retry logic)", () => {
    const calls = [makeCall({ status: "failed" })];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(0);
  });

  it("should match the Brent Walker scenario: 139s call, skipped, no recording, GHL source", () => {
    const brentWalkerCall = makeCall({
      id: 2820145,
      duration: 139,
      contactName: "Brent Walker",
      ghlCallId: "XKJvNVktbjqXHHv2L0bx",
      classificationReason: "No recording available from GHL (call 139s with Brent Walker)",
      updatedAt: new Date(Date.now() - 20 * 60 * 1000),
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    const result = filterSkippedNoRecording([brentWalkerCall]);
    expect(result).toHaveLength(1);
    expect(result[0].contactName).toBe("Brent Walker");
  });

  it("should match multiple eligible calls from a batch", () => {
    const calls = [
      makeCall({ id: 1, duration: 60 }),
      makeCall({ id: 2, duration: 15 }), // too short
      makeCall({ id: 3, duration: 200, recordingUrl: "https://s3.example.com/rec.mp3" }), // has recording
      makeCall({ id: 4, duration: 90 }),
    ];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toEqual([1, 4]);
  });

  it("should handle auto-retry failure message in classificationReason", () => {
    // After a failed auto-retry, the classificationReason is updated
    const calls = [makeCall({
      classificationReason: "No recording available from GHL (call 139s with Test) — auto-retry failed: Recording no longer available",
    })];
    const result = filterSkippedNoRecording(calls);
    expect(result).toHaveLength(1); // Should still match since it contains "No recording available"
  });
});
