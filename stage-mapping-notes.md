# Stage Mapping Reference (2026-03-06)

## Sales Process Pipeline
- New Lead → lead (CREATES property)
- Warm Leads → lead (CREATES property)
- Hot Leads → lead (CREATES property)
- Pending Apt → apt_set (update only)
- Walkthrough Apt Scheduled → apt_set (update only)
- Offer Apt Scheduled → apt_set (update only)
- Made Offer → offer_made (update only)
- Under Contract → under_contract (update only)
- Purchased → closed (update only)
- 1 Month Follow Up → follow_up (update only)
- 4 Month Follow Up → follow_up (update only)
- 1 Year Follow Up → follow_up (update only)
- Ghosted Lead → follow_up (update only)
- Agreement not closed → dead (update only)
- SOLD → dead (update only)
- DO NOT WANT → dead (update only)

## Dispo Pipeline (updates only, no creation)
- New deal → marketing
- Clear to Send Out → marketing
- Sent to buyers → marketing
- Offers Received → buyer_negotiating
- <1 Day — Need to Terminate → marketing (default)
- With JV Partner → buyer_negotiating
- UC W/ Buyer → closing
- Working w/ Title → closing
- Closed → closed

## Key Rules
1. Only CREATE properties from New Lead, Warm Leads, Hot Leads stages
2. Source comes from opportunity.source field (not contact tags)
3. No tag parsing needed
4. Dispo pipeline only updates existing properties
5. <1 Day — Need to Terminate defaults to marketing
