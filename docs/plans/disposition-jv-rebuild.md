# Disposition + JV Rebuild — Locked Spec

> Owner: Corey Lavinder
> Status: **SHIPPED 2026-05-11** — all 7 phases live on main. See
> PROGRESS.md Session 83 for the commit list and verification ritual.
> Created: 2026-05-11

This document captures the user-stated requirements verbatim and turns them
into a phased, executable plan. The two areas are independent and can ship
on different days.

---

## Part A — Disposition: Buyer-management modal rewrite

### Pain (Corey's words)

> "The right panel that comes in when editing details is bloated, too big,
> and too many words. Let's turn it to center page modal that is persistent
> in size, background is not scrollable, and has tier, response speed,
> verified funding, purchased before, market that is searchable dropdown for
> multiselect, buybox that is dropdown searchable, and contact info. The add
> button in Match Buyers section should have the same modal that works.
> People should not be deleted from column in Responded in Match Buyers,
> they persist and we start tracking them in Track Responses section. Bulk
> add buyers needs to have all these choices as well and have default
> options to change as well."

### Today's code (grounding)

| Concept | File | Notes |
|---|---|---|
| Buyer edit panel (the bloated one) | `components/disposition/journey/buyer-edit-slideover.tsx` | 394 lines. Right-side slide-over, max-w-md, scrollable body, sticky header + footer. Markets are chips, buybox is chips, tier is `<select>`. |
| Match Buyers kanban + Add-buyer inline form | `components/disposition/journey/section-3-buyer-match.tsx` | 700+ lines. Add-buyer is an inline expanding form (`showAddForm`), NOT a modal. Kanban columns: matched → sent → responded. |
| Bulk Add modal | `components/disposition/journey/bulk-add-modal.tsx` | Modal already, but uses 2 modes (paste / quick-add) with a small column set (firstName/lastName/phone/email/tier/market/notes). No buybox, no verified funding, no purchased before, no response speed. |
| Track Responses section | `components/disposition/journey/section-4-responses.tsx` | Today: kanban of buyers with `intent='interested'` / `'showing_scheduled'`. Buyers move OUT of Section 3 "Responded" column INTO Section 4. |

### What changes (locked)

#### A.1 — New canonical modal component
Create one shared modal: `components/disposition/journey/buyer-modal.tsx`.

- **Layout**: center-page (`fixed inset-0 flex items-center justify-center`),
  fixed width `max-w-2xl`, fixed max-height `min(80vh, 640px)`, body scrolls
  *inside* the modal — page background is **non-scrollable** via
  `overflow-hidden` on `<body>` while open.
- **Persistent size**: same dimensions whether editing 1 field or 20. No
  layout shift when toggling sections.
- **Backdrop**: semi-transparent black, clicking it does NOT close (only the
  X / Cancel close — prevents accidental data loss).
- **Mode prop**: `mode: 'edit' | 'add'` — same component, mode controls
  whether it POSTs a new buyer or PATCHes an existing one.

#### A.2 — Canonical field set (every modal: edit, add, bulk)
| Field | Type | Source | Required? |
|---|---|---|---|
| Contact: name | text | inline | yes |
| Contact: phone (primary) | text | inline | yes |
| Contact: phone (mobile) | text | inline | no |
| Contact: phone (secondary) | text | inline | no |
| Contact: email (primary) | text | inline | no |
| Contact: email (secondary) | text | inline | no |
| Contact: company | text | inline | no |
| Tier | searchable dropdown (single-select) | TIER_OPTIONS const | yes |
| Response Speed | searchable dropdown (single-select) | RESPONSE_SPEED_OPTIONS const | no |
| Verified Funding | checkbox | inline | — |
| Purchased Before | checkbox | inline | — |
| Markets | **searchable dropdown, multi-select** | tenant markets + add-new | yes |
| Buybox | **searchable dropdown, multi-select** | BUYBOX_OPTIONS const | yes |
| Notes | textarea | inline | no |

> "Searchable dropdown" = `SearchableSelect` component (already exists at
> `components/ui/searchable-select.tsx` per section-3 import). Multi-select
> variant displays selected items as removable chips above the search box.

#### A.3 — "Add buyer" button in Match Buyers
- Remove the inline `showAddForm` block in section-3-buyer-match.tsx.
- Replace with: `<button onClick={() => setBuyerModal({ mode: 'add' })}>+ Add Buyer</button>`.
- The modal POSTs to existing `POST /api/properties/[id]/buyers` (already
  accepts the `addForm` payload). Backend gains tolerance for new fields
  (responseSpeed, purchasedBefore — already accepted; verifiedFunding —
  already accepted).

