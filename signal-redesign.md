# Signals Page Redesign — Classification System

## Philosophy Change

The current system thinks like a "pipeline auditor" — it checks if steps were followed.
The new system thinks like an **Acquisition Manager reviewing the war room board** — it asks:
- "Where is money being left on the table?" (Missed)
- "What's about to go wrong if we don't act?" (At Risk)
- "What's interesting that I should know about?" (Worth a Look)

---

## TIER RECLASSIFICATION

### MISSED (Red — Drastic losses, money walked out the door)
These are ONLY for situations where we definitively lost a deal or a major opportunity is gone.
The owner sees these and thinks "that should NOT have happened."

| Rule | Current Tier | New Tier | Rationale |
|------|-------------|----------|-----------|
| sms_deal_lost | missed | **MISSED** | Seller told us they sold/went with competitor — definitive loss |
| repeat_inbound_ignored | missed | **MISSED** | Seller reached out 2+ times and we never responded — deal likely gone |
| backward_movement_no_call | missed | **MISSED** | Lead shelved without anyone ever talking to them |
| followup_inbound_ignored | missed | **AT RISK** | RECLASSIFY — inbound from follow-up not answered in 4h is urgent but not yet lost |
| offer_no_followup | missed | **AT RISK** | RECLASSIFY — offer made but no follow-up is a process failure, not yet a loss |
| NEW: deal_lost_on_call | — | **MISSED** | NEW — Transcript shows seller said they sold, went with someone else, or listing with agent |
| NEW: contract_fell_through_no_action | — | **MISSED** | NEW — We were under contract but it fell apart and no recovery action taken |

### AT RISK (Orange — Red flags in process, SOP failures, things about to go wrong)
The owner sees these and thinks "someone needs to fix this NOW before we lose the deal."

| Rule | Current Tier | New Tier | Rationale |
|------|-------------|----------|-----------|
| followup_inbound_ignored | missed→ | **AT RISK** | Inbound from follow-up lead unanswered 4h+ — urgent but recoverable |
| offer_no_followup | missed→ | **AT RISK** | Offer made but team went silent — SOP failure |
| new_lead_sla_breach | warning | **AT RISK** | Speed-to-lead is critical — 5min rule, 15min max |
| motivated_one_and_done | warning | **AT RISK** | Motivated seller, only 1 call, no follow-up — SOP failure |
| stale_active_stage | warning | **AT RISK** | Lead sitting in active stage 5+ days with no movement |
| dead_with_selling_signals | warning | **AT RISK** | DQ'd lead that had real motivation — possible bad call |
| walkthrough_no_offer | warning | **AT RISK** | Walkthrough done, no offer — critical SOP gap |
| post_walkthrough_ghosting | warning | **AT RISK** | Seller went silent after walkthrough — needs immediate re-engagement |
| timeline_offered_no_commitment | warning | **AT RISK** | Agent left timeline open-ended instead of locking next step |
| delayed_scheduled_callback | warning | **AT RISK** | Scheduled callback was late — damaged rapport |
| NEW: bad_call_performance | — | **AT RISK** | NEW — Call graded D or F, or score below 40 — very bad offer/qualification call |
| NEW: missed_appointment | — | **AT RISK** | NEW — Appointment was scheduled but no call/activity happened at that time |

### WORTH A LOOK (Blue — Subtle opportunities, insights, interesting patterns)
The owner sees these and thinks "that's interesting, let me dig into this."

