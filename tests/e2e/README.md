# Gunner E2E Tests

## Setup (run once)
npx playwright install chromium

## Running tests
pnpm test:e2e              # run all E2E tests
pnpm test:e2e:ui           # open Playwright UI
PLAYWRIGHT_BASE_URL=https://gunner-app-production.up.railway.app pnpm test:e2e  # run against production

## Test coverage
- auth.spec.ts — login, signup, onboarding redirect
- crm.spec.ts — CRM Settings tab, connection flow
- calls.spec.ts — call list, grading trigger
- actions.spec.ts — action dialog, CRM write-back confirmation

## Adding tests
One file per feature area. Use page.getByRole() and page.getByTestId() — avoid CSS selectors.
