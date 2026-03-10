# Gunner Rebuild Plan

> **Purpose:** This is the single source of truth for the Gunner rebuild. Every architecture decision, page spec, algorithm, trigger, and playbook mapping is documented here. Read this before starting any rebuild task. This document IS the brain for the build.
>
> **Last updated:** March 10, 2026

---

## Table of Contents

1. [Vision & Philosophy](#1-vision--philosophy)
2. [Four-Playbook Architecture](#2-four-playbook-architecture)
3. [Playbook Layer Separation](#3-playbook-layer-separation)
4. [Page Map](#4-page-map)
5. [Unified AI Service](#5-unified-ai-service)
6. [AI Intelligence & Learning Loop](#6-ai-intelligence--learning-loop)
7. [Sorting Algorithms](#7-sorting-algorithms)
8. [Universal Action System](#8-universal-action-system)
9. [Inventory as Core](#9-inventory-as-core)
10. [CRM Sync Architecture](#10-crm-sync-architecture)
11. [Trigger Map](#11-trigger-map)
12. [Security](#12-security)
13. [Settings & Playbook Editor](#13-settings--playbook-editor)
14. [Existing Features to Preserve](#14-existing-features-to-preserve)
15. [Build Phases](#15-build-phases)
16. [Architecture Rules](#16-architecture-rules)

---

## 1. Vision & Philosophy

### What Gunner Is

Gunner is a multi-tenant AI-powered sales team empowerment platform. It does NOT replace the CRM. It pulls data from the CRM and empowers teams through:

- **Training** — make people better at their jobs
- **Accountability** — grades, KPIs, performance visibility
- **Efficient Actions** — AI tells you what to do, one click does it
- **Inventory Pipeline** — deals moving forward (inventory-focused, not contact-focused)

The goal: get the team OUT of the CRM and INTO Gunner. CRM stays updated automatically via Gunner's actions. Team never has to go back to the CRM to do work.

### High Floor / High Ceiling

**The Floor** (Software + Industry Playbooks) — what a new customer gets on Day 1:
- Pick your industry → everything adapts instantly
- Pick your CRM → connects and syncs automatically
- First call graded with industry-calibrated rubrics
- AI coach already knows the industry deeply
- Benchmarks from other teams in same industry
- Pre-built objection library, training scenarios, KPI definitions
- Smart from Day 1 because the platform learned from every other customer in that industry

The floor keeps rising as more customers join (network effect).

**The Ceiling** (Tenant + User Playbooks) — what grows over time:
- Tenant Playbook learns the company's specific patterns
- User Playbook learns each individual person
- AI suggestions get smarter with every interaction
- Coaching becomes personalized, not generic
- Automation becomes possible because patterns are known
- The ceiling has NO LIMIT — the more they use it, the more valuable it becomes

This creates switching cost: leaving Gunner means losing all accumulated intelligence.

### Core Design Principle

**Simple pages. Deep intelligence.**

The page is just a window. The intelligence lives underneath. User sees clean, simple, obvious. Underneath: playbooks, AI, algorithms doing the work.

- Pages are DUMB. System is SMART.
- The page shows a sorted list. User doesn't see the algorithm. Just sees the right thing at the top.
- The AI coach is a simple text box. User doesn't see the 4 playbooks being assembled. Just gets shockingly relevant advice.

---

## 2. Four-Playbook Architecture

### Layer 1: Software Playbook

**"What's true for any sales coaching platform, period."**

Owner: Gunner (we build and maintain this)

Contains:
- CRM adapter interface (works with any CRM)
- Universal grading criteria (rapport, listening, objection handling, professionalism, next steps)
- Core action types (note, SMS, task, stage change, appointment, tag, workflow, field update)
- Platform knowledge (how badges work, what XP means, how grading works)
- Base AI behavior rules ("always confirm before executing", "always show FROM and TO")
- Action system rules (every action must be previewed, confirmed, and show results)
- Algorithm frameworks (urgency sort structure, buyer match structure, task sort structure)
- Trigger patterns (webhook → polling → reconciliation)
- Security rules (tenant isolation, rate limits, session management)
- Contact cache pattern (3-layer: memory → DB → API)
- Critical failure cap mechanism (the concept, not specific thresholds)
- DQ-awareness (correct disqualifications score 75-90%)
- Prior context awareness (don't penalize for known info)
- Milestone flags that never reset
- Stage history logging on every transition

### Layer 2: Industry Playbook

**"What's true for this type of business."**

Owner: Gunner + cross-tenant intelligence (anonymized, aggregated)

Contains:
- Role templates (names, descriptions, what calls each makes)
- Call type definitions (name, description, rubric mapping)
- Full rubrics (criteria, points, key phrases, critical failures, talk ratio targets)
- Pipeline stage templates (acquisition + disposition for RE, different for solar, etc.)
- Terminology (seller/homeowner/policyholder, property/installation/policy, deal/proposal/renewal)
- Outcome types (appointment_set, offer_made, etc.)
- KPI funnel stages and definitions
- Asset/project types (flipper/landlord for RE, residential/commercial for solar)
- Occupancy/status options
- Roleplay personalities and scenarios
- Training material categories
- Common objection library with proven responses
- Seasonal patterns
- Industry benchmarks (cross-tenant, anonymized, ≥5 tenants minimum)
- Default algorithm weights for this industry
- Grading philosophy instructions specific to this industry
- Industry-specific AI knowledge

### Layer 3: Tenant Playbook

**"What's specific to THIS company."**

Owner: The customer (editable via UI and AI)

Contains:
- Company name, branding
- CRM connection (type, credentials, location ID)
- Their exact stage names (mapped to CRM pipeline/stage IDs)
- Their actual role names (mapped to CRM user roles)
- Their markets (names + zip codes)
- Their lead sources (names + CRM source string mappings)
- Their GHL custom fields (for AI to reference)
- Their GHL pipeline IDs and stage IDs
- Algorithm weight overrides (urgency, buyer match, task sort)
- Rubric tweaks (point adjustments, custom criteria added)
- Their methodology and scripts (tenant-specific text)
- Their KPI targets (per role, per period)
- Their badge definitions
- Their grading rule overrides
- Buyer pipeline stages (matched, sent, interested, offered, etc.)
- Outreach channel options
- SMS sending limits
- Team member roster + CRM user ID mapping

### Layer 4: User Playbook

**"What's specific to THIS person."**

Owner: Auto-generated from data + user input

Contains:
- User identity (name, role, team, tenure)
- Communication style (SMS tone, note format — learned from edits)
- Explicit instructions ("always use Sales Process pipeline", "assign tasks to Daniel")
- Performance profile (auto-generated from grading data):
  - Top 3 strengths (from criteria scores)
  - Top 3 growth areas (from criteria scores)
  - Grade trend (improving/declining/plateau)
  - Outcome trend (conversion rate direction)
- Coaching history (distilled):
  - Key themes across past sessions
  - What advice was given and whether it stuck
  - Techniques practiced in roleplay
  - Recurring issues flagged by the AI
- Action patterns (auto-generated):
  - Most common actions ("sends 12 SMS/day")
  - Missing patterns ("rarely creates follow-up tasks after callbacks")
  - CRM habits
- Behavioral patterns (from user_events):
  - When they log in, how long, cadence
  - Which suggestions they act on vs ignore
  - Response times to suggestions
- KPI targets and progress
- Personal goals

---

## 3. Playbook Layer Separation

Everything currently hardcoded maps to a specific playbook layer. This is the exact migration guide:

### Currently Hardcoded → Moves To

| Hardcoded Item | Currently In | Moves To |
|---|---|---|
| `STATUS_CONFIG` stage names (new_lead, contacted, apt_set...) | Inventory.tsx, routers.ts | Tenant Playbook (stages, mapped to GHL) |
| `projectType` options (flipper, landlord, builder...) | schema.ts, Inventory.tsx | Industry Playbook (RE asset types) |
| `occupancyStatus` options (vacant, occupied, tenant...) | schema.ts, Inventory.tsx | Industry Playbook (RE property states) |
| `BUYER_STATUS_CONFIG` (matched, sent, interested...) | Inventory.tsx | Tenant Playbook (buyer pipeline stages) |
| Role names (acquisition_manager, dispo_manager...) | 20+ files | Tenant Playbook (roles) |
| 4 roleplay seller personalities | Training.tsx, routers.ts | Industry Playbook (RE personas) |
| 4 roleplay scenarios | Training.tsx, routers.ts | Industry Playbook (RE call types) |
| Training material categories (Script, Objection Handling...) | Training.tsx | Industry Playbook |
| KPI funnel stages (leads → apts → offers → contracts → closed) | KpiPage.tsx | Industry Playbook (RE funnel) |
| 50-60% Zillow price anchor instruction | grading.ts | Industry Playbook (RE pricing rule) |
| Key phrases in rubric criteria | grading.ts | Industry Playbook (industry-calibrated phrases) |
| Grading rubric criteria names (Motivation Extraction, Offer Setup...) | grading.ts | Industry Playbook (rubrics) |
| Algorithm weights (buyer tier: 30, project type: 35...) | to be created | Tenant Playbook (config, adjustable per company) |
| 15-minute new lead urgency rule | to be created | Tenant Playbook (their specific SLA) |
| Market names (Nashville, Memphis...) | KpiPage, Inventory | Tenant Playbook (markets) |
| GHL pipeline IDs | ghlService.ts, ghlContactImport.ts | Tenant Playbook (CRM config) |
| Lead source names | KpiPage | Tenant Playbook (sources) |
| "Real estate wholesaling" in AI prompts (300+ places) | grading.ts, coachStream.ts, routers.ts, etc. | Industry Playbook (industryPrompt) |
| "Seller" / "Property" / "Deal" in UI | 100+ frontend files | Industry/Tenant Playbook (terminology) |
| "GoHighLevel" in frontend copy | Landing, TaskCenter, Inventory | Remove entirely (CRM-agnostic UI) |
| "NAH Kitty Hawk" testimonial | Landing.tsx | Remove (no tenant-specific content in code) |
| "Built for Real Estate Wholesalers" | Landing.tsx | Remove (industry-agnostic landing) |

---

## 4. Page Map

### 7 Core Pages

| Route | Page | One Job |
|---|---|---|
| `/today` | Day Hub | What do I do right now? SMS inbox + Appointments + Tasks |
| `/calls` | Call Inbox | Review calls, get graded, AI coach |
| `/inventory` | Pipeline | All assets moving through stages (THE CORE) |
| `/kpis` | KPI Dashboard | Goals, actuals, funnel, markets |
| `/team` | Team + Gamification | Leaderboard, XP, badges, streaks — motivation layer |
| `/training` | Training Hub | Skills, roleplay, materials, team training |
| `/settings` | Configuration | Simple. Three sections max. Set it and forget it. |

### Supporting Pages

| Route | Page |
|---|---|
| `/` | Landing (public) |
| `/login` | Auth (login + signup unified) |
| `/pricing` | Plans (public) |
| `/profile` | Personal profile, badges, settings |
| `/admin` | Super admin only |
| `/playbook` | Playbook viewer + AI editor (important enough for own page) |

### Pages to Delete/Consolidate

| Current Page | Destination |
|---|---|
| Home (858 lines) | DELETE (dead, never routed) |
| LeadGenDashboard | DELETE (redirect to /tasks) |
| ComponentShowcase | DELETE (dev only) |
| Feedback | DELETE (redirect to /calls) |
| GradingRules | DELETE (orphaned, never imported) |
| Methodology | MERGE into /training tab |
| TeamTraining | MERGE into /training tab |
| Leaderboard | MERGE into /team |
| Analytics | DELETE (absorbed into /kpis and AI coach) |
| SocialMedia | MERGE into /training or /settings |
| Opportunities | MERGE into /inventory (signal panel) |
| CoachActivityLog | MERGE into /calls tab |
| TeamManagement | MERGE into /settings → Team section |
| TenantSetup | MERGE into /settings or /admin |

### Today Page Spec

Three things:

1. **SMS Inbox** — All conversations from CRM. Unread/needs reply at top. One-click reply with AI draft. Sorted: unread first, then by recency.
2. **Appointments Today** — Pulled from CRM calendar. Time, contact name, asset. Prep button → shows asset detail + AI briefing. Chronological order.
3. **Tasks** — Pulled FROM CRM task list (CRM is source of truth). Sorted by role-specific importance algorithm. Any task created in Gunner → creates in CRM too. Completed in Gunner → marks complete in CRM.

Plus: AI always accessible. Missed calls badge (count, click → /calls filtered to missed).

---

## 5. Unified AI Service

### The Problem Today

10 different AI personalities across the app. 6 separate streaming endpoints. 4 separate memory pools. The AI on the Analytics page has zero memory of what the user discussed on the Calls page.

Only Day Hub coach and Calls page coach share memory. Everything else is isolated. The user feels like they're talking to a different person on every page.

### The Architecture

**One AI. Everywhere. Same voice. Same memory. Same personality.**

**One endpoint:** `POST /api/ai/stream`

```
{
  message: "...",
  page: "calls" | "inventory" | "analytics" | "training" | "today" | "team" | "kpis",
  pageContext: { callId?, propertyId?, teamMemberId?, ... }
}
```

**Server assembles context from all 4 playbooks:**

1. **Core Identity** (always loaded, every page):
   - User Playbook (name, role, strengths, trends, coaching themes)
   - Coaching Memory (distilled cross-session, not just last 8 messages)
   - Preferences (style, instructions)
   - Tenant Playbook (company, methodology, scripts)
   - Industry Playbook (terminology, rubrics, objections)
   - Software Playbook (action capabilities, rules)

2. **Capability Modules** (activated per page):
   - Calls: call transcript, grade, contact info
   - Inventory: property detail, buyers, offers, comps
   - KPIs: team stats, trends, benchmarks
   - Training: materials, roleplay scenarios
   - Today: tasks, conversations, appointments
   - Team: leaderboard, member profiles

3. **One Conversation Thread** — ALL messages across ALL pages go into ONE thread. The AI can reference conversations from other pages.

### What the AI Always Knows About Each User

| Data | Fed to AI? | When |
|---|---|---|
| User name and role | Yes | Always |
| Style preferences (SMS, notes, tasks) | Yes | Always |
| Explicit instructions | Yes | Always |
| Performance profile (strengths, weaknesses, trends) | Yes | Always |
| Coaching history (distilled themes) | Yes | Always |
| Conversation history | Yes | Always (full thread, not truncated) |
| Recent calls + grades | Yes | Always |
| XP, level, badges, streaks | Yes | Always |
| Past CRM actions | Yes | Always (summarized) |
| Action patterns | Yes | Always |
| KPI targets and progress | Yes | Always |

### Trust Equation

**TRUST = CONSISTENCY + MEMORY + COMPETENCE**

- Consistency: Same voice on every page. Same level of knowledge.
- Memory: "Last week we worked on your objection handling." User never repeats themselves.
- Competence: Can take actions from any page. Connects dots across pages.

---

## 6. AI Intelligence & Learning Loop

### Three Versions of Gunner AI

| Version | Mode | User Effort | AI Knowledge |
|---|---|---|---|
| V1 (Current) | Reactive — user tells AI what to do | High | Shallow |
| V2 (Next) | Proactive — AI suggests, user confirms | Medium | Deep |
| V3 (Future) | Autonomous — AI acts, user oversees | Low | Expert |

### Data Collection (Start NOW, Even for V1)

**New table: `user_events`** — Every meaningful user action:

| Field | Type | Description |
|---|---|---|
| id | serial | Primary key |
| tenantId | integer | Which company |
| userId | integer | Which person |
| eventType | text | What happened |
| page | text | Where in the app |
| entityType | text | call, contact, property, team_member |
| entityId | text | Which specific entity |
| metadata | jsonb | Event-specific details |
| source | text | user, ai_suggestion, automation |
| suggestionId | integer | If prompted by AI suggestion |
| createdAt | timestamp | When |

Event categories: navigation (page_view, feature_used, search_performed), AI interaction (question_asked, suggestion_accepted/edited/dismissed/ignored), CRM actions (requested, confirmed, executed, outcome), call activity (reviewed, replayed, grade_viewed, next_step_completed/ignored), workflow (day_started, tasks_completed, kpi_entered, property_updated, pipeline_moved).

**New table: `ai_suggestions`** — Tracks every suggestion lifecycle:

| Field | Type | Description |
|---|---|---|
| id | serial | Primary key |
| tenantId | integer | Which company |
| userId | integer | Who got the suggestion |
| suggestionType | text | next_step, coaching, action, nudge |
| content | text | What was suggested |
| reasoning | text | Why the AI suggested it |
| confidence | decimal | 0-1 |
| context | jsonb | What data drove this |
| page | text | Where shown |
| status | text | shown, accepted, edited, dismissed, ignored, auto_executed |
| userReaction | jsonb | Edits, dismiss reason |
| timeToReact | integer | Seconds from shown to reaction |
| outcome | jsonb | What happened after |
| outcomeScore | decimal | -1 to 1 |
| createdAt, reactedAt, outcomeAt | timestamps | Lifecycle timestamps |

### The Learning Loop

```
AI SUGGESTS → USER REACTS → OUTCOME MEASURED → DATA STORED → AI LEARNS
     ↑                                                              │
     └──────────────────────────────────────────────────────────────┘
```

- Confirms → weight this higher
- Edits → learn the correction
- Dismisses → don't suggest this again
- Ignores → reduce confidence
- Outcome positive → reinforce pattern
- Outcome negative → adjust approach

### Playbook Intelligence

**New table: `playbook_insights`** — Learned knowledge at every playbook level:

| Field | Type | Description |
|---|---|---|
| id | serial | Primary key |
| playbookLevel | text | software, industry, tenant, user |
| tenantId | integer | null for software/industry |
| userId | integer | null except for user level |
| industryCode | text | null for software level |
| insightType | text | pattern, benchmark, correlation, prediction, recommendation, etc. |
| category | text | What area of the business |
| content | jsonb | The actual intelligence |
| confidence | decimal | 0-1 |
| dataPoints | integer | How many events drove this |
| validUntil | timestamp | When to recalculate |
| createdAt, updatedAt | timestamps | |

**Intelligence jobs:**

| Job | Frequency | Updates | What It Does |
|---|---|---|---|
| User Profile Update | After every graded call | User Playbook | Recalculates strengths/weaknesses, trends |
| User Insight Distill | Weekly | User Playbook | Summarizes coaching themes, behavior patterns |
| Tenant Intelligence | Weekly | Tenant Playbook | Team performance, pipeline conversion, script effectiveness |
| Industry Intelligence | Monthly | Industry Playbook | Cross-tenant benchmarks (anonymized, ≥5 tenants), top objections |
| Software Intelligence | Monthly | Software Playbook | Universal coaching patterns, suggestion effectiveness |

### Cross-Tenant Privacy Rules

- Raw data NEVER leaves the tenant
- Insights flow up only as anonymized, aggregated statistics
- Industry insights require ≥5 tenants in that industry (prevent identification)
- SQL aggregation only (AVG, COUNT, etc.) — no raw rows
- No tenant ID, user ID, or PII in playbook_insights
- Terms of Service clearly states anonymized aggregated data improves the platform

---

## 7. Sorting Algorithms

### Architecture Rule

Every algorithm has a CONFIG OBJECT at the top of its file. To tune the algorithm: change the config. Not the logic. Config values come from the Tenant Playbook (with Industry Playbook defaults as fallback).

**File structure:**
```
server/algorithms/
├── inventorySort.ts     ← config + sort function
├── buyerMatch.ts        ← config + match function
├── taskSort.ts          ← config + sort function per role
└── index.ts             ← exports all three
```

### Algorithm 1: Inventory Sort (Asset Urgency)

**Level 1:** Group by stage (tabs from Tenant Playbook). User clicks the stage they want to work.

**Level 2:** Within a stage — dynamic sort:

| Tier | Priority | What Qualifies |
|---|---|---|
| TIER 1 — Needs Immediate Attention | TOP | Unread/unanswered SMS from contact. Missed call today. Note with callback date = today or past due. |
| TIER 2 — New | Second | Just entered this stage. Never contacted. LM: 15-minute rule applies. Sorted: newest first. |
| TIER 3 — Active Working | Middle | Contacted before but not today. Days since last contact drives sort (longer = higher). AM/PM pattern: contacted this AM → push down for PM session. |
| TIER 4 — Contacted Today | Bottom | Already called/texted today. Pushed to bottom. Always shows the next one to hit. |

Within each tier: sort by how long ago they reached out (Tier 1), newest first (Tier 2), days since last contact descending (Tier 3), most recently contacted first (Tier 4).

**Config example:**
```
INVENTORY_SORT_CONFIG = {
  newLeadMaxAgeMinutes: 60,
  contactedTodayHours: 24,
  amPmSplitHour: 12,
  unreadMessageBoost: 1000,
  newLeadBoost: 500,
  newLeadUrgencyMinutes: 15,
  daysNoContactWeight: 10,
  contactedTodayPenalty: -200
}
```

### Algorithm 2: Buyer Match Sort

**Step 1: Hard filter** — Market must match property market (or "Nationwide" or secondaryMarket). No match = excluded. Period.

**Step 2: Score (0-100):**

| Signal | Weight | Scoring |
|---|---|---|
| Project Type Match | 35 pts | Exact buyBoxType match = 35, no match = 0 |
| Buyer Tier | 30 pts | Priority=30, Qualified=20, JV Partner=15, Unqualified=5, Halted=0 |
| Response Speed | 20 pts | Lightning=20, Same Day=13, Slow=6, Ghost=0 |
| Verified Funding | 10 pts | Verified=10, Not=0 |
| Past Purchase | 5 pts | hasPurchasedBefore=5, No=0 |

**Step 3:** Sort by score descending. Ties: Buyer Tier first, then Response Speed.

**Display:** Hot (≥65), Warm (35-64), Cold (<35). Score not shown to user.

**Config example:**
```
BUYER_MATCH_CONFIG = {
  projectTypeWeight: 35,
  buyerTierWeight: 30,
  responseSpeedWeight: 20,
  verifiedFundingWeight: 10,
  pastPurchaseWeight: 5,
  buyerTierScores: { Priority: 30, Qualified: 20, JV_Partner: 15, Unqualified: 5, Halted: 0 },
  responseSpeedScores: { Lightning: 20, Same_Day: 13, Slow: 6, Ghost: 0 },
  hotMinScore: 65,
  warmMinScore: 35,
  excludeHalted: false
}
```

### Algorithm 3: Task Sort (Role-Specific)

Source: CRM task list (CRM is source of truth). All tasks created in Gunner → create in CRM. Completed in Gunner → mark complete in CRM.

**Lead Manager:**

| Tier | What |
|---|---|
| 1. New Leads (15-min rule) | Just entered new_lead stage, no contact attempt, under 15 min = URGENT |
| 2. Callbacks / Inbound | Contact responded, missed call, unanswered SMS |
| 3. Scheduled Callbacks | Note/task with callback date = today, appointment today |
| 4. Follow-ups (overdue first) | CRM tasks sorted by due date |
| 5. Regular tasks | Everything else |

No revenue weighting for LM.

**Acquisition Manager:**

| Tier | What |
|---|---|
| 1. Inbound / callbacks | Missed call or unanswered SMS from contact |
| 2. Hot leads with appointments | Appointment today/tomorrow, pre-appointment prep |
| 3. Follow-ups (overdue + revenue) | Under contract or offer stage sorted by deal value when available, otherwise by days overdue |
| 4. Regular CRM tasks | By due date |

**Dispo Manager:**

| Tier | What |
|---|---|
| 1. Buyer responses needing reply | Buyer replied to blast or offer |
| 2. Time-sensitive deals | Offer deadline approaching, closing date within X days, sorted by deal value |
| 3. Properties with no buyer contact | In marketing with no sends for X days |
| 4. Regular CRM tasks | By due date |

**Admin:** Sees all tasks across all roles. Sorted by role first, then by that role's logic. Can filter by team member.

**Config example:**
```
TASK_SORT_CONFIG = {
  lead_manager: {
    newLeadUrgencyMinutes: 15,
    newLeadAlertMinutes: 60,
    tiers: ['new_lead', 'inbound', 'callback', 'overdue', 'regular']
  },
  acquisition_manager: {
    revenueWeightedStages: ['offer', 'under_contract'],
    tiers: ['inbound', 'appointment', 'follow_up_revenue', 'overdue', 'regular']
  },
  dispo_manager: {
    revenueWeightedStages: ['under_contract', 'closing'],
    closingDayWarning: 7,
    tiers: ['buyer_response', 'time_sensitive', 'no_contact', 'regular']
  }
}
```

---

## 8. Universal Action System

### The Problem Today

Two completely separate action systems running in parallel. Same button works differently on different pages. Three different SMS dialogs on TaskCenter alone. One quick-reply fires silently with no sender selection, no confirmation.

Specific issues found:
- NextStepsTab "Push to GHL" fires immediately — no confirmation
- NextStepsTab has NO sender picker for SMS
- "Push All" fires all actions with zero bulk warning
- Inventory "Confirm Send" does NOT actually send anything (only logs)
- Inventory uses `window.prompt()` for Log Offer and Log Response
- Quick-reply inline SMS on TaskCenter fires with zero visibility
- DealBlastTab never shows which GHL user sends the blast
- DayHub AI coach cards show sender name but not phone number

### The Standard

**One shared component: `<ActionConfirmDialog />`**

Every single action — no matter where triggered — goes through this universal flow:

**Step 1: PREVIEW** (always shown before anything happens)
- Shows FROM (who is performing the action, with phone number for SMS)
- Shows TO (contact name + phone number for SMS)
- Shows exactly WHAT will happen (full message text, note body, task details, stage change)
- Edit button (inline editing + AI-assisted editing)
- Cancel and Confirm buttons

**Step 2: EXECUTION** (after Confirm)
- Loading state while API call happens
- Cannot double-click / double-submit

**Step 3: RESULT** (always shown)
- Success: shows what was done, who sent it, who received it, timestamp
- Failure: shows error, explains what happened, retry button

### Every Action: What Must Be Shown

| Action | FROM | TO | WHAT | EDIT | CONFIRM |
|---|---|---|---|---|---|
| SMS | Sender name + phone | Contact name + phone | Full message + send time | ✅ + AI edit | ✅ Required |
| Note | Team member name | Contact name | Full note body | ✅ | ✅ Required |
| Task | Assigned to name | Contact or general | Title, due date, description | ✅ | ✅ Required |
| Appointment | Assigned to name | Contact name + phone | Title, date, time, location | ✅ | ✅ Required |
| Stage Change | Who changed it | Contact/Opportunity | From stage → To stage | ✅ | ✅ Required |
| Workflow | Who triggered | Contact name | Workflow name, Add/Remove | ✅ | ✅ Required |
| Tag | Who added | Contact name | Tag name(s) | ✅ | ✅ Required |
| Update Field | Who updated | Contact name | Field name, old → new value | ✅ | ✅ Required |
| Bulk SMS | Sender name + phone | "N buyers in [Market]" | Full message, channel, count | ✅ + WARNING | ✅ Required |

### Searchable Dropdowns

Every picker that involves finding a person, workflow, stage, or contact must be a searchable typeahead:

- **Sender picker (SMS FROM):** Type name → shows "Name — (555) 867-5309"
- **Task assignee:** Type name → shows "Name — Role"
- **Workflow picker:** Type partial → shows matching workflows
- **Contact search:** Type name → searches CRM in real time, shows name + phone + stage
- **Stage picker:** Type partial → shows stages with pipeline context
- **Market picker:** Type partial → shows market with zip count
- **GHL custom field:** Type field name → shows available fields

### Additional Actions to Include

- **Edit GHL Contact Fields:** Preview shows contact, field name, current value, new value
- **Edit Inventory Fields:** Inline editing on property detail (askingPrice, arv, notes, etc.) with save/cancel, logged in activity
- **Edit KPI Inputs:** Click cell → editable in place, Tab to next cell, save on blur/Enter, undo within session

### File Structure

```
client/src/components/actions/
├── ActionConfirmDialog.tsx    ← The ONE universal dialog
├── SenderPicker.tsx           ← Reusable searchable FROM selector
├── ContactDisplay.tsx         ← Reusable TO display
├── ActionResultCard.tsx       ← Consistent success/failure state
└── index.ts
```

### Rules

1. NO action fires without going through ActionConfirmDialog
2. SMS ALWAYS shows FROM (sender + phone) and TO (contact + phone)
3. Every action has an edit step before confirm
4. Every action has a result state after execute
5. Bulk actions show count + "this cannot be undone" warning
6. `window.prompt()` is BANNED — remove all instances
7. Toast-only feedback is BANNED for actions — use ActionResultCard
8. The inline quick-reply in TaskCenter gets replaced with the dialog
9. Behavior is IDENTICAL on every page

---

## 9. Inventory as Core

### Mental Model

Inventory is the PIPELINE COMMAND CENTER. Not a "property list." Every asset the company is working on, in every stage, with every piece of intelligence attached.

The ASSET is whatever is moving through the pipeline. The name comes from the Industry Playbook: Property (RE), Proposal (solar), Policy (insurance), Deal (SaaS).

Gunner is inventory-focused, not contact-focused. This is what differentiates it from CRM.

### Stage Tabs

Stage tabs come from the Tenant Playbook. Page renders dynamically:

```
{playbook.stages.map(stage => (
  <Tab value={stage.code}>{stage.name}</Tab>
))}
```

No stage names in code. Ever.

### What Inventory Does (Simply)

1. Show all assets, sorted by urgency algorithm (within current stage tab)
2. Stage changes: dead simple (drag or one click)
3. Right columns for the current stage (acquisition stages show different columns than disposition stages)
4. AI assistant for any asset — context-aware
5. Buyer/contact matching with smart sorting
6. Outreach in one click (draft → confirm → send)
7. Never show a field that doesn't matter right now

### Property Detail Panel (Slide-In)

| Tab | Contents |
|---|---|
| Overview | Financial summary, property details, milestone progress, AI suggestions, AI research |
| Buyers | Matched buyer list (sorted by match algorithm), send tracking, offer recording, buyer response stats |
| Outreach | Log sends (channel, buyer group), showings (schedule, feedback, interest level) |
| Activity | Chronological event log for all actions |
| AI Assistant | Unified AI (same identity as everywhere else, with property context) |
| Deal Blast | AI-generated SMS/email content per buyer tier, send controls |

### CRM Write-Back

Every action in Inventory that changes data → writes to CRM:
- Stage change → CRM opportunity stage update
- Note added → CRM contact note
- SMS sent → CRM SMS via sender's number
- Task created → CRM task
- Field update → CRM contact field update

---

## 10. CRM Sync Architecture

### Triple-Layer Sync

**Layer 1: Webhooks (primary — real-time)**
- CRM pushes events → Gunner processes instantly
- Failed processing → retry queue (1m, 5m, 15m, 1h — max 4 retries)
- Deduplication in DATABASE (not memory — survives deploys)
- Health monitoring: if no events in 30 min during business hours → alert admin
- Handles: Calls, Opportunities, Contacts, Tasks, Appointments

**Layer 2: Polling (safety net — fills gaps)**
- Calls: every 5 min
- Opportunities: every 10 min (currently dead code — START THIS)
- Contacts/Buyers: every 30 min
- Tasks: every 5 min (needed for Day Hub)
- Appointments: every 15 min
- Smart polling: if webhooks healthy → reduced frequency (verification mode). If webhooks silent → increased frequency + alert.
- Deduplication: check DB before processing. Same event from webhook + polling = processed once.

**Layer 3: Reconciliation (catch-all — finds drift)**
- Daily 2 AM: Compare Gunner call count vs CRM for last 48h. Flag mismatches.
- Daily: Check all "pending" or "stuck" items and retry.
- Weekly: Full pipeline reconciliation — pull all active CRM opportunities, compare to Gunner inventory, auto-import or alert.

### Credential Priority Chain

1. **OAuth Access Token** (best — scoped, auto-refreshable, proactive refresh 2h before expiry)
2. **API Key fallback** (if OAuth fails — works without OAuth setup, fewer permissions)
3. **Alert + Degrade Gracefully** (if both fail — mark CRM_DISCONNECTED, alert admin, pause sync/actions, Gunner still works for grading existing calls, training, coaching, gamification)

On reconnect after outage: calculate time disconnected, pull all data from that window, process missed events, notify admin.

### Self-Onboarding CRM Setup

**OAuth (recommended):** User clicks "Connect GoHighLevel" → OAuth flow → Gunner handles everything automatically (tokens stored, webhook registered, events subscribed, polling started, pipelines detected, team members detected). Under 5 minutes. Zero CRM admin knowledge required.

**API Key (fallback):** Enter API key + Location ID → Test Connection → Works with polling only (5-min delay, not real-time). Guide with screenshots for finding credentials.

### Sync Health Dashboard

In /settings → CRM section:
- Connection status (OAuth ✅ / API Key ✅)
- Webhook status (healthy/degraded/inactive) with last event time
- Polling status (active/idle) with last poll time
- Last reconciliation result
- "Run Full Sync Now" button
- Degraded state clearly explains what's happening and how to fix

---

## 11. Trigger Map

Every trigger is black and white: one input, one action, one result, one failure mode, one recovery.

### Data Coming Into Gunner (CRM → Gunner)

| Trigger | Input | Action | Result | If Fail | Recovery |
|---|---|---|---|---|---|
| New call recording in CRM | Conversation + recording URL | Download → Transcribe → Classify → Grade | Call in /calls with grade | Retry queue. Stuck retry at 10 min | Shows "stuck" badge. Admin can retry. |
| New opportunity in CRM | Opportunity + contact + pipeline + stage | Create property in inventory, map stage | Property at correct stage in /inventory | Retry queue. | Reconciliation within 24h |
| Opportunity stage changed | Opportunity ID + new stage | Update property status, log history | Property moves to new stage tab | Retry queue | Polling within 10 min |
| Contact created/updated | Contact fields | Upsert contact_cache | Buyer data updated for matching | Retry queue | Polling within 30 min |
| New SMS in CRM | Conversation + message | Update conversation, mark unread if inbound | Message in /today SMS inbox | Polling within 5 min | |
| Task created/updated in CRM | Task with title, assignee, due date | Show in task list | Task at correct priority in /today | Polling within 5 min | |
| Appointment in CRM | Appointment with date, time, contact | Show in schedule | In /today if date = today | Polling within 15 min | |

### Data Going Out of Gunner (Gunner → CRM)

| Trigger | Input | Action | Result | If Fail |
|---|---|---|---|---|
| Confirm "Send SMS" | FROM + TO + message | CRM API: send SMS | Card: "✅ Sent" + delivery status | Card: "❌ Failed" + error. Retry button. |
| Confirm "Add Note" | Contact + note body | CRM API: add note | Card: "✅ Added" | Card: "❌ Failed". Retry. |
| Confirm "Create Task" | Title, assignee, due date, contact | CRM API: create task | Card: "✅ Created". Shows in CRM + /today | Card: "❌ Failed". Retry. |
| Confirm "Complete Task" | Task ID | CRM API: mark complete | Task removed from /today. Done in CRM. | Error shown. Task stays. Retry. |
| Confirm "Change Stage" | Opportunity, FROM → TO stage | CRM API: update opportunity | Card: "✅ Moved". Property updates in /inventory | Card: "❌ Failed". Property stays at old stage. |
| Confirm "Create Appointment" | Title, date, time, contact, assignee | CRM API: create appointment | Card: "✅ Created". In /today if today. | Card: "❌ Failed". Retry. |
| Confirm "Add/Remove Tag" | Contact, tag name(s) | CRM API: add/remove tag | Card: "✅ Done" | Card: "❌ Failed". Retry. |
| Confirm "Update Field" | Contact, field, new value | CRM API: update custom field | Card: "✅ Updated" | Card: "❌ Failed". Retry. |
| Confirm "Add/Remove Workflow" | Contact, workflow name | CRM API: add to/remove from workflow | Card: "✅ Done" | Card: "❌ Failed". Retry. |
| Confirm "Deal Blast" | Property, tier, channel, content | CRM API: send to each buyer | "Sent to N buyers (M failed)" | Per-buyer failures shown. Retry failed. |

### Internal Gunner Triggers

| Trigger | Input | Action | Result | If Fail |
|---|---|---|---|---|
| Call graded | Transcript + rubric from playbook | AI grades, generates scores + tips | Grade on call detail. XP awarded. | "grading_failed". Stuck retry. |
| Inline field edit | Property, field, old → new value | Update DB, log in activity | Field updated. Activity entry created. | Error shown. Reverts to old value. |
| KPI data entry | Period, field, value | Update KPI tables | Dashboard reflects new number. | Error shown. Value reverts. |
| Training roleplay complete | Session data | Log completion, award XP | XP added. Badge progress. | Error logged. Can retry. |
| AI suggestion (proactive) | User playbook + recent data | Create ai_suggestion record | User sees suggestion with [Act] [Dismiss] | Suggestion not shown. No impact. |
| Monday 6 AM weekly | Last week's grades + team data | Generate team insights | New items in /training | Admin notified. Manual regenerate. |
| Daily 2 AM reconciliation | Gunner data vs CRM data | Find mismatches | Auto-import or flag for admin | Runs again next day. |

### The Rule

```
EVERY TRIGGER:
1. ONE clear input
2. ONE clear action
3. ONE clear result
4. ONE clear failure state
5. ONE clear recovery

NO SILENT FAILURES.
NO AMBIGUOUS STATES.
If it worked → user KNOWS. If it failed → user KNOWS and can fix it.
```

---

## 12. Security

### Critical Fixes (Do Before Rebuild)

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | Hardcoded Supabase service key fallback in `server/storage.ts` | CRITICAL | Remove fallback. Require env var. Fail if missing. |
| 2 | JWT secret defaults to "dev-secret" in `context.ts` and `selfServeAuth.ts` | CRITICAL | Remove fallback. Require env var. Fail startup if unset. |
| 3 | 9 endpoints return data without tenant check (teamMembers.getById, trainingMaterials.getById, feedback.getById, teamTrainingItems.getById, brandAssets.getById, calls.getGrade, nextSteps.getNextStepsCount, nextSteps.updateNextStepStatus, nextSteps.editNextStep) | HIGH | Add `WHERE tenantId = ctx.user.tenantId` to every query. |
| 4 | No rate limiting on login endpoint | MEDIUM | 5 per email per 15 min. 20 per IP per 15 min. Account lockout after 10. |

### Security Architecture for Rebuild

**Perimeter:** Turnstile on signup (exists), login rate limiting (new), CORS allowlist (new), Helmet security headers (new).

**Authentication:** JWT with required secret (no fallback), 30-day sessions (reduced from 1 year), session revocation on password change.

**Authorization:** Universal tenantId enforcement in tRPC middleware. Every protectedProcedure automatically scopes to tenant. Automated test that scans every endpoint for tenantId check.

**Rate Limiting:** Per-tenant (100/min general, 20/min AI), per-user (60 AI messages/hour, 100 SMS/day configurable in Tenant Playbook), streaming endpoints rate limited (10/min).

**Data Protection:** No PII in logs (scrub before Sentry/PostHog). GHL OAuth tokens encrypted in DB. HTTPS enforced with HSTS.

**Anti-Spam:** Login rate limiting + lockout. Turnstile on signup. Per-user SMS caps. Bulk action warnings. Webhook signature verification.

---

## 13. Settings & Playbook Editor

### Settings Page (Simple: 3 Sections)

**Section 1: Workspace**
- Company name
- Industry (dropdown → loads Industry Playbook)
- CRM connection (one-button OAuth or API key entry)
- Billing plan

**Section 2: Team**
- Members & roles (invite, assign roles from Tenant Playbook)
- Permissions
- CRM user mapping

**Section 3: Advanced (collapsed by default)**
- Webhooks, API keys, developer options
- Sync health dashboard

### Playbook Editor (Own Page: /playbook)

Four tabs:
- **Software Playbook** — Read-only (Gunner maintains)
- **Industry Playbook** — Read-only with tenant overrides visible
- **Tenant Playbook** — Fully editable (accordion sections: Roles, Stages, Call Types, Rubrics, Terminology, Markets, Sources, Algorithm Weights, KPI Targets, Scripts)
- **Team Member Playbooks** — Per-user profiles (read-mostly, shows auto-generated intelligence)

**AI-Editable:**
```
┌─────────────────────────────────────────────────┐
│ 💬 Ask AI to update your playbook               │
│                                                 │
│ "Change the new lead urgency threshold to       │
│  20 minutes"                           [Send]  │
└─────────────────────────────────────────────────┘

AI response:
"I'll change newLeadUrgencyMinutes from 15 to 20.
 Current: 15 minutes → New: 20 minutes
 This affects: task sort priority for Lead Managers.
 [Preview Impact]  [Cancel]  [Apply Change]"
```

All changes logged with timestamp and who made them.

---

## 14. Existing Features to Preserve

These features are well-built and must survive the rebuild. They migrate into playbooks but the logic stays:

| Feature | What to Preserve | Moves To |
|---|---|---|
| 7 grading rubrics (all criteria, points, key phrases, critical failures) | Preserve verbatim | Industry Playbook (RE Wholesaling) |
| Grading philosophy (DQ awareness, prior context, timeline commitment, conversational credit) | Preserve verbatim | Industry Playbook (grading instructions) |
| Critical failure cap system (50% cap with specific triggers) | Mechanism stays in Software Playbook, triggers in Industry | Split across layers |
| 10 call outcome types | Preserve | Industry Playbook (outcomes) |
| Dispo AI action card pattern (confirm → execute → result) | This becomes ActionConfirmDialog everywhere | Software Playbook (action system) |
| Meeting Facilitator with 4 personalities + 4 scenarios | Keep feature, move personas/scenarios | Industry Playbook |
| Milestone flags (aptEverSet, offerEverMade, etc.) | Keep as-is, make configurable per tenant | Tenant Playbook |
| Property stage history logging | Keep as-is (universal) | Software Playbook |
| KPI Source × Market pivot table | Keep feature, make dimensions playbook-driven | Tenant Playbook |
| Funnel drilldown with clickable stages + property search | Keep UX, stage names from playbook | Tenant Playbook |
| 3-layer contact search cache (memory → DB → API) | Keep as-is | Software Playbook |
| Task contact context enrichment (CRM notes + Gunner grade summary) | Keep as-is | Software Playbook |
| Buyer pipeline tracking (per-buyer status, response stats) | Keep | Tenant Playbook |
| Market auto-populate from zip code | Keep | Tenant Playbook (zip → market mapping) |
| Stuck call retry system | Keep | Software Playbook |
| Coach action preference learning (edits → style summary) | Keep and expand | User Playbook |
| User explicit instructions (pipeline, tone, format, assignment) | Keep | User Playbook |

---

## 15. Build Phases

### Phase 0: Critical Security Fixes + Code Cleanup

**Security (do first):**
- Remove hardcoded Supabase key fallback
- Remove JWT "dev-secret" fallback
- Add tenant checks to all 9 IDOR endpoints
- Add login rate limiting

**Cleanup:**
- Delete dead pages (Home, LeadGenDashboard, ComponentShowcase, GradingRules, Feedback redirects)
- Fix BulkRegradeWidget (uses wrong tRPC path)
- Consolidate GHL fetch patterns (eliminate 3 different ghlFetch implementations)
- Start opportunity polling (code exists, never started)

### Phase 1: Software Playbook Layer (The Platform Shell)

Build the shell. Pages render from playbook data. No hardcoded labels anywhere.

- Playbook data model (DB tables / JSON structure for all 4 layers)
- `useTenantConfig` hook reads ALL labels from playbook API (used on EVERY page)
- 7 page shells (Today, Calls, Inventory, KPIs, Team, Training, Settings)
- `ActionConfirmDialog` (universal actions component)
- `SearchableDropdown` (universal picker component)
- Unified AI service (one endpoint: `/api/ai/stream`)
- Algorithm framework (`server/algorithms/` with config objects)
- CRM adapter interface (GHL adapter behind it)
- `user_events` + `ai_suggestions` tables (start data collection)
- `playbook_insights` + `playbook_intelligence_log` tables
- `/playbook` page (viewer + AI editor)
- Helmet, CORS, universal tenantId enforcement
- Webhook retry queue for incoming events
- DB-based deduplication for webhooks

After this phase: site works but everything is "Asset", "Contact", "Stage 1". Functional but generic.

### Phase 2: Industry Playbook Layer (RE Wholesaling)

Apply RE Wholesaling as the first industry template. This is DATA, not code.

- Seed RE Wholesaling industry playbook:
  - 7 rubrics (all criteria, key phrases, critical failures — preserved from existing code)
  - 6 call types with descriptions
  - 4 roles with descriptions
  - 10 outcomes
  - Pipeline stage templates (acquisition + disposition)
  - Terminology (seller, property, deal, walkthrough, ARV)
  - Project types, occupancy statuses
  - KPI funnel stages
  - Roleplay personas + scenarios
  - Training categories
  - Default algorithm weights
  - Grading philosophy instructions

After this phase: site looks like a RE wholesaling tool. No code changed — only data.

### Phase 3: Tenant Playbook Layer (NAH)

Apply NAH's specific config. Again — data, not code.

- Connect GHL (OAuth)
- Map pipeline stages to playbook stages
- Define markets + zip codes
- Define lead sources + GHL mappings
- Import team + map to GHL users
- Set algorithm weights
- Set KPI targets
- Tweak rubrics if needed
- Add methodology text

After this phase: site is NAH's Gunner. Their stages, markets, team, rules. Same code as any other tenant.

### Phase 4: User Playbook + Intelligence Loop

- User profile summary (auto-generated after each graded call)
- Coaching memory distillation (weekly job)
- Action pattern analysis (from user_events)
- First intelligence jobs (user profile update, tenant intelligence)
- Wire existing unused data into AI context (past actions, XP/badges always loaded, full performance profile)
- Proactive suggestions (V2 AI — suggest without being asked)

### Phase 5: Polish + Premium UI

- Premium UI pass on all 7 pages (Linear/Notion/Stripe quality)
- Self-onboarding CRM setup (one-button OAuth)
- Reconciliation job (daily/weekly sync verification)
- Landing page (industry-agnostic, no tenant content)
- Full accessibility pass

### The Second Tenant Test

After the rebuild, onboarding a second RE wholesaling tenant should take <30 minutes and require ZERO code changes. Onboarding a solar company should require ZERO code changes — just creating a solar industry playbook template.

---

## 16. Architecture Rules

### Nothing Hardcoded. Ever.

```
❌ NEVER:  <div>Seller Name</div>
❌ NEVER:  if (role === 'acquisition_manager')
❌ NEVER:  placeholder="Search properties..."
❌ NEVER:  "motivated seller" anywhere in component code

✅ ALWAYS: <div>{t.contactLabel} Name</div>
✅ ALWAYS: if (role === userPlaybook.primaryRole)
✅ ALWAYS: placeholder={`Search ${t.assetLabelPlural}...`}
✅ ALWAYS: t.contactLabel + " expressed urgency"
```

### Algorithm Config at Top of File

Every algorithm has a CONFIG OBJECT at the top. To tune: change the config, not the logic. One line, one file. Claude can find, read, and update in seconds.

### One Component, Used Everywhere

- One `ActionConfirmDialog` for all actions
- One `SearchableDropdown` for all pickers
- One `useTenantConfig` for all labels
- One `/api/ai/stream` for all AI interactions
- Fix it once → fixed everywhere

### CRM Write-Back Contract

Every action in Gunner that changes data → writes to CRM:
- Create task → CRM task created
- Complete task → CRM task marked complete
- Add note → CRM contact note added
- Send SMS → CRM SMS sent + logged
- Change stage → CRM opportunity updated
- Set appointment → CRM appointment created

### Easily Updatable

The codebase must be structured so that Claude Code can find and update any algorithm weight, UI label, playbook field, or trigger behavior by changing one config value in one file. No multi-file hunts. No scattered constants.

---

*This document is the brain for the rebuild. Every task, every PR, every decision should reference it.*
