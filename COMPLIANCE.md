# Gunner — Playbook Compliance Tracker

> This document is the source of truth for playbook architecture compliance.
> Every AI agent reads this before touching any file.
> Update the status column as violations are fixed.

## Architecture Overview

All labels, names, lists, colors, and configuration values must flow through the 4-layer playbook chain:

```
User Playbook > Tenant Playbook > Industry Playbook > Software Playbook
```

The frontend hook `useTenantConfig()` is the single point of access for all playbook data on the frontend.
The backend resolver chain lives in `server/services/playbooks.ts`.

---

## Violation Tracker

Last audited: March 11, 2026

### Severity 1 — Tenant-Breaking (breaks for any non-RE-Wholesaling tenant)

| # | File | Line | Violation | Status |
|---|---|---|---|---|
| 1 | `Inventory.tsx` | 47 | `STAGE_COLORS` keyed to wrong RE-specific stage codes — doesn't match actual seeded stage codes (`new_lead`, `offer_made`, etc.) | ✅ Fixed Sprint 4 — replaced with index-based STAGE_PALETTE |
| 2 | `Inventory.tsx` | 61 | Hardcoded `"lead"` fallback stage when `configStages` is empty | ✅ Fixed Sprint 4 — uses `stages[0]` from config |
| 3 | `KpiPage.tsx` | 12-18 | `DEFAULT_KPI_METRICS` array always used — `kpiMetrics` never actually flows through `getConfig` | ✅ Fixed Wave 5 |
| 4 | `KpiPage.tsx` | 143 | Funnel renders raw DB status codes (`under_contract`) not human-readable stage names | ✅ Fixed Wave 5 |
| 5 | `Onboarding.tsx` | 186-187 | Role picker hardcodes `"Lead Manager"` / `"Acquisition Manager"` — first UX for every new user | ✅ Fixed Wave 5 |
| 6 | `useTenantConfig.ts` | — | Missing fields: `kpiFunnelStages`, `kpiMetrics`, `outcomeTypes`, `trainingCategories`, `roleplayPersonas`, `markets`, `leadSources` | ✅ Fixed Wave 5 (kpiFunnelStages, kpiMetrics, roleplayPersonas, trainingCategories added) |

### Severity 2 — Functionally Broken (works today, breaks for tenant 2)

| # | File | Line | Violation | Status |
|---|---|---|---|---|
| 7 | `Training.tsx` | 155 | Roleplay scenario hardcoded as `"general_coaching"` — ignores the 6 rich RE personas in the playbook | ✅ Fixed Wave 5 |
| 8 | `Training.tsx` | 15-21 | `MATERIAL_ICONS` keyed to wrong category codes — every material shows fallback icon | 🟠 Open |
| 9 | `CallInbox.tsx` | 216 | `call.callType` displayed as raw code (`cold_call`) not resolved name (`"Cold Call"`) | ✅ Fixed Wave 5 |
| 10 | `grading.ts` | 11-18 | `FALLBACK_CRITERIA` are generic SaaS demo criteria — leak into stored `criteriaScores` | 🟠 Open |
| 11 | `grading.ts` | 66 | Default `callType = "qualification"` matches no rubric in RE Wholesaling playbook | ✅ Fixed Wave 5 |

### Severity 3 — Architectural Gaps (playbook resolution chain incomplete)

| # | File | Line | Violation | Status |
|---|---|---|---|---|
| 12 | `useTenantConfig.ts` | 34 | `algorithm` field is untyped `Record<string, unknown>` blob — should be named typed fields | 🟡 Open |
| 13 | `playbook.ts (router)` | 29-38 | `getConfig` never returns `kpiFunnelStages`, `outcomeTypes`, `trainingCategories`, `roleplayPersonas` — they're discarded | ✅ Fixed Wave 5 |
| 14 | `shared/types.ts` | 5-13 | `Terminology` interface missing `leadSource` and other field overrides needed by Inventory | 🟡 Open |

### Severity 4 — Cosmetic (hardcoded but not tenant-breaking today)

