import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("BatchDialer API Key Validation", () => {
  it("should validate BatchDialer API key with a simple endpoint", async () => {
    // Test with get campaigns endpoint (simpler than CDRs)
    const url = "https://app.batchdialer.com/api/campaigns";
    
    console.log("Testing BatchDialer API key...");
    
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-ApiKey": ENV.batchDialerApiKey,
          "Accept": "application/json",
        },
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("API Response successful:", {
        hasData: !!data,
        dataType: Array.isArray(data) ? "array" : typeof data,
        itemCount: Array.isArray(data) ? data.length : "N/A",
      });

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
    } catch (error) {
      console.error("BatchDialer API Error:", error);
      throw error;
    }
  }, 30000); // 30 second timeout
});
