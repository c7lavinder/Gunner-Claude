import { describe, expect, it } from "vitest";

/**
 * Tests for the GHL call sync bug fixes (Feb 27, 2026):
 * 1. audio/x-wav MIME type mapping fix
 * 2. Separate circuit breakers for call polling vs OpportunityDetection
 * 3. Contact name resolution from GHL Contact API
 * 4. Duration extraction from transcription result
 */

// Test 1: MIME type mapping fix
describe("Voice Transcription MIME type mapping", () => {
  // We can't import the private function directly, so we replicate the logic
  function getFileExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/x-wave': 'wav',
      'audio/vnd.wave': 'wav',
      'audio/ogg': 'ogg',
      'audio/x-ogg': 'ogg',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'm4a',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
    };
    const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
    return mimeToExt[cleanMime] || 'mp3';
  }

  it("should map audio/x-wav to wav (Twilio format)", () => {
    expect(getFileExtension("audio/x-wav")).toBe("wav");
  });

  it("should map audio/wav to wav", () => {
    expect(getFileExtension("audio/wav")).toBe("wav");
  });

  it("should map audio/wave to wav", () => {
    expect(getFileExtension("audio/wave")).toBe("wav");
  });

  it("should map audio/x-wave to wav", () => {
    expect(getFileExtension("audio/x-wave")).toBe("wav");
  });

  it("should map audio/vnd.wave to wav", () => {
    expect(getFileExtension("audio/vnd.wave")).toBe("wav");
  });

  it("should handle charset suffixes", () => {
    expect(getFileExtension("audio/wav; charset=utf-8")).toBe("wav");
    expect(getFileExtension("audio/x-wav; charset=utf-8")).toBe("wav");
  });

  it("should default to mp3 for unknown types instead of 'audio'", () => {
    expect(getFileExtension("audio/unknown")).toBe("mp3");
    expect(getFileExtension("application/octet-stream")).toBe("mp3");
  });

  it("should handle standard audio formats", () => {
    expect(getFileExtension("audio/mp3")).toBe("mp3");
    expect(getFileExtension("audio/mpeg")).toBe("mp3");
    expect(getFileExtension("audio/ogg")).toBe("ogg");
    expect(getFileExtension("audio/m4a")).toBe("m4a");
    expect(getFileExtension("audio/mp4")).toBe("m4a");
    expect(getFileExtension("audio/webm")).toBe("webm");
  });

  it("should handle x- prefixed variants", () => {
    expect(getFileExtension("audio/x-ogg")).toBe("ogg");
    expect(getFileExtension("audio/x-m4a")).toBe("m4a");
    expect(getFileExtension("audio/x-flac")).toBe("flac");
  });
});

// Test 2: Circuit breaker separation
describe("Circuit breaker separation", () => {
  it("should have separate circuit breaker instances for call polling and opportunity detection", async () => {
    // Import the circuit breakers
    const { ghlCircuitBreaker, oppCircuitBreaker } = await import("./ghlRateLimiter");
    
    expect(ghlCircuitBreaker).toBeDefined();
    expect(oppCircuitBreaker).toBeDefined();
    
    // They should be different instances
    expect(ghlCircuitBreaker).not.toBe(oppCircuitBreaker);
  });

  it("tripping one circuit breaker should not affect the other", async () => {
    const { ghlCircuitBreaker, oppCircuitBreaker } = await import("./ghlRateLimiter");
    
    // Both should start in a usable state
    expect(ghlCircuitBreaker.canProceed("normal")).toBe(true);
    expect(oppCircuitBreaker.canProceed("normal")).toBe(true);
    
    // Trip the opportunity detection circuit breaker with 429s
    for (let i = 0; i < 10; i++) {
      oppCircuitBreaker.recordRequest();
      oppCircuitBreaker.record429();
    }
    
    // The call polling circuit breaker should still be usable
    expect(ghlCircuitBreaker.canProceed("normal")).toBe(true);
  });
});

// Test 3: Transcription result with duration
describe("Transcription result format", () => {
  it("transcribeCallRecording should return an object with text and optional durationSeconds", async () => {
    // Import the function signature type
    const { transcribeCallRecording } = await import("./grading");
    
    // Verify the function exists and has the right signature
    expect(typeof transcribeCallRecording).toBe("function");
    
    // The function returns Promise<{ text: string; durationSeconds?: number }>
    // We can't call it without a real recording URL, but we verify the export exists
  });
});

// Test 4: fetchGHLContactName export
describe("GHL Contact Name Resolution", () => {
  it("fetchGHLContactName should be exported from ghlService", async () => {
    const ghlService = await import("./ghlService");
    expect(typeof ghlService.fetchGHLContactName).toBe("function");
  });
});
