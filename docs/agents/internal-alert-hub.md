# internal-alert-hub

> Wave: 2 (promoted from Wave 4 per Corey's priority 2026-05-11 — team-facing, not customer-facing)
> Status: spec
> Risk: low
> Replaces: GHL Slack/email/SMS alert workflows that ping the team when something happens

## 1. Purpose

Central routing for every team-facing alert: hot lead detected, missed call, appointment booked, agent escalation, cron failure, buy signal, etc. Replaces the patchwork of GHL workflows + ad-hoc emails. One place to configure who gets what.

## 2. Trigger

Called by other agents and webhooks via the `alertHub.send(alertType, payload)` API. Not its own cron — pure inbound router.

## 3. Inputs

- `alert_rules` (new table): `{ tenantId, alertType, userIds, channels: ["in_app","email","sms"], throttleSeconds, enabled }`.
- `alert_subscriptions` (new table): per-user opt-in/out.
- Incoming payloads from other agents.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `resolveRecipients(tenantId, alertType, payload)` | inputs | list of `{userId, channels}` who should receive this alert |
| `composeAlert(alertType, payload, channel)` | inputs | rendered subject + body per channel |
| `checkThrottle(userId, alertType)` | inputs | whether this user has hit the rate limit for this alert type today |
| `sendInApp(userId, subject, body, link)` | inputs | writes `in_app_notifications` row; pushes via Pusher / SSE if available |
| `sendEmail(userId, subject, body, link)` | inputs | sends via existing email provider (already exists in `lib/email/`) |
| `sendInternalSms(userId, body)` | inputs | sends to TEAM phone numbers only (allow-list of internal users). **Not customer SMS.** |
| `logAlert(alertType, userId, channel, status)` | inputs | audit log |

## 5. Outputs

- `in_app_notifications` rows (surfaced in app header bell).
- Emails sent.
- Internal SMS sent (to team only — gated via `internal_users.phoneVerified` flag).
- `audit_logs`: `alert.{sent|throttled|failed}`.

## 6. Approval gates

- **Internal-only:** team users only. Hard-coded recipient allow-list — agent CANNOT send to a phone number not in the tenant's `internal_users` table.
- All recipient resolution happens via tenant-scoped queries; no cross-tenant leakage possible.

## 7. Completion signal

`stop_reason: "end_turn"`. Per alert: resolve recipients → compose → throttle-check → send → end. Often this isn't even an LLM call — it's a router. Use LLM only for composing custom-tailored alert bodies; use templates for routine alerts.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Recipient not configured for this alert type | Default to tenant admin. |
| All channels disabled | Drop alert; log INFO (user has opted out, respect it). |
| Email send fails | Retry once; if still fails, fall back to in-app. |
| SMS to recipient hits provider rate limit | Queue; retry in 60s. |
| Same alert fires 10× in a minute | Coalesce into a single "you have 10 hot leads" alert. |

## 9. Test plan

- **Unit:** Recipient resolution per alert type; throttle logic; channel fallback.
- **Integration:** Fire 5 alert types, assert correct recipients and channels per tenant config.
- **Production rollout:**
  1. Build infra.
  2. Migrate alerts from existing GHL workflows one type at a time. Each migrated workflow: disable in GHL → enable in hub → verify equivalent behavior for 1 week → call it migrated.
  3. Track migration in `docs/OPERATIONS.md` "Active GHL Workflows" section.

## 10. Implementation notes

- **Files:**
  - `lib/agents/alert-hub/{index,router,composers}.ts`
  - `lib/agents/alert-hub/api.ts` — exported `alertHub.send(...)` API for other agents.
  - `prisma/schema.prisma` — add `AlertRule`, `AlertSubscription`, `InAppNotification`.
  - `app/(tenant)/[tenant]/settings/notifications/page.tsx` — new Settings page for alert prefs (extends Settings Hub).
  - `components/app-shell/notification-bell.tsx` — header bell for in-app alerts.
- **Model:** Mostly no LLM — routing + templating. LLM (`claude-haiku-4-5-20251001`) only when an alert type is configured for "smart compose" (rare).
- **Cost:** Near zero.
- **Cross-link:** Replaces direct escalation calls in `cron-sentinel`, `webhook-drift-watchdog`, `tcp-anomaly-surfacer`, `lead-triage`. Once shipped, refactor those agents to call `alertHub.send()` instead of writing `agent_escalations` rows directly.
