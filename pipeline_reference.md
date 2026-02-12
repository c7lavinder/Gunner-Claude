# GHL Pipeline Reference

## Sales Process (tOqQbembKlIoPiXbepP3) — MAIN ACQUISITION PIPELINE
- Stage 0: New Lead (1) — f919c1a7
- Stage 1: Warm Leads(2) — 34b88324
- Stage 2: SMS Warm Leads — a977dd60
- Stage 3: Hot Leads(2) — 84c5583f
- Stage 4: Pending Apt(3) — 09016bf4
- Stage 5: Walkthrough Apt Scheduled — 32949f8d
- Stage 6: Offer Apt Scheduled (3) — 3fc1356a
- Stage 7: Made Offer (4) — 4ab2cfdb
- Stage 8: Under Contract (5) — d71ec692
- Stage 9: Purchased (6) — 23c35caa
- Stage 10: 1 Month Follow Up — 0f7ddf92
- Stage 11: 4 Month Follow Up — e0fbea34
- Stage 12: 1 Year Follow Up — 733adecd
- Stage 13: Ghosted Lead — dc8a2451
- Stage 14: Agreement not closed — b157bae8
- Stage 15: SOLD — f0f33ad5
- Stage 16: DO NOT WANT — b8590254

### Active deal stages (forward progress): 0-9
### Follow-up stages (backward/shelved): 10-12
### Dead/terminal stages: 13-16

## Follow Up Pipeline (grDjCVlwUKx4ShCiOqGi)
- Stage 0: New Lead
- Stage 1: New Offer
- Stage 2: New Walkthrough
- Stage 3: 4 Month Follow Up
- Stage 4: 1 Year Follow Up
- Stage 5: Purchased
- Stage 6: Agreement Not Closed
- Stage 7: SOLD
- Stage 8: Ghosted
- Stage 9: Trash

## Key Detection Rules:
1. BACKWARD MOVEMENT: Lead moved from stages 1-6 (Warm/Hot/Pending/Walkthrough/Offer) to stages 10-12 (Follow Up) without outbound call
2. DEAD WITH SIGNALS: Lead moved to stages 13-16 (Ghosted/DO NOT WANT) but transcript had selling signals
3. STALE IN ACTIVE: Lead sitting in stages 4-6 (Pending/Walkthrough/Offer) for 5+ days with no activity
4. INBOUND FROM FOLLOW UP: Contact in stages 10-12 reaches back out (inbound call/SMS)
5. REPEAT INBOUND: Same seller contacts 2+ times in a week
6. PRICE STATED NO FOLLOW UP: Seller stated a price in transcript but no follow-up within 48h
7. MOTIVATED ONE-AND-DONE: Motivated seller with only 1 call attempt, no 2nd in 72h
