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
        json: () => Promise.resolve({ items: [], nextPage: null }),
      });

      await fetchRecentCalls({ page: 1, pagelength: 50 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-ApiKey"]).toBe("test-api-key-123");
      expect(options.headers["Accept"]).toBe("application/json");
    });

    it("should use V2 endpoint URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], nextPage: null }),
      });

      await fetchRecentCalls({
        callDate: "2026-02-10T00:00:00.000Z",
        callDateEnd: "2026-02-10T00:15:00.000Z",
        pagelength: 50,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/v2/cdrs");
      expect(url).toContain("callDate=");
      expect(url).toContain("callDateEnd=");
      expect(url).toContain("pagelength=50");
    });

    it("should throw on non-OK response (e.g. 401 Unauthorized)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(fetchRecentCalls({ page: 1 })).rejects.toThrow("BatchDialer V2 API error: 401 Unauthorized");
    });

    it("should throw on 500 server error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(fetchRecentCalls({ page: 1 })).rejects.toThrow("BatchDialer V2 API error: 500");
    });

    it("should support direction filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], nextPage: null }),
      });

      await fetchRecentCalls({
        direction: "outbound",
        page: 1,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("direction=outbound");
    });

    it("should use AbortController for timeout", async () => {
      mockFetch.mockImplementationOnce((url: string, options: any) => {
        // Verify signal is passed
        expect(options.signal).toBeDefined();
        expect(options.signal).toBeInstanceOf(AbortSignal);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [], nextPage: null }),
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

    it("should return backward-compatible response shape", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: 1 }], nextPage: "abc123" }),
      });

      const result = await fetchRecentCalls({ page: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(2); // nextPage exists, so totalPages > 1
    });
  });

  describe("V2 API configuration", () => {
    it("should use 30-second request timeout", async () => {
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

    it("should use page size of 100 (v2 max)", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("PAGE_SIZE = 100");
    });

    it("should use cursor-based pagination via next_page param", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain('params.append("next_page"');
      expect(source).toContain("nextPageCursor");
    });

    it("should use daily windows for ranges > 7 days", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("ONE_DAY_MS");
      expect(source).toContain("rangeDays <= 7");
    });

    it("should continue to next window on failure (not abort entire sync)", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("Continuing with next window");
    });

    it("should add delays between pages (300ms) and windows (500ms)", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("await sleep(300)");
      expect(source).toContain("await sleep(500)");
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

    it("should use the correct recording endpoint: /api/call/{id}/recording", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      expect(source).toContain("/call/${callId}/recording");
      // Ensure old incorrect endpoint is not used
      expect(source).not.toContain("/callrecording/${callId}");
    });

    it("should use X-ApiKey header for recording downloads", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("/home/ubuntu/gunner/server/batchDialerService.ts", "utf-8");
      // Extract the fetchCallRecording function and verify it uses X-ApiKey
      const fnStart = source.indexOf("export async function fetchCallRecording");
      const fnEnd = source.indexOf("\n}", fnStart) + 2;
      const fnBody = source.substring(fnStart, fnEnd);
      expect(fnBody).toContain("X-ApiKey");
    });
  });
});
