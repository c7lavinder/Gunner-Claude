# Gunner Project Playbook

> **Purpose:** This document is the single source of truth for the Gunner codebase. Read this before starting any task to avoid re-auditing the codebase. Update it whenever schema, roles, or business logic change.

---

## 1. Architecture Overview

Gunner is a **multi-tenant SaaS platform** for real estate wholesaling teams. It combines AI-powered call coaching, KPI tracking, deal management, and property disposition into one application. The stack is React 19 + Tailwind 4 + Express 4 + tRPC 11 with PostgreSQL, hosted on Railway at **getgunner.ai**.

Tenants sign in via `getgunner.ai`. Each tenant has their own team members, playbook configuration (roles, rubrics, call types), markets, sources, and properties. Nothing is hardcoded to a specific tenant.

---

## 2. Database Schema Map

The database contains **69 tables** organized into the following domains:

### 2.1 Core Identity & Multi-Tenancy

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenants` | Each company/organization | `id`, `name` |
| `users` | Login accounts | `id`, `tenantId`, `name`, `email`, `role` (admin/user/super_admin), `teamRole` (admin/lead_manager/acquisition_manager/lead_generator/dispo_manager) |
| `team_members` | Pre-configured team roster | `id`, `tenantId`, `name`, `teamRole`, `userId` (linked on login), `ghlUserId`, `lcPhone`, `lcPhones` |
| `team_assignments` | LM → AM reporting structure | `leadManagerId`, `acquisitionManagerId` |
| `pending_invitations` | Email invites for new members | `tenantId`, `email`, `role` |

### 2.2 Playbook Configuration (Tenant-Level)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenant_roles` | Custom roles (e.g., SDR, AE, Closer) | `tenantId`, `name`, `code`, `rubricId` |
| `tenant_rubrics` | Grading rubrics for call scoring | `tenantId`, `name`, `weight` |
| `tenant_call_types` | Call type categories | `tenantId`, `name` |

**Distinct Roles (4):** Configured per tenant via the playbook. Default seeded roles follow the real estate wholesaling pattern.

**Distinct Rubrics (6):** Grading criteria for AI call coaching.

**Distinct Call Types (6):** Categories for classifying calls.

### 2.3 KPI & Performance Tracking

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `kpi_markets` | Market definitions with zip codes | `id`, `name`, `zipCodes` (JSON array) |
| `kpi_sources` | Lead source definitions | `id`, `name` |
| `kpi_channels` | Marketing channel definitions | `id`, `name` |
| `kpi_periods` | Weekly/monthly KPI periods | `tenantId`, `startDate`, `endDate` |
| `team_member_kpis` | Per-member KPI data | `teamMemberId`, `periodId`, metrics |
| `campaign_kpis` | Campaign-level KPI data | `periodId`, `campaignName`, metrics |
| `kpi_deals` | Deal tracking for KPIs | `periodId`, `propertyAddress`, amounts |
| `kpi_goals` | Target goals per member | `teamMemberId`, `periodId`, targets |
| `kpi_spend` | Marketing spend tracking | `periodId`, `channelId`, `amount` |
| `kpi_volume` | Lead volume tracking | `periodId`, `sourceId`, `count` |
| `daily_kpi_entries` | Manual daily KPI entries | `tenantId`, `date`, `kpiType`, `userId` |
| `dispo_daily_kpis` | Disposition daily KPIs | `tenantId`, `date`, metrics |

**Markets (5 configured):** Each market has a `zipCodes` JSON array for zip-to-market auto-mapping. When a property's zip code matches a market's zip codes, the market field auto-populates.

### 2.4 Property / Inventory (Disposition)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `dispo_properties` | Main property inventory | See section 3 below |
| `property_stage_history` | All status transitions | `propertyId`, `fromStatus`, `toStatus` |
| `dispo_property_sends` | Outreach sends to buyers | `propertyId`, `buyerContactId`, `channel` |
| `dispo_property_offers` | Offers received on properties | `propertyId`, `buyerName`, `amount`, `status` |
| `dispo_property_showings` | Property showings | `propertyId`, `buyerName`, `scheduledAt` |
| `property_buyer_activity` | Buyer-property matching & tracking | `propertyId`, `contactCacheId`, `matchScore`, `tier` |
| `property_activity_log` | Activity audit trail | `propertyId`, `action`, `details` |
| `deal_distributions` | Deal blast content per tier | `propertyId`, `tier`, `content` |
| `deal_content_edits` | Edits to deal blast content | `distributionId`, `editedContent` |

