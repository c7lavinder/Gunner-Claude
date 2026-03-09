export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Return the login page URL.
// Previously used Manus OAuth portal (VITE_OAUTH_PORTAL_URL) — removed after migration.
// The app now handles auth via its own /login page with Google OAuth + email/password.
export const getLoginUrl = () => "/login";
