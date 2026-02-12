# Gunner: Industry-Agnostic Architecture Audit

## Executive Summary

Gunner is currently built as a **real estate wholesaling call coaching platform**. To make it work for any industry (solar, insurance, SaaS sales, roofing, etc.), we need to extract everything that's wholesaling-specific into configurable, per-tenant data. The good news: the multi-tenant foundation already exists (tenants table, tenantId on most tables, CRM config field). The bad news: the actual business logic is still deeply hardcoded.

---

## What's Already Industry-Agnostic (No Changes Needed)

These systems work for any industry as-is:

| System | Why It's Already Generic |
|--------|------------------------|
| Authentication & user management | Role-based, tenant-scoped |
| Gamification engine (XP, levels, streaks) | Points system is universal |
| Badge infrastructure | Badge definitions are data-driven (just need to be per-tenant) |
| Audio transcription pipeline | Transcribes any call regardless of content |
| File storage (S3) | Generic upload/download |
| Stripe billing & subscription tiers | Already tenant-scoped |
| Team member management | Names, roles, phone matching — all generic |
| Tenant table with CRM config field | Already supports ghl, hubspot, salesforce, close, pipedrive |

---

## What's Hardcoded and Needs to Change

### Layer 1: Grading Rubrics (HIGHEST PRIORITY)
**File:** `server/grading.ts` (1,104 lines)

This is the core of the product and the most wholesaling-specific part. Six rubrics are hardcoded as TypeScript constants:

| Rubric | Wholesaling-Specific Content |
|--------|------------------------------|
| `LEAD_MANAGER_RUBRIC` | Criteria like "Motivation Extraction," "Price Discussion," "Setting Expectations" — all about qualifying property sellers |
| `ACQUISITION_MANAGER_RUBRIC` | "Offer Setup," "Price Delivery," "Closing Technique" — about making offers on houses |
| `LEAD_GENERATOR_RUBRIC` | "Interest Discovery" — about finding motivated sellers via cold calls |
| `FOLLOW_UP_RUBRIC` | "Previous Offer Anchor," "Roadblock Discovery" — re-engaging cold seller leads |
| `SELLER_CALLBACK_RUBRIC` | "Callback Acknowledgment" — when a property seller calls back |
| `ADMIN_CALLBACK_RUBRIC` | "Task Execution" — generic enough, but framed around document signing for deals |

Each rubric contains:
- Criteria names and descriptions (e.g., "Did the rep ask about the seller's timeline?")
- Key phrases to listen for (e.g., "your property at," "when we last connected")
- Red flags (e.g., "Talked over the seller")
- Critical failures with score caps
- Talk ratio targets

**What needs to change:** Rubrics should be stored in the database as per-tenant JSON, not as TypeScript constants. The grading LLM prompt (line 475) literally says *"You are an expert sales coach for a real estate wholesaling company called Nashville Area Home Buyers"* — this must be dynamically pulled from tenant config.

---

### Layer 2: Team Roles (HIGH PRIORITY)
**Files:** `drizzle/schema.ts`, 14 frontend files, most server files
**References:** 189 frontend references + ~100 server references

The three roles are hardcoded as MySQL enums throughout the schema:
```
"lead_manager" | "acquisition_manager" | "lead_generator"
```

These are wholesaling-specific titles. A solar company might have "Setter," "Closer," "Canvasser." An insurance agency might have "Inside Sales," "Field Agent," "Retention Specialist."

**Affected schema tables (11 tables):**
- `users.teamRole`
- `team_members.teamRole`
- `calls.callType` (maps to rubrics)
- `call_grades.rubricType`
- `grading_rules.applicableTo`
- `training_modules.applicableTo`
- `badges.category`
- `kpi_role_configs.roleType`
- `kpi_targets.roleType`
- Plus several more

**What needs to change:** Roles should be a per-tenant configurable table (not enums). Each tenant defines their own roles during onboarding. The enum columns would become varchar/foreign key references to a `tenant_roles` table.

---

### Layer 3: Call Type Classification (HIGH PRIORITY)
**File:** `server/grading.ts` (lines 421-445, 700-750)

Six call types are hardcoded:
```
"cold_call" | "qualification" | "follow_up" | "offer" | "seller_callback" | "admin_callback"
```

The LLM classification prompt (line 715) says *"You are a call classification system for a real estate investment company"* and describes scenarios like "asking about property, situation, motivation, timeline."

**What needs to change:** Call types should be per-tenant configurable. Each tenant maps their CRM pipeline stages to their own call types, and each call type maps to a rubric.

---

### Layer 4: LLM System Prompts (HIGH PRIORITY)
**Files:** `server/grading.ts`, `server/routers.ts`

Every AI interaction has wholesaling-specific system prompts:

| Location | Prompt Content |
|----------|---------------|
| Grading prompt (grading.ts:475) | "expert sales coach for a real estate wholesaling company called Nashville Area Home Buyers" |
| Classification prompt (grading.ts:715) | "call classification system for a real estate investment company" |
| AI Coach (routers.ts:1018) | "supportive sales coach for a real estate wholesaling team" |
| Role-play (routers.ts:1128) | "playing the role of a SELLER in a real estate wholesaling role-play" |
| Meeting facilitator (routers.ts:1163) | "meeting facilitator helping a real estate wholesaling team" |
| Content creator (routers.ts:1629) | "social media content creator for a real estate wholesaling business" |

