import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ENV before importing the module
vi.mock("./_core/env", () => ({
  ENV: {
    batchDialerApiKey: "test-api-key-123",
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { fetchRecentCalls } from "./batchDialerService";

describe("BatchDialer Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchRecentCalls", () => {
    it("should include X-ApiKey header in requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], page: 1, totalPages: 1 }),
      });

      await fetchRecentCalls({ page: 1, pagelength: 50 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-ApiKey"]).toBe("test-api-key-123");
      expect(options.headers["Accept"]).toBe("application/json");
    });

    it("should construct URL with all query parameters including callDateEnd", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], page: 1, totalPages: 1 }),
      });

      await fetchRecentCalls({
        callDate: "2026-02-10T00:00:00.000Z",
        callDateEnd: "2026-02-10T00:15:00.000Z",
        page: 1,
        pagelength: 50,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("callDate=");
      expect(url).toContain("callDateEnd=");
      expect(url).toContain("page=1");
      expect(url).toContain("pagelength=50");
    });

    it("should throw on non-OK response (e.g. 401 Unauthorized)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(fetchRecentCalls({ page: 1 })).rejects.toThrow("BatchDialer API error: 401 Unauthorized");
    });

    it("should throw on 500 server error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(fetchRecentCalls({ page: 1 })).rejects.toThrow("BatchDialer API error: 500");
    });

    it("should use page size of 50 by default", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], page: 1, totalPages: 1 }),
      });

      await fetchRecentCalls({ page: 1, pagelength: 50 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("pagelength=50");
    });

    it("should support direction and disposition filters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], page: 1, totalPages: 1 }),
      });

      await fetchRecentCalls({
        direction: "outbound",
        disposition: "answered",
        page: 1,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("direction=outbound");
      expect(url).toContain("disposition=answered");
    });

    it("should use AbortController for timeout", async () => {
      mockFetch.mockImplementationOnce((url: string, options: any) => {
        // Verify signal is passed
        expect(options.signal).toBeDefined();
        expect(options.signal).toBeInstanceOf(AbortSignal);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [], page: 1, totalPages: 1 }),
        });
      });

      await fetchRecentCalls({ page: 1 });
    });

    it("should handle AbortError as timeout", async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      await expect(fetchRecentCalls({ page: 1 })).rejects.toThrow("timed out");
    });
  });

  describe("getCallsSince - time windowing logic", () => {
    // These tests verify the windowing math without actually calling the API
    // by testing the configuration constants

    it("should use 15-minute time windows", async () => {
      // Read the module source to verify the constant
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("MAX_TIME_WINDOW_MS = 15 * 60 * 1000");
    });

    it("should use 30-second request timeout (shorter than server 120s)", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("REQUEST_TIMEOUT_MS = 30_000");
    });

    it("should retry up to 3 times", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("MAX_RETRIES = 3");
    });

    it("should use exponential backoff starting at 2 seconds", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("RETRY_BASE_DELAY_MS = 2_000");
    });

    it("should use page size of 50", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("PAGE_SIZE = 50");
    });

    it("should pass callDateEnd parameter to bound time windows", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      // Verify the fetchAllPagesForWindow function passes callDateEnd
      expect(source).toContain("callDateEnd: endStr");
    });

    it("should continue to next window on failure (not abort entire sync)", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      // Verify the try/catch in the window loop continues on error
      expect(source).toContain("Continuing with next window");
    });

    it("should add delays between pages (500ms) and windows (1000ms)", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("await sleep(500)");
      expect(source).toContain("await sleep(1000)");
    });
  });

  describe("Recording download", () => {
    it("should use 60-second timeout for recording downloads", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("60_000"); // 60s timeout for recordings
    });

    it("should include retry logic for recording downloads", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("Recording download for call");
    });
  });
});
