import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { downloadAndCompressAudio } from "./audioCompression";

describe("Audio Compression", () => {
  it("should handle small audio files without compression", async () => {
    // Create a small mock audio file (1MB)
    const smallBuffer = Buffer.alloc(1024 * 1024, 0);
    
    // Mock fetch to return small file
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "audio/mpeg"]]),
        arrayBuffer: () => Promise.resolve(smallBuffer.buffer),
      } as Response)
    );

    const result = await downloadAndCompressAudio("http://example.com/small.mp3");
    
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.wasCompressed).toBe(false);
      expect(result.originalSizeMB).toBeCloseTo(1, 0.1);
      expect(result.finalSizeMB).toBeCloseTo(1, 0.1);
    }
  });

  it("should attempt to send large files even if compression fails", async () => {
    // Create a large mock audio file (20MB)
    const largeBuffer = Buffer.alloc(20 * 1024 * 1024, 0);
    
    // Mock fetch to return large file
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "audio/mpeg"]]),
        arrayBuffer: () => Promise.resolve(largeBuffer.buffer),
      } as Response)
    );

    const result = await downloadAndCompressAudio("http://example.com/large.mp3");
    
    // Should not error - should attempt fallback
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      // Should have the original buffer (fallback behavior)
      expect(result.buffer).toBeDefined();
      expect(result.originalSizeMB).toBeCloseTo(20, 0.1);
      // If FFmpeg is not available, finalSizeMB should equal originalSizeMB
      expect(result.finalSizeMB).toBeGreaterThanOrEqual(result.originalSizeMB * 0.9);
    }
  });

  it("should handle download errors gracefully", async () => {
    // Mock fetch to return error
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response)
    );

    const result = await downloadAndCompressAudio("http://example.com/missing.mp3");
    
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Failed to download audio");
    }
  });
});