### 2.5 Contact / Buyer Cache

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `contact_cache` | Cached GHL contacts (buyers) | `tenantId`, `ghlContactId`, `name`, `phone`, `email`, `market`, `buyBoxType`, `buyerTier`, `responseSpeed`, `verifiedFunding`, `hasPurchasedBefore`, `secondaryMarket`, `buyerNotes` |

**Buyer Tiers:** Priority, Qualified, JV Partner, Unqualified, Halted

**Response Speed:** Lightning, Same Day, Slow, Ghost

### 2.6 Call Coaching & AI

| Table | Purpose |
|-------|---------|
| `calls` | Call recordings and metadata |
| `call_grades` | AI-generated call grades |
| `ai_feedback` | AI coaching feedback |
| `grading_rules` | Custom grading rules |
| `coach_messages` | AI coach conversation history |
| `ai_coach_preferences` | Per-user AI coach settings |
| `coach_action_log` | AI-suggested actions |
| `coach_action_edits` | Edits to AI actions |
| `call_next_steps` | Next steps from calls |

### 2.7 GHL Integration

| Table | Purpose |
|-------|---------|
| `ghl_oauth_tokens` | OAuth 2.0 tokens per tenant/location |
| `opportunities` | GHL opportunity data |
| `webhook_events` | Incoming webhook event log |
| `webhook_retry_queue` | Failed webhook retry queue |
| `sync_log` | Sync operation audit trail |

### 2.8 Other Modules

| Domain | Tables |
|--------|--------|
| Gamification | `badges`, `user_badges`, `badge_progress`, `user_streaks`, `user_xp`, `xp_transactions` |
| Brand & Social | `brand_assets`, `social_posts`, `content_ideas`, `brand_profile` |
| Training | `training_materials`, `team_training_items` |
| Deals | `deals`, `reward_views` |
| Platform | `platform_settings`, `subscription_plans`, `api_usage`, `emails_sent` |
| User Settings | `user_instructions` |

---

## 3. Property (dispo_properties) — Complete Column Reference

This is the most complex table. Every inventory fix touches it.

### Identity & Location
`id`, `tenantId`, `address`, `city`, `state`, `zip`, `county`, `propertyType` (enum: house/lot/land/multi_family/commercial/other)

### Financial
`askingPrice`, `arv`, `repairEstimate`, `contractPrice`, `ourOfferAmount`, `acceptedOffer`, `counterOfferAmount`, `assignmentAmount`, `dispoAskingPrice`, `assignmentFee` — all in **cents**

### Status & Pipeline
`status` (enum: new_lead/contacted/apt_set/offer_made/follow_up/under_contract/marketing/showing/offer_received/closing/sold/dead/on_hold)

**Acquisition stages:** new_lead, contacted, apt_set, offer_made, follow_up, dead, on_hold

**Disposition stages:** under_contract, marketing, showing, offer_received, closing, sold

### Dates & Timestamps
`offerDate`, `contractDate`, `closingDate`, `actualCloseDate`, `expectedCloseDate`, `stageChangedAt`, `contactedAt`, `aptSetAt`, `offerMadeAt`, `underContractAt`, `closedAt`, `marketedAt`, `soldAt`, `lastContactedAt` (auto-tracked), `lastConversationAt` (auto-tracked), `createdAt`, `updatedAt`

### Milestone Flags (set TRUE, never reset)
`aptEverSet`, `offerEverMade`, `everUnderContract`, `everClosed`

### People
`sellerName`, `sellerPhone`, `ghlContactId`, `buyerGhlContactId`, `buyerName`, `buyerCompany`, `assignedAmUserId`, `assignedLmUserId`

### Classification
`market` (varchar), `marketId` (FK to kpi_markets), `sourceId` (FK to kpi_sources), `leadSource`, `opportunitySource` (from GHL), `projectType` (varchar, multi-select: flipper/landlord/builder/multi_family/turn_key), `campaignName`

### Property Details
`beds`, `baths`, `sqft`, `yearBuilt`, `lotSize`, `photos` (JSON), `description`, `notes`, `lockboxCode`, `occupancyStatus`, `mediaLink`

### AI Research
`propertyResearch` (JSON: zestimate, taxAssessment, comps, listing history, etc.), `researchUpdatedAt`

### GHL Links
`ghlOpportunityId`, `ghlPipelineId`, `ghlPipelineStageId`

---

## 4. Role-Based Access Control

### System Roles (users.teamRole)

| Role | Sees on Inventory | Sees Dead Tab | Day Hub | Team Page | Training |
|------|-------------------|---------------|---------|-----------|----------|
| `admin` | All statuses | Yes | All tabs | Yes | Yes |
| `lead_manager` | All statuses | Yes | Own tab + assigned | Yes | Yes |
| `acquisition_manager` | All statuses | Yes | Own tab | Yes | Yes |
| `lead_generator` | All statuses | Yes | Own tab | Yes | Yes |
| `dispo_manager` | All statuses | **No** | Own tab only | **No** | **No** |

