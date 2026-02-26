# Webhook Scalability Audit

## Current Architecture
- Webhook URL: `{origin}/api/webhook/ghl` — uses the deployed domain
- Onboarding shows this URL to users and asks them to configure it in their GHL app
- Each user/tenant would need to configure the webhook in their own GHL account

## Key Question: Is this per-user or per-app?

### GHL OAuth/Marketplace App Model
- If Gunner is a GHL Marketplace app, webhooks are configured ONCE at the app level
- All locations (sub-accounts) that install the app automatically get webhooks
- Users don't need to do anything — it's invisible to them

### GHL Private Integration Model (current setup)
- Each user connects via API key (not OAuth app install)
- Users would need to manually configure webhooks in their GHL sub-account
- This is the current model — users enter API key + Location ID in onboarding

## Issues Found
1. The onboarding wizard shows webhook URL to EVERY user — this is correct for the current model
2. But it adds friction — users need to go to GHL, find webhook settings, paste URL, select events
3. For scalability, should consider GHL Marketplace app model where webhooks are automatic

## What Needs to Change
- The current approach IS scalable — each tenant configures their own webhook
- The onboarding wizard correctly shows the URL and required events
- BUT: The webhook URL uses `window.location.origin` which is correct (uses deployed domain)
- The setup instructions are clear and actionable
- The fallback polling ensures it works even without webhooks

## Verdict
- Current architecture is fine for the private integration model
- Each user configures their own webhook — this is standard for API-key based integrations
- The onboarding wizard makes it as easy as possible
- No changes needed for scalability — it works for any number of tenants
