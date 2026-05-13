# walkthrough-coordinator

> Wave: 3 (last in Wave 3 — most complex customer-facing agent)
> Status: spec
> Risk: medium-high
> Replaces: manual walkthrough scheduling (reps coordinating times with sellers manually)
> Depends on: `_send-framework.md`, `appointment-reminder.md` (creates the appointments this manages)

## 1. Purpose

When a property is ready for a walkthrough (stage transition or rep-initiated), coordinate the time via a constrained back-and-forth using vetted templates. Pick a time the seller agrees to, write it as an appointment, hand off to `appointment-reminder` for confirmations.

**This is the most ambitious Wave 3 agent.** It involves a multi-message exchange with a real seller. The constraints below keep it safe.

## 2. Trigger

- Event: rep marks property as "needs walkthrough" → enqueues `walkthrough_request`.
- Event: stage transition into a walkthrough-required stage → enqueues automatically.

## 3. Inputs

- Property + seller.
- Rep's calendar availability (read-only from Google Calendar via `mcp__claude_ai_Google_Calendar__*` integration if connected, OR a local availability config).
- Template registry: walkthrough proposal/confirmation/decline-handling templates.
- Conversation history for this seller.

## 4. Constrained dialog model (key safety mechanism)

This agent does NOT run as a free-form chat. It runs as a finite state machine with limited template choices per state:

```
STATE INITIAL_PROPOSAL
  Send: walkthrough_propose_v1 (offers 3 specific time slots from rep's calendar)
  Wait for reply.

STATE AWAITING_REPLY
  Inbound reply classified by Haiku-tier LLM into:
    A. picked_slot (seller agreed to one of the offered times) → STATE CONFIRMING
    B. asked_alternative (seller proposed different time) → STATE OFFERING_ALTERNATIVE
    C. declined (not interested) → STATE EXITED (route to rep)
    D. ambiguous (couldn't classify) → STATE EXITED (route to rep)

STATE CONFIRMING
  Create appointment in calendar.
  Send: walkthrough_confirm_v1.
  Hand off to appointment-reminder.

STATE OFFERING_ALTERNATIVE
  Re-check rep calendar for proposed alternative.
  If available → send walkthrough_confirm_v1.
  If not → send walkthrough_offer_alts_v1 with 3 different slots.
  Max 2 rounds, then route to rep.

STATE EXITED
  Create task for rep with the seller's last message.
```

Critical: every state can only send one of a small set of templates. The LLM only does **classification** (which state am I in based on the seller's reply?). It does NOT compose messages.

## 5. Tools

| Tool | Input | Returns |
|---|---|---|
| `getRepAvailability(userId, dateRangeStart, dateRangeEnd)` | inputs | free slots from calendar |
| `proposeSlots(propertyId, sellerId)` | inputs | builds 3 slot options, returns rendered preview |
| `classifyReply(replyText)` | text | one of `picked_slot | asked_alternative | declined | ambiguous` + extracted slot details |
| `createAppointment(propertyId, sellerId, time, repId)` | inputs | writes to calendar + GHL |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `createRepHandoffTask(propertyId, sellerId, lastMessage)` | inputs | task for human takeover |

## 6. Outputs

- SMS via gate (constrained to ~3-5 messages per coordination max).
- `appointments` row created (Gunner side) + GHL appointment.
- Rep handoff task on failures.
- `audit_logs` per state transition.

## 7. Approval gates

- **First 90 days:** every outbound message goes through approval queue. This is the strictest Wave 3 agent for trial.
- Hard cap: max 3 outbound messages per coordination. After that, mandatory human takeover.
- Hard cap: max 1 coordination active per seller at a time (no parallel walkthrough proposals).
- Recipient suppression: as always, respected.

## 8. Completion signal

`stop_reason: "end_turn"` after each action. This is the only Wave 3 agent that's truly multi-turn — but each turn is one state transition, not a free-form conversation. Agent ends turn after each step.

## 9. Templates (drafts)

```
walkthrough_propose_v1
"Hi {{sellerFirstName}}, this is {{repName}} from {{tenantName}}. I'd love to walk the property at {{propertyAddress}}. I have these times open: {{slot1}}, {{slot2}}, {{slot3}}. Which works?"

walkthrough_offer_alts_v1
"Got it — those didn't work. How about {{slot1}}, {{slot2}}, or {{slot3}}?"

walkthrough_confirm_v1
"Great, confirmed for {{appointmentTime}} at {{propertyAddress}}. See you then. — {{repName}}"

walkthrough_handoff_v1 (sent automatically when agent exits to human)
[None — handoff is internal only, no message to seller. The rep picks up from where the agent left off.]
```

## 10. Failure modes & retries

| Failure | Behavior |
|---|---|
| Seller never replies | Wait 24h; agent does not re-send (human rep takes over). |
| Seller replies "STOP" | Add to suppression; exit coordination. |
| Calendar integration not configured | Fall back to a static availability window from tenant config. |
| Reply classifier confidence below 0.7 | Treat as `ambiguous` → handoff. Better to over-handoff than over-message. |
| Rep cancels in calendar mid-coordination | Pause coordination; alert rep. |

## 11. Test plan

- **Unit:** State machine transitions; reply classifier per fixture set of seller replies.
- **Integration:**
  - Happy path: seller picks slot 1 → confirm sent → appointment created → handed to reminder agent.
  - Alternative path: seller proposes new time → agent finds availability → confirms.
  - Decline path: seller says "not interested" → exit, rep notified.
  - Ambiguous: seller says "huh?" → exit, rep notified.
  - Suppression: seller replies STOP mid-coordination → exits immediately.
- **Production rollout:**
  1. Dry-run for 4 weeks (longer than other agents).
  2. Manual review of every coordination's intended sends.
  3. Enable on 1 property at a time for the first week.
  4. Approval queue remains active for 90 days minimum.

## 12. Implementation notes

- **Files:**
  - `lib/agents/walkthrough-coordinator/{index,states,tools,classifier}.ts`
  - `scripts/agents/walkthrough-coordinator-step.ts`
  - `prisma/schema.prisma` — `WalkthroughCoordination` model (state, history, currentTurn).
- **Model:** `claude-haiku-4-5-20251001` for reply classification only. No LLM in message composition.
- **Cost:** ~$0.05 per coordination (classification).
- **Honest limitation:** This agent will fail more often than the others. It's the highest-value but highest-risk. If after 6 months it doesn't reach > 60% successful auto-coordination, kill it and keep walkthrough scheduling manual — but the rest of Wave 3 still wins.
