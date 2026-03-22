# CLAUDE.md — Gunner AI

> You are a Production Systems Engineer, not a chatbot.
> Read this ENTIRE file before touching any code.
> Rules + orientation only. Status → PROGRESS.md. Architecture → docs/ARCHITECTURE.md. Agent standards → AGENTS.md.
> See docs/GUNNER_DAYHUB_CALLS_PROMPT.md for Day Hub + Calls full spec.

---

## What this is

**Gunner AI** — AI-first CRM Enhancer for wholesale real estate teams.
Backed by Go High Level (GHL). Zero friction. Revenue-driven.

The three things it does:
1. Grades every sales call automatically using Claude AI the moment it ends
2. Manages wholesale properties (inventory) with KPI auto-population
3. Scores leads using True Conversion Probability (0.0–1.0 ensemble model)

**This is not a CRM. This is a revenue intelligence layer on top of GHL.**

---

## NON-NEGOTIABLE RULES

Violating any of these is grounds to stop, revert, and fix.

---

### Rule 1 — Data Contract Rule (Settings Foundation)

**Settings built without data logic = UI shells = wasted work. This killed the prior build.**

Before building ANY settings field:
1. Define the Prisma schema field it writes to (table, column, type)
2. Define the exact API endpoint and query the live page uses to read it
3. Confirm write-path key === read-path key — identical, no exceptions

Every settings field in code must have this comment block:
```typescript
// WRITES TO: tenants.property_trigger_stage (String)
// API ENDPOINT: PATCH /api/tenants/config
// READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
// READ QUERY: db.tenant.findUnique({ select: { propertyTriggerStage: true } })
// DROPDOWN SOURCE: GET /api/ghl/pipelines → stages[]
```

Use updateTenantSettings() server action for all settings writes.
Dashboard read-path and settings write-path must use identical Prisma field names.

---

### Rule 2 — No Text Inputs for GHL Mappings

**Zero text inputs for any CRM field mapping. Zero exceptions.**

Every GHL mapping field must be:
- A searchable dropdown populated by a live GHL API call
- Storing GHL IDs (not display names — names change, IDs don't)
- Handling loading, error, and empty states explicitly

| Field type | GHL endpoint |
|---|---|
| Pipeline | GET /opportunities/pipelines |
| Stage | Derived from selected pipeline |
| Custom field | GET /locations/{id}/customFields |
| Assigned user | GET /users (location scoped) |
| Calendar | GET /calendars |

Never: <input placeholder="Enter stage name" />
Always: <GHLDropdown endpoint="/api/ghl/pipelines" storeId />

---

### Rule 3 — Single Settings Hub — 7 Sections

All configuration at /{tenant}/settings. No gear icons on individual pages.

| # | Section | Data contract target |
|---|---|---|
| 1 | Integrations | tenants.ghl_access_token, ghl_location_id |
| 2 | Pipeline | tenants.property_pipeline_id, property_trigger_stage |
| 3 | Team | users table, role assignments, hierarchy |
| 4 | Calls | tenants.call_types, call_rubrics table |
| 5 | Inventory | tenants.config → inventory_fields |
| 6 | KPIs | role_configs table, kpi_snapshots |
| 7 | Day Hub | role_configs.task_categories |

No Orphan UI: If a setting does not visibly change something on a live dashboard, do not build the write-path until the read-path exists.

---

### Rule 4 — Worker Agent Architecture

**Gunner agents are Workers, not Chatbots.**

- Completion signal: Use stop_reason: "end_turn" as the only unambiguous signal. Never parse natural language to detect completion.
- High-stakes gates: SMS blasts, record deletion, bulk updates — gated by code-level interceptors requiring explicit human approval. Prompt instructions are not security boundaries.
- Isolated context: Every sub-agent spawn passes full context explicitly (CLAUDE.md, AGENTS.md, relevant module docs). Never assume inherited context.
- Self-healing tools: All tools return structured JSON:

{
  status: 'success' | 'error' | 'no_results',
  data?: unknown,
  error?: string,
  suggestion?: string
}

---

### Rule 5 — True Conversion Probability (Lead Scoring)

**Gunner calculates True Conversion Probability (TCP): 0.0–1.0.**

Ensemble model factors:
- Call sentiment score (from grading)
- Previous touch count and recency
- Property equity percentage
- Seller motivation score
- Days since first contact
- Appointment set/no-show history
- Pipeline stage velocity

The Buy Signal: High TCP + Low team engagement = priority lead.
Team efficiency tracked via Sharpe Ratio (profit per unit of risk/time).
Performance logged as Log Returns: ln(P1/P0) for additive accuracy.

Implementation lives in lib/ai/scoring.ts.
Score recalculates on every: call graded, stage change, task completed.

---

### Rule 6 — Onboarding is 70% of the App

The first 60 seconds must connect GHL and show a wow result.

Onboarding flow:
1. Connect GHL (OAuth) — must complete in under 3 clicks
2. Select pipeline trigger — live dropdown, no typing
3. Make or replay a call — show first graded result
4. Hard paywall gate here — user has seen the value, now subscribe
5. Invite team → dashboard

The paywall goes AFTER the user sees the first graded call.

---

### Rule 7 — Autonomous Handoff (Session Discipline)

Every session ends with PROGRESS.md updated. Every single session.

End of session checklist:
1. PROGRESS.md → Session Log: exactly what was done
2. PROGRESS.md → Known Bugs: anything discovered
3. PROGRESS.md → Next Session: exact first task, exact first prompt
4. AGENTS.md → updated if any new convention was established
5. docs/DECISIONS.md → updated if any architectural choice was made

Test: could a brand new Claude Code session pick up exactly where this left off
using only PROGRESS.md + AGENTS.md? If no → handoff is incomplete.

---

## Hard Technical Rules

- Every API route calls getSession() from lib/auth/session.ts before touching data
- Every DB query includes tenantId — no exceptions
- Never expose SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY client-side
- All GHL calls go through lib/ghl/client.ts
- All Claude calls go through lib/ai/
- All env vars go through config/env.ts
- TypeScript strict mode — no any, no @ts-ignore
- Every async function has try/catch — errors log to audit_logs
- Server components fetch. Client components display.
- **No phase is complete until every feature is verified end-to-end on production** — manual replays, local-only tests, and "should work" do not count. If it hasn't been observed working on the live Railway URL with real data, it is not done.

---

## Stack — locked

| Layer | Tech | Entry point |
|---|---|---|
| Framework | Next.js 14 App Router | next.config.js |
| Database | PostgreSQL via Supabase | prisma/schema.prisma |
| ORM | Prisma | lib/db/client.ts |
| Auth | NextAuth.js v4 | lib/auth/config.ts |
| AI | Anthropic claude-opus-4-6 | lib/ai/ |
| GHL | OAuth Marketplace App | lib/ghl/client.ts |
| Lead Scoring | Ensemble TCP model | lib/ai/scoring.ts |
| Styling | Tailwind CSS | tailwind.config.ts |
| Deploy | Railway + Supabase | railway.toml |
| Agent Standards | AGENTS.md | /AGENTS.md |

---

## Session Start Protocol

1. Read PROGRESS.md → find Next Session → start exactly there
2. Read AGENTS.md → confirm you understand the conventions
3. Read relevant section of docs/MODULES.md
4. Check docs/DECISIONS.md before any architectural choice
5. Build
6. Update PROGRESS.md + AGENTS.md before ending
