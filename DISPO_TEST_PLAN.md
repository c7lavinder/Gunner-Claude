# Dispo Manager — Deep Test Plan

This document outlines every feature to test for the new Dispo Manager Day Hub and Inventory page. Work through each section in order. Mark each item as you go.

---

## Pre-requisites

Before testing, you need a team member with the `dispo_manager` role:

1. Go to **Team** page
2. Either create a new team member or edit an existing one
3. Set their role to **Dispo Manager**
4. Link them to a user account (or create a new user for testing)
5. Log in as that user (or use your super_admin account which can see all tabs)

---

## 1. Navigation & Access Control

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 1.1 | Log in as super_admin (Corey) | Should see "Day Hub" and "Inventory" in the sidebar nav | |
| 1.2 | Click "Inventory" in sidebar | Should navigate to `/inventory` page | |
| 1.3 | Click "Day Hub" in sidebar | Should navigate to `/tasks` page | |
| 1.4 | On Day Hub, check role tabs | Should see "Admin", "LM", "AM", "Dispo" tabs at top | |
| 1.5 | Click the "Dispo" tab | Should switch to dispo-specific view (different KPIs, different layout) | |

---

## 2. Day Hub — Dispo Tab

### 2.1 KPI Bar

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 2.1.1 | View the Dispo KPI bar | Should show 5 KPIs: Properties Sent, Showings, Offers, Deals Assigned, Contracts | |
| 2.1.2 | All KPIs should start at 0 | Values show "0 / [target]" with red color (below target) | |
| 2.1.3 | KPI targets should be reasonable | Properties Sent: 5, Showings: 3, Offers: 2, Deals Assigned: 1, Contracts: 1 | |

### 2.2 Left Panel — Inbox Tab

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 2.2.1 | View the Inbox tab | Should show GHL conversations (or "No conversations" if none) | |
| 2.2.2 | If conversations exist, click one | Should show conversation details | |

### 2.3 Left Panel — Showings Tab

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 2.3.1 | Click "Showings" tab in left panel | Should switch to showing appointments view | |
| 2.3.2 | With no showings | Should show "No showings scheduled for today" | |
| 2.3.3 | After adding showings (from Inventory page) | Should show today's showings with property address, buyer, time, status | |

### 2.4 AI Coach

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 2.4.1 | View the AI Coach panel on Dispo tab | Should show the coach chat interface | |
| 2.4.2 | Ask "What properties do I have available?" | Coach should respond with dispo-aware context (may say "no properties" if inventory is empty) | |
| 2.4.3 | Ask "How should I price this property?" | Coach should give dispo-specific advice about pricing strategy, ARV, assignment fees | |
| 2.4.4 | Ask "Send a text to [contact name]" | Coach should be able to execute GHL actions (send SMS) | |

---

## 3. Inventory Page — Property Management

### 3.1 Empty State

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.1.1 | Visit Inventory page with no properties | Should show empty state with "No properties found" message | |
| 3.1.2 | "Add Property" button should be visible | Button should be prominent at top of page | |

### 3.2 Add Property

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.2.1 | Click "Add Property" | Should open a dialog/form with all property fields | |
| 3.2.2 | Fill in required fields only (address, city, state) | Should be able to save with minimal info | |
| 3.2.3 | Fill in ALL fields and save | All fields should save correctly: |
| | | - Address, City, State, ZIP |
| | | - Property Type (house, lot, land, commercial, multi_family, other) |
| | | - Beds, Baths, Sqft, Year Built |
| | | - Contract Price, Asking Price, Assignment Fee, ARV, Est. Repairs |
| | | - Lockbox Code, Occupancy Status |
| | | - Seller Name, Seller Phone |
| | | - Media Link, Description, Notes |
| 3.2.4 | After saving, property appears in list | New property card should show with correct address and status "New" | |
| 3.2.5 | Add a second property | Should appear alongside the first | |

**Test Data — Add these properties:**

| Property | Address | City | State | Contract Price | Asking Price | Type |
|----------|---------|------|-------|---------------|-------------|------|
| Property A | 435 West Woodring | Pulaski | TN | $70,000 | $90,000 | House |
| Property B | 1480 Bloomington Rd | Baxter | TN | $85,000 | $110,000 | Land |
| Property C | 1403 2nd St NE | Cleveland | TN | $15,000 | $20,000 | Lot |
| Property D | 3509 Duke St | Richmond | VA | $30,000 | $45,000 | Lot |
| Property E | 1241 1st Ave | Mount Pleasant | TN | $50,000 | $65,000 | House |

### 3.3 Property Cards

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.3.1 | View property cards | Each card shows: address, city/state, status badge, asking price, contract price | |
| 3.3.2 | Cards show activity counts | Should show sends, offers, showings counts (all 0 initially) | |
| 3.3.3 | Click a property card | Should expand to show full details with tabs | |

### 3.4 Property Detail View

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.4.1 | Click a property card | Should show detail view with tabs: Details, Sends, Offers, Showings | |
| 3.4.2 | Details tab | Should show all property info: financials, description, notes, seller info | |
| 3.4.3 | Edit property | Should be able to modify any field and save | |
| 3.4.4 | Change status | Should be able to change status (New → Marketing → Negotiating → Under Contract → Sold → Dead) | |

