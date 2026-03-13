import { test, expect } from "@playwright/test";

test.describe("Call Inbox", () => {
  test("call inbox page requires authentication", async ({ page }) => {
    await page.goto("/calls");
    await expect(page).toHaveURL(/login|signup/);
  });
});
