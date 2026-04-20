# Action Execution Audit — Blocker #2

> Inventory of every GHL write action in the codebase, scored against
> UX compliance, Reliability, Safety, and Observability. Produced by
> Session 37 (2026-04-20) as the evidence base for clearing Blocker #2.
>
> **Methodology**: grep all `ghl.*Write*` methods on `lib/ghl/client.ts`
> + all direct `services.leadconnectorhq.com` `fetch` calls in `app/` and
> `lib/`, cross-referenced with `requireApproval`, `logFailure`, `auditLog`
> usage, and the two hot-path client components (`coach-sidebar.tsx`,
> `call-detail-client.tsx`).

## Headline finding

**The AI Assistant's "Edit" button has no `onClick` handler.** It renders in
the UI as a clickable element but does nothing —
[`components/ui/coach-sidebar.tsx:301-303`](../../components/ui/coach-sidebar.tsx#L301-L303).
Field values render as read-only `<span>` tags, and the POST body to
`/api/ai/assistant/execute` only sends `{ toolCallId, pageContext, rejected? }`
— no mechanism to convey edits. **All 7 AI-assistant action types run
whatever the AI proposed, verbatim.**

Conversely, the call-detail next-steps flow **is** correct — AI pre-fills →
user edits label inline → explicit "Push to CRM" → toast on success/failure
→ corrections logged to `/feedback` for AI learning. This is the reference
implementation the assistant should mirror.

---

## Scoring legend

- **UX** — propose → edit → confirm. ✅ all three; ⚠️ two of three; ❌ none; N/A not AI-initiated.
- **Rel** — Reliability. ✅ `logFailure` + toast on both outcomes + sensible retry/rollback; ⚠️ partial; ❌ silent catch or swallowed errors.
- **Safe** — Safety. ✅ `requireApproval` where stakes warrant; N/A stakes don't warrant; ❌ destructive/bulk with no gate.
- **Obs** — Observability. ✅ `audit_logs` on both success & failure with tenantId + resource + resourceId; ⚠️ one but not the other; ❌ no trail.
- **Stakes** — High / Medium / Low (triage lens — low-stakes auto-execute isn't a blocker; high-stakes auto-execute is).

---

## Inventory table

| # | Call Site | File:Line | Action | Stakes | UX | Rel | Safe | Obs | Gaps |
|---|-----------|-----------|--------|--------|----|----|-----|-----|------|
| 1 | Assistant — send_sms | [execute/route.ts:80-98](../../app/api/ai/assistant/execute/route.ts#L80-L98) | `ghl.sendSMS` | High | ⚠️ | ⚠️ | ❌ | ✅ | Edit button non-functional; no `requireApproval`; only this branch audit-logs |
| 2 | Assistant — send_email | [execute/route.ts:278-295](../../app/api/ai/assistant/execute/route.ts#L278-L295) | `ghl.sendEmail` | High | ⚠️ | ⚠️ | ❌ | ❌ | No edit; no approval gate; no audit_log row |
| 3 | Assistant — add_note | [execute/route.ts:120-134](../../app/api/ai/assistant/execute/route.ts#L120-L134) | `ghl.addNote` | Medium | ⚠️ | ⚠️ | N/A | ❌ | No edit; no audit_log |
| 4 | Assistant — create_task / update_task | [execute/route.ts:100-118, 570-585](../../app/api/ai/assistant/execute/route.ts#L100-L118) | `ghl.createTask` / `updateTask` | Medium | ⚠️ | ⚠️ | N/A | ❌ | No edit; no audit_log |
| 5 | Assistant — complete_task | [execute/route.ts:265-274](../../app/api/ai/assistant/execute/route.ts#L265-L274) | `ghl.completeTask` | Low | ⚠️ | ⚠️ | N/A | ❌ | No edit matters less here; still no audit_log |
| 6 | Assistant — create_contact / update_contact (tags, assignee, fields) | [execute/route.ts:255-265, 365-395, 585-620](../../app/api/ai/assistant/execute/route.ts#L365-L395) | `ghl.createContact` / `updateContact` | High | ⚠️ | ⚠️ | ❌ | ❌ | Creates/modifies contacts with no edit, no approval, no audit |
| 7 | Assistant — opportunity (create / stage / status / value) | [execute/route.ts:150-170, 395-410, 625-650](../../app/api/ai/assistant/execute/route.ts#L150-L170) | `ghl.createOpportunity` / `updateOpportunity*` | High | ⚠️ | ⚠️ | ❌ | ❌ | Stage changes and new deals with no edit/approval/audit |
| 8 | Call-detail — add_note | [actions/route.ts:58-62](../../app/api/[tenant]/calls/[id]/actions/route.ts#L58-L62) | `ghl.addNote` | Medium | ✅ | ⚠️ | N/A | ❌ | Client-side toast ✓; route doesn't audit or logFailure |
| 9 | Call-detail — create_task | [actions/route.ts:64-70](../../app/api/[tenant]/calls/[id]/actions/route.ts#L64-L70) | `ghl.createTask` | Medium | ✅ | ⚠️ | N/A | ❌ | Same pattern as #8 |
| 10 | Call-detail — send_sms | [actions/route.ts:72-80](../../app/api/[tenant]/calls/[id]/actions/route.ts#L72-L80) | `ghl.sendSMS` | High | ✅ | ⚠️ | ❌ | ❌ | User edits label ✓ but high-stakes send with no approval modal and no audit |
| 11 | Call-detail — create_appointment | [actions/route.ts:82-90](../../app/api/[tenant]/calls/[id]/actions/route.ts#L82-L90) | `ghl.createTask` (task-style appt) | Low | ✅ | ⚠️ | N/A | ❌ | — |
| 12 | Call-detail — change_stage | [actions/route.ts:100-120](../../app/api/[tenant]/calls/[id]/actions/route.ts#L100-L120) | `ghl.updateOpportunityStage` | High | ✅ | ⚠️ | ❌ | ❌ | Pipeline stage change with no approval gate |
| 13 | Call-detail — check_off_task | [actions/route.ts:135-145](../../app/api/[tenant]/calls/[id]/actions/route.ts#L135-L145) | `ghl.completeTask` + `ghl.addNote` | Low | ✅ | ⚠️ | N/A | ❌ | — |
| 14 | Unified action dispatcher | [ghl/actions/route.ts:62-99](../../app/api/ghl/actions/route.ts#L62-L99) | sendSMS / addNote / createTask / completeTask / updateOpportunityStage | Mixed | N/A | ⚠️ | ❌ | ⚠️ | Plumbing endpoint — permission check ✓, audit on success only, no logFailure. UX owned by caller. |
| 15 | Deal blast (bulk SMS/email to buyer list) | [properties/[propertyId]/blast/route.ts:224-260](../../app/api/properties/[propertyId]/blast/route.ts#L224-L260) | `ghl.sendSMS` / `sendEmail` × N buyers | **HIGH (bulk)** | ⚠️ | ❌ | **❌** | ⚠️ | Per-recipient errors `console.error`'d silently; aggregate audit only; **no `requireApproval` despite bulk send — violates AGENTS.md gate policy** |
| 16 | Add buyer to GHL | [properties/[propertyId]/buyers/route.ts:498-521](../../app/api/properties/[propertyId]/buyers/route.ts#L498-L521) | `ghl.createContact` + `createOpportunity` | High | ✅ | ⚠️ | ❌ | ❌ | User-filled form ✓; creates CRM contact + pipeline opportunity with no approval modal and no audit_log |
| 17 | Day Hub — send inbox reply | [dayhub/inbox/route.ts:112-146](../../app/api/[tenant]/dayhub/inbox/route.ts#L112-L146) | `ghl.sendSMS` | High | ✅ | ⚠️ | ❌ | ⚠️ | User composes and sends ✓; audit on success, nothing on failure; no approval (single-contact; arguably N/A) |
| 18 | Day Hub — task toggle | [dayhub/tasks/route.ts:118](../../app/api/[tenant]/dayhub/tasks/route.ts#L118) | `ghl.completeTask` | Low | ✅ | ⚠️ | N/A | ❌ | — |
| 19 | Day Hub — appointment status PUT | [dayhub/appointments/route.ts:257-270](../../app/api/[tenant]/dayhub/appointments/route.ts#L257-L270) | direct `PUT /calendars/events/appointments/{id}` | Low | ✅ | ⚠️ | N/A | ❌ | Direct fetch, not client-wrapped; no retry/backoff |
| 20 | Task create (CRM-side) | [tasks/route.ts:68](../../app/api/tasks/route.ts#L68) | `ghl.createTask` | Medium | ✅ | ⚠️ | N/A | ❌ | — |
| 21 | Task complete (CRM-side) | [tasks/[taskId]/complete/route.ts:26](../../app/api/tasks/[taskId]/complete/route.ts#L26) | `ghl.completeTask` | Low | ✅ | ⚠️ | N/A | ❌ | — |
| 22 | OAuth webhook register / deregister | [lib/ghl/webhook-register.ts:25-28](../../lib/ghl/webhook-register.ts#L25-L28) | `ghl.registerWebhook` / `deleteWebhook` | Medium (system) | N/A | ❌ | ❌ | ❌ | `deleteWebhook.catch(() => {})` silent catch; no audit row; possibly related to **PROGRESS.md bug #10** (registration 404) going undiagnosed |

---

## Rollout blockers

Lines with ❌ on UX **or** ❌ on Reliability. These block Blocker #2 clearing.

1. **Rows 1-7 (AI Assistant, all 7 action types)** — UX ⚠️ across the board because the Edit button is a dead UI element. Technically ⚠️ not ❌, but functionally equivalent to auto-execute-without-edit for any field the AI got wrong. Assistant-proposed SMS/email/stage-change/contact-write actions cannot be corrected before firing. **This is the single biggest blocker.**
2. **Row 15 (Deal blast)** — **Safety ❌**. Bulk SMS/email send with no `requireApproval` gate. AGENTS.md explicitly requires approval on SMS to >10 contacts and on bulk GHL contact updates. Violation of a non-negotiable rule.
3. **Row 22 (OAuth webhook register/delete)** — Reliability ❌ and Observability ❌. `deleteWebhook.catch(() => {})` is the exact silent-catch pattern Session 33 swept everywhere else. This is likely why PROGRESS.md bug #10 ("GHL webhook registration returns 404") has persisted — the failure is swallowed silently and never surfaces in `audit_logs`.

---

## Non-blocking gaps

⚠️ lines — fix in follow-up sprint, don't block rollout.

- **Rows 8-13 (Call-detail actions)** — Reliability ⚠️. Route doesn't call `logFailure` on GHL errors; the client shows a toast via the HTTP status code but nothing gets recorded in `audit_logs`. Client-side toast ≠ server-side trail. When a silent-error sweep is done, these 6 callsites belong in it.
- **Rows 10, 12 (Call-detail send_sms and change_stage)** — Safety ❌. High-stakes actions with no approval modal. User edited the label ✓ and clicked "Push to CRM" ✓, which arguably *is* the approval — but for a stage change to a contract/closed stage, a confirmation modal with the before → after stage names would prevent fat-finger errors. Low-effort addition.
- **Row 14 (Unified dispatcher)** — logs on success, not failure. Partial audit trail.
- **Row 16 (Add buyer)** — High-stakes (new GHL contact + pipeline entry) with no approval and no audit. Every manually-added buyer should be audit-logged; an accidental form submission currently creates a real CRM contact with no trace.
- **Row 17 (Day Hub inbox reply)** — Obs ⚠️, audits success only.
- **Rows 18-21** — Low-stakes actions (toggle task, update appointment status) with no audit trail. Individually benign; collectively the gap means the audit page can't show a full "who did what" for Day Hub activity.

---

## Summary counts

- **Total call sites audited:** 22
- **Fully compliant (all dimensions ✅ / N/A):** 0
- **Rollout blockers** (❌ on UX or Reliability, or Safety ❌ on bulk): **3 call sites / 9 rows**
  - Rows 1-7 (assistant edit-button-dead, all 7 rows)
  - Row 15 (deal blast no-approval)
  - Row 22 (webhook register silent-fail)
- **Non-blocking gaps** (⚠️ on any dimension): **12 rows**
- **Observability gap is systemic:** 17 of 22 rows have ❌ on `Obs`. The codebase reliably writes `audit_logs` for the *business events* it cares about (`call.graded`, `property.created`, `sms.sent` from Assistant row 1) but almost every GHL *write* skips the audit write, which means there's no unified "who pushed what to GHL" trail.

## Fix sequence to clear Blocker #2

1. **Wire the Edit button in `coach-sidebar.tsx`.** Replace the read-only `<span>` field render with editable `<input>`s; add an `onClick` to the Edit button that toggles field editability; send edited input to the server; server accepts an optional `editedInput` and uses it in place of `toolCall.input`. **Single highest-leverage change in the whole audit.**
2. **Add `requireApproval` gate to `/properties/[propertyId]/blast`.** One import + one call. Addresses AGENTS.md rule violation.
3. **Replace `deleteWebhook.catch(() => {})` in `webhook-register.ts` with `logFailure`.** Lets bug #10 surface.
4. **Add missing `audit_logs` writes to rows 2-7, 8-13, 16, 18-21.** Use a tiny helper (`logGhlAction(tenantId, userId, 'action.type', { ...payload })`) and call it from every GHL-write endpoint, success *and* failure path. Closes the systemic Obs gap.

Items 1 and 2 alone clear the hard blockers. Item 3 is a 2-line fix that resolves a separate long-standing bug. Item 4 is a sprint-scale cleanup.
