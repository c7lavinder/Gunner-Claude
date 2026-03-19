# ARCHITECTURE.md — Gunner AI System Design

> The "why" behind every structural decision. Read this before adding a new module, changing a data flow, or questioning why something works the way it does.

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTS (browsers)                    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Next.js 14 — Railway                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  App Router  │  │  API Routes  │  │  Middleware   │  │
│  │  (pages)    │  │  (/api/*)    │  │  (auth+tenant)│  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │
│         │                │                               │
│  ┌──────▼──────────────────▼──────────────────────────┐ │
│  │                   lib/                              │ │
│  │  ghl/client.ts  ai/grading.ts  ai/coach.ts         │ │
│  │  auth/config.ts  db/client.ts  properties.ts       │ │
│  └──────────────────────────┬───────────────────────-─┘ │
└─────────────────────────────┼───────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────▼──────┐  ┌─────────▼──────┐  ┌────────▼───────┐
│   Supabase     │  │  Anthropic     │  │  Go High Level │
│   PostgreSQL   │  │  Claude API    │  │  (GHL) API     │
│   + Auth       │  │                │  │                │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## Multi-Tenancy Architecture

### How tenant isolation works

Every client (wholesaling company) is a **tenant**. They are completely isolated from each other at every layer:

**Layer 1 — URL routing**
```
gunnerai.com/apex-wholesaling/dashboard
             ^^^^^^^^^^^^^^^^
             tenant slug — resolved in middleware.ts
```
Middleware reads `session.tenantSlug` and rejects requests where URL slug ≠ session slug. A user from "apex-wholesaling" can never access "sunrise-deals" routes, even if they guess the URL.

**Layer 2 — Application queries**
Every single DB query filters by `tenantId`:
```typescript
// WRONG — leaks data across tenants
db.property.findMany()

// RIGHT — always
db.property.findMany({ where: { tenantId } })
```
The `tenantId` comes from the NextAuth session, which is set at login and signed with `NEXTAUTH_SECRET`.

**Layer 3 — Supabase Row Level Security**
Even if a bug in the app forgets the `tenantId` filter, Supabase RLS blocks the query at the database level. The policies in `prisma/rls-policies.sql` enforce that users can only see rows where `tenant_id` matches the value set in `app.tenant_id`.

**Why three layers?**
- Layer 1 prevents URL guessing attacks
- Layer 2 is the primary enforcement (fast, in application code)
- Layer 3 is the safety net (catches bugs in Layer 2)

---

## GHL Integration Architecture

### Why OAuth Marketplace App (not API keys)

| Approach | Pros | Cons |
|---|---|---|
| API keys per tenant | Simple to start | Manual setup, error-prone, not scalable |
| OAuth Marketplace App | Self-serve, automatic, scalable, GHL-approved | More complex to build initially |

We built OAuth from the start because the goal is 100 tenants. API keys don't scale.

### Token flow

```
User clicks "Connect GHL" in onboarding
        ↓
Redirect to GHL OAuth chooselocation page
        ↓
User picks their sub-account
        ↓
GHL redirects to /api/auth/ghl/callback?code=XXX
        ↓
We exchange code for access_token + refresh_token
        ↓
Store both in tenants table (ghl_access_token, ghl_refresh_token, ghl_token_expiry)
        ↓
Register webhooks on GHL for this location
        ↓
Every subsequent GHL API call goes through getGHLClient(tenantId)
which auto-refreshes the token if it expires in <5 minutes
```

### Webhook flow

```
GHL fires event (e.g. call ends)
        ↓
POST /api/webhooks/ghl
        ↓
Verify HMAC signature (GHL_WEBHOOK_SECRET)
        ↓
Return 200 immediately (so GHL doesn't retry)
        ↓
Process async in background:
  - Find tenant by locationId
  - Route to correct handler (handleCallCompleted, etc.)
  - Handler does the work (grade call, create property, etc.)
```

**Why return 200 before processing?**
GHL will retry the webhook if we don't respond within 5 seconds. Call grading takes 10-30 seconds. So we respond immediately and process asynchronously.

---

## Call Grading Architecture

```
GHL fires CallCompleted webhook
        ↓
handleCallCompleted() in lib/ghl/webhooks.ts
        ↓
Creates Call record with gradingStatus: 'PENDING'
        ↓
Calls gradeCall(callId) — fire and forget (no await)
        ↓ (async, may take 10-30 seconds)
gradeCall() in lib/ai/grading.ts:
  1. Updates gradingStatus → 'PROCESSING'
  2. Fetches call + user + rubric from DB
  3. Builds system prompt with rubric criteria
  4. Builds user prompt with transcript/metadata
  5. Calls Claude claude-opus-4-6 API
  6. Parses JSON response
  7. Updates Call record with score, rubricScores, aiSummary, aiFeedback, coachingTips
  8. Updates gradingStatus → 'COMPLETED'
  9. Logs to audit_logs
```

**Why fire-and-forget?**
The webhook must return 200 in <5 seconds. Grading takes longer. So we decouple them.

**What if grading fails?**
- Sets `gradingStatus: 'FAILED'`
- Logs error to `audit_logs`
- User sees "Grading failed" on the call card
- Can be manually triggered in a future release

**What if there's no recording?**
Claude grades on available metadata (direction, duration, call type, role). Score will be lower quality but still gives basic feedback.

---

## Property / Inventory Architecture

### Why property-based not contact-based

GHL is contact-based. We are property-based. This is intentional.

In wholesaling:
- One seller (contact in GHL) can own 3 properties
- You want to track each property separately (different ARV, status, assigned rep)
- Your KPIs are deals closed (properties sold), not contacts touched

So: GHL owns the contact → we own the property → they're linked via `ghlContactId`.

### How a property gets created

```
Seller fills out form or gets uploaded to GHL
        ↓
Rep works the lead → moves contact to configured pipeline stage
        ↓
GHL fires OpportunityStageChanged webhook
        ↓
We check: does stageId match tenant.propertyTriggerStage?
        ↓
If yes: createPropertyFromContact(tenantId, contactId)
        ↓
Fetch contact details from GHL API
        ↓
Create Property record with address from contact
        ↓
Create or find Seller record
        ↓
Create PropertySeller join (isPrimary: true)
```

### The seller-property many-to-many

One seller can own multiple properties:
```
Seller: Robert Smith
  → 123 Main St (active)
  → 456 Oak Ave (sold)
  → 789 Pine Rd (dead)
```

We use `property_sellers` as a join table. `isPrimary` marks the main contact for a property.

---

## AI Coach Architecture

### What makes it context-aware

Every coach request pulls fresh context before calling Claude:
```typescript
// Fetched every time, not cached:
- Last 5 graded calls + scores + feedback
- Open task count
- Active property count
- Role config (what KPIs they track)
```

This context goes into Claude's system prompt. The coach knows:
- "You scored 61 on your last call — here's what the grader said"
- "You have 3 open tasks right now"
- "You're a lead manager, so I'll focus on qualifying and appointment-setting"

### Why we don't store conversation history

The coach is stateless — each session starts fresh. This is intentional:
- Keeps context window clean
- No storage cost for message history
- Users tend to start new topics each session anyway
- Simpler to implement for MVP

Future: add optional conversation memory for returning users.

---

## KPI Architecture

### Source of truth

KPIs auto-populate from these tables:
- **Calls** → calls made, avg score, grading distribution
- **Properties** → active pipeline, new leads, sold this month
- **Tasks** → completed today, open count
- **KpiSnapshots** → historical trend data (daily snapshots)

### Snapshot system

A cron job runs daily at midnight and saves a snapshot of every user's metrics to `kpi_snapshots`. This enables:
- Historical trend charts (score over time)
- Weekly/monthly comparisons
- Without snapshots, we can only show current state

---

## Database Schema — key relationships

```
Tenant (1) ─── (many) User
Tenant (1) ─── (many) Property
Tenant (1) ─── (many) Seller
Tenant (1) ─── (many) Call
Tenant (1) ─── (many) Task
Tenant (1) ─── (many) CallRubric
Tenant (1) ─── (many) RoleConfig

Property (many) ─── (many) Seller  [via PropertySeller join table]
Property (1) ─── (many) Call
Property (1) ─── (many) Task

User (many) ─── (many) User  [via reportsTo self-reference]
User (1) ─── (many) Call  [assignedTo]
User (1) ─── (many) Task  [assignedTo]
User (1) ─── (many) KpiSnapshot
```

---

## File Naming Conventions

| Pattern | Meaning | Example |
|---|---|---|
| `app/(group)/page.tsx` | Route group (no URL segment) | `(auth)/login/page.tsx` |
| `app/(tenant)/[tenant]/page.tsx` | Dynamic tenant segment | `[tenant]/dashboard/page.tsx` |
| `components/module/module-client.tsx` | Client component for a module | `calls/calls-client.tsx` |
| `lib/domain/action.ts` | Business logic | `ghl/client.ts`, `ai/grading.ts` |
| `app/api/resource/route.ts` | API route | `api/tasks/route.ts` |
| `scripts/verb.ts` | Runnable script | `scripts/seed.ts` |

---

## Performance Considerations

- **Server components** fetch data — keeps client bundle small
- **Parallel queries** with `Promise.all()` — dashboard loads all data in one round-trip
- **GHL token refresh** happens automatically — no failed requests due to expired tokens
- **Webhook processing** is async — never blocks GHL's retry timeout
- **KPI snapshots** are pre-computed nightly — KPI page doesn't scan millions of rows

---

## Security Model

| Threat | Mitigation |
|---|---|
| Tenant A accessing Tenant B data | Middleware slug check + DB `tenantId` filter + RLS |
| Forged GHL webhooks | HMAC signature verification with `GHL_WEBHOOK_SECRET` |
| Session hijacking | NextAuth JWT signed with `NEXTAUTH_SECRET`, httpOnly cookies |
| Exposed secrets | `config/env.ts` validates at startup, never reads `process.env` in components |
| SQL injection | Prisma ORM parameterizes all queries |
| Privilege escalation | `hasPermission(role, permission)` checked on every protected action |