| # | File | Line | Violation | Status |
|---|---|---|---|---|
| 15 | `Today.tsx` | 119 | `"properties"` fallback is RE-specific — should be `"assets"` or use `DEFAULT_T.assetPlural` | 🔵 Open |
| 16 | `KpiPage.tsx` | 221 | `"Lead → Closed"` conversion label hardcoded — should use `kpiFunnelStages[0]` → `kpiFunnelStages[last]` | 🔵 Open |
| 17 | `Team.tsx` | 54, 239 | Hot streak threshold `3` hardcoded in view — should come from `SOFTWARE_PLAYBOOK` constant | 🔵 Open |

### Severity 5 — Schema-Level (type safety / validation gaps)

| # | File | Line | Violation | Status |
|---|---|---|---|---|
| 18 | `playbook.ts (router)` | 99-102 | `JSON.parse` on user input without Zod validation — terminology + algorithmOverrides | ✅ Fixed Sprint 4 — Zod `z.record()` + TRPCError |
| 19 | `playbook.ts (router)` | 270-271 | `JSON.parse` on strengths/growthAreas without Zod validation | ✅ Fixed Sprint 4 — Zod `z.array(z.string())` + TRPCError |
| 20 | `playbooks.ts (service)` | 122, 157-160 | `parseJsonField` calls missing type generics — rubrics, markets, leadSources, algorithmOverrides, terminology | ✅ Fixed Sprint 4 — all generics added |
| 21 | `shared/types.ts` | 60 | `AlgorithmConfig.taskSort` typed as `Record<string, unknown>` — should reference `TaskSortConfig` but can't (server-only type) | 🟡 Open — needs type extraction to shared/ |

---

## What's Working Correctly

These patterns are compliant and should be followed as the model:

- `Team.tsx` — `roleLabel()` resolves role names through `useTenantConfig().roles` ✅
- `Inventory.tsx` — stage names in tabs/badges use `stages.find(s => s.code === ...).name` from the hook ✅
- `Inventory.tsx` — `t.assetPlural` / `t.asset` / `t.contact` used throughout ✅
- `CallInbox.tsx` — search placeholder uses `t.contact` ✅
- `grading.ts` — rubric resolution is layered: tenant DB rubric → industry playbook rubric → fallback ✅
- `grading.ts` — grading philosophy loaded from industry playbook and injected into GPT prompt ✅
- `playbooks.ts` — `resolveTerminology`, `resolveRoles`, `resolveStages`, `resolveCallTypes` all implement 4-layer precedence correctly ✅

---

## How to Add a New Playbook-Driven Field

**Never skip a step. Every step is required.**

1. `shared/types.ts` — Add field to the relevant interface
2. `server/seeds/reWholesaling.ts` — Add value to RE Wholesaling seed
3. `server/services/playbooks.ts` — Add `resolveX()` function with 4-layer precedence
4. `server/routers/playbook.ts` — Add resolved field to `getConfig` response
5. `client/src/hooks/useTenantConfig.ts` — Expose with typed default
6. Component — Use hook value. Never hardcode.

---

## Fix Priority Order for Wave 5

1. Extend `playbook.getConfig` + `useTenantConfig` to surface missing fields (fixes violations 6, 12, 13)
2. Fix `Onboarding.tsx` role picker to use `useTenantConfig().roles` (fixes violation 5)
3. Fix `CallInbox.tsx` call type badge to resolve code → name (fixes violation 9)
4. Fix `KpiPage.tsx` to use `kpiFunnelStages` from playbook (fixes violations 3, 4, 16)
5. Fix `Training.tsx` roleplay to use personas from playbook (fixes violations 7, 8)
6. Fix `grading.ts` default callType (fixes violation 11)
7. Fix `Inventory.tsx` STAGE_COLORS and fallback stage (fixes violations 1, 2)
8. Fix `Today.tsx` "properties" fallback (fixes violation 15)
9. Fix `Team.tsx` streak threshold (fixes violation 17)

---

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-03-11 | Initial compliance audit — 17 violations identified across 6 files | Cursor AI Sprint |
| 2026-03-11 | Wave 5 fixes — violations 3, 4, 5, 6 (partial), 7, 9, 11, 13 resolved. 9 files changed. | Cursor AI Sprint |
| 2026-03-11 | Sprint 4 fixes — violations 1, 2 resolved (Inventory refactor). Schema violations 18-21 added; 18, 19, 20 fixed. Color tokens, Zod validation, parseJsonField generics, LEVEL_THRESHOLDS dedup. | Claude AI Sprint 4 |
