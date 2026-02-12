# Spec Analysis: What's New vs What's Built

## Already Built:
- 5 call types (cold_call, qualification, follow_up, offer, callback)
- Multi-rubric routing (cold_call→LG, qualification→LM, offer→AM, follow_up/callback→LM placeholder)
- AI call type detection from transcript
- AI outcome extraction during grading
- Manual call type and outcome override
- 3-tab UI (All Calls, Needs Review, Skipped)
- Pagination (25/page)
- Date range filter, outcome filter, call type filter
- Property address pill on cards
- Outcome tags on cards

## New from Updated Spec:

### 1. Call Types: 6 not 5
- Current: cold_call, qualification, follow_up, offer, callback
- New: cold_call, qualification, follow_up, offer, seller_callback, admin_callback
- Need to split "callback" into "seller_callback" (inbound, high intent) and "admin_callback" (outbound, operational)

### 2. Three NEW Rubrics (fully defined in spec)
- **Follow-Up Rubric**: 7 criteria, critical failures cap at 50%
  - Referenced previous conversation (10%), Anchored previous offer (15%), Re-confirmed decision maker (10%), Re-qualified motivation (15%), Surfaced roadblocks (15%), Pushed for decision (20%), Handled objection/set next step (15%)
  - Talk ratio target: seller ≥50%
- **Seller Callback Rubric**: 8 criteria, critical failures cap at 50%
  - Acknowledged callback (10%), Asked what prompted (15%), Matched energy (10%), Filled info gaps (15%), Moved toward commitment (20%), Handled questions (15%), Set firm next step (10%), Talk ratio (5%)
- **Admin Callback Rubric**: 5 criteria, NO critical failures
  - Stated purpose (20%), Got info needed (30%), Confirmed next step (25%), Professional tone (10%), Kept it tight (15%)
  - Scores tracked but can be excluded from main leaderboard

### 3. Scoring Philosophy
- Score process, not conversion
- Track conversion as standalone dashboard metric
- Don't bake outcome into individual call scores

### 4. Critical Failure Caps
- Follow-Up: cap at 50% if never referenced offer, never asked for decision, talked through silence, didn't confirm decision maker
- Seller Callback: cap at 50% if ran cold call script, didn't ask why calling, let them hang up without next step
- Admin Callback: no critical failures

### 5. Talk Ratio Targets
- Follow-Up: seller ≥50%
- Seller Callback: seller ≥60%
