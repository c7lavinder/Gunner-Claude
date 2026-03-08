# Inventory Fix Notes - Complete Audit

## Issue 11 - Table Column Mapping Bug
Headers (10 cols): Status, Asking, Contract, Spread, Sends, Buyers, Offers, Showings, DOM, Actions
Body (11 cells): Address, Status, Asking, Contract, Spread, Sends, Buyers, Offers, Showings, DOM, Delete
FIX: Add "Property" as first header column (line ~2889). The headers array is missing the Property column.

## Issue 12 - Accepted Offer Auto-Populate
updateOfferStatus (server/inventory.ts) sets status to under_contract when accepted but does NOT set acceptedOffer.
FIX: Also set dispoProperties.acceptedOffer = offer.offerAmount when status is "accepted".

## Issue 1 - Hide Dead from Dispo Manager
visibleStages for dispo_manager includes "dead". Remove it.

## Issue 2/18 - Remove All Tab
Remove "all" from ALL role stage lists. Default to first visible stage.
Search should work cross-status when text is entered.

## Issue 3 - Markets Dropdown
Filter dropdown uses uniqueMarkets from property data. Should use kpiMarkets from tenant playbook.

## Issue 4/8 - Project Types
Currently has: wholesale, novation, creative_finance, fix_and_flip, buy_and_hold, other
Should be ONLY: Flipper, Landlord, Builder, Multi Family, Turn Key
Appears in: PropertyFormDialog, filter dropdown, bulk edit, schema enum

## Issue 5 - Remove counts from tabs
Line 2850: Remove count display from status tabs.

## Issue 6 - Search bar
Line 2773: Already max-w-xs. Need fixed width w-72 and ensure always visible.
When search has text, search across ALL statuses (ignore status filter).

## Issue 7 - Bulk edit actions
Line 3195-3246: Currently has Move to Stage, Delete, Clear.
FIX: Add Set Market, Set Source, Set Project Type dropdowns.

## Issue 9 - Auto-populate market/source
resolveMarketId in ghlContactImport.ts handles zip-to-market mapping.
Need to also auto-populate on property create/import.
Store in tenant playbook.

## Issue 10 - AI input pinned at bottom
DispoAITab (line 1843): Already has flex-col layout with input at bottom.
The input area is at the bottom but may need sticky positioning to stay pinned.

## Issue 13 - Rematch Buyers
BuyersTab (line 879): Has "Add Buyer" and "Match from GHL". Add "Rematch Buyers".

## Issue 14 - Remove buyer cap
matchBuyersForProperty in server/inventory.ts has `.slice(0, MATCH_LIMIT)` with MATCH_LIMIT=200.
Remove the limit. Market = hard filter. Sort by project type match > tier > other factors.

## Issue 15 - Search in Buyers tab
Add search input to BuyersTab.

## Issue 16 - Confirmation dialogs
BuyersTab buyer action buttons (SMS, Email, Log Offer, Log Response) at lines 1038-1060.
Currently use prompt() and direct mutation calls. Need proper confirmation dialogs.
Show: from (user's contact), to (buyer), message (editable), from should be changeable.

## Issue 17 - Acquisition vs disposition columns
Acquisition stages: lead, apt_set, offer_made, follow_up, dead
  → Columns: Current Stage, Last Offer, Last Contacted, Last Conversation
Disposition stages: under_contract, marketing, buyer_negotiating, closing, closed
  → Columns: Asking, Contract, Spread, Sends, Buyers, Offers, Showings, DOM
Need new DB fields: lastContactedAt, lastConversationAt on dispoProperties

## Issue 19 - CSV mapping
Already has mapping UI with FIELD_OPTIONS. 
Remove Template button. Add more FIELD_OPTIONS (source, projectType, market).
Only address required.

## Key Line References
- STATUS_CONFIG: line ~2410
- visibleStages: varies by role, line ~2495-2510
- Search bar: line 2773
- Status tabs: line 2831
- Table headers: line 2889
- Table body: line 2920
- Bulk action bar: line 3195
- BuyersTab: line 879
- DispoAITab: line 1475
- FIELD_OPTIONS: line ~3059
- Template button: line ~3128
- PropertyFormDialog: project type at line ~289
- matchBuyersForProperty: server/inventory.ts
- updateOfferStatus: server/inventory.ts