#### A.4 — "Responded" column persistence
**Today**: when a buyer moves to `responded` in Section 3 kanban, the next
state-machine update (rep marks them "interested") **removes them from
Section 3 entirely** because they leave the `responded` stage.

**Spec**: a buyer who has responded stays visible in Section 3 "Responded"
column forever, in addition to whatever Section 4 column they're in. Two
options:

- **Option A (recommended)** — Section 3 Responded column queries
  `everResponded=true` (new derived flag: any historical state
  transition into `responded` OR any inbound message / call from this
  buyer for this property). Section 4 queries current intent state. No
  state-machine change — just decouple the read query.
- **Option B** — keep "responded" as a sticky state and add a separate
  `intent` field for Section 4 progression.

**Decision**: Option A. Cleaner. Database adds nothing new — we already
have `OutreachLog` and `PropertyBuyerStage.respondedAt`. Wire Section 3
Responded column to `respondedAt IS NOT NULL OR EXISTS (OutreachLog
inbound)`.

#### A.5 — Bulk add: same field set + default overrides
Rewrite `bulk-add-modal.tsx` so:

- The "Quick add" mode rows include every canonical field above (12+
  fields). Wide table layout with horizontal scroll inside the modal.
- A "Defaults" bar at the top of the modal lets the rep pre-set
  `tier`, `responseSpeed`, `verifiedFunding`, `purchasedBefore`,
  `markets[]`, `buybox[]`. New rows inherit those defaults; per-row
  overrides win.
- The "Paste" mode stays for CSV/spreadsheet workflows but only parses
  the simple 6-column format. Reps wanting the rich field set use Quick
  add. Add a tooltip explaining the trade-off.

#### A.6 — API surface
- `POST /api/properties/[id]/buyers` — already accepts the rich payload
  for single-buyer add. Confirm verifiedFunding / purchasedBefore /
  responseSpeed all persist. Audit and patch if any field silently
  drops.
- `POST /api/properties/[id]/buyers/bulk-add` — extend payload to accept
  the rich row shape. Backwards compatible: missing fields default to
  what the modal's "Defaults" bar specifies.
- `PATCH /api/buyers/[id]` — already accepts the rich payload. No change.

### Phases — Part A
- **Phase A1**: build `BuyerModal` (new component). Replace
  `BuyerEditSlideover` usage in section 3. Test edit flow end-to-end.
- **Phase A2**: replace the inline add-form in section 3 with
  `BuyerModal mode='add'`. Test single-buyer add.
- **Phase A3**: extend `POST /buyers/bulk-add` and rewrite the bulk
  modal with the rich row shape + defaults bar.
- **Phase A4**: Section 3 "Responded" column persistence. Update the
  match-buyers API to expose `everResponded` per buyer. Update Section
  3 client to keep responded buyers visible always.

---

## Part B — JV lead management

### Pain (Corey's words)

> "The JV entry form does not make sense and I cannot move it from stage
> to stage in Gunner."

### Today's code (grounding)

| Concept | File | Notes |
|---|---|---|
| JV intake form | `components/inventory/log-jv-deal-form.tsx` | 319 lines. Two sections: partner pick + deal details (address, financials, assignment). |
| JV intake API | `app/api/properties/jv-intake/route.ts` | Creates `Property` with `leadSource='JV Partner'`, `acqStatus='NEW_LEAD'`, no GHL opp ID. Creates `PropertyPartner role='sourced_to_us'`. |
| Stage progression | `app/api/properties/[propertyId]/stage/route.ts` (or similar) | All regular properties move stages via GHL pipeline writes (`lib/ghl/client.ts → updateOpportunityStage`). JV deals have no `ghlAcqOppId`, so this path doesn't apply. |

### Root cause of "can't move stage to stage"
JV deals are created with **no GHL opportunity linkage** (`ghlAcqOppId =
null`). Every existing stage-change UI on the property detail page calls
the GHL pipeline write path under the hood. With no opp ID, the write
is a no-op or silently errors. There is no UI affordance to advance a
purely local property through stages.

### What changes (locked)

#### B.1 — JV form redesign
Replace `log-jv-deal-form.tsx` with a focused 3-step intake:

1. **Partner** — searchable single-select (existing pattern from section 3).
2. **Property** — address + city + state + zip. Same address-parse path
   as the regular property POST.
