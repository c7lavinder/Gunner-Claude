# ARCHITECTURE.md — Gunner AI System Design

> The "why" behind every structural decision.
> Read before adding a new module, changing a data flow, or questioning why something works the way it does.
> Updated: Phase 1 hardening — GHL boundary and data contract rules integrated.

---

## Core Product Philosophy

**Gunner AI enhances GHL. It does not replace it.**

This boundary is the most important architectural decision in the entire system.
Getting it wrong means duplicating data, fighting sync conflicts, and building features GHL already has.

### What GHL owns (source of truth — we read, never overwrite)
- Contacts (sellers, buyers, leads)
- Conversations and messages
- Appointments and calendar events
- Pipelines and stages
- Tasks (we can create them, GHL stores them)
- Call recordings and metadata

### What Gunner AI owns (our source of truth — GHL cannot do this)
- **Properties** — ARV, repair estimates, equity, MAO, assignment fee, status
- **Call grades** — score, rubric breakdown, AI feedback, coaching tips
- **KPI milestones** — historical snapshots, trend data, goal tracking
- **Buyer activity** — deal blasts sent, responses, buyer list
- **Rubrics** — grading criteria per role and call type
- **Role configs** — which KPIs each role sees, task categories, permissions

When in doubt: if GHL can store it natively, we don't duplicate it.
We only build what GHL cannot do.

---

## The Data Contract Rule

**Every settings field must have an explicit data contract before it is built.**

A data contract means:
1. **WRITES TO:** exact table, column, and data type
2. **READ BY:** exact file, function, and query that consumes it

If both are not defined and verified to be identical before building the UI, the UI does not get built.

### Example — correct implementation
```
// Settings field: "Property pipeline trigger"
// WRITES TO: tenants.property_trigger_stage (string — GHL stage ID)
// READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
//          checks: event.stageId === tenant.propertyTriggerStage
// DROPDOWN SOURCE: GET /opportunities/pipelines → stages array
```

### Example — what failure looks like
Settings writes to `tenant.config.pipelineStage` (JSON blob).
Live page reads from `tenant.propertyTriggerStage` (top-level column).
Different fields → setting does nothing → user sees no effect → trust is broken.
This exact failure killed the previous build. It cannot happen again.

---

## GHL Integration Architecture

### Why OAuth Marketplace App (not API keys)
- Self-serve: tenants connect themselves during onboarding
- Scoped: tokens are per-location, not agency-wide
- Scalable: works for 100 tenants without manual credential management
- GHL-approved: better rate limits, marketplace visibility

### Token flow
```
User clicks "Connect GHL" in onboarding
        ↓
Redirect to GHL OAuth chooselocation
        ↓
User selects their sub-account
        ↓
GHL redirects to /api/auth/crm/callback?code=XXX
        ↓
Exchange code for access_token + refresh_token
        ↓
Store in tenants table (ghl_access_token, ghl_refresh_token, ghl_token_expiry)
        ↓
Register webhooks on GHL for this location
        ↓
Every GHL API call uses getGHLClient(tenantId) — auto-refreshes on expiry
```

### Webhook flow
```
GHL fires event (e.g. call ends)
        ↓
POST /api/webhooks/ghl
        ↓
Verify HMAC signature
        ↓
Return 200 immediately (prevents GHL retry)
        ↓
Process async:
  Find tenant by locationId
  Route to handler
  Handler does the work
```

Critical: Always return 200 before processing.
GHL retries if no response in 5 seconds.
Grading takes 10-30 seconds.
Async is non-negotiable.

---

## GHL Dropdown Rule

**No text inputs for any field that maps to a GHL entity.**

