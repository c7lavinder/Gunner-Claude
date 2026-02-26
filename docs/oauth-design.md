# GHL OAuth 2.0 Migration Design

## GHL OAuth Flow Summary
1. **Register App** on GHL Marketplace (Client ID + Client Secret)
2. **Install URL** → user clicks → GHL shows location picker → redirects to callback with `code`
3. **Exchange code** → POST `https://services.leadconnectorhq.com/oauth/token` with `grant_type=authorization_code`
4. **Receive tokens** → access_token (24h), refresh_token (1 year or until used)
5. **Refresh** → POST same endpoint with `grant_type=refresh_token` → new access + refresh token pair
6. **Token types**: Location (sub-account) or Company (agency). We need Location tokens.

## Key GHL OAuth Details
- Token endpoint: `https://services.leadconnectorhq.com/oauth/token`
- Access token expires: ~24 hours (86399 seconds)
- Refresh token: valid 1 year OR until used (single-use, returns new refresh token)
- Target user: Sub-account (Location)
- Response includes: locationId, companyId, userId, scopes
- App Install webhook fires when app is installed (provides locationId, companyId)

## Current Architecture (API Key Model)
- `tenants.crmConfig` stores JSON: `{ ghlApiKey, ghlLocationId, ... }`
- `getCredentialsForTenant(tenantId)` returns `{ apiKey, locationId }`
- `ghlFetch(creds, path, method, body)` uses `Bearer ${creds.apiKey}`
- Three separate ghlFetch implementations: ghlActions.ts, ghlService.ts, opportunityDetection.ts
- ghlService.ts uses inline fetch with `creds.apiKey` in ~8 places

## Target Architecture (OAuth + API Key Fallback)

### New Table: `ghl_oauth_tokens`
- id, tenantId, locationId, companyId, ghlUserId
- accessToken, refreshToken, expiresAt, scopes
- createdAt, updatedAt

### New Service: `server/ghlOAuth.ts`
- `getGHLAccessToken(tenantId)` → returns valid access token (auto-refreshes if expired)
- `exchangeCodeForTokens(code, redirectUri)` → exchanges auth code for tokens
- `refreshAccessToken(tenantId)` → refreshes expired token
- `revokeTokens(tenantId)` → removes tokens on disconnect

### Unified Auth: `getCredentialsForTenant(tenantId)` Updated
- Check ghl_oauth_tokens table first → use OAuth token
- Fall back to crmConfig.ghlApiKey → use API key
- Return same `{ apiKey, locationId }` interface (apiKey = OAuth access token)
- This means ALL downstream code works unchanged

### OAuth Endpoints
- `GET /api/ghl/install` → redirects to GHL authorization URL
- `GET /api/ghl/callback` → exchanges code, stores tokens, links tenant

### Onboarding Changes
- Add "Connect with GoHighLevel" button that opens install URL
- Keep API key input as fallback (collapsed/secondary)
- After OAuth callback, auto-populate locationId from token response

## Required Scopes
Based on current API usage:
- contacts.readonly, contacts.write
- conversations.readonly, conversations/message.write
- opportunities.readonly, opportunities.write
- locations.readonly
- users.readonly
- calendars.readonly, calendars.write, calendars/events.readonly, calendars/events.write
- workflows.readonly (if needed)

## Environment Variables Needed
- GHL_CLIENT_ID: Marketplace app client ID
- GHL_CLIENT_SECRET: Marketplace app client secret
