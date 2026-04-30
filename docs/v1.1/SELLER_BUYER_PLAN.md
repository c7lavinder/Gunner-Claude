# Seller / Buyer Integration Plan — v1.1 kickoff (PLAN ONLY)

> **Status:** Draft for Corey review. PLAN ONLY — no code, no schema changes,
> no migrations. Wave 1 does NOT begin until Corey explicitly approves.
> **Author:** Session 60 (2026-04-30)
> **Sprint pre-state:** v1-finish closed at commit `1d41d50`. Reliability scorecard
> dimension #8 (Seller/Buyer contact data model) = 4/10 — the explicit redesign target.
>
> **Decisions locked 2026-04-30 (after first Corey review):**
> - **Q1 → Shape A** (pure live-fetch from GHL on render). GHL-overlap columns
>   on Seller and Buyer are DROPPED. Skip-trace columns added for unlinked
>   sellers. Section 4 narrowed to per-surface fetch decisions.
> - **Q2 → Decompose `Seller.name`** into `firstName` / `middleName` /
>   `lastName` / `nameSuffix`. The legacy `name` column drops at Wave 5
>   cutover; UI formats from parts.
> - **Q3 → Ambiguous Property fields per recommendations:** `absenteeOwner`,
>   `absenteeOwnerInState`, `ownerMailingVacant` (rename to
>   `mailingAddressVacant`) STAY on Property; `seniorOwner`,
>   `deceasedOwner`, `cashBuyerOwner` STRIP to Seller.
>
> Q4-Q7 remain open (sprint-time decisions). Q8 carry-forward unchanged.

---

## 1. Executive summary

The kickoff prompt framed this redesign as greenfield: "Seller/buyer fields
are crammed into the Property model. No `/sellers/[id]` or `/buyers/[id]`
pages exist." A pre-flight audit shows that framing is **out of date by
roughly 18 months of work**:

- `Seller`, `Buyer`, `PropertySeller`, `PropertyBuyerStage`, `DealBlast`,
  `DealBlastRecipient` Prisma models all already exist in
  [prisma/schema.prisma](../../prisma/schema.prisma) — Seller is ~150 columns,
  Buyer is ~150 columns, both with extensive AI-enriched / public-records / portfolio fields.
