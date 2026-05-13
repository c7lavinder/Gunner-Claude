# _send-framework — shared infrastructure for all customer-facing send agents

> Wave: 3 (must ship BEFORE any Wave 3 agent)
> Status: spec
> Risk: high — this is the gate that protects every customer touch
> Replaces: no current centralized send path; sends happen ad-hoc via GHL workflows or one-off Gunner endpoints

## 1. Purpose

A single, code-enforced send path that every customer-facing agent must use. Implements:

- **Vetted template registry** — only pre-approved templates can be sent. No free-form LLM-generated SMS/email content.
- **Approval queue** — agents propose sends; humans approve before delivery (until template is graduated to autonomous).
- **Code-level gate** — interceptor that runs on every send call, rejects unknown templates, enforces tenant caps, logs everything.
- **Send guardrails** — rate limits per recipient, per tenant, per template; quiet hours; suppression lists.
- **Audit trail** — every send is logged with template version, agent, approver (if any), timestamp, delivery status.

This is the **defense layer** that makes Corey's "very controlled at first" feasible. Without this, no Wave 3 agent ships.

## 2. Trigger

Not a cron. This is a library + a few HTTP endpoints called by send agents.

## 3. Components

### 3a. Template Registry (`AgentTemplate` Prisma model)

```prisma
model AgentTemplate {
  id              String   @id @default(cuid())
  tenantId        String
  key             String   // e.g. "appointment_confirm_v1"
  channel         Channel  // SMS | EMAIL
  body            String   @db.Text
  variables       Json     // ["sellerFirstName", "appointmentTime"] - placeholder list
  approvedBy      String?  // userId who marked it approved
  approvedAt      DateTime?
  autonomousAfter DateTime? // null = requires approval forever; set = autonomous after this date
  status          TemplateStatus // DRAFT | APPROVED | ARCHIVED
  version         Int      // bump on any edit; old versions kept for audit
  createdAt       DateTime @default(now())
  @@unique([tenantId, key, version])
}
```

- A template lives in DRAFT until a tenant admin (Corey) approves it.
- APPROVED templates can be sent — initially with human approval per send. Setting `autonomousAfter` graduates the template to autonomous (still subject to all guardrails).
- ARCHIVED templates can't be selected for new sends but remain readable for audit on past sends.

### 3b. Approval Queue (`AgentApprovalQueueItem` Prisma model)

```prisma
model AgentApprovalQueueItem {
  id            String   @id @default(cuid())
  tenantId      String
  agentName     String   // "appointment-reminder"
  recipientType String   // "seller" | "buyer"
  recipientId   String
  channel       Channel
  templateKey   String
  renderedBody  String   @db.Text // already-substituted preview
  scheduledFor  DateTime
  status        QueueStatus // PENDING | APPROVED | REJECTED | SENT | EXPIRED
  approvedBy    String?
  approvedAt    DateTime?
  rejectedReason String?
  createdAt     DateTime @default(now())
  expiresAt     DateTime // 24h default - if not approved by then, marks EXPIRED
}
```

- UI: `/(tenant)/[tenant]/agents/queue` lists pending items grouped by agent.
- Each item shows the rendered body (not the template — the actual message that will go out).
- One-click approve/reject. Mobile-friendly (Corey reviews from phone).
- Bulk approve for grouped items (e.g., 10 appointment reminders going out at 9am).

### 3c. Send Gate (`lib/agents/send-gate.ts`)

```typescript
// All send agents MUST call sendViaGate. Direct calls to GHL/Twilio/email
// providers are blocked at the linter level (custom eslint rule that errors
// on imports of @twilio, sendgrid, etc outside the gate module).

export async function sendViaGate(args: {
  tenantId: string;
  agentName: string;
  recipientType: 'seller' | 'buyer';
  recipientId: string;
  templateKey: string;
  variables: Record<string, string>;
  channel: 'SMS' | 'EMAIL';
}): Promise<{ status: 'sent' | 'queued' | 'rejected'; error?: string; suggestion?: string }>
```

Internal flow:
1. Look up template by key; assert APPROVED status. Reject if DRAFT.
2. Substitute variables; assert no LLM-generated text leaks in.
3. Check suppression list (recipient opted out, hard-bounced, blocklisted).
4. Check tenant send caps (per-tenant daily SMS, per-recipient cooldowns, quiet-hours 9pm-9am local).
5. Check whether template is autonomous-eligible. If yes → send. If no → enqueue for approval.
6. Send (Twilio for SMS, existing email provider for email).
7. Write `AgentSend` row with full audit data.
8. Return structured JSON.

### 3d. Audit Log (`AgentSend` Prisma model)