3. **JV terms** — explicit fields (not buried in financials):
   - JV role: `we are the JV partner` / `we sourced this to a partner`
     (radio). This drives the `PropertyPartner.role`:
     `jv_partner` (we're partnering on their deal) vs `sourced_to_us`
     (they brought it to us). Decide the canonical mapping; the current
     code hardcodes `sourced_to_us` for every JV intake which is wrong.
   - JV split: percentage we get vs partner gets (two numbers, must sum
     to 100). Persisted as `PropertyPartner.commissionPercent`.
   - Expected fee: dollar amount we expect to net. Persisted as
     `PropertyPartner.assignmentFeePaid` (rename misleading — see B.3).
   - Notes: free text.

#### B.2 — Stage progression for JV deals (no GHL opp)
Add a **local stage advancement** API path that does not write to GHL.

- New endpoint: `POST /api/properties/[id]/local-stage-change`
  with `{ lane, newStatus }`. Allowed only when the property has no
  opp ID for that lane (`ghlAcqOppId === null && lane === 'acq'`, etc).
- Updates the matching `*Status`, `*StageEnteredAt`, `*StageName`
  columns directly. Writes a `PropertyMilestone` row.
- Property detail UI: when a property's lane has no GHL opp ID, render
  a "Move stage" inline dropdown next to the lane chip that calls the
  local endpoint. (Reuses existing stage display markup.)
- Acq lane: New Lead → Appt Set → Offer Made → Under Contract → Closed.
- Dispo lane: In Disposition → Pushed → Offers → Contracted → Closed.

#### B.3 — Schema cleanup (PropertyPartner)
Today's `PropertyPartner.assignmentFeePaid` is misnamed and never written.
Audit: is this the fee *we* pay the JV partner, or the fee *they* pay us?

Spec:
- Rename to `feeAmount` (semantically neutral) OR add two fields:
  `feeWePay` + `feeWeCollect`. Decide before migrating.
- Add `splitPercent` (Decimal) — our share of the deal.
- Add UI: on the property detail page → JV section → an editable card
  showing role, split %, fee amount(s). Saves PATCH to a new
  `/api/property-partners/[id]` endpoint.

#### B.4 — JV visibility surfaces
- Inventory row: badge "JV" when `leadSource === 'JV Partner'` OR
  `PropertyPartner.role IN ('jv_partner', 'sourced_to_us')`. Already
  partially achievable via leadSource filter; make the badge explicit.
- Disposition portfolio (`/disposition` page): add a "JV" filter chip
  next to existing chips. Filter on the same condition above.
- KPI: a "JV Pipeline" KPI on the partners page → already has
  `Partner.jvHistoryCount`. Audit the compute-aggregates script
  (`scripts/compute-aggregates.ts`) to confirm it counts both legal
  PropertyPartner roles correctly.

### Phases — Part B
- **Phase B1**: rewrite `log-jv-deal-form.tsx` + `jv-intake/route.ts` with
  the 3-step structure and explicit JV terms. Migrate
  `PropertyPartner.assignmentFeePaid` → `feeAmount` + `splitPercent`.
- **Phase B2**: build local-stage-change endpoint + UI. Acq lane first,
  dispo lane second.
- **Phase B3**: JV visibility (inventory badge, dispo filter, KPI audit).

---

## Sequencing

Two reasonable orders:

- **Disposition first (recommended)** — A1 → A2 → A3 → A4, then B1 →
  B2 → B3. Disposition is daily-use; JV is a smaller surface. Shipping
  disposition first means immediate daily-workflow improvement.
- **JV first** — B1 → B2 → B3, then A. Right if JV friction is
  actively blocking deals.

> Corey: pick the order at sign-off below.

---

## Non-negotiables (per CLAUDE.md)

- Every API route: `getSession()` first. Every DB query: tenantId.
- No `<input placeholder="...">` for any CRM mapping. Searchable
  dropdowns only.
- No phase complete until verified end-to-end on Railway prod with
  real data.
- Update `PROGRESS.md` + `docs/SYSTEM_MAP.md` (or `OPERATIONS.md`) per
  session. This plan doc gets struck-through and archived once
  shipped.

---

## Approval

- [x] Corey signed off on the spec (2026-05-11).
- [x] Sequencing locked: disposition first (A1 → A1.1 → A2 → A3 → A4),
      then JV (B2 → B1 → B3; B2 jumped ahead of B1 because the
      inability to advance JV stages was the active blocker).
- [x] **JV semantics locked (2026-05-11)**: a JV partner brings us a
      property they already have under contract and wants us to assign
      the contract to a buyer (or buy it ourselves). They act like a
      seller. So:
      - Property enters our ACQ pipeline at NEW_LEAD on intake.
      - We negotiate / make them an offer on the contract.
      - Once we own it, it flows through DISPO normally.
      - `PropertyPartner.role = 'sourced_to_us'` is the correct value.
      - The fee dynamic is "what we pay them" (assignment fee out) —
        not "what they pay us." So the dollar field is "fee we pay."
      - The **`Buyer.tier='jv'` concept on the buyer side is unrelated
        and out of scope for Part B.** Those are JV buyers — partners
        who help us dispo a deal we already have. Different flow.
