# appointment-reminder

> Wave: 3 (priority #1 — Corey's GHL kill list 2026-05-11)
> Status: spec
> Risk: medium
> Replaces: GHL appointment-reminder workflow (confirm + day-of)
> Depends on: `_send-framework.md` must be shipped first

## 1. Purpose

Send appointment confirmation and day-of reminder SMS to sellers (and optionally buyers) via vetted templates. Fixed templates, fixed timing, zero LLM-generated content.

## 2. Trigger

Three cron jobs (all via `_send-framework`):

```toml
[[cron]]
name = "appointment-reminder-confirm"
schedule = "*/15 * * * *"  # check every 15 min for new appointments
command = "npx tsx scripts/agents/appointment-reminder.ts confirm"

[[cron]]
name = "appointment-reminder-day-before"
schedule = "0 17 * * *"    # 5pm tenant-local, send day-before for next-day appts
command = "npx tsx scripts/agents/appointment-reminder.ts day-before"

[[cron]]
name = "appointment-reminder-day-of"
schedule = "0 8 * * *"     # 8am tenant-local, send day-of for today's appts
command = "npx tsx scripts/agents/appointment-reminder.ts day-of"
```

## 3. Inputs

- `appointments` (fetched live from GHL or stored locally — see `lib/ghl/appointments.ts`).
- `sellers` table for recipient phone/email.
- Tenant template registry (must include approved templates: `appointment_confirm_v1`, `appointment_day_before_v1`, `appointment_day_of_v1`).
- Suppression list.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getAppointmentsByWindow(tenantId, windowStart, windowEnd, status)` | inputs | list of appointments in window |
| `getSellerForAppointment(appointmentId)` | id | seller + property + recent activity |
| `chooseTemplate(stage, channel)` | inputs | template key from registry (confirm vs day-before vs day-of) |
| `sendViaGate(...)` | gate args | delegates to `_send-framework` send gate |
| `recordSentReminder(appointmentId, templateKey, sendId)` | inputs | upserts `appointment_reminders_sent` to prevent duplicates |

## 5. Outputs

- SMS sent via send gate (subject to approval queue per template autonomy status).
- `appointment_reminders_sent(appointmentId, templateKey, sendId, sentAt)` row.
- `audit_logs`: `appointment.reminder.sent`.

## 6. Approval gates

- **First 30 days:** every send goes through approval queue (template `autonomousAfter` is null).
- **After:** Corey graduates templates one at a time. Confirm template likely first (lowest risk: customer just booked, expects a confirmation).
- **Suppression:** if recipient opted out of marketing/appointment SMS, send gate rejects.

## 7. Completion signal

`stop_reason: "end_turn"`. Per cron mode (confirm / day-before / day-of): list applicable appointments → for each, dedupe → send → end.

## 8. Templates (initial draft — Corey to approve)

```
appointment_confirm_v1 (sent immediately after appointment booked)
"Hi {{sellerFirstName}}, this is {{repName}} from {{tenantName}}. Confirming our appointment {{appointmentTime}} at {{propertyAddress}}. Reply YES to confirm or call {{repPhone}} to reschedule."

appointment_day_before_v1 (sent 5pm day before)
"Hi {{sellerFirstName}}, just a reminder we have our walkthrough tomorrow at {{appointmentTime}}. Anything come up? Call {{repPhone}} if so."

appointment_day_of_v1 (sent 8am day of)
"Hi {{sellerFirstName}}, looking forward to seeing you at {{appointmentTime}} today. {{repName}}"
```

All three are short, factual, no hype, no LLM content. Match Corey's "professional, no hype" tone (per `feedback_ai_strict_facts.md`).

## 9. Failure modes & retries

| Failure | Behavior |
|---|---|
| Template not approved yet | Skip sends entirely; log WARNING. |
| Duplicate (already sent this template for this appointment) | No-op. |
| Recipient suppressed | Gate rejects; log INFO. |
| Send gate down | Skip this run; next cron picks up. |
| Appointment cancelled in GHL between job enqueue and send | Re-check status at send time; skip if cancelled. |

## 10. Test plan

- **Unit:** Template selection per stage; dedupe logic.
- **Integration:** Seed 5 appointments at varying times. Run all 3 cron modes across a fixture day. Assert correct sends queued (not actually sent in test env — send gate is in dry-run mode).
- **Production rollout:**
  1. Build agent with `sendViaGate` in dry-run mode (logs intent, doesn't actually send).
  2. Run for 1 week parallel to existing GHL appointment workflow. Compare sends GHL would have made vs sends agent intends to make. Investigate every difference.
  3. Disable GHL appointment workflow.
  4. Enable real sends — first day under approval queue.
  5. After 30 days clean, graduate confirm template to autonomous.

## 11. Implementation notes

- **Files:**
  - `scripts/agents/appointment-reminder.ts`
  - `lib/agents/appointment-reminder/{index,tools}.ts`
  - `prisma/schema.prisma` — add `AppointmentReminderSent`.
  - Reuse: `lib/ghl/appointments.ts`, `lib/agents/send-gate.ts`.
- **Model:** No LLM. This is a deterministic scheduler. Templates are pre-vetted; substitution is rule-based. Resist the temptation to "personalize" — that's free-form, which Corey said no to.
- **Cost:** SMS provider cost only (~$0.01/send). No Anthropic cost.
