import { describe, it, expect } from "vitest";
import { fetchRecentCalls } from "./batchDialerService";

describe("BatchDialer API Integration", () => {
  it("should successfully authenticate and fetch recent calls", async () => {
    // Test API key by fetching recent calls with minimal parameters
    const response = await fetchRecentCalls({
      pagelength: 1, // Only fetch 1 record to test authentication
    });

    // Verify response structure
    expect(response).toHaveProperty("items");
    expect(response).toHaveProperty("page");
    expect(response).toHaveProperty("totalPages");
    expect(Array.isArray(response.items)).toBe(true);
    
    console.log(`✅ BatchDialer API authenticated successfully. Found ${response.totalPages} pages of calls.`);
  }, 30000); // 30 second timeout for API call
});