### Key Permission Rules
- Users can only assign tasks to themselves and individuals assigned to them.
- Dispo Manager sees only their own calls, their own Day Hub tab, and messages to their number.
- Admin can view content for all team types.
- "Generate AI Insights" button is admin-only.
- Preferences are stored per-user, not per-tenant.

---

## 5. Inventory Business Logic

### 5.1 Status Tabs (Frontend)
The "All" tab has been removed. Default tab is the first visible status for the user's role. Dispo Manager does not see "Dead." Count numbers are not shown on tabs.

### 5.2 Dynamic Table Columns
Acquisition stages (new_lead, contacted, apt_set, offer_made, follow_up, dead, on_hold) show columns: **Last Offer**, **Last Contacted**, **Last Conversation**

Disposition stages (under_contract, marketing, showing, offer_received, closing, sold) show columns: **Sends**, **Buyers**, **Offers**, **Showings**

### 5.3 Search
Search works **cross-status** — when search text is present, the status filter is bypassed and results from all statuses are shown.

### 5.4 Buyer Matching (matchBuyersForProperty)
- **No cap** on number of buyers matched (previously 200)
- **Market is a hard filter** — buyer's market or secondaryMarket must match the property's market, OR buyer market is "Nationwide"
- **Sorting priority:** Project type match > Buyer tier > Other factors
- Project type match scoring: if buyer's buyBoxType matches any of the property's projectType values, they get a bonus score

### 5.5 Auto-Tracking Fields
- `lastContactedAt` — automatically updated whenever `addPropertySend` is called (any SMS/email sent to a buyer about this property)
- `lastConversationAt` — automatically updated whenever `recordBuyerResponse` is called (confirmed two-way exchange)
- `acceptedOffer` — automatically populated on the property when an offer's status is changed to "accepted" via `updateOfferStatus`

### 5.6 Market Auto-Populate
When a property's zip code is entered, the system checks all `kpiMarkets` for a matching zip code in their `zipCodes` JSON array. If found, the market field auto-populates.

### 5.7 Project Types
Valid values: `flipper`, `landlord`, `builder`, `multi_family`, `turn_key`. Stored as comma-separated string in varchar column (multi-select).

### 5.8 Bulk Actions
Available bulk actions: Set Status, Set Market, Set Source, Set Project Type, Delete.

### 5.9 CSV Import
Mappable fields include all property fields plus `projectType`, `opportunitySource`, `acceptedOffer`. Only `address` is required.

---

## 6. tRPC Router Map

### Top-Level Routers (27)

| Router | Purpose |
|--------|---------|
| `auth` | Login, logout, profile, password |
| `team` | Team members, assignments, roles |
| `calls` | Call list, grading, details |
| `ghlSync` | GHL data synchronization |
| `sync` | General sync operations |
| `leaderboard` | Team leaderboard |
| `analytics` | Analytics data |
| `archival` | Data archival |
| `training` | Training materials |
| `feedback` | AI feedback |
| `rules` | Grading rules |
| `coach` | AI coach conversations |
| `meeting` | Meeting management |
| `rubrics` | Rubric management |
| `teamTraining` | Team training items |
| `brandAssets` | Brand asset management |
| `socialPosts` | Social media posts |
| `contentIdeas` | Content idea generation |
| `brandProfile` | Brand profile settings |
| `contentGeneration` | AI content generation |
| `gamification` | Badges, XP, streaks |
| `kpi` | KPI tracking and reporting |
| `tenant` | Tenant settings, onboarding |
| `opportunities` | GHL opportunities |
| `coachActions` | AI coach action items |
| `playbook` | Playbook configuration |
| `taskCenter` | Task management |
| `inventory` | Property inventory (49 endpoints) |

### Inventory Endpoints (49)

