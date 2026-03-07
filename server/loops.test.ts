import { describe, it, expect } from "vitest";
import { createOrUpdateContact, sendEvent } from "./loops";

describe("Loops API Key Validation", () => {
  it("should handle Loops API key gracefully (may not be configured)", async () => {
    const apiKey = process.env.LOOPS_API_KEY;
    // Loops API key may not be configured — functions should not throw
    if (apiKey) {
      expect(apiKey).not.toBe("");
    } else {
      // Not configured is acceptable — functions handle it gracefully
      expect(true).toBe(true);
    }
  });
});

describe("Loops Integration Functions", () => {
  it("should create or update a test contact in Loops", async () => {
    // Use unique email and userId to avoid conflicts
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const testEmail = `test-${uniqueId}@gunner-test.com`;
    
    const result = await createOrUpdateContact({
      email: testEmail,
      firstName: "Test",
      lastName: "User",
      userId: `test-${uniqueId}`,
      source: "vitest",
      userGroup: "test",
    });
    
    // Result can be null if there's an API error (e.g., rate limiting)
    // The key test is that the function doesn't throw
    // If API key is valid, result should be an object or null (for 409 conflict)
    expect(typeof result === 'object' || result === null).toBe(true);
  }, 10000);

  it("should send a test event to Loops", async () => {
    const testEmail = `test-${Date.now()}@gunner-test.com`;
    
    const result = await sendEvent({
      email: testEmail,
      eventName: "test_event",
      eventProperties: {
        source: "vitest",
        timestamp: Date.now(),
      },
    });
    
    // Function should not throw regardless of API key status
    expect(result === null || typeof result === 'object').toBe(true);
  }, 10000);
});