**What needs to change:** System prompts should be templated with tenant-specific variables: `{companyName}`, `{industry}`, `{roleNames}`, `{callTypes}`, `{rubricContext}`.

---

### Layer 5: Email Copy (MEDIUM PRIORITY)
**File:** `server/emailService.ts` (1,133 lines)

All onboarding, trial, and engagement emails contain wholesaling language:
- "motivated sellers"
- "acquisitions team"
- "calls with motivated sellers"
- "The best wholesaling teams review calls every morning"
- "Upload your newest rep's last acquisition call"

**What needs to change:** Email templates should use tenant-specific variables. The core email structure stays the same, but the industry-specific language gets swapped.

---

### Layer 6: Badge Definitions (MEDIUM PRIORITY)
**File:** `server/gamification.ts` (1,398 lines)

Badge names and descriptions are wholesaling-specific:
- "Appointment Machine" (not every industry sets appointments)
- "Warm Handoff Pro" (specific to lead gen → lead manager handoff)
- "Cold Call Warrior" (not every industry does cold calls)
- Criteria references like "Motivation Extraction ≥15/20"

Badge categories are tied to the hardcoded roles: `lead_manager`, `acquisition_manager`, `lead_generator`.

**What needs to change:** Badge definitions should be per-tenant, linked to their custom roles and rubric criteria. A "badge template library" could offer starting points per industry.

---

### Layer 7: CRM Integration (MEDIUM PRIORITY)
**Files:** `server/ghlService.ts` (974 lines), `server/batchDialerSync.ts` (231 lines)

Currently only GHL and BatchDialer are integrated. The tenant table already has `crmType` supporting ghl, hubspot, salesforce, close, pipedrive — but only GHL has actual implementation.

**What needs to change:** Each CRM integration needs an adapter that normalizes call data into a common format. The pipeline stage → call type mapping needs to be per-tenant configurable.

---

### Layer 8: KPI Dashboard (LOWER PRIORITY)
**Files:** `server/kpi.ts`, `client/src/pages/KpiDashboard.tsx`

The KPI dashboard tracks deals with `propertyAddress`, and references "Nashville" as a market. Role types use `am`, `lm`, `lg_cold_caller`.

**What needs to change:** KPI fields should be configurable per tenant. "Property Address" becomes a generic "Deal Identifier." Markets become tenant-defined regions.

---

### Layer 9: Frontend Labels (LOWER PRIORITY)
**Files:** 14 frontend files with 189 references

Every dropdown, filter, card, and label shows "Lead Manager," "Acquisition Manager," "Lead Generator," "Cold Call," "Seller Callback," etc.

**What needs to change:** Frontend should read role names and call type labels from the tenant config (served via a tRPC endpoint), not from hardcoded strings.

---

## Proposed Architecture

### Phase 1: Foundation (Make it work for a second customer in the same industry)
1. **Per-tenant API credentials** — Store GHL/BatchDialer keys in tenant config, not env vars
2. **Per-tenant pipeline mapping UI** — Map CRM stages → call types during onboarding
3. **Tenant setup wizard** — Admin page to create new tenants with basic config
4. **Team member bulk import** — CSV or paste-in for quick onboarding

### Phase 2: Industry Abstraction (Make it work for any industry)
1. **Custom roles table** — Replace enum with per-tenant `tenant_roles` table
2. **Database-driven rubrics** — Move rubrics from TypeScript constants to per-tenant JSON in DB
3. **Templated LLM prompts** — Replace hardcoded prompts with `{variable}` templates
4. **Configurable call types** — Per-tenant call type definitions linked to rubrics
5. **Dynamic badge definitions** — Per-tenant badge configs linked to custom roles/criteria

### Phase 3: Polish (Make onboarding self-service)
1. **Industry templates** — Pre-built configs for common industries (wholesaling, solar, insurance, SaaS)
2. **Email template variables** — Swap industry language per tenant
3. **Frontend label system** — Read all labels from tenant config
4. **KPI customization** — Configurable deal fields and market definitions
5. **CRM adapters** — HubSpot, Salesforce, Close, Pipedrive implementations

---

## Effort Estimate

| Phase | Scope | Estimated Sessions |
|-------|-------|-------------------|
| Phase 1 | Multi-tenant credentials + onboarding | 3-4 sessions |
| Phase 2 | Industry abstraction (roles, rubrics, prompts) | 6-8 sessions |
| Phase 3 | Self-service + additional CRMs | 4-6 sessions |
| **Total** | **Full industry-agnostic platform** | **13-18 sessions** |

---

## Recommended Starting Point

Start with **Phase 1** because it lets you onboard a second wholesaling customer immediately (same industry, different GHL account). This validates the multi-tenant architecture without touching the rubrics or roles. Then Phase 2 opens it up to any industry.
