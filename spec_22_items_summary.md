# Spec: 22 Fixes & Features (day-hub-fixes-spec(3).md)

## DAY HUB (Items 1-8)
1. KPI boxes clickable → show contact list modal
2. Role views show only personal data (LM sees LM data, AM sees AM data, etc.)
3. Dispo inbox — only dispo-relevant messages
4. Inbox shows which team member the call/text was sent to
5. Conversation expander — fix scroll & layout (no page jump)
6. AI Coach knows inventory property data (auto-research Zillow/county/comps)
7. "View As" Daniel — task list error fix
8. Inbox loading — too slow & goes blank

## CALLS PAGE (Items 9-11)
9. Don't grade calls under 2 minutes
10. Handle transcription failures gracefully (no raw JSON errors)
11. Handle "No recording available" — archive, don't show in Skipped

## TEAM / GAMIFICATION (Items 12-13)
12. Disposition Manager gamification (XP, badges, levels)
13. Add Dispo Manager to Teammate Classes & everywhere missing

## INVENTORY / DISPO COMMAND CENTER (Items 14-22)
14. Property stage filter not working (Buyer Negotiating shows empty)
15. Property description disappears after adding
16. Buyer match logic — market, buy box, tier, response speed (uses GHL custom fields)
17. AI Assistant — fix scroll issue on type
18. "Add Buyer" must auto-complete from GHL contacts
19. Showings & Offers — auto-complete contacts from GHL
20. Remove 3-dot menu on property card, make card clickable
21. Inventory — switch from card grid to compact list/table view
22. Inventory stage permissions by role (LM/AM: 7 stages, Dispo: 5, Admin: all)

## USER QUESTION: About OAuth and polling
User asks if this spec is doable and whether OAuth is already set up.
Need to check current GHL OAuth status and webhook configuration.