```prisma
model AgentSend {
  id              String   @id @default(cuid())
  tenantId        String
  agentName       String
  recipientType   String
  recipientId     String
  channel         Channel
  templateKey     String
  templateVersion Int
  renderedBody    String   @db.Text
  status          SendStatus // SENT | FAILED | BOUNCED | QUEUED
  approverId      String?  // null = autonomous send
  scheduledFor    DateTime
  sentAt          DateTime?
  errorReason     String?
  providerId      String?  // Twilio SID or email message ID
  createdAt       DateTime @default(now())
}
```

Every send appears here. Permanent record. Powers the audit trail and the "what did Gunner send my leads?" lookback.

### 3e. Suppression List (`SendSuppression` Prisma model)

```prisma
model SendSuppression {
  id           String   @id @default(cuid())
  tenantId     String
  recipientType String
  recipientId  String
  channel      Channel
  reason       String   // STOP_REQUESTED | HARD_BOUNCE | MANUAL_BLOCK | INVALID_NUMBER
  createdAt    DateTime @default(now())
  @@unique([tenantId, recipientType, recipientId, channel])
}
```

- Auto-populated on STOP reply (SMS), hard bounce (email), invalid number.
- Manual entries from team for special cases.
- `sendViaGate` checks this on every call; any match returns `rejected`.

### 3f. Settings UI

Settings Hub Section 4 (Calls) gets a new sub-section: **Outbound Templates**.
- Lists all `AgentTemplate` rows for this tenant.
- Tabs: DRAFT | APPROVED | ARCHIVED.
- "New template" wizard with channel, variable picker, preview.
- Per template: approval toggle, autonomy graduation date.

## 4. Code-level enforcement (linter rule)

A custom eslint rule under `eslint-plugin-gunner/no-direct-send`:
- Errors on `import` from `@twilio/voice-sdk`, `twilio`, `@sendgrid/mail`, etc., when not inside `lib/agents/send-gate.ts`.
- Errors on `fetch(ghlBaseUrl + '/conversations/messages')` outside the gate (GHL SMS path).

This means an agent or refactor cannot accidentally bypass the gate. The lint rule blocks it before code review.

## 5. Quiet hours + send caps (defaults)

| Rule | Default value | Configurable per tenant |
|---|---|---|
| Quiet hours | 9pm-9am recipient-local | yes |
| Per-tenant daily SMS cap | 200/day | yes |
| Per-recipient cooldown | 24h between any 2 sends to same recipient | yes |
| Burst limit | 10 sends/min per tenant | no (hard cap) |

`sendViaGate` enforces all of these at the code level.

## 6. Test plan

- **Unit:**
  - Template substitution correctness; missing-variable rejection.
  - Suppression list match prevents send.
  - Quiet hours rejection.
  - Daily cap rejection.
- **Integration:**
  - Approved template + clean recipient → send.
  - Draft template + clean recipient → reject.
  - Approved template + suppressed recipient → reject + audit log.
  - Bulk-approve flow in queue UI.
- **Lint rule:**
  - Confirm CI blocks any PR that imports Twilio outside the gate.

## 7. Rollout

1. Ship database models + send gate library + lint rule (no UI, no agents).
2. Ship Settings UI for template management.
3. Ship Approval Queue UI.
4. Wire one tenant (Corey's) to use the gate for ALL existing send paths (migrate from current GHL-direct sends).
5. Run for 1 week. Verify zero gate bypasses.
6. Only then enable Wave 3 agents.

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Gate is down (DB unreachable) | All sends fail closed. Better silent than out-of-control. |
| Approver doesn't review queue within 24h | Item EXPIRES. Audit log shows "expired unapproved" — not a silent send. |
| Lint rule disabled by a developer | CI catches it (rule enforced in `npm run lint`); main branch protected. |
| Template variables contain malicious content (XSS in email) | Always escape; render via sanitized HTML helper. |

## 9. Implementation order (within Wave 3 build phase)

1. Prisma models + migration.
2. `lib/agents/send-gate.ts` (write + audit; no UI yet).
3. Suppression handling + STOP keyword handler for SMS (inbound).
4. Lint rule.
5. Settings UI (template management).
6. Approval Queue UI.
7. Migrate one existing send path (e.g., the current dispo SMS) through the gate as a proof of concept.
8. THEN start Wave 3 agents in priority order.

## 10. Why this matters

Every other Wave 3 spec depends on this. Without the gate:
- An agent can hallucinate a phone number and text a stranger.
- A prompt injection in a transcript can rewrite the agent's outbound message.
- A regression in any agent can blast hundreds of customers.

With the gate:
- Template content is human-vetted, version-controlled, immutable per send.
- Recipient is resolved from the DB, not from LLM output.
- Every send is auditable.
- Worst case bug: a wrong template gets sent to a real recipient (still bad, but bounded and observable).