### 3.5 Send Tracking

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.5.1 | Click "Sends" tab on a property | Should show sends list (empty initially) | |
| 3.5.2 | Click "Log Send" button | Should open form with: Channel, Buyer Group, Count, Notes | |
| 3.5.3 | Log a send: "SMS" channel, "Nashville Buyers" group, count 47 | Should save and appear in sends list | |
| 3.5.4 | Log another send: "Email" channel, "Chattanooga Buyers" group, count 23 | Should appear as second entry | |
| 3.5.5 | Log a Facebook send: "Facebook" channel, "All Markets" group, count 1 | Should appear as third entry | |
| 3.5.6 | Property card should update | Sends count on the card should now show "3" (or total count) | |

**Available channels:** sms, email, facebook, investor_base, other

### 3.6 Offer Tracking

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.6.1 | Click "Offers" tab on a property | Should show offers list (empty initially) | |
| 3.6.2 | Click "Log Offer" button | Should open form with: Buyer Name, Buyer Phone, Amount, Interest Level, Notes | |
| 3.6.3 | Log offer: "Any Door LLC", $67,000, "high" interest | Should save and appear in offers list | |
| 3.6.4 | Log offer: "Taiwo Daniel", $70,000, "medium" interest | Should appear as second offer | |
| 3.6.5 | Update offer status | Should be able to change: pending → accepted / rejected / countered | |
| 3.6.6 | Property card should update | Offers count on the card should now show "2" | |

**Available interest levels:** hot, warm, cold
**Available offer statuses:** pending, accepted, rejected, countered, withdrawn

### 3.7 Showing Tracking

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.7.1 | Click "Showings" tab on a property | Should show showings list (empty initially) | |
| 3.7.2 | Click "Schedule Showing" button | Should open form with: Buyer Name, Buyer Phone, Date, Time, Notes | |
| 3.7.3 | Schedule showing for TODAY | Should save with status "scheduled" | |
| 3.7.4 | Schedule showing for tomorrow | Should save and appear in list | |
| 3.7.5 | Update showing status | Should be able to change: scheduled → completed / cancelled / no_show | |
| 3.7.6 | Property card should update | Showings count should reflect total | |
| 3.7.7 | Go back to Day Hub → Dispo → Showings tab | Today's showing should now appear in the Day Hub showings panel | |

---

## 4. Status Filter & Search

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 4.1 | Use the status filter dropdown | Should filter properties by status (All, New, Marketing, Negotiating, etc.) | |
| 4.2 | Change a property to "Marketing" status | Property should now appear under "Marketing" filter | |
| 4.3 | Search by address | Should filter properties matching the search text | |
| 4.4 | Search by city | Should filter properties matching the city | |

---

## 5. KPI Auto-Count Verification

After adding test data above, go back to Day Hub → Dispo tab:

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 5.1 | Properties Sent KPI | Should count total sends logged today | |
| 5.2 | Showings KPI | Should count showings scheduled for today | |
| 5.3 | Offers KPI | Should count offers received today | |
| 5.4 | Deals Assigned KPI | Should count properties with status "under_contract" | |
| 5.5 | Contracts KPI | Should count properties with status "sold" | |

---

## 6. Delete Operations

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 6.1 | Delete a send entry | Should remove the send and update count | |
| 6.2 | Delete an offer entry | Should remove the offer and update count | |
| 6.3 | Delete a showing entry | Should remove the showing and update count | |
| 6.4 | Delete a property | Should show confirmation dialog, then remove property and ALL its sends/offers/showings | |

---

## 7. Edge Cases

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 7.1 | Add property with only address (no price) | Should save — prices are optional | |
| 7.2 | Add property with $0 contract price | Should save without error | |
| 7.3 | Very long notes field | Should handle long text without breaking layout | |
| 7.4 | Special characters in address | Should handle characters like #, /, & correctly | |
| 7.5 | Multiple properties with same address | Should allow (different units, etc.) | |

---

## 8. Cross-Feature Integration

| # | Test | Expected Result | Pass? |
|---|------|-----------------|-------|
| 8.1 | AI Coach on Dispo tab knows about inventory | Ask "How many properties do I have?" — should reference actual count | |
| 8.2 | Day Hub showings panel reflects Inventory showings | Today's showings from Inventory should appear in Day Hub | |
| 8.3 | KPIs update in real-time | After adding a send/offer/showing, refreshing Day Hub should show updated KPIs | |

---

## Known Limitations (Phase 2 Features)

These are NOT yet built — do not test:
- Daily task checklist (auto-generated tasks like "Send property X to buyer group Y")
- Smart Blast via GHL (auto-send to tagged buyers)
- AI Asset Generator (PDF flyer, email blast, social post)
- Deal Jacket (structured handoff from AM pipeline)
- Full Kanban board with drag-and-drop
- Engagement meter and aging alerts
- Performance Scorecard

---

## Test Results Summary

| Section | Total Tests | Passed | Failed | Notes |
|---------|------------|--------|--------|-------|
| 1. Navigation | 5 | | | |
| 2. Day Hub Dispo | 10 | | | |
| 3. Inventory CRUD | 25 | | | |
| 4. Filters & Search | 4 | | | |
| 5. KPI Auto-Count | 5 | | | |
| 6. Delete Operations | 4 | | | |
| 7. Edge Cases | 5 | | | |
| 8. Integration | 3 | | | |
| **TOTAL** | **61** | | | |