| Rule | Current Tier | New Tier | Rationale |
|------|-------------|----------|-----------|
| price_stated_no_followup | possible | **WORTH A LOOK** | Seller stated price — negotiation opportunity |
| deal_fell_through | possible | **WORTH A LOOK** | Previous deal fell through — re-engagement window |
| active_negotiation_in_followup | possible | **WORTH A LOOK** | Active engagement in follow-up — warm lead |
| missed_callback_request | possible | **WORTH A LOOK** | Seller asked for callback — they want to talk |
| high_talk_time_dq | possible | **WORTH A LOOK** | Long conversation but DQ'd — seller was engaged |
| short_call_actionable_intel | possible | **WORTH A LOOK** | Short call had email, referral, or callback info |
| duplicate_property_address | possible | **WORTH A LOOK** | Multiple contacts for same property |
| skipped_walkthrough | possible | **WORTH A LOOK** | Went to offer without walkthrough |
| NEW: extreme_motivation | — | **WORTH A LOOK** | NEW — Seller expressing extreme urgency (foreclosure, divorce, death, etc.) |
| NEW: close_on_price | — | **WORTH A LOOK** | NEW — Our offer and seller ask are within $30k — very closeable |
| NEW: seller_re_engagement | — | **WORTH A LOOK** | NEW — Seller coming back after 30+ days of silence in follow-up |
| NEW: seller_texted_number | — | **WORTH A LOOK** | NEW — Seller proactively texted us their phone number or contact info |
| NEW: seller_out_of_agreement | — | **WORTH A LOOK** | NEW — Seller mentions they just got out of agreement/listing with someone |
| NEW: ai_coach_inactive | — | **WORTH A LOOK** | NEW — Team member hasn't used AI coach in 7+ days |
| NEW: consistent_call_weakness | — | **WORTH A LOOK** | NEW — Team member consistently missing same call section (e.g., always low on motivation questions) |
| NEW: bad_temperament | — | **WORTH A LOOK** | NEW — Call transcript shows frustration, rudeness, or unprofessional tone |

---

## NEW RULES DETAIL

### MISSED Tier — New Rules

**deal_lost_on_call**: Scan transcripts for seller explicitly saying on a call that they sold, listed with agent, went with competitor, or are no longer selling. Different from sms_deal_lost (which scans texts). Patterns: "I already sold it", "we listed with an agent", "went with another investor", "we're not selling anymore", "someone else already bought it".

**contract_fell_through_no_action**: If a contact was in "Under Contract" or similar stage, then moved backward (to follow-up, dead, etc.) and no outbound activity happened within 48h of the stage change — we lost the deal and didn't try to save it.

### AT RISK Tier — New Rules

**bad_call_performance**: Query callGrades table for recent calls with overall grade D or F, or overall score below 40. These are calls where the rep performed very poorly — bad offer presentation, missed key qualification questions, poor rapport. Flag with the specific weak areas from the grade breakdown.

**missed_appointment**: Cross-reference GHL appointments with call activity. If an appointment was scheduled for a specific time and no call/activity happened within 30 minutes of that time, the appointment was missed. This is a critical SOP failure.

### WORTH A LOOK Tier — New Rules

**extreme_motivation**: Scan transcripts for high-urgency motivation signals: foreclosure with timeline, divorce with property division, death in family with estate, tax sale deadline, code violation deadline, health emergency forcing sale. Different from motivated_one_and_done (which requires only 1 call) — this fires regardless of call count, purely based on motivation intensity.

**close_on_price**: When both ourOffer and sellerAsk are known and the gap is ≤$30k, flag as highly closeable. This is a deal that could close with one more conversation.

**seller_re_engagement**: Detect when a contact in follow-up stage (30+ days old) suddenly has new inbound activity — they came back. This is a warm re-engagement opportunity.

**seller_texted_number**: Scan GHL SMS for inbound messages where seller proactively shares a phone number, email, or says "call me at..." — they want to be contacted.

**seller_out_of_agreement**: Scan transcripts and SMS for seller mentioning they just got out of a listing agreement, their agent contract expired, previous buyer backed out, etc.

**ai_coach_inactive**: Query the training/coaching tables for team members who haven't accessed AI coach features in 7+ days. This is a team development signal.

**consistent_call_weakness**: Query callGrades for a team member's last 5+ calls and check if the same category consistently scores low (e.g., always below 5/10 on "Motivation Extraction" or "Closing"). Pattern detection across multiple calls.

**bad_temperament**: Use LLM to scan recent transcripts for signs of frustration, rudeness, talking over the seller, dismissive language, or unprofessional tone. This is a coaching opportunity.
