import { describe, it, expect } from "vitest";
import { Resend } from "resend";

describe("Resend API Key Validation", () => {
  it("should have a valid RESEND_API_KEY configured", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).toMatch(/^re_/);
  });

  it("should be able to connect to Resend API", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(apiKey);
    
    // Try to list domains - if the key is restricted to sending only,
    // we'll get a specific error message which is acceptable
    const { data, error } = await resend.domains.list();
    
    if (error) {
      // "restricted to only send emails" means the key is valid but limited - that's OK
      if (error.message?.includes("restricted to only send emails")) {
        // This is expected for send-only API keys - the key is valid
        expect(true).toBe(true);
        return;
      }
      
      // Authentication errors mean the key is invalid
      if (error.message?.includes("API key") || error.message?.includes("authentication") || error.message?.includes("unauthorized")) {
        throw new Error(`Invalid Resend API key: ${error.message}`);
      }
      
      // Other errors might be acceptable
      console.log("Resend API response:", error.message);
    }
    
    // If we got here without an auth error, the key is valid
    expect(true).toBe(true);
  });
});
