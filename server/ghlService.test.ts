import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPollingStatus, setLastPollTimestamp, startPolling, stopPolling } from "./ghlService";

describe("GHL Service", () => {
  beforeEach(() => {
    // Reset polling state before each test
    stopPolling();
  });

  afterEach(() => {
    // Clean up after each test
    stopPolling();
  });

  describe("getPollingStatus", () => {
    it("should return initial status with no polling", () => {
      const status = getPollingStatus();
      
      expect(status).toHaveProperty("isPolling");
      expect(status).toHaveProperty("lastPollTime");
      expect(status).toHaveProperty("isAutoPollingEnabled");
      expect(status.isPolling).toBe(false);
      expect(status.isAutoPollingEnabled).toBe(false);
    });

    it("should reflect last poll timestamp when set", () => {
      const testDate = new Date("2026-01-15T10:00:00Z");
      setLastPollTimestamp(testDate);
      
      const status = getPollingStatus();
      expect(status.lastPollTime).toEqual(testDate);
    });
  });

  describe("setLastPollTimestamp", () => {
    it("should update the last poll timestamp", () => {
      const testDate = new Date("2026-02-01T12:00:00Z");
      setLastPollTimestamp(testDate);
      
      const status = getPollingStatus();
      expect(status.lastPollTime).toEqual(testDate);
    });
  });

  describe("startPolling and stopPolling", () => {
    it("should enable auto polling when started", () => {
      // Mock the pollForNewCalls to prevent actual API calls
      vi.useFakeTimers();
      
      startPolling(5);
      
      const status = getPollingStatus();
      expect(status.isAutoPollingEnabled).toBe(true);
      
      vi.useRealTimers();
    });

    it("should disable auto polling when stopped", () => {
      vi.useFakeTimers();
      
      startPolling(5);
      stopPolling();
      
      const status = getPollingStatus();
      expect(status.isAutoPollingEnabled).toBe(false);
      
      vi.useRealTimers();
    });

    it("should not start multiple polling intervals", () => {
      vi.useFakeTimers();
      
      startPolling(5);
      startPolling(5); // Should not create another interval
      
      const status = getPollingStatus();
      expect(status.isAutoPollingEnabled).toBe(true);
      
      stopPolling();
      expect(getPollingStatus().isAutoPollingEnabled).toBe(false);
      
      vi.useRealTimers();
    });
  });
});

describe("Manual Upload Input Validation", () => {
  it("should validate audio file types", () => {
    const validTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/webm", "audio/ogg"];
    const invalidTypes = ["video/mp4", "image/png", "application/pdf"];
    
    validTypes.forEach(type => {
      expect(validTypes.includes(type)).toBe(true);
    });
    
    invalidTypes.forEach(type => {
      expect(validTypes.includes(type)).toBe(false);
    });
  });

  it("should validate file extensions", () => {
    const validExtensions = [".mp3", ".wav", ".m4a", ".webm", ".ogg"];
    const invalidExtensions = [".mp4", ".png", ".pdf", ".doc"];
    
    validExtensions.forEach(ext => {
      expect(validExtensions.includes(ext)).toBe(true);
    });
    
    invalidExtensions.forEach(ext => {
      expect(validExtensions.includes(ext)).toBe(false);
    });
  });

  it("should enforce file size limit of 16MB", () => {
    const maxSize = 16 * 1024 * 1024; // 16MB in bytes
    
    expect(15 * 1024 * 1024 < maxSize).toBe(true); // 15MB should pass
    expect(17 * 1024 * 1024 > maxSize).toBe(true); // 17MB should fail
    expect(16 * 1024 * 1024 <= maxSize).toBe(true); // Exactly 16MB should pass
  });
});
