import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads with correct title", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Gunner/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("button", { name: /sign up|create account/i })).toBeVisible();
  });

  test("unauthenticated user redirected from dashboard to login", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/login|signup/);
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("notreal@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
  });
});
