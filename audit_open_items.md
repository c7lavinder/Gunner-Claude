# Open TODO Items Audit (2026-03-07)

## CRITICAL / BLOCKING (Production Issues)

### Missing Calls (Feb 27 — still open)
- [ ] James Prince (730s, 2:12 PM, Daniel Lozano) not showing in Gunner
- [ ] Donald Cormier calls (12:33-12:34 PM) not showing
- [ ] Jan Bailey calls (10:58 AM) not showing
- [ ] Virgil Patterson calls (10:48-10:49 AM) not showing
- [ ] Gerri Hayden (35s, 10:45 AM) not showing
- [ ] Kyle Barks calls: Zaia Safi, JR Postma, Tara & Josh Balboa, etc. not showing

### GHL Webhook Configuration
- [ ] Fix GHL webhook configuration — zero webhook events received, Gunner is 100% polling-dependent
- [ ] Verify webhooks are receiving real-time call events after fix

### AM/PM Badge — Missing Calls
- [ ] Nicole Morris: 2 outbound calls at 11:35 AM in GHL, but DB has 0 and GHL activity API returns 0
- [ ] Need a reliable solution that catches ALL outbound dial attempts

## HIGH PRIORITY (Spec Items / User-Facing)

### AI Coach Improvements
- [ ] AI Coach must respond in < 2 seconds for simple queries
- [ ] Add Note: if no content provided, ASK "What should the note say?" — no generic notes
- [ ] Add Note: edit button to modify before confirming
- [ ] Create Task: must include Title, Assignee dropdown, Due Date picker, Description — all editable
- [ ] Update Task: same fields as Create (Assignee, Due Date, Title, Description)
- [ ] Change Pipeline: show Current → New stage, auto-create opportunity if none exists
- [ ] Add Tag: edit button to modify tag name, autocomplete existing tags
- [ ] Update Field: searchable dropdown of all GHL fields, editable value with format validation
- [ ] Add GHL task querying to AI Coach — allow coach to answer "what leads are due on [date]"

### Inbox / Day Hub
- [ ] Click to Expand: show last 10 messages from GHL conversation (slide-out panel) — partially done
- [ ] Call Button: confirmation modal with From/To info, initiate GHL Twilio call (not FaceTime)
- [ ] Text Button: SMS modal with context (last messages visible), verify sends via GHL API

### Calls Page
- [ ] Missing Names: enrich on ingest — query GHL by phone number to get Full Name + Address

### Signals / Opportunities
- [ ] Add "Worth a Look" classification for signals
- [ ] Update opportunity detection prompt to distinguish "Missed" vs "Worth a Look"
- [ ] Update UI to show "Worth a Look" badge
- [ ] Suppress followup_inbound_ignored when last call was proper DQ
- [ ] Reframe "What They Missed" as "Why This Is Worth a Look" for possible-tier signals
- [ ] Fix price extraction logic — extracting wrong numbers
- [ ] Auto-suppress/resolve signals when pipeline stage shows under contract/purchased
- [ ] Fix follow-up detection to check GHL conversations/SMS/call activity before claiming "no follow-up"
- [ ] Barbara Thompson false positive
- [ ] Dequisha McKnight false positive

## MEDIUM PRIORITY (Feature Gaps / Deferred)

### Playbook System
- [ ] Replace hardcoded teamRole MySQL enum with dynamic tenant_roles table
- [ ] Migrate existing tenant data to use new dynamic roles
- [ ] Make tenant_rubrics the SOLE rubric source (remove hardcoded fallback)
- [ ] Update call type detection to use tenant-configured call types via LLM
- [ ] Update team member creation/assignment to use dynamic roles
- [ ] Update coach system prompt to use tenant-configured role names
- [ ] Update webhook handler to use dynamic call type matching
- [ ] Analytics/leaderboard queries using dynamic outcome names
- [ ] Add/remove roles from UI (backend ready, UI needs add/delete buttons)
- [ ] Full rubric criteria weight editor (edit individual criterion points)
- [ ] Add industry template selection step to onboarding UI
- [ ] Test full onboarding flow for new wholesaler tenant

### GHL Data Sync
- [ ] Verify contact_cache stores only 6 fields
- [ ] Remove extra stored fields that should be pulled on demand
- [ ] Add ContactDelete webhook handler
- [ ] Add safety net polling (every 15 min) for missed webhook updates
- [ ] Add on-demand GHL contact detail fetching for detail views
- [ ] Session-level caching for on-demand fetches
- [ ] Ensure Gunner never writes contact data back to GHL
- [ ] Bulk import targets Sales Process pipeline specifically
- [ ] Source/market/type sync only on contact create

### Dispo / Inventory
- [ ] Outreach tab: Pre-built templates (SMS hook, Email details, Blast multi-channel)
- [ ] Outreach tab: Drip sequence enrollment for uncontacted buyers
- [ ] Outreach tab: LLM auto-generated messages from property data
- [ ] Materials tab: PDF deal sheet auto-generation
- [ ] Materials tab: Listing descriptions
- [ ] AI Dispo Assistant tab with full property context
- [ ] Link dispo calls to properties in Inventory
- [ ] Auto-generated training modules from low-scoring dispo patterns
- [ ] Practice mode against AI-simulated buyers
- [ ] Daily task checklist for dispo activities

### Other Deferred
- [ ] Webhook auto-detect when first webhook arrives and mark setup complete
- [ ] Show webhook status indicator during setup
- [ ] Update searchContacts to check local cache first
- [ ] Populate initial cache from GHL API on first sync
- [ ] Import status indicator in Settings
- [ ] Reset webhookActive if no webhooks in 24 hours
- [ ] Remove manual webhook setup wizard
- [ ] Re-enable email sending with rate limits and safeguards
- [ ] AI Coach knows property research data (Notte/Zillow)
- [ ] Address parser for multi-property splitting
- [ ] Backend polling fallback every 15 min for missed updates

## LOW PRIORITY (Future Enhancements)
- [ ] Task Dashboard view inside Gunner
- [ ] Message Inbox view inside Gunner
- [ ] Pipeline Board view inside Gunner (Kanban)
- [ ] Quick Dial integration inside Gunner
- [ ] Gmail outreach automation
- [ ] GHL Marketplace app listing
- [ ] LinkedIn/social media posts
- [ ] Sales automation recurring tasks
- [ ] Verify webhook auto-registration on OAuth connect
