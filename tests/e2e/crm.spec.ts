import { test, expect } from "@playwright/test";

test.describe("CRM Settings", () => {
  test("CRM settings tab is accessible to authenticated admin", async ({ page }) => {
    // This test requires auth — in CI use a test account env var
    // PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD
    const email = process.env.PLAYWRIGHT_TEST_EMAIL;
    const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
    test.skip(!email || !password, "Skipping — PLAYWRIGHT_TEST_EMAIL/PASSWORD not set");

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/today|onboarding/, { timeout: 10000 });

    await page.goto("/settings?tab=crm");
    await expect(page.getByText(/GoHighLevel|CRM Connection|API Token/i)).toBeVisible();
  });
});