| Endpoint | Purpose |
|----------|---------|
| `getProperties` | List properties with status/search filter |
| `getPropertyById` | Single property detail |
| `createProperty` | Add new property |
| `updateProperty` | Edit property fields |
| `bulkUpdateStatus` | Bulk change status |
| `bulkUpdateField` | Bulk set market/source/projectType |
| `bulkDelete` | Bulk delete properties |
| `deleteProperty` | Delete single property |
| `addSend` | Record outreach send (auto-updates lastContactedAt) |
| `deleteSend` | Remove send record |
| `addOffer` | Add offer on property |
| `updateOfferStatus` | Accept/reject offer (auto-populates acceptedOffer) |
| `deleteOffer` | Remove offer |
| `addShowing` | Schedule showing |
| `updateShowing` | Update showing details |
| `deleteShowing` | Cancel showing |
| `getTodayShowings` | Today's scheduled showings |
| `getDispoKpiSummary` | Disposition KPI dashboard |
| `getPropertyDetail` | Full property with sends/offers/showings/buyers |
| `getBuyerActivities` | Buyer activity for a property |
| `addBuyerActivity` | Add buyer-property match |
| `updateBuyerActivity` | Update buyer activity |
| `recordBuyerSend` | Record send to specific buyer |
| `recordBuyerOffer` | Record offer from buyer |
| `deleteBuyerActivity` | Remove buyer match |
| `matchBuyers` | Auto-match buyers to property |
| `rematchBuyers` | Clear and re-run buyer matching |
| `recordBuyerResponse` | Record buyer response (auto-updates lastConversationAt) |
| `getBuyerResponseStats` | Response statistics |
| `getActivityLog` | Property activity audit trail |
| `addActivityNote` | Add manual note |
| `parseCsvPreview` | Preview CSV for import |
| `importFromCsv` | Import properties from CSV |
| `getCsvTemplate` | Download CSV template |
| `ghlBulkImport` | Import from GHL pipeline |
| `ghlImportProgress` | Check GHL import status |
| `ghlPipelines` | List GHL pipelines |
| `getInventoryContactIds` | Get all GHL contact IDs |
| `searchGhlContacts` | Search GHL contacts |
| `researchProperty` | AI property research |
| `getPropertySuggestions` | AI suggestions |
| `bulkSendToBuyers` | Send to multiple buyers |
| `generateDealContent` | AI deal blast content |
| `getDistributions` | Get deal blast distributions |
| `updateDistribution` | Edit distribution content |
| `regenerateTierContent` | Regenerate tier-specific content |
| `autoAssignTiers` | Auto-assign buyer tiers |
| `getBuyerCountsByTier` | Count buyers per tier |
| `sendDealBlast` | Execute deal blast |

---

## 7. GHL Integration

Properties enter the inventory when GHL opportunities reach **new lead**, **warm lead**, or **hot lead** pipeline stages. The opportunity source is pulled directly from the GHL opportunity (not from tags).

GHL OAuth tokens are stored per tenant/location in `ghl_oauth_tokens`. The OAuth callback URL is `https://getgunner.ai/api/ghl/callback`.

The `contact_cache` table stores buyer data synced from GHL, including `buyBoxType`, `buyerTier`, `responseSpeed`, `verifiedFunding`, and `market` fields used for buyer matching.

---

## 8. Key File Locations

| File | Purpose |
|------|---------|
| `drizzle/schema.ts` | All 69 table definitions |
| `server/routers.ts` | All tRPC endpoints (~9000 lines) |
| `server/inventory.ts` | Inventory business logic (~1500 lines) |
| `server/db.ts` | Database query helpers |
| `server/ghlService.ts` | GHL API integration |
| `server/batchDialerSync.ts` | BatchDialer call sync |
| `client/src/pages/Inventory.tsx` | Inventory UI (~3300 lines) |
| `client/src/pages/Home.tsx` | Day Hub / dashboard |
| `client/src/components/DashboardLayout.tsx` | Sidebar layout |
| `server/_core/oauth.ts` | OAuth callback (with email fallback) |
| `server/_core/llm.ts` | LLM integration helpers |

---

## 9. Common Gotchas

1. **Column names in SQL vs Drizzle:** Drizzle uses camelCase (`lastContactedAt`), but MySQL column names are also camelCase in this project (not snake_case). Always check the actual column name in the schema.

2. **Money is in cents:** All financial fields (`askingPrice`, `acceptedOffer`, `arv`, etc.) are stored as integers in cents. Divide by 100 for display.

3. **projectType is varchar, not enum:** Changed from enum to varchar to support multi-select. Values are comma-separated (e.g., "flipper,landlord").

4. **lastOfferAmount is on propertyBuyerActivity, not dispoProperties:** The frontend table uses `_activity.highestOffer` from the enriched getProperties response.

5. **OAuth email fallback:** Users who signed up via Google OAuth have a `google_*` openId. When they log in via a different OAuth provider, the system falls back to email matching. The session token uses the existing DB user's openId, not the new OAuth openId.

6. **Buyer market matching:** "Nationwide" buyers match all markets. Other buyers must match the property's market in either their `market` or `secondaryMarket` field.

7. **Status tabs:** No "All" tab. Dispo Manager cannot see "Dead." No count numbers on tabs.

---

*Last updated: March 8, 2026*