Every GHL mapping field must:
1. Fetch live data from GHL API on render
2. Display human-readable names
3. Store GHL IDs (not names — names change, IDs don't)
4. Handle loading and error states gracefully

Applies to:
- Pipeline selection → GET /opportunities/pipelines
- Stage selection → populated from selected pipeline stages
- Custom field mapping → GET /locations/{id}/customFields
- User assignment → GET /users on the location
- Calendar selection → GET /calendars

---

## Settings Architecture — 7 Sections, One Page

All configuration lives at /{tenant}/settings. No gear icons on individual pages.

| Section | What it controls | Key data contracts |
|---|---|---|
| Integrations | GHL OAuth, webhook status | tenants.ghl_access_token, ghl_location_id |
| Pipeline | Which stage creates a property | tenants.property_pipeline_id, property_trigger_stage |
| Team | Members, roles, hierarchy | users table, role assignments |
| Calls | Call types, results, rubrics | tenants.call_types, call_rubrics table |
| Inventory | Property card fields | tenants.config → inventory section |
| KPIs | Which metrics each role sees | role_configs table, kpi_snapshots |
| Day Hub | Task categories, default views | role_configs.task_categories |

---

## Multi-Tenancy — Three Layer Isolation

**Layer 1 — URL routing (middleware.ts)**
/{slug}/page → middleware validates slug matches session tenantSlug.
User from tenant A cannot access tenant B's URL even if they guess it.

**Layer 2 — Application queries**
Every DB query includes tenantId. Comes from verified session, not URL.

**Layer 3 — Supabase RLS**
Even if layers 1-2 have a bug, RLS blocks at DB level.
Requires setTenantContext(tenantId, userId) before each request.

---

## Call Grading Architecture
```
GHL fires CallCompleted webhook
        ↓
createCall() — saves record with gradingStatus: PENDING
        ↓
gradeCall(callId) — fire and forget (no await)
        ↓ async
1. Set gradingStatus → PROCESSING (prevents duplicate grading)
2. Fetch call + user + rubric from DB
3. Build prompt with rubric criteria
4. Call Claude claude-opus-4-6
5. Parse JSON response
6. Update call: score, rubricScores, aiSummary, aiFeedback, coachingTips
7. Set gradingStatus → COMPLETED
8. Log to audit_logs
```

gradingStatus: PROCESSING must be set before calling Claude.
If not set and webhook fires twice, you get duplicate grades.

---

## Property / Inventory Architecture

### Why property-based not contact-based
GHL is contact-based. Gunner AI is property-based. This is intentional.
One seller (GHL contact) can own multiple properties.
GHL has no native property object — we own this entirely.

### How a property gets created
```
Rep moves GHL contact to configured pipeline stage
        ↓
GHL fires OpportunityStageChanged webhook
        ↓
Check: does stageId === tenant.propertyTriggerStage?
        ↓ yes
createPropertyFromContact(tenantId, ghlContactId)
        ↓
Fetch contact from GHL → extract address
Create Property + Seller + PropertySeller records
```

The stage ID must come from a live GHL dropdown in settings.
If the user types the wrong stage name, properties never get created. Silent failure.

---

## Database — Key Relationships
```
Tenant (1) ── (many) User
Tenant (1) ── (many) Property
Tenant (1) ── (many) Seller
Tenant (1) ── (many) Call
Tenant (1) ── (many) Task
Tenant (1) ── (many) CallRubric
Tenant (1) ── (many) RoleConfig

Property (many) ── (many) Seller  [via PropertySeller]
Property (1) ── (many) Call
Property (1) ── (many) Task

User (many) ── (many) User  [via reportsTo self-reference]
```

---

## Security Model

| Threat | Mitigation |
|---|---|
| Tenant A accessing Tenant B data | Middleware slug check + tenantId filter + RLS |
| Forged GHL webhooks | HMAC signature with GHL_WEBHOOK_SECRET |
| Session hijacking | NextAuth JWT signed with NEXTAUTH_SECRET |
| Exposed secrets | config/env.ts validates at startup |
| SQL injection | Prisma ORM parameterizes all queries |
| Privilege escalation | hasPermission(role, permission) on every action |

---

## Phase 1 Success Criteria

The architecture is not proven until:
1. A real GHL call → creates a graded record in Gunner AI automatically
2. A real pipeline stage change → creates a property in inventory automatically
3. Two different tenant accounts → cannot see each other's data
4. Settings pipeline selector → uses live GHL dropdown → writes correct stage ID → triggers property creation

If all four work, the foundation is solid. Phase 2 can begin.
