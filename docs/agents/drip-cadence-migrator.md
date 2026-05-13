# drip-cadence-migrator

> Wave: 3 (priority #2 — Corey's GHL kill list 2026-05-11)
> Status: spec
> Risk: high — multi-message, multi-day cadences hitting many customers
> Replaces: GHL drip campaigns (long nurture sequences)
> Depends on: `_send-framework.md` must be shipped first

## 1. Purpose

Replace GHL's multi-week drip campaigns with Gunner-controlled cadences. Each cadence is a sequence of pre-vetted templates with deterministic timing. Cadences are migrated one at a time from GHL — never multiple in parallel during the initial migration phase.

## 2. Trigger

Two paths:

1. **Enrollment:** Other agents (lead-triage, followup-task-builder) or webhooks enroll recipients into a cadence: `cadenceManager.enroll(recipientId, cadenceKey)`.
2. **Step processor cron:** every 15 minutes, find enrollments whose next step is due, send via gate.

```toml
[[cron]]
name = "drip-cadence-step-processor"
schedule = "*/15 * * * *"
command = "npx tsx scripts/agents/drip-cadence-step-processor.ts"
```

## 3. Inputs

- `cadence_definitions` (new table): cadence config (key, name, steps[], pacing).
- `cadence_enrollments` (new table): which recipients are in which cadence + their current step.
- Template registry from `_send-framework`.
- Suppression list, quiet hours, caps from `_send-framework`.

## 4. Schema

```prisma
model CadenceDefinition {
  id        String   @id @default(cuid())
  tenantId  String
  key       String   // "cold-seller-30day-v1"
  name      String
  steps     Json     // [{ delayHours: 0, templateKey: "cold_intro_v1", channel: "SMS" }, ...]
  exitOn    Json     // ["reply", "appointment_booked", "marked_dead"]
  status    CadenceStatus // DRAFT | ACTIVE | ARCHIVED
  createdAt DateTime @default(now())
  @@unique([tenantId, key])
}

model CadenceEnrollment {
  id            String   @id @default(cuid())
  tenantId      String
  cadenceKey    String
  recipientType String
  recipientId   String
  enrolledAt    DateTime @default(now())
  currentStep   Int      @default(0)
  status        EnrollmentStatus // ACTIVE | PAUSED | COMPLETED | EXITED
  exitReason    String?
  nextStepAt    DateTime?
  @@unique([tenantId, cadenceKey, recipientType, recipientId])
}
```

## 5. Tools

| Tool | Input | Returns |
|---|---|---|
| `getDueSteps(tenantId, limit)` | inputs | enrollments where `nextStepAt <= now` AND `status = ACTIVE` |
| `loadCadence(tenantId, cadenceKey)` | inputs | full cadence definition |
| `checkExitConditions(enrollmentId)` | id | whether recipient triggered an exit condition (replied, booked, etc.) since last step |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `advanceStep(enrollmentId)` | id | increments currentStep, sets `nextStepAt` per cadence pacing |
| `exitEnrollment(enrollmentId, reason)` | inputs | marks EXITED |

## 6. Outputs

- SMS/email sends via gate.
- `cadence_enrollments.currentStep`, `nextStepAt`, `status` updates.
- `cadence_send_log` joins with `AgentSend` table.
- `audit_logs`: `cadence.step.sent|exited|paused`.

## 7. Approval gates

- **Cadence-level:** an entire cadence definition requires Corey's approval before activation. DRAFT cadences cannot enroll.
- **Template-level:** every template within a cadence must already be APPROVED in the template registry.
- **Send-level:** initial rollout has every send going through the approval queue. Graduation is **per cadence**, not per template — meaning Corey signs off on the whole cadence going autonomous after observing 30+ days.
- **Exit-on-reply is non-negotiable:** if a recipient replies to ANY cadence message, the enrollment is paused immediately (handled by inbound SMS handler — see Section 9).

## 8. Completion signal

`stop_reason: "end_turn"`. Per processor run: list due steps → for each, check exits → send → advance → end.

## 9. Inbound SMS handling

Critical for cadences: when a recipient replies, we must catch it instantly and pause their cadence (and any other cadences they're in).

- `lib/ghl/webhooks.ts → handleMessage()` already logs inbound. Extend to:
  - Check active `cadence_enrollments` for this recipient.
  - Pause all of them (`status=PAUSED`, `exitReason="recipient_replied"`).
  - Route the reply to the assigned rep (via `internal-alert-hub`).
- Inbound "STOP" keyword → add to suppression list + exit all cadences.

## 10. Failure modes & retries

| Failure | Behavior |
|---|---|
| Cadence step references unapproved template | Pause enrollment; escalate (cadence configuration broken). |
| Recipient phone changed | Re-resolve from DB at send time. If still invalid, mark BOUNCED + exit cadence. |
| Send gate rejects (cap hit) | Push `nextStepAt` forward by 1 hour; retry next cycle. |
| Recipient replied (event missed) | Step processor double-checks `cadence_enrollments.status` and inbound message history before sending. |
| Cadence definition edited mid-flight | New enrollments use new definition; in-flight enrollments stay on old version (immutable per enrollment via `cadenceVersion` field — add to schema). |

## 11. Test plan

- **Unit:** Step scheduling math; exit-on-reply detection; pacing intervals respect quiet hours.
- **Integration:** Define a 5-step cadence. Enroll 10 test contacts. Simulate replies on 3 of them mid-cadence. Run processor for full 30-day window (time-mocked). Assert: 7 complete the cadence, 3 exit on reply, no sends during quiet hours, no duplicate sends.
- **Production rollout:**
  1. Build infra + first cadence definition (DRAFT).
  2. Corey approves the cadence definition + every template in it.
  3. **Migrate one GHL drip at a time.** For each:
     - Disable GHL workflow.
     - Run Gunner cadence in dry-run mode for 48h.
     - Cross-check Gunner intended sends against what GHL would have sent.
     - Enable real sends with full approval queue.
     - After 30 days clean, graduate to autonomous.

## 12. Implementation notes

- **Files:**
  - `scripts/agents/drip-cadence-step-processor.ts`
  - `lib/agents/drip-cadence/{index,tools,enrollment}.ts`
  - `prisma/schema.prisma` — add `CadenceDefinition`, `CadenceEnrollment`.
  - `app/(tenant)/[tenant]/settings/cadences/page.tsx` — Settings Hub sub-page under Section 4 (Calls — repurpose to "Communications") for cadence management.
  - `lib/ghl/webhooks.ts` — extend `handleMessage` to pause enrollments on reply.
- **Model:** No LLM. Pure deterministic scheduler. This is the most-controlled agent precisely because it sends the most messages.
- **Cost:** SMS/email provider cost only.

## 13. Critical principle: no LLM in the message body

Drip cadences are exactly where LLMs are tempting and exactly where they're dangerous. Variations of "personalize this message to the recipient's situation" produce non-determinstic output, which means:
- We can't audit what the customer will receive before it goes out.
- A prompt injection in source data can corrupt the message.
- Compliance review can't sign off on a class of messages.

The cadence-migrator sends ONLY substituted templates. Personalization happens via variable substitution (`{{firstName}}`, `{{propertyAddress}}`) — never via generation.