- `Call.sellerId` and `Call.buyerId` foreign keys already exist
  ([prisma/schema.prisma:1085-1088](../../prisma/schema.prisma#L1085-L1088)) —
  the linkage decision (Section 6) has already been made.
- `app/(tenant)/[tenant]/sellers/[id]/page.tsx` exists. `app/(tenant)/[tenant]/buyers/page.tsx`
  + `[id]/page.tsx` exist. API routes under `app/api/[tenant]/sellers/[id]/`,
  `app/api/[tenant]/buyers/[id]/`, `app/api/properties/[propertyId]/sellers/`,
  `app/api/properties/[propertyId]/buyers/` all exist.
- `extract-deal-intel.ts` already writes per-call deal state into `PropertySeller`
  when `call.sellerId` is set
  ([lib/ai/extract-deal-intel.ts:92-101](../../lib/ai/extract-deal-intel.ts#L92-L101)).

**The actual problem at 4/10 is narrower and more specific:**

1. **GHL boundary leak (Section 4 / Rule 1).** Seller and Buyer both store local
   copies of GHL contact identity (`name`, `phone`, `email`, `mailingAddress`,
   etc.). When `ghlContactId` is set, those locals are duplicated state — the
   "Line That Cannot Be Crossed" from SYSTEM_MAP is being crossed quietly.
2. **Property has duplicative owner-identity columns** (~15 fields:
   `ownerPhone`, `ownerEmail`, `ownerType`, `secondOwnerName/Phone/Email`,
   `ownerFirstName1`/`LastName1`/`FirstName2`/`LastName2`, `ownershipLengthYears`,
   `absenteeOwner`, `seniorOwner`, `deceasedOwner`, `cashBuyerOwner`,
   `ownerPortfolio*` aggregates) that are populated by PropertyRadar enrichment
   into Property and then re-copied into Seller by `lib/enrichment/sync-seller.ts`.
   This is staging-via-Property — Seller is the right destination; Property
   is the wrong staging surface.
3. **`Property.manualBuyerIds` is a JSON array of GHL contact IDs** — a hack
   that bypasses `PropertyBuyerStage`. Should become rows in the join table
   with `stage='added'`.
4. **`/sellers/` list page does NOT exist** (only `/sellers/[id]`). `/buyers/`
   list page exists but is hidden from nav per PROGRESS "Built, hidden from nav."
   The seller surface is half-built.
5. **Property Research tab on `inventory/[propertyId]/`** renders owner identity
   inline (and via `property-detail-client.tsx` lines 3637-3735 for portfolio
   widgets) instead of pulling from PropertySeller → Seller → GHL.

The redesign is therefore **GHL boundary cleanup + Property identity strip +
list-page polish**, not a greenfield entity build. Six waves; the largest
risk is read-path migration of ~30 sites that consume `property.owner*`
fields today.

**This plan is markdown only. No code changes proposed in this artifact.**
The first code commit is gated on Corey approval of:
- Section 4 GHL boundary decision (pure live-fetch vs cache-with-precedence)
- Section 11 open questions

---

## 2. Entity model — field-level diff

Three tables follow. Tables A / B / C plus the join models. Source tags per
Section 0 of the kickoff prompt:

- **[GHL-live-fetch]** — fetched from GHL on render, NEVER stored locally.
  Not a database column.
- **[GHL-cached-id-only]** — only `ghlContactId` stored locally; GHL fetch
  joins in at render.
- **[GHL-cached-fallback]** — local copy of a GHL field, used only when GHL
  fetch fails or `ghlContactId` is null. Authoritative copy lives in GHL.
  Treated as ephemeral. **(Decision needed Section 4 — may be eliminated.)**
- **[skip-trace]** — populated from PropertyRadar `/persons` or BatchData skip
  trace; lives locally because GHL doesn't own it.
- **[AI-extracted]** — populated by `lib/ai/extract-deal-intel.ts` (or related
  extractor). Lives in our DB.
- **[vendor-extracted]** — populated by PropertyRadar / BatchData / RealEstateAPI /
  CourtListener / RentCast. Lives in our DB.
- **[human-input]** — manual edits, rep notes, owner flags toggled in UI.
- **[computed]** — derived from our DB by cron (portfolio aggregates, conversion
  rates, etc.).

### Table A — Property TODAY → Property AFTER STRIP

Property currently has **~210 columns** ([prisma/schema.prisma:190-660](../../prisma/schema.prisma#L190-L660)).
The strip target is **~22 columns moving out** (mostly to Seller). Net
Property size after strip: **~188 columns**.

**Fields to STRIP from Property → SELLER (owner identity & history, ~15 cols):**

| Field | Type | Disposition | Reason |
|---|---|---|---|
| `ownerPhone` | String? | STRIP-TO-SELLER | Already replicated to `Seller.phone` by `sync-seller.ts:99`. Property is staging; Seller is destination. |
| `ownerEmail` | String? | STRIP-TO-SELLER | Same — `Seller.email`. |
| `ownerType` | String? | STRIP-TO-SELLER | Maps to `Seller.ownershipType` via `normalizeOwnerType` in `sync-seller.ts:145`. |
| `secondOwnerName` | String? | STRIP-TO-SELLER (as second Seller row + `Seller.spouseName`) | `sync-seller.ts:108` already writes to `spouseName`. The 2nd-owner row is created via PropertySeller. |
| `secondOwnerPhone` | String? | STRIP-TO-SELLER | Same as above (2nd Seller row) + `Seller.spousePhone`. |
| `secondOwnerEmail` | String? | STRIP-TO-SELLER | Same + `Seller.spouseEmail`. |
| `ownerFirstName1` | String? | STRIP-TO-SELLER | Decompose into Seller name parts (no current Seller.firstName/lastName columns — see Q3 in §11). |
| `ownerLastName1` | String? | STRIP-TO-SELLER | Same. |
| `ownerFirstName2` | String? | STRIP-TO-SELLER (2nd Seller row) | Same. |
| `ownerLastName2` | String? | STRIP-TO-SELLER (2nd Seller row) | Same. |
| `ownershipLengthYears` | Int? | STRIP-TO-SELLER | Maps to `Seller.yearsOwned`. |
| `ownerPortfolioCount` | Int? | STRIP-TO-SELLER | Maps to `Seller.totalPropertiesOwned` (cross-portfolio, person-level). |
| `ownerPortfolioTotalEquity` | Decimal? | STRIP-TO-SELLER | NEW field on Seller (no current home). |
| `ownerPortfolioTotalValue` | Decimal? | STRIP-TO-SELLER | NEW field on Seller. |
| `ownerPortfolioTotalPurchase` | Decimal? | STRIP-TO-SELLER | NEW field on Seller. |
| `ownerPortfolioAvgAssessed` | Decimal? | STRIP-TO-SELLER | NEW field on Seller. |
| `ownerPortfolioAvgPurchase` | Decimal? | STRIP-TO-SELLER | NEW field on Seller. |
| `ownerPortfolioAvgYearBuilt` | Int? | STRIP-TO-SELLER | NEW field on Seller. |
| `ownerPortfolioJson` | Json? | STRIP-TO-SELLER | NEW field on Seller. |

**Q3 resolved 2026-04-30 — formerly ambiguous fields, dispositions locked:**

| Field | Type | Disposition (LOCKED) | Reason |
|---|---|---|---|
| `absenteeOwner` | Boolean? | STAY ON PROPERTY | Property fact — this property is absentee-owned. PropertyRadar reports it per-property. |
| `absenteeOwnerInState` | Boolean? | STAY ON PROPERTY | Same — property-level. |
| `seniorOwner` | Boolean? | STRIP-TO-SELLER | Person-level fact about the owner. |
| `deceasedOwner` | Boolean? | STRIP-TO-SELLER | Person-level fact. |
| `cashBuyerOwner` | Boolean? | STRIP-TO-SELLER | Person-level fact (this person is also a cash buyer); surfacing on Seller detail makes the cross-side flag visible. |
| `ownerMailingVacant` | Boolean? | STAY ON PROPERTY (renamed to `mailingAddressVacant`) | About a property (the owner's mailing property), not the person. Rename in Wave 1 schema migration. |

Three of these (`seniorOwner`, `deceasedOwner`, `cashBuyerOwner`) join the
~15 strip targets above, bringing the **total Property → Seller strip to ~18 columns**.
Two flags (`absenteeOwner`, `absenteeOwnerInState`) stay; one renames in place
(`ownerMailingVacant` → `mailingAddressVacant`).

**Fields to STRIP from Property → PROPERTYBUYERSTAGE (1 col, JSON hack):**

| Field | Type | Disposition | Reason |
|---|---|---|---|
| `manualBuyerIds` | Json `[]` | STRIP-TO-PROPERTYBUYERSTAGE | Currently a JSON array of GHL contact IDs at `prisma/schema.prisma:280`. Migration: for each id, find/create matching Buyer (by `ghlContactId`), insert `PropertyBuyerStage` row with `stage='added'`. Read-path: `lib/buyers/sync.ts` and `app/api/properties/[propertyId]/buyers/route.ts`. |

**Fields that STAY on Property (rest = ~188 cols):**

All property-level facts: address/financial/status/condition/all vendor enrichment that
describes THE PROPERTY (lien_count, tax_delinquent, foreclosure_status, MLS data,
schools, demographics, condition grades, etc.). All Property TCP scoring
(`tcpScore`, `tcpFactors`, `tcpUpdatedAt` — see Section 7). All deal-level
financials (asking, MAO, offer, contract). The legal-distress flags
`inBankruptcy` / `inProbate` / `inDivorce` / `hasRecentEviction` are an
edge case — they're person-level facts but PropertyRadar reports them
keyed off the property's owner record, so they describe "the owner of
this property." Recommendation: **STAY ON PROPERTY** with mirror-write
to Seller (Q5 in §11).

### Table B — Seller (canonical entity, ~145 columns post-redesign)

Seller already has **~150 columns** ([prisma/schema.prisma:729-1007](../../prisma/schema.prisma#L729-L1007)).
After redesign: ~150 + ~18 (from Property strip per Q3 lock) − ~12 (GHL-overlap
fields DROPPED per Q1/Shape A lock) − 1 (`name` collapses into 4 part columns
per Q2 lock; net +3) ≈ **~158 columns**.

Grouped by source tag (counts approximate; exact post-Wave-1 audit will produce the
authoritative inventory):

| Group | Count | Examples | Notes |
|---|---|---|---|
| **[GHL-cached-id-only]** | 1 | `ghlContactId` | The single load-bearing reference. |
| **[GHL-overlap]** — DROPPED per Q1/Shape A | 0 (was ~12) | (removed: `name`, `phone`, `secondaryPhone`, `mobilePhone`, `email`, `secondaryEmail`, `mailingAddress`, `mailingCity`, `mailingState`, `mailingZip`, `mailingZipPlus4`, `mailingCounty`) | Live-fetched from GHL on render. Cache lives in 60s in-memory layer, not in DB. |
| **[skip-trace] — name parts (Q2 lock)** | 4 | `firstName`, `middleName`, `lastName`, `nameSuffix` | NEW columns per Q2. Used when `ghlContactId` is null (skip-traced sellers not yet promoted to GHL contacts) AND for CourtListener exact-name search + person disambiguation. UI formats display name from parts. |
| **[skip-trace] — fallback identity** | 4 | `skipTracedPhone`, `skipTracedEmail`, `skipTracedMailingAddress`, `skipTracedMailingCity/State/Zip` | NEW columns per Q1/Shape A. Render-path fallback when `ghlContactId` is null. Once seller is promoted to a GHL contact, these become orphan history (kept for audit). |
| **[skip-trace] — non-GHL contact data** | ~8 | `mailingValidity`, `mailingDeliveryPoint`, `mailingDpvFootnotes`, `mailingDpvMatchCode`, `dateOfBirth`, `age`, `gender`, `personType` | PropertyRadar `/persons` enrichment metadata (USPS DPV codes etc.). Not in GHL. Stays local. |
| **[vendor-extracted]** — public records / court / portfolio | ~30 | `clCasesJson`, `clBankruptcyCount`, `federalBankruptcyActive`, `civilSuitCountAsDefendant`, `evictionFilingCountAsPlaintiff`, `countyOwnerName`, `countyAssessedValue`, `lastSalePrice`, `parcelId`, `legalDescription`, `deedType`, `zoning`, `schoolDistrict`, etc. | CourtListener + county records. Stays local. |
| **[vendor-extracted] — owner portfolio + person flags (NEW from Property strip)** | ~10 | `totalPropertiesOwned`, `ownerPortfolioTotalEquity`, `ownerPortfolioTotalValue`, `ownerPortfolioTotalPurchase`, `ownerPortfolioAvgAssessed`, `ownerPortfolioAvgPurchase`, `ownerPortfolioAvgYearBuilt`, `ownerPortfolioJson`, `seniorOwner`, `deceasedOwner`, `cashBuyerOwner` | Stripped from Property (Table A — incl. Q3 person flags). |
| **[AI-extracted]** — Claude-derived from calls | ~25 | `motivationPrimary`, `motivationSecondary`, `urgencyScore`, `urgencyLevel`, `saleTimeline`, `hardshipType`, `emotionalState`, `personalityType`, `communicationStyle`, `priceSensitivity`, `objectionProfile`, `recommendedApproach`, `redFlags`, `positiveSignals`, `priceReductionLikelihood`, `motivationScore`, `likelihoodToSellScore`, `aiSummary`, `aiCoachingNotes`, etc. | Populated by `extract-deal-intel.ts`. Stays local. |
| **[AI-extracted] — voice/emotion aggregates** | ~7 | `trustScore`, `trustStepCurrent`, `trustStepArc`, `voiceEnergyTrend`, `primaryEmotionMostFrequent`, `competitorsMentionedByName`, `dealkillersRaised` | Aggregated from per-call promoted fields nightly. |
| **[human-input]** — flags, notes, prefs | ~25 | `doNotContact`, `doNotText`, `isDeceased`, `priorityFlag`, `internalNotes`, `tags`, `customFields`, `preferredContactMethod`, `bestTimeToCall`, `languagePreference`, `relationshipStrength`, `whoReferredThem`, etc. | Manual UI edits. |
| **[human-input] — financial situation** | ~10 | `mortgageBalance`, `monthlyMortgagePayment`, `lenderName`, `interestRate`, `loanType`, `propertyTaxesOwed`, `lienAmount`, `sellerAskingPrice`, `lowestAcceptablePrice`, `amountNeededToClear` | Either rep-entered or AI-extracted; `fieldSources` JSON tracks origin. |
| **[computed]** — interaction & portfolio rollups | ~15 | `totalCallCount`, `responseRate`, `noAnswerStreak`, `lastContactDate`, `firstContactDate`, `totalDealsWithUs`, `totalDealsClosed`, `totalDealsWalked`, `avgDaysToClose`, `closeRate`, `messageResponseRate`, `lastMeaningfulConversationDate`, etc. | Computed by nightly aggregates cron + on-graded triggers. |
| **[computed] — message aggregates** | ~7 | `messageResponseTimeAvgHours`, `messageBestReplyHourOfDay`, `messageBestReplyDayOfWeek`, `messageThreadSentimentTrend`, `messageGhostCheckpoint`, `lastMessageReceivedAt`, `textResponseRate` | Currently scaffolded; will populate "once messages persisted" per inline comments. |

**Justification for the ~158 count delta from "~200 framing":** the
~200 framing was an upper bound assuming a maximalist build that copies
GHL fields locally AND adds full skip-trace AND adds 25-field AI block
AND adds 15-field portfolio block. Reality is mostly already built. With
Q1/Shape A locked (drop ~12 GHL-overlap cols) + Q2 (decompose name → +3 net) +
Property strip (+~18 from Q3-amended Table A), Seller lands at **~158** —
on-spec for "whatever survives discipline" and ≤200.

### Table C — Buyer (canonical entity, ~145 columns post-redesign)

Buyer already has **~150 columns** ([prisma/schema.prisma:1553-1797](../../prisma/schema.prisma#L1553-L1797)).
After redesign: ~150 − ~12 (GHL-overlap fields DROPPED per Q1/Shape A lock) +
~5 (skip-trace fallback columns for unlinked buyers) ≈ **~143 columns**.

| Group | Count | Examples | Notes |
|---|---|---|---|
| **[GHL-cached-id-only]** | 1 | `ghlContactId` | Same load-bearing reference. |
| **[GHL-overlap]** — DROPPED per Q1/Shape A | 0 (was ~12) | (removed: `name`, `phone`, `secondaryPhone`, `mobilePhone`, `email`, `secondaryEmail`, `company`, `mailingAddress`, `mailingCity`, `mailingState`, `mailingZip`, `website`) | Live-fetched from GHL on render. |
| **[skip-trace] — fallback identity** | ~5 | `skipTracedName`, `skipTracedPhone`, `skipTracedEmail`, `skipTracedCompany`, `skipTracedMailingAddress` | NEW columns per Q1/Shape A. Render-path fallback when `ghlContactId` is null (rare for buyers — most are added with a GHL contact already). |
| **[human-input]** — buybox geographic | ~8 | `primaryMarkets`, `countiesOfInterest`, `citiesOfInterest`, `zipCodesOfInterest`, `neighborhoodsOfInterest`, `geographicExclusions`, `maxDriveDistanceMiles`, `urbanRuralPreference` | Buyer self-report or rep-entered. |
| **[human-input]** — buybox property | ~20 | `propertyTypes`, `minBeds`, `maxBeds`, `minBaths`, `maxBaths`, `minSqft`, `maxSqft`, `conditionRange`, `maxRepairBudget`, `structuralIssuesOk`, `tenantOccupiedOk`, `prefersVacant`, etc. | Same. |
| **[human-input]** — buybox financial | ~20 | `minPurchasePrice`, `maxPurchasePrice`, `maxArvPercent`, `proofOfFundsOnFile`, `pofAmount`, `pofExpiration`, `hardMoneyLender`, `typicalCloseTimelineDays`, `canCloseAsIs`, etc. | Same. |
| **[human-input]** — relationship & strategy | ~15 | `assignedToId`, `howAcquired`, `referralSourceName`, `relationshipStrength`, `personalNotes`, `birthday`, `spouseName`, `keyStaffNames`, `lastInPersonMeeting`, `isVip`, `hasExclusivityAgreement`, `exitStrategies`, `is1031Active`, `creativeFinanceInterest`, etc. | Same. |
| **[vendor-extracted]** — entity / public records | ~10 | `entityLegalName`, `entityEin`, `entityState`, `entityStatus`, `realEstateLicenseNumber`, `civilSuitCountAsDefendant`, `emdForfeitureCountHistorical`, `contractDisputeCountHistorical`, `googleBusinessRating`, `bbbRating`, `biggerPocketsMentions` | OpenCorporates / web research. |
| **[AI-extracted]** | ~10 | `buyerScore`, `matchLikelihoodScore`, `reliabilityPrediction`, `communicationStyleAi`, `negotiationStyle`, `ghostRiskScore`, `upsellPotential`, `lifetimeValueEstimate`, `aiSummary`, `recommendedApproach`, `redFlagsAi`, `churnRisk` | Buyer-level AI scoring. |
| **[computed]** — activity & funnel rollups | ~18 | `buyerSinceDate`, `lastDealClosedDate`, `totalDealsClosedWithUs`, `averageDealPrice`, `averageSpreadAccepted`, `blastResponseRate`, `offerRate`, `closeRate`, `dealsFallenThrough`, `totalVolumeFromUs`, `referralsConverted`, `reliabilityScore`, `communicationScore`, `buyerGrade`, `offersSentCount`, `offersAcceptedCount`, `conversionRateSentToAccepted`, `conversionRateAcceptedToClosed` | Nightly aggregates from `PropertyBuyerStage` + `DealBlastRecipient`. |
| **[computed]** — message aggregates | ~6 | `messageResponseRate`, `messageBestReplyHourOfDay`, `messageBestReplyDayOfWeek`, `messageGhostCheckpoint`, `linkCTRate`, `blastOpenToOfferConversion` | Same scaffold as Seller. |
| **[human-input]** — comm settings & VIP | ~15 | `blastFrequency`, `bestBlastDay`, `bestBlastTime`, `preferredBlastChannel`, `unsubscribedFromEmail`, `unsubscribedFromText`, `tierClassification`, `copyOnEmails`, `badWithUsFlag`, `priorityFlag`, `internalNotes`, `tags`, `customFields`, etc. | Manual UI. |

**Justification for ~143 count:** Buyer is mostly buybox and activity
data — neither is in GHL — so the GHL-overlap subtraction (~12) is the only
material change. The "~200" framing for Buyer was high. Buyer drops more
proportionally than Seller because it has zero owner-portfolio fields to
gain back from a Property strip — the strip targets are all seller-side.

### Join tables

**`PropertySeller`** ([prisma/schema.prisma:1009-1033](../../prisma/schema.prisma#L1009-L1033)) — keeps current shape:

```
@@id([propertyId, sellerId])    // compound PK = built-in dedupe
@@map("property_sellers")
```

Plus 8 deal-state columns (`sellerResistanceLevel`, `lastConversationSummary`,
`nextFollowupDate`, `competingOffersCount`, `sellerTimelineConstraint`,
`estimatedDaysToDecision`, `currentObjections`, `negotiationStage`) populated
by `extract-deal-intel.ts`. **No change proposed.**

**`PropertyBuyerStage`** ([prisma/schema.prisma:1803-1847](../../prisma/schema.prisma#L1803-L1847)) — keeps
current shape with `@@unique([propertyId, buyerId])` and ~22 deal-state
columns (offer amount, EMD, inspection, etc.). **One change proposed:**
add `source String @default("matched")` to disambiguate matched-from-buybox
vs added-manually-from-Property-detail (today the latter writes to
`Property.manualBuyerIds`; post-strip both paths land in this table and
`source` tells them apart).

**Cascade rules:** `onDelete: Cascade` on both join tables for both FKs —
already in place. If a Seller is hard-deleted, all PropertySeller rows go
with it; same for Buyer / PropertyBuyerStage. (Hard-delete itself remains
gated by `requireApproval` per Rule 4.)

---

## 3. Page flows

### Navigation graph

```mermaid
flowchart TD
  Dashboard[/{tenant}/dashboard/]
  Inventory[/{tenant}/inventory/ list]
  PropDetail[/{tenant}/inventory/[propertyId]/]
  ResearchTab[Research tab on PropDetail]
  CallDetail[/{tenant}/calls/[callId]/]

  SellersList[/{tenant}/sellers/ <br/> NEW — list view]
  SellerDetail[/{tenant}/sellers/[id]/ <br/> EXISTS — needs polish]

  BuyersList[/{tenant}/buyers/ <br/> EXISTS — currently hidden from nav]
  BuyerDetail[/{tenant}/buyers/[id]/ <br/> EXISTS]

  Dashboard --> Inventory
  Dashboard --> SellersList
  Dashboard --> BuyersList
  Inventory --> PropDetail
  PropDetail --> ResearchTab
  ResearchTab -->|Sellers sub-tab| SellerDetail
  ResearchTab -->|Buyers sub-tab| BuyerDetail
  PropDetail --> CallDetail
  CallDetail -->|Call.sellerId set| SellerDetail
  CallDetail -->|Call.buyerId set| BuyerDetail
  SellerDetail -->|Properties tab| PropDetail
  BuyerDetail -->|Stage list| PropDetail
```

### Surface inventory (current vs needed)

| Surface | Status | Notes |
|---|---|---|
| `app/(tenant)/[tenant]/sellers/` (list) | **MISSING** | Wave 3. List of all Sellers, sortable by `lastContactDate` / `motivationScore` / `totalDealsWithUs`. |
| `app/(tenant)/[tenant]/sellers/[id]/page.tsx` | EXISTS (5KB) | Wave 3. Polish: tabs (Overview / Properties / Calls / Public Records / Comms / AI). Today renders flat. |
| `app/(tenant)/[tenant]/buyers/page.tsx` | EXISTS | Wave 3. Currently uses `requireSession()` not `withTenant` — migrate. Surface in nav (Wave 3). |
| `app/(tenant)/[tenant]/buyers/[id]/page.tsx` | EXISTS | Wave 3. Polish: tabs (Overview / Buybox / Stage Pipeline / Blasts / AI). |
| `app/(tenant)/[tenant]/inventory/[propertyId]/page.tsx` Research tab | EXISTS but renders owner inline | Wave 3. Add Sellers sub-tab + Buyers sub-tab. Sellers reads from `PropertySeller → Seller`; Buyers reads from `PropertyBuyerStage → Buyer`. |

### Access matrix

| Surface | OWNER | ADMIN | ACQUISITION_MANAGER | LEAD_MANAGER | DISPOSITION_MANAGER |
|---|---|---|---|---|---|
| `/sellers/` list | ✓ all | ✓ all | ✓ all | ✓ assignedTo=me only | ✗ |
| `/sellers/[id]` | ✓ | ✓ | ✓ if assignedTo=me OR property.assignedTo=me | ✓ if assignedTo=me OR call.assignedTo=me | ✗ |
| `/buyers/` list | ✓ all | ✓ all | ✗ | ✗ | ✓ all |
| `/buyers/[id]` | ✓ | ✓ | ✗ | ✗ | ✓ |

These mirror the existing `/inventory` access rules — no new access logic invented;
implementation reuses `withTenant` + `ctx.userRole` and same role-scope filters as
inventory list page.

---

## 4. GHL contact-fetch boundary

**Q1 RESOLVED 2026-04-30 — Shape A locked.** The two shapes are documented
below for posterity; only Shape A is implemented.

### Shape A — Pure live-fetch (LOCKED)

When `Seller.ghlContactId` (or `Buyer.ghlContactId`) is set, the local
`name` / `phone` / `email` / `mailingAddress` columns are **dropped from
the schema entirely**. Identity is resolved at request time:

```typescript
// pseudo
const seller = await db.seller.findFirst({ where: { id, tenantId } })
const ghlContact = seller.ghlContactId
  ? await ghlClient.getContact(seller.ghlContactId, tenantId)
  : null
const identity = ghlContact ?? { name: seller.skipTracedName, phone: seller.skipTracedPhone, ... }
```

**Pros:**
- Strict GHL boundary discipline. Rule 1 holds without footnotes.
- One source of truth at any moment; can't drift.
- Smaller schema (~10-12 columns drop from Seller, ~10 from Buyer).

**Cons:**
- Every Seller/Buyer page paint = N GHL API calls. Mitigate with per-request
  batch fetch + 60s in-memory cache; still adds latency.
- Search by phone/email/name now means searching GHL, not local DB.
  `/sellers/` list filter UX gets harder. (Mitigation: search by GHL contact
  search, then resolve to local Seller rows by `ghlContactId`.)
- Skip-traced sellers (no `ghlContactId` yet) need separate `skipTracedName` /
  `skipTracedPhone` / `skipTracedEmail` columns to hold their identity until
  promoted to a GHL contact.

### Shape B — Cache-with-precedence

Keep current `name` / `phone` / `email` columns on Seller/Buyer, but document
them as `[GHL-cached-fallback]`. Render path always tries GHL fetch first;
cache is fallback when fetch fails or `ghlContactId` is null.

**Pros:**
- No schema deletion. Migration is documentation-only on these columns.
- Search-by-name on `/sellers/` works against local rows (still cheap).
- Smaller wave (no rename, no skip-trace column split).

**Cons:**
- The cache will drift. GHL rep edits a phone number, our cache doesn't update
  unless we re-fetch and write back, or we get a webhook update.
- Rule 1 holds with an asterisk: "GHL is authoritative, but here's a cache."
  Future Claude sessions will read the cache and treat it as truth.

### Per-surface fetch decisions (Shape A — LOCKED)

| Surface | Field | Source |
|---|---|---|
| `/sellers/` list (row label) | name | Live-fetch in batch on render |
| `/sellers/` list (row label fallback) | name | `Seller.skipTracedName` if `ghlContactId` null |
| `/sellers/[id]` Overview | name, phone, email, mailing | Live-fetch from GHL |
| `/sellers/[id]` Overview (fallback) | name/phone/email/mailing | `skipTracedName/Phone/Email/Address` |
| `/sellers/[id]` Properties tab | property addresses | Local DB only (Property is ours) |
| `/sellers/[id]` Calls tab | call list | Local DB only |
| `/sellers/[id]` Public Records | court / portfolio | Local DB only ([vendor-extracted]) |
| `/buyers/[id]` Overview | name, phone, email, company | Live-fetch from GHL |
| `/buyers/[id]` Overview (fallback) | name/phone/email | `skipTracedName/Phone/Email` (if seeded) |
| `/buyers/[id]` Buybox | all buybox fields | Local DB only ([human-input]) |
| `inventory/[propertyId]/` Research → Sellers sub-tab | seller name + phone | Live-fetch via batch |
| `inventory/[propertyId]/` Research → Buyers sub-tab | buyer name + phone | Live-fetch via batch |
| Call detail "About this seller" sidebar | seller name + phone | Live-fetch (single GHL call) |

**Decision: Shape A locked 2026-04-30.** The whole point of the 4/10 → 8/10
lift is ending the boundary leak structurally. Shape A's latency cost
(per-paint GHL fetch) is mitigated via the 60s in-memory cache + per-request
batch fetch.

**Implementation implications now locked into Wave 1:**
- ~12 GHL-overlap columns DROPPED from Seller (`name`, `phone`, `secondaryPhone`,
  `mobilePhone`, `email`, `secondaryEmail`, `mailingAddress`, `mailingCity`,
  `mailingState`, `mailingZip`, `mailingZipPlus4`, `mailingCounty`).
- ~12 GHL-overlap columns DROPPED from Buyer (`name`, `phone`, `secondaryPhone`,
  `mobilePhone`, `email`, `secondaryEmail`, `company`, `mailingAddress`,
  `mailingCity`, `mailingState`, `mailingZip`, `website`).
- Seller gains `firstName`, `middleName`, `lastName`, `nameSuffix` (Q2 lock).
- Seller gains skip-trace fallback columns (`skipTracedPhone`,
  `skipTracedEmail`, `skipTracedMailingAddress`, `skipTracedMailingCity/State/Zip`).
- Buyer gains skip-trace fallback columns (`skipTracedName`, `skipTracedPhone`,
  `skipTracedEmail`, `skipTracedCompany`, `skipTracedMailingAddress`).
- New `lib/ghl/contact-resolver.ts` helper: per-request batch GHL fetch +
  60s in-memory cache. Takes `tenantId` explicitly per AGENTS.md Class 4 hardening.
- Drops are gated by full read-path migration (Wave 3). They land in Wave 5
  with the rest of the strip cutover, NOT in Wave 1.

---

## 5. AI enrichment — extraction → field mapping

`extract-deal-intel.ts` runs after every grade
([lib/ai/extract-deal-intel.ts](../../lib/ai/extract-deal-intel.ts)). Today
it writes to:

1. `Call.dealIntelHistory` (proposed-changes JSON)
2. `Call.callPrimaryEmotion` / `callVoiceEnergyLevel` / `callTrustStep` /
   `callFollowupCommitment` / `callBestOfferMentioned` / `callDealkillersSurfaced` /
   `callCompetitorsMentioned` (per-call promoted fields, write directly)
3. `PropertySeller.{sellerResistanceLevel, lastConversationSummary, nextFollowupDate,
   competingOffersCount, sellerTimelineConstraint, estimatedDaysToDecision,
   currentObjections, negotiationStage}` (per-deal state, write directly)

### Proposed extension — Seller rollups

Today the system prompt asks for `proposedChanges[]` keyed against Property
field names. Many of those proposals are actually **seller-level** facts
(motivation, hardship, timeline, etc.) and end up applied to Property today
(via the propose-edit-confirm UI on call detail). Post-strip, those proposed
changes route to `Seller`, not `Property`, when `call.sellerId` is set.

**New mapping table (proposed):**

| Extracted field | Today writes to | After redesign | Trigger | Conflict resolution |
|---|---|---|---|---|
| `motivation` (free text) | `Property.dealIntel.motivation` JSON | `Seller.motivationPrimary` + `Seller.situation` | post-grade if `call.sellerId` set | Latest call wins for `motivationPrimary`. `Seller.situation` is rolling summary (cumulative). |
| `urgencyScore` | `Property.dealIntel` JSON | `Seller.urgencyScore` | post-grade | Latest wins. |
| `saleTimeline` | `Property.dealIntel` JSON | `Seller.saleTimeline` | post-grade | Latest wins. **Conflict: if last call said "asap" and this one says "flexible," log to `Call.dealIntelHistory` with `changeKind: "contradicted"` so rep notices.** |
| `hardshipType` | `Property.dealIntel` JSON | `Seller.hardshipType` | post-grade | Additive — append-only history in JSON column for future, latest scalar in column. |
| `isProbate` / `isForeclosure` / `isDivorce` / `isBankruptcy` | `Property.in*` flags | `Seller.is*` flags + mirror to `Property.in*` (Q5 in §11) | post-grade | Latest wins. Once true, never auto-flips false (manual unflip only). |
| `objectionProfile` | `Property.dealIntel.objections` | `Seller.objectionProfile` (additive) + `PropertySeller.currentObjections` (latest only) | post-grade | Additive on Seller (rolling); replace on PropertySeller (latest call). |
| `redFlags` | `Property.dealIntel` JSON | `Seller.redFlags` | post-grade | Additive. |
| `positiveSignals` | `Property.dealIntel` JSON | `Seller.positiveSignals` | post-grade | Additive. |
| `motivationScore` | none today | `Seller.motivationScore` | post-grade | Weighted EMA across last 5 calls (configurable). |
| `likelihoodToSellScore` | none today | `Seller.likelihoodToSellScore` | post-grade | EMA. |
| `personalityType` / `communicationStyle` / `priceSensitivity` | none today | `Seller.{personalityType,communicationStyle,priceSensitivity}` | post-grade if 3+ calls available | Mode (most-frequent) across calls; rep can override. |

### Backfill strategy for cumulative fields

For Sellers that have prior calls but no rollup yet (Wave 4 backfill):
1. Iterate Sellers WHERE `lastContactDate IS NOT NULL`.
2. For each, replay extraction-rollup over their existing `Call.dealIntelHistory`
   payloads (no new Claude calls — rebuild from already-extracted JSON).
3. Run nightly aggregates cron pass to compute message + portfolio rollups.

### Conflict semantics — cumulative vs latest

| Field shape | Behavior |
|---|---|
| Scalar — latest wins | `motivationPrimary`, `saleTimeline`, `urgencyScore`. Newest non-null call's value writes through. |
| Scalar — EMA / weighted | `motivationScore`, `likelihoodToSellScore`. Computed across last N calls. |
| List — additive | `objectionProfile`, `redFlags`, `positiveSignals`, `dealkillersRaised`. New items appended, dedup by canonical key. |
| List — progress-semantic (shrinks) | `topicsNotYetDiscussed` / `currentObjections` (PropertySeller). Items REMOVED when addressed (already implemented in extract-deal-intel system prompt with `changeKind: "resolved"`). |
| Mode — most-frequent across calls | `personalityType`, `communicationStyle`, `priceSensitivity`. Requires 3+ calls. |

---

## 6. Call ↔ Seller / Buyer linkage decision

**Decision: keep current direct-FK linkage. No design change.**

Rationale:
- `Call.sellerId` and `Call.buyerId` already exist
  ([prisma/schema.prisma:1085-1088](../../prisma/schema.prisma#L1085-L1088)).
- `extract-deal-intel.ts:92-101` already writes to `PropertySeller` keyed by
  `(call.propertyId, call.sellerId)`.
- AI Coach, Role Assistant, Coach Sidebar all already query by these FKs.
- Deriving Seller/Buyer through `Call.propertyId → PropertySeller → Seller`
  would force a 2-hop join on every read for no win — and would break
  the case where a Call has a Seller but no Property (early-funnel calls
  before property creation).

**Read paths affected by this decision (none change):**

| Read path | File | Today |
|---|---|---|
| AI Coach context | `lib/ai/coach.ts` | Already uses `Call.sellerId`. |
| Role Assistant tools | `lib/ai/assistant-tools.ts` | Reads via `Call.sellerId`. |
| TCP scorer | `lib/ai/scoring.ts` | Reads via `Property.calls`. |
| KPI rollups | `lib/kpis/dial-counts.ts` | No seller scope today. |
| Call detail "About this seller" | `app/(tenant)/[tenant]/calls/[id]/...` | Reads `Call.seller`. |

**Side decision (Q4 in §11):** when a Call lands with `propertyId` set but
`sellerId NULL`, should the grading worker auto-link by matching
`call.ghlContactId → Seller.ghlContactId`? Today this is done lazily in
`extract-deal-intel.ts`; a more aggressive auto-link would close some gaps
but risks mis-linking. Recommendation: yes, but ONLY when the
`(propertyId, ghlContactId)` pair has a unique match in `PropertySeller →
Seller`. Otherwise leave `sellerId NULL` and surface in admin queue.

---

## 7. TCP-equivalent decision

Today TCP lives on `Property.tcpScore` (8-factor weighted ensemble in
`lib/ai/scoring.ts`).

**Decision matrix:**

| Entity | Score | Source | Recalc trigger |
|---|---|---|---|
| **Property** | `Property.tcpScore` (0.0-1.0) | KEEP. 8-factor ensemble. Property × Seller × market signals combined. | call graded, pipeline stage change, task completed, appointment set/no-show. |
| **Seller** | `Seller.likelihoodToSellScore` (0.0-1.0) | EXISTS but currently null on most rows. PROMOTE: compute on every graded call where `call.sellerId` set. Aggregates motivation across all the seller's properties. | post-grade if `call.sellerId` set; nightly rebuild for stragglers. |
| **Buyer** | `Buyer.matchLikelihoodScore` (0.0-1.0) per-property | EXISTS but stored at Buyer level — wrong. REDESIGN: move to `PropertyBuyerStage.matchScore` (per-property fit), keep `Buyer.buyerScore` as cross-portfolio reliability score. | matched-from-buybox event, blast sent, response received. |

**Differences from Property TCP:**

- **Property TCP** answers: "Will THIS deal close?" — combines property facts
  (equity, condition), seller motivation, team engagement, market signals.
- **Seller likelihoodToSell** answers: "Will THIS person sell SOMETHING?" —
  cross-portfolio motivation × hardship × urgency. Independent of any one property.
- **Buyer matchScore** (per-property) answers: "Does this buyer's buybox match
  THIS property?" — pure rules engine, deterministic.
- **Buyer reliability score** answers: "Does this buyer historically close
  on what they offer?" — `closeRate × communicationScore × ghostRiskScore`.

**Sort order on list pages:**

| Page | Default sort |
|---|---|
| `/sellers/` | `likelihoodToSellScore DESC, lastContactDate DESC` |
| `/buyers/` | `tierClassification ASC ('A_list' first), reliabilityScore DESC` |
| `/inventory/` | `tcpScore DESC` (today; no change) |

**Open question Q6 in §11:** does Seller need Buy Signal pairing (high
score + low engagement)? Property has it as TCP × `daysSinceLastContact`.
For Seller it would be `likelihoodToSellScore × daysSinceLastContact`.

---

## 8. Migration plan

The schema strip is the riskiest step because ~30 read sites consume
`property.owner*` fields today. Sequenced for additive changes first,
strip last.

**Wave 1 — additive schema (1 migration):**
1. Add ~10 new columns to `Seller` (portfolio totals + person flags from
   Q3 lock: `seniorOwner`, `deceasedOwner`, `cashBuyerOwner`).
2. Add `firstName`, `middleName`, `lastName`, `nameSuffix` to Seller (Q2 lock).
3. Add skip-trace fallback columns per Q1/Shape A:
   - Seller: `skipTracedPhone`, `skipTracedEmail`, `skipTracedMailingAddress`,
     `skipTracedMailingCity`, `skipTracedMailingState`, `skipTracedMailingZip`.
   - Buyer: `skipTracedName`, `skipTracedPhone`, `skipTracedEmail`,
     `skipTracedCompany`, `skipTracedMailingAddress`.
4. Add `source` column to `PropertyBuyerStage` (default `"matched"`).
5. Rename `Property.ownerMailingVacant` → `mailingAddressVacant` (Q3 lock).
6. NO column drops in this wave — additive only. The ~22 Property strip
   columns + ~24 Seller/Buyer GHL-overlap drops all land in Wave 5.

**Wave 2 — backfill + dual-write:**
1. Backfill: copy `Property.owner*` fields into the right Seller rows. Match
   on `Property.ghlContactId → Seller.ghlContactId` if present, else create
   a new Seller row + PropertySeller link.
2. `lib/enrichment/sync-seller.ts` already does this for new properties; the
   backfill is a one-time job for existing ~N properties.
3. Backfill: for each `Property.manualBuyerIds[]` entry, find/create Buyer
   by `ghlContactId`, insert `PropertyBuyerStage` row with `stage='added'`,
   `source='manual'`.
4. **Dual-write window begins.** PropertyRadar enrichment continues writing
   to `Property.owner*` AND to Seller via `sync-seller.ts`. Read sites
   continue reading from Property. No behavior change yet.

**Wave 3 — read-path migration:**
1. Migrate ~30 read sites (enumerated by grep in pre-flight) from
   `property.owner*` → `property.sellers[0].seller.*` (or live-fetch under
   Shape A). Sites:
   - `lib/properties.ts`
   - `lib/enrichment/enrich-property.ts` (selects)
   - `lib/enrichment/sync-seller.ts` (reads + writes)
   - `lib/realestateapi/client.ts`, `lib/batchdata/client.ts`,
     `lib/propertyradar/client.ts` (vendor field landings)
   - `app/(tenant)/[tenant]/inventory/[propertyId]/page.tsx`
   - `components/inventory/property-detail-client.tsx` (~30 read points,
     including portfolio widgets at lines 3637-3735)
   - `app/api/properties/[propertyId]/blast/route.ts`
   - `app/api/properties/[propertyId]/buyers/route.ts` (drops manualBuyerIds read)
2. New surfaces:
   - `/{tenant}/sellers/` list page (NEW).
   - Polish `/{tenant}/sellers/[id]` (tabs).
   - Surface `/{tenant}/buyers/` in nav.
   - Migrate `/{tenant}/buyers/page.tsx` from `requireSession()` to `withTenant`.
   - Property detail Research tab → add Sellers sub-tab + Buyers sub-tab.

**Wave 4 — AI enrichment integration:**
1. Update `extract-deal-intel.ts` system prompt to route motivation/hardship/timeline
   proposals to Seller fields, not Property `dealIntel` JSON.
2. Add Seller rollup pass to extract-deal-intel post-call.
3. Backfill: replay `Call.dealIntelHistory` over existing Sellers (no new
   Claude calls — rebuild from already-extracted JSON per Section 5 backfill).
4. TCP scorer (`lib/ai/scoring.ts`): add Seller likelihoodToSell write on
   every recalc.

**Wave 5 — strip Property + Seller/Buyer GHL-overlap + cutover:**
1. Verify dual-write cutover: every property in production has the new
   Seller rows; every read site has been migrated; pre-flight grep returns
   zero hits for `property.ownerPhone` / `ownerEmail` / `ownerType` /
   `secondOwner*` / `ownerFirstName*` / `ownerLastName*` /
   `ownershipLengthYears` / `ownerPortfolio*` / `manualBuyerIds` /
   `seniorOwner` / `deceasedOwner` / `cashBuyerOwner` /
   `seller.name` / `seller.phone` / `seller.email` / `seller.mailing*` /
   `buyer.name` / `buyer.phone` / `buyer.email` / `buyer.company` / etc.
2. Drop the ~22 Property strip columns + ~12 Seller GHL-overlap columns +
   ~12 Buyer GHL-overlap columns + legacy `Seller.name` (replaced by name parts).
   ~46 column drops total in a single migration.
3. Remove dual-write from `sync-seller.ts` — Seller is sole destination.
4. Property strip is irreversible without a restore. **Tag a Railway
   database snapshot before this migration.**

**Wave 6 — verification + handoff:**
1. Live verification on Railway URL: spot-check 5 properties, confirm
   Seller / Buyer / PropertySeller / PropertyBuyerStage data is correct
   and rendering on detail pages.
2. PROGRESS.md / SYSTEM_MAP.md / OPERATIONS.md updates per Rule 8.
3. Reliability scorecard rescore on dimension #8 (target: 4 → 8).
4. Hand off to next sprint.

### Risks + mitigations

| Risk | Mitigation |
|---|---|
| GHL rate limit blowup under Shape A live-fetch | Per-request batch + 60s in-memory cache; pre-warm on list-page render. |
| Backfill creates duplicate Sellers (same person, multiple properties) | Match on `ghlContactId` first, then on normalized phone, then on (firstName + lastName + state). Log ambiguous cases to admin queue. |
| Wave 5 strip has a missed read site | Wave 3 grep + a CI pre-commit grep that fails if `property.ownerPhone` etc. appear in src/. Property strip migration runs in a transaction; any FK violation rolls back. |
| Production traffic during cutover | Wave 5 migration runs in a Railway maintenance window (~5 min). Document and announce. |
| Cumulative AI rollups on Seller drift from per-call ground truth | Append-only history JSON column on Seller (`motivationHistoryJson`) so the rollup can be rebuilt. Latest scalar is convenience; history is truth. |

### Rollback plan if cutover fails

Wave 1-4 are additive — rolling back means dropping the new columns and
the dual-write code, no data loss.

Wave 5 is the only destructive wave. If cutover fails:
1. Restore from the pre-Wave-5 Railway snapshot (RPO ≤ 1 hour).
2. Revert the strip migration commit.
3. Re-deploy. Loses any production data created during the failed window
   (typically minutes, not hours).
4. Investigate, re-attempt with the lesson learned.

**Dual-write or hard cutover?** Dual-write through Wave 2-4. Hard cutover
at Wave 5 (necessary because the column drops are destructive). The
dual-write window is ~2-3 sprint days of co-existence, long enough to
catch any read site that was missed.

---

## 9. Leak-class proof

For every NEW route this redesign introduces, the four leak classes from
AGENTS.md are designed out from the start. Routes added:

### Routes added

| Route | Method(s) | Pattern |
|---|---|---|
| `app/api/[tenant]/sellers/route.ts` | GET (list), POST (create) | NEW |
| `app/api/[tenant]/sellers/[sellerId]/route.ts` | GET, PATCH, DELETE | EXISTS at `app/api/[tenant]/sellers/[id]/` — refactor to `[sellerId]` for AGENTS.md naming convention. |
| `app/api/properties/[propertyId]/sellers/route.ts` | (GET, POST, DELETE) | EXISTS — canonical DiD-via-FK reference per AGENTS.md, no changes. |
| `app/api/[tenant]/buyers/route.ts` | GET (list), POST (create) | NEW (today buyer list is loaded server-side from `app/(tenant)/[tenant]/buyers/page.tsx`; promote to API for filter/sort.) |
| `app/api/[tenant]/buyers/[buyerId]/route.ts` | GET, PATCH, DELETE | EXISTS at `app/api/[tenant]/buyers/[id]/` — refactor to `[buyerId]`. |
| `app/api/properties/[propertyId]/buyers/route.ts` | GET, POST, DELETE | EXISTS — refactor to drop `manualBuyerIds` JSON read path; route through PropertyBuyerStage. |
| `app/api/properties/[propertyId]/buyer-stage/route.ts` | PATCH | EXISTS — already canonical pattern (Wave 3 batch 5 reference for upsert leak class). |
| `app/api/sellers/[sellerId]/skip-trace/route.ts` | POST | EXISTS. Audit for Class 4 helper hardening. |

### Class 1-4 designed out

**Class 1 — chained-update (find-then-update with id-only WHERE).** All
PATCH/DELETE handlers use `withTenant` and pass `tenantId: ctx.tenantId`
in EVERY db.* WHERE clause, including chained updates after findFirst
guards. Pattern:

```ts
export const PATCH = withTenant<{ sellerId: string }>(async (req, ctx, params) => {
  // findFirst with tenantId — guard
  const existing = await db.seller.findFirst({
    where: { id: params.sellerId, tenantId: ctx.tenantId },
  })
  if (!existing) return notFound()
  // update with tenantId in WHERE — defense-in-depth
  const updated = await db.seller.update({
    where: { id: params.sellerId, tenantId: ctx.tenantId },
    data: { ... },
  })
  return NextResponse.json(updated)
})
```

**Class 2 — id-only findUnique + JS-side tenantId comparison.** Forbidden
in this redesign. Every find is `findFirst` with `tenantId` in WHERE. No
JS-side `if (row.tenantId !== ctx.tenantId)` guards.

**Class 3 — id-only / compound-unique upsert without parent validation.**
The two upserts in this surface (`PropertySeller`, `PropertyBuyerStage`)
both use compound unique (`@@id([propertyId, sellerId])`,
`@@unique([propertyId, buyerId])`). Routes that touch them validate the
parent Property's tenant boundary first via DiD-via-FK pattern (canonical
example: `app/api/properties/[propertyId]/sellers/route.ts` — already in
the codebase). New code follows that template verbatim.

**Class 4 — helper-delegate id-only lookup.** All Seller/Buyer-touching
helpers in `lib/` MUST take `tenantId` explicitly. Wave 1 audits and
hardens:
- `lib/enrichment/sync-seller.ts` — currently takes `propertyId`,
  derives tenantId from the property row. Refactor to take both, scope
  every internal query.
- `lib/enrichment/sync-seller-courtlistener.ts` — same.
- `lib/buyers/sync.ts` — same.
- Any new helpers (e.g. `lib/sellers/rollup.ts` for the AI rollup pass)
  take `tenantId` from inception.

### Public-route safety (AGENTS.md `PUBLIC_PATHS` rule)

No new public/self-gating routes proposed in this redesign. All new routes
are tenant-scoped under `app/api/[tenant]/*` or `app/api/properties/*`,
both of which require session auth via middleware.

If Wave 4 needs a webhook for GHL contact updates (to invalidate the
60s in-memory cache under Shape A), that webhook MUST:
1. Verify HMAC against `GHL_WEBHOOK_SECRET` in the route handler.
2. Add an entry to `PUBLIC_PATHS` in `middleware.ts`.
3. Probe deployed endpoint with no auth to confirm 401 (not 307).

---

## 10. Wave structure

Six waves. Justified against an alternative ordering at the end.

| Wave | Goal | Effort (sprint days) | Verifiable in prod |
|---|---|---|---|
| 1 | Schema additions (no drops). New columns on Seller/Buyer. New `source` on PropertyBuyerStage. Skip-trace columns (gated on Q1). Class-4 helper audit + tenantId param refactor. | 1-2 | Migration applies cleanly. `npx tsc --noEmit` zero errors. |
| 2 | Backfill jobs (Property.owner_* → Seller; manualBuyerIds → PropertyBuyerStage). Dual-write turn-on in `sync-seller.ts`. | 2-3 | Backfill diagnostic endpoint reports 100% coverage. Spot-check 5 properties via `/api/diagnostics/seller-backfill`. |
| 3 | Read-path migration (~30 sites). New `/sellers/` list page. Polish `/sellers/[id]`. Surface `/buyers/` in nav. Migrate `/buyers/page.tsx` to `withTenant`. Property Research tab Sellers + Buyers sub-tabs. | 3-5 | Live walkthrough of `/sellers/`, `/sellers/[id]`, `/buyers/`, `/buyers/[id]`, Property Research tab. |
| 4 | AI enrichment integration. extract-deal-intel routes to Seller fields. Seller rollup pass. TCP scorer adds Seller likelihoodToSell write. Backfill rollups from existing call history. | 2-3 | Spot-check 3 graded calls; confirm Seller fields update post-grade. Verify Seller likelihoodToSell populated for active sellers. |
| 5 | Strip Property columns (~22). Remove dual-write. Pre-cutover: Railway snapshot. Hard cutover migration. | 1 | Post-cutover grep `property\.\(ownerPhone\|ownerEmail\|...\)` returns zero hits. Property detail page renders with no errors. |
| 6 | Verification + handoff. Reliability scorecard rescore (dim #8: 4 → 8 target). PROGRESS / SYSTEM_MAP / OPERATIONS / AGENTS updates per Rule 8. | 1 | Reliability scorecard published in PROGRESS. Documentation lands in same commits as code per Rule 8. |

**Total: ~10-15 sprint days.**

### Alternative ordering considered: schema-strip-first

Could we drop `Property.owner*` columns earlier (before Wave 5) by writing
the read-path migration first?

**Rejected.** Dropping columns before backfill means every read site that
runs against a property without yet-migrated Seller data returns `null`.
Wave 3 read-path migration assumes Wave 2 backfill is complete. Inverting
the order would require a "compatibility shim" layer in `lib/properties.ts`
that synthesizes `property.ownerPhone` from `property.sellers[0].seller.phone`
— extra code that gets thrown away in Wave 5 anyway.

The chosen sequence (additive → backfill → read migration → AI integration → strip → verify)
is the standard expand-contract migration pattern, and it's what the v1-finish
sprint Wave 3 used for the withTenant migration. Same playbook, different
schema target.

### Alternative considered: skip Wave 4 (AI enrichment) and defer to v1.2

The AI rollup work could be deferred — Wave 5 can ship without Seller
likelihoodToSell scoring writing on every grade. The data still flows;
the score just stays null until Wave 4 ships.

**Recommended: keep Wave 4 in this sprint.** Wave 4 is what changes the
4/10 → 8/10 score on the reliability dimension. Without it, the strip
is mechanical and doesn't unlock new value. With it, the Seller list
page sorts by motivation, and the Day Hub can surface "high-motivation
sellers we haven't called in 5+ days" — which is the actual goal of the
redesign.

---

## 11. Open questions for Corey

These are decisions needed before Wave 1 kicks off. Listed in priority
order — Q1-Q3 block schema design; Q4-Q7 can be answered during the sprint.

### Q1 — Shape A vs Shape B (Section 4) **✅ RESOLVED 2026-04-30**

Locked: **Shape A** (pure live-fetch). GHL-overlap columns DROPPED from
both Seller and Buyer. Skip-trace fallback columns added for unlinked
records. New `lib/ghl/contact-resolver.ts` helper handles per-request
batch fetch + 60s in-memory cache. Drops land in Wave 5 cutover.

### Q2 — Decompose Seller name into firstName / lastName? **✅ RESOLVED 2026-04-30**

Locked: **decompose**. Seller gains `firstName`, `middleName`,
`lastName`, `nameSuffix` in Wave 1 (additive). Legacy `Seller.name`
column drops in Wave 5 cutover. UI formats display name from parts.
CourtListener exact-name search and person-level disambiguation both
benefit.

### Q3 — Ambiguous fields disposition (Table A) **✅ RESOLVED 2026-04-30**

Locked per recommendations:

- `absenteeOwner` — STAY ON PROPERTY (property fact)
- `absenteeOwnerInState` — STAY ON PROPERTY
- `seniorOwner` — STRIP-TO-SELLER (person fact)
- `deceasedOwner` — STRIP-TO-SELLER (person fact)
- `cashBuyerOwner` — STRIP-TO-SELLER (person fact, cross-side flag)
- `ownerMailingVacant` — STAY ON PROPERTY, rename to `mailingAddressVacant`

### Q4 — Auto-link calls to sellers by ghlContactId? (Section 6)

When a Call lands with `propertyId` set but `sellerId NULL`, should the
grading worker auto-link by matching `call.ghlContactId →
PropertySeller.seller.ghlContactId` if the pair has a unique match?

**Recommendation: yes.** Logged audit row when auto-link fires; manual queue
when match is ambiguous.

### Q5 — Mirror legal-distress flags or move them outright? (Section 5)

`Property.inBankruptcy` / `inProbate` / `inDivorce` / `hasRecentEviction`
are person-level facts but PropertyRadar reports them per-property record.

**Recommendation: mirror-write.** Keep them on Property for filtering
inventory list ("show me probate properties") AND write to Seller for
person-level views. Same field name on both. Conflicts: latest enrichment
run wins on both sides.

### Q6 — Seller Buy Signal? (Section 7)

Property has Buy Signal = high TCP × low team engagement. Should Seller
have a parallel signal = high `likelihoodToSellScore` × `daysSinceLastContact`?

**Recommendation: yes.** Surfaces on `/sellers/` list as an icon. Day Hub
can pick up "high-motivation sellers we haven't called in N days" tasks
automatically.

### Q7 — Buyer matchScore: per-property table or computed at query time? (Section 7)

Today `Buyer.matchLikelihoodScore` is a single column on Buyer (per-Buyer,
not per-property). Move to `PropertyBuyerStage.matchScore` (computed at
match time)?

**Recommendation: yes, move it.** Per-property fit is the meaningful unit;
buyer-level "match likelihood" is meaningless without a property.

### Q8 — D-045, D-046, P4, P5, P6 carry-forward (from PROGRESS Next Session)

These are NOT blockers for this redesign but are open questions queued for
v1.1 sprint:
- D-045 — KPI snapshot timestamp (createdAt vs calledAt).
- D-046 — Add test framework (vitest)?
- P4 — Start `/tasks/` deletion migration (5-step plan in AUDIT_PLAN.md).
- P5 — `assign_contact_to_user` UI flow alignment.
- P6 — View As cookie + server-side resolution (Shape C).

**Recommendation:** address P6 BEFORE Wave 3 of this redesign — Wave 3
adds new client components that read tenant-scoped data, and the Wave 6.2
hydration race lesson applies to any new component reading View As state.
P4, P5, D-045, D-046 are independent of this sprint.

---

## Appendix A — Cross-reference to existing docs

- [CLAUDE.md](../../CLAUDE.md) — Rule 1 (Data Contract), Rule 4 (Worker), Rule 5 (TCP), Rule 8 (Living Map)
- [AGENTS.md](../../AGENTS.md) — withTenant, 4 leak classes, DiD-via-FK pattern, Class 4 helper hardening, PUBLIC_PATHS rule
- [docs/SYSTEM_MAP.md](../SYSTEM_MAP.md) — GHL boundary ("the most important decision in the system"), AI layer, call pipeline
- [docs/OPERATIONS.md](../OPERATIONS.md) — page roster, cron list, schema-change log
- [docs/AUDIT_PLAN.md](../AUDIT_PLAN.md) — P4, P5, P6 carry-forward; D-045, D-046 pending decisions
- [PROGRESS.md](../../PROGRESS.md) — Session 59 sprint close; reliability scorecard dim #8 = 4/10 (target of this redesign)
- [prisma/schema.prisma](../../prisma/schema.prisma) — Property (lines 190-660), Seller (729-1007), PropertySeller (1009-1033), Call (1064-1153), Buyer (1553-1797), PropertyBuyerStage (1803-1847)
- [lib/ai/extract-deal-intel.ts](../../lib/ai/extract-deal-intel.ts) — current AI enrichment pipeline

---

**End of plan. Awaiting Corey review before Wave 1 begins.**
