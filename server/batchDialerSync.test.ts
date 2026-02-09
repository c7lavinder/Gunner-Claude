import { describe, it, expect } from "vitest";
import { fetchRecentCalls } from "./batchDialerService";

describe("BatchDialer Sync", () => {
  it("should fetch recent calls from BatchDialer API", async () => {
    // Test with a recent date (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    try {
      const response = await fetchRecentCalls({
        callDate: oneDayAgo.toISOString(),
        page: 1,
        pagelength: 10,
      });

      console.log("BatchDialer API Response:", {
        totalPages: response.totalPages,
        currentPage: response.page,
        itemsCount: response.items.length,
      });

      expect(response).toBeDefined();
      expect(response.items).toBeDefined();
      expect(Array.isArray(response.items)).toBe(true);
      
      if (response.items.length > 0) {
        const firstCall = response.items[0];
        console.log("Sample call:", {
          id: firstCall.id,
          agent: firstCall.agent,
          duration: firstCall.duration,
          disposition: firstCall.disposition,
          hasRecording: !!firstCall.callRecordUrl,
        });
      }
    } catch (error) {
      console.error("BatchDialer API Error:", error);
      throw error;
    }
  }, 60000); // 60 second timeout for API call
});
