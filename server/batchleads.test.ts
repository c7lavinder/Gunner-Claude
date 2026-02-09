import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("BatchLeads API Integration", () => {
  it("should validate BatchLeads API key by fetching user usage stats", async () => {
    const apiKey = ENV.batchLeadsApiKey;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");

    const response = await fetch(
      "https://app.batchleads.io/api/v1/user/check-usage",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "api-key": apiKey,
        },
      }
    );

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe(1);
    expect(data.message).toBe("OK");
    expect(data.data).toBeDefined();
    expect(data.data.Properties).toBeDefined();
    expect(data.data.SubUsers).toBeDefined();
    
    console.log("BatchLeads API validation successful:");
    console.log(`Total properties: ${data.data.Properties.total_properties}`);
    console.log(`Total sub-users: ${data.data.SubUsers.total_sub_users}`);
  });
});
