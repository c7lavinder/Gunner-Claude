# MODULES.md — Gunner AI Module Reference

> Before touching any module, read its section here. Understand its inputs, outputs, and what breaks if you change it.

---

## Module Index

1. [Authentication & Sessions](#1-authentication--sessions)
2. [Tenant Routing & Isolation](#2-tenant-routing--isolation)
3. [GHL Client & OAuth](#3-ghl-client--oauth)
4. [GHL Webhooks](#4-ghl-webhooks)
5. [Call Grading](#5-call-grading)
6. [Property / Inventory](#6-property--inventory)
7. [Task Management](#7-task-management)
8. [AI Coach](#8-ai-coach)
9. [KPI System](#9-kpi-system)
10. [Self-Audit Agent](#10-self-audit-agent)
11. [Inbox](#11-inbox)
12. [Appointments](#12-appointments)

---

## 1. Authentication & Sessions

**Files:** `lib/auth/config.ts`, `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts`

**What it does:**
Handles login, session creation, and enriches the session with `tenantId`, `tenantSlug`, `role`, and `onboardingCompleted`.

**Session shape:**
```typescript
session.user = {
  id: string           // our DB user ID
  email: string
  name: string
  role: UserRole       // OWNER | ADMIN | TEAM_LEAD | etc.
  tenantId: string     // our DB tenant ID
  tenantSlug: string   // URL slug e.g. "apex-wholesaling"
  onboardingCompleted: boolean
}
```

**How to use it in a server component:**
```typescript
const session = await getServerSession(authConfig)
if (!session?.user) redirect('/login')
const tenantId = (session.user as { tenantId?: string }).tenantId ?? ''
```

**Gotchas:**
- NextAuth v5 is still beta. The `authConfig` export must be used, not `auth` directly.
- The type cast `(session.user as { tenantId?: string })` is needed because we extend the default type in `types/next-auth.d.ts`.
- Session is stored in a JWT (not DB) — updates to user role/tenant don't reflect until they log out and back in.

**Dependencies:** Prisma (`db.user.findUnique`), bcryptjs for password comparison

---

## 2. Tenant Routing & Isolation

**Files:** `middleware.ts`

**What it does:**
Runs on every request. Extracts the tenant slug from the URL, validates it matches the session, and injects tenant context into request headers.

**Headers injected:**
```
x-tenant-slug: apex-wholesaling
x-tenant-id: clm123abc...
x-user-id: clm456def...
x-user-role: ACQUISITION_MANAGER
```

**Public paths (no auth required):**
`/login`, `/register`, `/onboarding`, `/api/auth/*`, `/api/webhooks/*`

**What happens on mismatch:**
User from tenant A trying to access tenant B's URL → redirected to their own dashboard.

**Gotchas:**
- The middleware runs on the Edge — no Prisma, no Node APIs. Only reads the JWT token.
- Webhook routes (`/api/webhooks/*`) are public — GHL must be able to POST without auth.
- If you add a new public route, add it to the `PUBLIC_PATHS` array.

---

## 3. GHL Client & OAuth

**Files:** `lib/ghl/client.ts`

**What it does:**
Single wrapper for all GHL API calls. Handles token storage, auto-refresh, and error handling.

**How to get a client:**
```typescript
// ALWAYS use this factory — never instantiate GHLClient directly
const ghl = await getGHLClient(tenantId)
```

**Available methods:**
- `getContact(id)`, `updateContact(id, data)`
- `addNote(contactId, note)`
- `createTask(contactId, task)`, `updateTask(...)`, `completeTask(...)`
- `sendSMS(contactId, message)`
- `getConversations(params)`
- `getCall(id)`, `getCallRecording(id)`
- `getAppointments(params)`
- `getPipelines()`
- `updateOpportunityStage(opportunityId, stageId)`
- `registerWebhook(url, events)`, `deleteWebhook(id)`

**Token refresh logic:**
`getGHLClient()` checks if `ghl_token_expiry` is within 5 minutes. If so, calls `refreshGHLToken()` which updates the DB and returns the new token. This is transparent to callers.

**Gotchas:**
- If `ghlLocationId` is null, throws `Error: Tenant has no GHL connection`. Always check for this.
- GHL API base URL is `https://services.leadconnectorhq.com` — not `api.ghl.com`
- API version header `Version: 2021-07-28` is required on every request
- Rate limits: GHL allows ~100 requests/minute per location. Add throttling if bulk operations are needed.

**OAuth flow:** `app/api/auth/ghl/callback/route.ts` handles the redirect, calls `exchangeGHLCode()`, saves tokens, and registers webhooks.

---

## 4. GHL Webhooks

**Files:** `lib/ghl/webhooks.ts`, `app/api/webhooks/ghl/route.ts`

**What it does:**
Receives all events from GHL, verifies the signature, routes to the right handler.

**Events handled:**
| Event | Handler | What it does |
|---|---|---|
| `CallCompleted` | `handleCallCompleted` | Creates Call record, triggers grading |
| `OpportunityStageChanged` | `handleOpportunityStageChanged` | Maybe creates a Property |
| `TaskCompleted` | `handleTaskCompleted` | Syncs completion to our DB |
| `AppointmentCreated` | `handleAppointmentCreated` | Logs it (appointments are fetched live) |

**To add a new event:**
1. Add a case to the `switch` in `handleGHLWebhook()`
2. Write a handler function `async function handleXxx(tenantId, event)`
3. Add the event name to the `GHL_WEBHOOK_EVENTS` array in `app/api/auth/ghl/callback/route.ts`

**Signature verification:**
GHL sends `x-ghl-signature` header with HMAC-SHA256 of the body using `GHL_WEBHOOK_SECRET`. If the secret is wrong or missing, all webhooks fail silently in production.

**Gotchas:**
- Always return 200 within 5 seconds or GHL retries. The route handles this — don't add slow operations to the route handler itself.
- The `event.type` field uses inconsistent casing in GHL (`CallCompleted` vs `call.completed`). We handle both.
- `locationId` in the event maps to `tenant.ghlLocationId`. If no tenant found, log and return — don't error.

---

## 5. Call Grading

**Files:** `lib/ai/grading.ts`

**What it does:**
Uses Claude to score a call on a rubric, produce a summary, detailed feedback, and coaching tips.

**Input:** `callId` (string)
**Output:** Updates the `calls` table with score, rubricScores, aiSummary, aiFeedback, aiCoachingTips

**Rubric system:**
- Fetches the default rubric for the user's role from `call_rubrics` table
- If no rubric configured, uses built-in defaults (different per role)
- Lead Manager default: Opening, Qualifying, Listening, Objection handling, Next steps
- Acquisition Manager default: Rapport, Motivation discovery, Property info, Offer delivery, Close

**Grade response shape (from Claude):**
```json
{
  "overallScore": 78,
  "rubricScores": {
    "Opening": { "score": 16, "maxScore": 20, "notes": "Good energy" }
  },
  "summary": "Two-sentence call summary",
  "feedback": "Specific actionable paragraph",
  "coachingTips": ["Tip 1", "Tip 2", "Tip 3"]
}
```

**Gotchas:**
- `gradingStatus: 'PROCESSING'` must be set before calling Claude. Prevents duplicate grading if webhook fires twice.
- Always wrap Claude response parsing in try/catch — Claude occasionally returns malformed JSON.
- If no recording URL and no transcript, grading still runs but score quality will be low. The feedback notes this.
- Claude model is hardcoded to `claude-opus-4-6`. Do not change without testing grade quality.

---

## 6. Property / Inventory

**Files:** `lib/properties.ts`, `app/(tenant)/[tenant]/inventory/`, `components/inventory/`

**What it does:**
Manages the property lifecycle from creation (triggered by GHL) through disposition.

**Property creation flow:**
1. GHL webhook fires `OpportunityStageChanged`
2. `handleOpportunityStageChanged` checks if the stage matches `tenant.propertyTriggerStage`
3. If match: calls `createPropertyFromContact(tenantId, ghlContactId, context)`
4. `createPropertyFromContact` fetches contact from GHL, creates Property + Seller + PropertySeller records
5. Deduplication check: if a property already exists for this `ghlContactId`, it skips

**Property status flow:**
```
NEW_LEAD → CONTACTED → APPOINTMENT_SET → APPOINTMENT_COMPLETED
→ OFFER_MADE → UNDER_CONTRACT → IN_DISPOSITION → SOLD
                                               → DEAD (any stage)
```

**The seller-property relationship:**
```typescript
// A property can have multiple sellers
// Each property must have at least one seller marked isPrimary: true
db.propertySeller.create({ data: { propertyId, sellerId, isPrimary: true } })
```

**Gotchas:**
- `createPropertyFromContact` is idempotent — safe to call multiple times for the same contact.
- Address fields default to empty strings if GHL contact has no address data. Don't assume they're populated.
- Financial fields (arv, askingPrice, mao) are `Decimal` in Prisma — convert to string with `.toString()` before passing to client components.

---

## 7. Task Management

**Files:** `app/api/tasks/route.ts`, `app/api/tasks/[taskId]/complete/route.ts`, `components/tasks/`

**What it does:**
Creates and completes tasks, syncing with GHL when a property contact is available.

**Create a task:**
```typescript
POST /api/tasks
{
  title: string
  category?: string        // from tenant task categories
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueAt?: string           // ISO datetime
  propertyId?: string      // links task to a property
  syncToGhl?: boolean      // default true, syncs to GHL contact's tasks
}
```

**Complete a task:**
```typescript
POST /api/tasks/{taskId}/complete
// Marks COMPLETED in our DB, syncs to GHL if ghlTaskId exists
```

**GHL sync:**
- Tasks linked to a property with a `ghlContactId` are synced to GHL automatically
- Tasks without a property (personal tasks) stay in our DB only
- If GHL sync fails, the task is still marked complete in our DB (non-fatal)

**Gotchas:**
- Task categories come from `roleConfig.taskCategories` — not hardcoded. Fetch from DB or use defaults.
- `ghlTaskId` is null for tasks created in our app before GHL sync completes. Handle gracefully.
- `priority` sorting: URGENT > HIGH > MEDIUM > LOW. The tasks page groups by priority, not sorts.

---

## 8. AI Coach

**Files:** `lib/ai/coach.ts`, `app/api/ai/coach/route.ts`, `components/ai-coach/`

**What it does:**
Conversational AI coach for each team member. Context-aware — knows their recent scores, open tasks, and pipeline.

**Context injected per request:**
- Last 5 graded calls + scores + feedback text
- Open task count
- Active property count
- User's role (changes coach persona and advice focus)
- Most recent coaching tips from last graded call

**System prompt structure:**
1. Coach persona ("You are Gunner, an elite wholesaling coach...")
2. User context (scores, tasks, properties)
3. Knowledge base (industry knowledge, objection handling, etc.)
4. Output rules (conversational, direct, no fluff)

**Conversation history:**
The client sends the full message history with each request. Claude has no memory between requests — it's all in the messages array.

**Gotchas:**
- Max tokens is 1024 per response — keeps responses punchy. Increase if detailed analysis is needed.
- Context is fetched fresh every request — adds ~50ms DB queries but ensures freshness.
- The coach persona is "Gunner" not "Claude" — keep this consistent in any prompt changes.
- Suggested prompts in the UI are hardcoded. Update them as you learn what users actually ask.

---

## 9. KPI System

**Files:** `app/(tenant)/[tenant]/kpis/page.tsx`, `components/kpis/`, `scripts/kpi-snapshot.ts`

**What it does:**
Shows real-time and historical KPI metrics. Real-time data from DB queries. Historical from `kpi_snapshots` table.

**Metrics available:**
- Calls made (today / week / month)
- Avg call score (today / week / month)
- Appointments set (approximated from task categories containing "ppointment")
- Contracts signed (properties with status `UNDER_CONTRACT` updated this month)
- Active properties / new this month / sold this month
- Tasks completed today / open count

**Per-role defaults** (from `types/roles.ts` `DEFAULT_KPIS`):
- Lead Manager: calls made, leads contacted, appointments set, avg score
- Acquisition Manager: calls made, appointments set, contracts signed, avg score
- Disposition Manager: active inventory, deals sent, deals closed, avg days to close

**Snapshot cron:**
`scripts/kpi-snapshot.ts` runs at midnight daily via Railway cron. Saves current metrics to `kpi_snapshots`. The KPI page currently shows live data — snapshots will power trend charts in Phase 2.

**Gotchas:**
- "Appointments set" is approximated from tasks with category containing "appointment" — not from GHL calendar. This is a known limitation.
- `avg_days_to_close` is not yet implemented — shows 0. Needs property `createdAt` → `status=SOLD` delta.
- User-level KPI scope: Lead Manager sees own data, Acquisition Manager sees own + their lead managers, Admin/Owner sees all.

---

## 10. Self-Audit Agent

**Files:** `scripts/audit.ts`

**What it does:**
Runs daily at 2am via Railway cron. Checks TypeScript, ESLint, env vars, then does a Claude-powered code review.

**Checks performed:**
1. `tsc --noEmit` — TypeScript errors
2. `next lint --quiet` — ESLint violations
3. Env var presence check (all required vars from a hardcoded list)
4. Claude AI code review of `lib/` and `app/api/` files — checks for security issues, missing tenant isolation, error handling gaps

**Claude review output:**
```json
{
  "issues": [
    {
      "severity": "CRITICAL|ERROR|WARNING|INFO",
      "file": "lib/ghl/client.ts",
      "issue": "Missing error handling on token refresh",
      "fix": "Wrap in try/catch, fall back to re-auth",
      "autoFixable": false
    }
  ],
  "summary": "Code health summary",
  "score": 85
}
```

**To run manually:**
```bash
npm run audit
# or
npx tsx scripts/audit.ts
```

**Gotchas:**
- Reads up to 15 source files (3000 chars each) — stays within Claude's context window.
- Fails with exit code 1 if any check status is FAIL. Railway cron sees this and can alert.
- Does not auto-fix yet — Phase 2 feature. Currently just reports.

---

## 11. Inbox

**Files:** `app/(tenant)/[tenant]/inbox/page.tsx`, `components/inbox/`

**What it does:**
Shows unread messages and recent conversations from GHL in real time. Data fetched server-side on every page load.

**Data source:** `ghl.getConversations({ limit: 50 })` — live from GHL API, not stored in our DB.

**Conversation grouping:**
- Unread first (conversations with `unreadCount > 0`)
- Then recent (all others, newest first)

**Gotchas:**
- If GHL is not connected, shows a clear error state (not a crash).
- Contact name is not available from the conversations list endpoint — shows "Contact" placeholder. Resolve contact names in Phase 2 with a separate GHL contact lookup per conversation.
- We don't store conversations — always fetched live. This means no offline support and no search.

---

## 12. Appointments

**Files:** `app/(tenant)/[tenant]/appointments/page.tsx`, `components/appointments/`

**What it does:**
Shows appointments for the next 7 days from GHL calendar. Data fetched server-side on every page load.

**Data source:** `ghl.getAppointments({ startDate, endDate, userId? })` — live from GHL API.

**Filtering:** If the user has a `ghlUserId` set, appointments are filtered to their calendar. Otherwise shows all appointments for the location.

**Grouping:** By day label (Today / Tomorrow / day name).

**Gotchas:**
- GHL user ID must be set on the `users` table (`ghlUserId` field) for per-user filtering to work. Currently this field exists but is not populated during onboarding.
- Appointment data does not include contact name — shows the appointment title only.
- No create/edit appointment from our app yet — links back to GHL for mutations.
