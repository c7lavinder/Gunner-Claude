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
15. [Landing Pages](#15-landing-pages)
16. [Gamification System](#16-gamification-system)
17. [Design Standards](#17-design-standards)
18. [Tech Stack Confirmation](#18-tech-stack-confirmation)
19. [Codebase Organization](#19-codebase-organization)
20. [Tools, APIs & Services Needed](#20-tools-apis--services-needed)
21. [Enhancement List — Premium Parity](#21-enhancement-list--premium-parity)
22. [Build Phases](#22-build-phases)
23. [Architecture Rules](#23-architecture-rules)

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
- **Voice profile (for future AI caller cloning):**
  - Aggregated audio samples from graded calls (speaker-separated)
  - Total minutes of clean audio collected
  - Voice characteristics metadata (pace, pitch range, energy level — auto-extracted)
  - Consent status (user must opt in)
  - Ready-for-cloning flag (true when enough clean audio is collected)

### Voice Sample Collection (Start NOW — Future AI Caller)

Every call already goes through the transcription pipeline. The audio exists. The goal is to start isolating and storing each user's voice samples so that when voice cloning technology is ready for production AI callers, Gunner already has the data.

**How it works:**

1. **Speaker diarization** — When a call is transcribed, identify which audio segments belong to the Gunner user vs the contact. OpenAI Whisper doesn't natively diarize, so either:
   - Use a diarization model (e.g., `pyannote/speaker-diarization` or a future OpenAI feature) as a post-processing step
   - OR use a simpler heuristic: the first speaker on outbound calls is typically the rep; on inbound, the second speaker is the rep
   - Start with the heuristic (free, fast), upgrade to diarization later

2. **Extract user audio segments** — Clip the user's speaking portions from the call recording. Store as separate audio files.

3. **Store in Supabase Storage** — New bucket: `gunner-voice-samples`
   ```
   gunner-voice-samples/
   └── {tenantId}/
       └── {userId}/
           ├── sample-{callId}-001.wav
           ├── sample-{callId}-002.wav
           └── ...
   ```

4. **Track in database** — New table: `user_voice_samples`

| Field | Type | Description |
|---|---|---|
| id | serial | Primary key |
| tenantId | integer | Tenant |
| userId | integer | Which team member |
| callId | integer | Source call |
| storageKey | text | Path in Supabase bucket |
| durationSeconds | decimal | Length of this sample |
| quality | text | good / noisy / unusable (auto-assessed or manual) |
| speakerConfidence | decimal | 0-1 confidence this is actually the user speaking |
| createdAt | timestamp | When extracted |

5. **Aggregate stats on User Playbook** — New table: `user_voice_profiles`

| Field | Type | Description |
|---|---|---|
| id | serial | Primary key |
| tenantId | integer | Tenant |
| userId | integer | Which team member |
| totalSamples | integer | Count of stored samples |
| totalDurationMinutes | decimal | Total clean audio minutes |
| avgPace | decimal | Words per minute (from transcription data) |
| consentGiven | boolean | User opted in to voice collection |
| consentDate | timestamp | When they opted in |
| readyForCloning | boolean | True when >= 30 min of clean audio |
| metadata | jsonb | Additional voice characteristics |
| updatedAt | timestamp | Last updated |

**Consent requirement:** Users MUST opt in. Add a toggle in Profile page:
> "Allow Gunner to store your voice samples for future AI features. Your voice data is never shared with other tenants."

Default: OFF. Only collect when ON.

**Quality thresholds:**
- Minimum sample length: 5 seconds (shorter clips are noise)
- Minimum speaker confidence: 0.7 (below = discard)
- Target for "ready": 30+ minutes of clean audio across 20+ calls
- Quality assessment: reject samples with heavy background noise or crosstalk

**Processing:** Runs as a background job AFTER grading completes (low priority, never blocks the grading pipeline). Failed extraction = skip silently, try again on next call.

**Cost:** Storage only. ~1 MB per minute of WAV audio. 30 minutes = ~30 MB per user. Negligible at current scale.

**Privacy rules:**
- Voice samples are tenant-isolated (same as all data)
- Samples NEVER flow up to industry/software playbook intelligence
- User can revoke consent at any time → samples are deleted within 24 hours
- Deletion is hard delete (not soft delete) — audio is removed from storage
- Terms of Service must explicitly cover voice data collection and intended use

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

## 15. Landing Pages

### Core Landing Page (getgunner.ai)

**The Message: Empowering, Not Babysitting.**

Current copy says "Stop Babysitting Your Sales Reps." That frames the product negatively — around distrust. The rebuild reframes everything around EMPOWERMENT.

**New messaging direction:**

| Old (Remove) | New (Replace With) |
|---|---|
| "Stop Babysitting Your Sales Reps" | "Empower Your Team to Perform at Their Best" |
| "Babysitting reps instead of scaling" | "Micromanaging instead of scaling" |
| "Ready to Stop Babysitting and Start Scaling?" | "Ready to Empower Your Team and Scale?" |
| "Built for Real Estate Wholesalers" | REMOVE — industry-agnostic |
| "Built by a Wholesaler, for Wholesalers" | MOVE to RE industry page only |
| "Corey & Pablo story" | MOVE to /about page |
| All GHL-specific references | REMOVE — CRM-agnostic |

**Tagline direction:** "Your team's AI-powered performance engine" / "Train better. Perform better. Close more." / "Empowering teams through training, accountability, and efficient operations."

**Hero section must communicate the three pillars:**
1. **Training** — AI coaching that makes every rep better
2. **Accountability** — Grades, KPIs, leaderboards that drive performance
3. **Efficient Operations** — One-click actions, smart task prioritization, AI that does the busywork

**Login on the Landing Page:**

Currently there is NO login option visible on the landing page. Nav only has section links. This must change:

| Element | Location | Action |
|---|---|---|
| "Sign In" button | Top-right nav (desktop) + mobile menu | Links to `/login` |
| "Get Started" / "Start Free Trial" button | Top-right nav (desktop), bold/primary | Links to `/signup` |
| Login form (optional) | Below hero or sticky header | Email + password fields + Google button + "Sign Up" link |
| Google OAuth button | Prominent on both login and signup | "Continue with Google" — standard OAuth flow |
| Email + Password | Login and Signup | Both must work (currently signup is disabled — re-enable) |

**Auth requirements:**
- Google OAuth (primary, already works for existing users)
- Email + password (works for login, signup currently blocked — must re-enable)
- Password reset flow (exists and works)
- Cloudflare Turnstile on signup (exists)
- "Continue with Google" must be visually prominent — most users prefer it

**Landing page sections (rebuilt):**

| # | Section | Content |
|---|---|---|
| 1 | Nav | Logo + Features / How It Works / Pricing + **Sign In** + **Get Started** |
| 2 | Hero | Empowerment headline, 3-pillar subtext, CTA: "Start Free Trial", trust badges |
| 3 | Problem | "Your team is capable of more." — frame around untapped potential, not distrust |
| 4 | How It Works | 3 steps: Connect CRM → AI grades & coaches → Team levels up |
| 5 | Features | Tabs: AI Coaching, Smart Inventory, Gamification, KPI Tracking |
| 6 | Social Proof | Metrics + testimonials (dynamic — pulled from DB, not hardcoded) |
| 7 | Pricing | Plans from DB, toggle monthly/yearly, CTA per plan |
| 8 | Integrations | "Works with your CRM" — CRM-agnostic icons (GHL, HubSpot, Salesforce planned) |
| 9 | FAQ | Common questions (from DB or config, not hardcoded) |
| 10 | Final CTA | "Empower Your Team Today" + Get Started button |
| 11 | Footer | Product, Company, Legal links, social media |

**Critical design rules for landing page:**
- Zero hardcoded tenant content
- Zero hardcoded industry content (except on industry-specific pages)
- CRM logos shown but no "Built for [CRM]" messaging
- All testimonials from DB (tenant-approved, with real names/companies)
- Pricing from DB (`plans` table)
- FAQ from config/DB

### 5 Industry Landing Pages

Each industry gets its own landing page with tailored copy, use cases, and examples. Same design template, different data.

| # | Industry | Route | Priority | Status |
|---|---|---|---|---|
| 1 | Real Estate Wholesaling | `/industries/wholesaling` | **HIGHEST** — first and primary | Build first |
| 2 | Solar Sales | `/industries/solar` | HIGH — large TAM, similar call structure | Build second |
| 3 | Insurance Sales | `/industries/insurance` | MEDIUM — high volume call teams | Build third |
| 4 | SaaS Sales | `/industries/saas` | MEDIUM — tech-savvy audience | Build fourth |
| 5 | Home Services | `/industries/home-services` | MEDIUM — HVAC, roofing, etc. | Build fifth |

**Each industry page contains:**

| Section | What Changes Per Industry |
|---|---|
| Hero headline | Industry-specific empowerment message |
| Problem statement | Industry-specific pain points |
| Use cases | 3-4 scenarios specific to that industry |
| Terminology | Uses industry terms (seller/homeowner/policyholder/prospect) |
| Example scorecards | Mockup graded call with industry-relevant criteria |
| Roles shown | Industry-typical team structure |
| Testimonials | Industry-specific (when available, otherwise generic) |
| CTA | "Built for [Industry] Teams" |

**RE Wholesaling page (`/industries/wholesaling`):**
- Hero: "Your wholesaling team is capable of closing 2x more deals."
- Problem: "Lead managers dropping the ball on follow-ups. Acquisition managers winging offer calls. Dispo managers blasting buyers with no strategy."
- Use cases: Lead qualification scoring, appointment-setting accountability, offer call coaching, dispo call optimization
- Example: Graded acquisition call with Motivation Extraction, Price Discussion, Offer Setup criteria
- Roles: Lead Manager, Acquisition Manager, Dispo Manager, Lead Generator
- The "Built by a Wholesaler" story moves HERE, not on the main landing page

**Template architecture:**
```
client/src/pages/landing/
├── Landing.tsx              ← Main CRM/industry-agnostic landing
├── IndustryLanding.tsx      ← Template component (receives industry config)
├── industryConfigs/
│   ├── wholesaling.ts       ← Copy, use cases, testimonials for RE wholesaling
│   ├── solar.ts
│   ├── insurance.ts
│   ├── saas.ts
│   └── homeServices.ts
└── components/
    ├── HeroSection.tsx
    ├── ProblemSection.tsx
    ├── HowItWorks.tsx
    ├── FeatureTabs.tsx
    ├── SocialProof.tsx
    ├── PricingSection.tsx
    ├── FAQSection.tsx
    └── FooterSection.tsx
```

Each industry config is a pure data object — no JSX, no components. The template renders the data.

---

## 16. Gamification System

### Current State (Audit)

The gamification system is one of Gunner's strongest features. It has real depth. But it has hardcoded elements and unfinished logic that need fixing.

**What exists and works:**
- 28 badges across 5 categories (3 universal, 7 LM, 5 AM, 5 LG, 7 DM + 1 shared)
- 3-tier badge progression (Bronze → Silver → Gold)
- XP system (10 base per call + grade bonus: A=+50, B=+30, C=+15, D=+5, F=+0)
- 25-level progression (Rookie → Hall of Fame, 0 → 350,000 XP)
- Hot streak (consecutive C+ grades) and consistency streak (consecutive weekdays with calls)
- Weekend handling (skipped in CST)
- Score leaderboard (average grade) and XP leaderboard
- Profile page with badges, streaks, progress bars
- Team page sorted by XP

**What's broken / not implemented:**
- `consistency_days` badge criteria (Consistency King) — code says "handled by other processes" but NO process exists
- `weekly_volume` badge criteria (Volume Dialer, Cold Call Warrior, Deal Machine) — same, no implementation
- `deals` badge criteria (Closer badge for AM) — no implementation
- `IMPROVEMENT` XP (+20 for 2+ letter grade improvement) — defined but never awarded
- Dispo Manager badges missing from `BADGE_ICON_URLS` (no custom icons)
- Gamification leaderboard doesn't return full team member data (names/avatars broken in XP mode)
- Badge evaluation only runs on call view, not on call grade completion

### What Must Move to Playbooks

| Hardcoded Item | Moves To |
|---|---|
| Badge definitions (28 badges, names, descriptions, icons, criteria, tier thresholds) | Industry Playbook (defaults) + Tenant Playbook (overrides) |
| XP values (10 base, +50/+30/+15/+5/+0 grade bonus, +25 badge, +20 improvement) | Industry Playbook (defaults) + Tenant Playbook (overrides) |
| Level thresholds (25 levels, 0→350K XP) | Software Playbook (universal) |
| Level titles (Rookie, Starter, Playmaker... Hall of Fame) | Industry Playbook (defaults) + Tenant Playbook (custom titles) |
| Role → badge category mapping | Tenant Playbook (roles → their badge sets) |
| Rubric criteria names in badge criteria (`"Motivation Extraction"`, `"Offer Setup"`) | Industry Playbook (badges reference rubric criteria by ID, not name) |

### Enhancements for Premium

| Enhancement | Description | Priority |
|---|---|---|
| **Fix unimplemented badges** | Consistency King (use streak data), Volume badges (weekly cron job), Closer (sync from CRM deals) | HIGH |
| **Award improvement XP** | +20 XP when grade improves 2+ letters vs previous call | HIGH |
| **Fix gamification leaderboard** | Return full team member data so XP leaderboard shows names/avatars | HIGH |
| **Dispo badge icons** | Add custom icons for all 7 dispo badges | MEDIUM |
| **Daily/weekly challenges** | "Grade 5 calls today for +100 bonus XP", "Maintain hot streak all week for +500" | MEDIUM |
| **Badge rarity visuals** | Bronze/Silver/Gold with distinct colors, glow effects, particle animation on earn | MEDIUM |
| **XP history page** | Timeline view of all XP transactions with reasons | LOW |
| **Gamification leaderboard date ranges** | Filter by today/week/month/ytd/all (currently all-time only) | LOW |
| **Streak freeze** | 1 free missed day per month, purchasable with XP or feature of higher plan | LOW |
| **Custom tenant badges** | Tenants can create their own badges via Playbook Editor | FUTURE |
| **Team challenges** | Team-wide goals: "Team averages B+ this week → everyone gets 200 XP" | FUTURE |
| **Achievement notifications** | Push/in-app notification + confetti when badge earned or level up | MEDIUM |

---

## 17. Design Standards

### The Standard: Billion-Dollar Build

Every pixel must feel intentional. No wobbly buttons, no off-balance page transitions, no janky hover states, no layout shifts. The bar is Linear, Notion, Stripe, Vercel — companies that treat their UI as a competitive advantage.

### Design Principles

| Principle | What It Means | What It Kills |
|---|---|---|
| **Firm** | Every element has weight. Buttons don't bounce. Panels don't wobble. Transitions are smooth and purposeful. | Springy animations, jittery hover states, layout shifts on load |
| **Precise** | Pixel-perfect alignment. Consistent spacing. Typography hierarchy is clear and unbreakable. | Misaligned text, inconsistent padding, orphaned headings |
| **Quiet** | Let content breathe. No visual noise. Only animate what needs attention. | Gratuitous gradients, excessive shadows, decorative elements |
| **Fast** | Every interaction responds in <100ms. Pages load in <1s. No loading spinners that last >2s. | Skeleton screens that flash, slow transitions, heavy bundles |
| **Dense where it matters** | Data-heavy pages (Inventory, KPIs, Calls) show maximum info in minimum space. | Oversized cards, excessive whitespace on data pages |

### Specific UI Rules

**Typography:**
- Satoshi (primary body), Inter (secondary/labels), JetBrains Mono (code/numbers), Orbitron (gamification/scores)
- Strict type scale: 5 sizes max (xs, sm, base, lg, xl). No arbitrary sizes.
- Line heights locked: body=1.5, headings=1.2, dense data=1.3

**Color:**
- Dark mode primary (already implemented via design tokens)
- Light mode as secondary (must be tested and polished, not an afterthought)
- Accent: `#c41e3a` (Gunner red) for primary actions, success green, warning amber, error red
- Grade colors: A=emerald, B=blue, C=amber, D=orange, F=red — consistent everywhere
- Neutral scale: 10 shades, not 20. Simplify the palette.

**Spacing:**
- 4px base unit. All spacing is multiples of 4: 4, 8, 12, 16, 24, 32, 48, 64
- No arbitrary margins. If it doesn't align to the grid, it's wrong.

**Motion:**
- Page transitions: 200ms ease-out slide (no bounce, no spring)
- Micro-interactions: 150ms ease (hover, focus, toggle)
- Loading states: skeleton shimmer (already exists as `g-shimmer`), never spinners for <1s
- Celebrations: confetti on badge/level up only (already have canvas-confetti)
- NO spring physics, NO elastic, NO overshoot

**Components:**
- All 54 shadcn components already exist — use them. Don't create custom UI when shadcn covers it.
- Button variants: `default`, `destructive`, `outline`, `ghost`, `link`. That's it.
- Card: consistent border-radius (use `--radius` token), consistent padding
- Tables: zebra-striped for dense data, hover row highlight, sticky headers
- Forms: label above input, error below, red border on error. No floating labels.

**Page Layout:**
- Sidebar navigation (already exists via shadcn `sidebar`)
- Content area: max-width 1440px, centered
- Panels: consistent border, consistent shadow level
- Mobile: sidebar collapses to hamburger. Content is full-width. No horizontal scroll.

**Loading:**
- Skeleton screens for initial page load (already using `skeleton` component)
- Optimistic updates for actions (show success immediately, rollback on failure)
- Streaming text for AI responses (already implemented)
- No empty states without guidance ("No calls yet. Connect your CRM to get started.")

### Anti-Patterns (Banned)

| Banned | Why | Replace With |
|---|---|---|
| `window.prompt()` / `window.confirm()` | Breaks immersion, ugly, inconsistent | ActionConfirmDialog |
| Toast-only feedback for actions | User misses it, no detail | ActionResultCard with details |
| Inline `style={}` props | Breaks consistency | Tailwind classes only |
| Arbitrary z-index values | Stacking conflicts | z-index scale: 10, 20, 30, 40, 50 |
| CSS `!important` | Fragile overrides | Properly scoped selectors |
| Spinner for <1s loads | Flickering, feels slow | Skeleton or instant |
| Layout shift on data load | Janky, unprofessional | Fixed height containers, skeleton |

---

## 18. Tech Stack Confirmation

### Current Stack — CONFIRMED Ready for Premium Rebuild

The existing tech stack is modern and capable. No framework migration needed.

**Frontend (Confirmed):**

| Tool | Version | Status |
|---|---|---|
| React | 19.2.1 | Latest stable |
| TypeScript | 5.9.3 | Latest |
| Vite | 7.1.7 | Latest, fast builds |
| Tailwind CSS | 4.1.14 | Latest (v4 with CSS-first config) |
| shadcn/ui (Radix) | 54 components | Full component library ready |
| Framer Motion | 12.23.22 | Animation (use sparingly per design rules) |
| Recharts | 2.15.2 | Charts/data viz |
| React Hook Form + Zod | 7.64.0 / 4.1.12 | Form validation |
| TanStack React Query | 5.90.2 | Server state management |
| tRPC Client | 11.6.0 | Type-safe API calls |
| Wouter | 3.3.5 | Lightweight routing |
| Lucide React | 0.453.0 | Icons |
| Sonner | 2.0.7 | Toast notifications |
| cmdk | 1.1.1 | Command palette |

**Backend (Confirmed):**

| Tool | Version | Status |
|---|---|---|
| Node.js + Express | 4.21.2 | Stable |
| tRPC Server | 11.6.0 | Type-safe API |
| Drizzle ORM | 0.44.5 | Modern, type-safe ORM |
| PostgreSQL (pg) | 8.13.1 | Production DB |
| Zod | 4.1.12 | Schema validation |
| Jose + jsonwebtoken | 6.1.0 / 9.0.3 | JWT auth |
| bcrypt | 6.0.0 | Password hashing |
| p-queue | 9.1.0 | Concurrency control |
| nanoid | 5.1.5 | ID generation |

**AI/ML (Confirmed):**

| Tool | Version | Status |
|---|---|---|
| OpenAI API | via direct HTTP | GPT-4 grading + coaching |
| Whisper API | via OpenAI | Transcription |
| LangSmith | 0.5.9 | AI tracing/observability |

**Services (Confirmed):**

| Service | Purpose | Status |
|---|---|---|
| PostgreSQL (Railway) | Primary database | Active |
| Supabase Storage | File storage (recordings) | Active |
| Stripe | Payments/subscriptions | Active |
| Resend | Transactional email | Active |
| Loops | Drip email sequences | Active |
| Sentry (backend) | Error tracking | Active |
| PostHog (backend) | Analytics | Active |
| Cloudflare Turnstile | CAPTCHA/bot protection | Active |
| Google OAuth | Authentication | Active |

**Dev Tooling (Confirmed):**

| Tool | Version | Status |
|---|---|---|
| Vitest | 2.1.4 | Server-side tests (70+ test files) |
| Prettier | 3.6.2 | Code formatting |
| Drizzle Kit | 0.31.4 | DB migrations |
| esbuild | 0.25.0 | Fast bundling |
| tsx | 4.19.1 | TypeScript execution |

### What's Missing (Must Add)

| Gap | Tool to Add | Why |
|---|---|---|
| **Linting** | ESLint + `eslint-config-prettier` | Catch bugs, enforce patterns, prevent regressions |
| **Frontend error tracking** | `@sentry/react` | Currently only backend errors are tracked — frontend crashes are invisible |
| **Frontend analytics** | PostHog JS client | Track user behavior for playbook intelligence (user_events) |
| **Frontend testing** | `@testing-library/react` | Critical flow regression protection |
| **E2E testing** | Playwright | Full user journey tests (login → grade → action → verify) |
| **Accessibility** | `eslint-plugin-jsx-a11y` | Catch a11y issues at lint time |
| **Security headers** | Helmet | XSS, clickjacking, MIME sniffing protection |
| **Rate limiting** | `express-rate-limit` | Login + API protection |

### What to Remove

| Package | Why |
|---|---|
| `@aws-sdk/client-s3` | Not used — storage is Supabase |
| `@aws-sdk/s3-request-presigner` | Not used — same |
| `add` (devDep) | Likely accidental install |

---

## 19. Codebase Organization

### Current Problem

`server/routers.ts` is a 9,059-line monolith with ~100 tRPC procedures. `server/opportunityDetection.ts` is 5,381 lines. Files mix concerns. Finding anything requires full-text search.

### Target Structure

```
gunner/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── landing/              ← Landing + industry pages
│   │   │   │   ├── Landing.tsx
│   │   │   │   ├── IndustryLanding.tsx
│   │   │   │   └── industryConfigs/
│   │   │   ├── Today.tsx
│   │   │   ├── CallInbox.tsx
│   │   │   ├── Inventory.tsx
│   │   │   ├── KpiPage.tsx
│   │   │   ├── Team.tsx
│   │   │   ├── Training.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── Playbook.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── Login.tsx
│   │   │   └── Admin.tsx
│   │   ├── components/
│   │   │   ├── ui/                   ← 54 shadcn components (keep as-is)
│   │   │   ├── actions/              ← Universal action system
│   │   │   │   ├── ActionConfirmDialog.tsx
│   │   │   │   ├── SenderPicker.tsx
│   │   │   │   ├── ContactDisplay.tsx
│   │   │   │   └── ActionResultCard.tsx
│   │   │   ├── layout/               ← App shell, sidebar, headers
│   │   │   │   ├── DashboardLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── PageHeader.tsx
│   │   │   ├── ai/                   ← AI chat interface
│   │   │   │   ├── AiChat.tsx
│   │   │   │   └── AiSuggestionCard.tsx
│   │   │   ├── inventory/            ← Inventory-specific components
│   │   │   ├── calls/                ← Call-specific components
│   │   │   ├── gamification/         ← Badge, streak, XP components
│   │   │   └── shared/               ← SearchableDropdown, DataTable, etc.
│   │   ├── hooks/
│   │   │   ├── useTenantConfig.ts    ← All labels from playbook (used everywhere)
│   │   │   ├── useAi.ts             ← Unified AI hook
│   │   │   ├── useActions.ts        ← Universal action hook
│   │   │   └── usePlaybook.ts       ← Playbook data access
│   │   ├── lib/
│   │   │   ├── trpc.ts              ← tRPC client setup
│   │   │   ├── utils.ts             ← Shared utilities
│   │   │   └── constants.ts         ← App-wide constants (z-index scale, etc.)
│   │   └── styles/
│   │       └── index.css            ← Tailwind entry + design tokens
│   └── index.html
│
├── server/
│   ├── _core/                        ← Core infrastructure (keep)
│   │   ├── db.ts                     ← Database connection
│   │   ├── env.ts                    ← Environment variables
│   │   ├── context.ts               ← tRPC context + auth
│   │   ├── index.ts                 ← Server startup
│   │   ├── analytics.ts             ← PostHog tracking
│   │   └── llm.ts                   ← OpenAI client
│   │
│   ├── routers/                      ← tRPC routers (SPLIT from routers.ts)
│   │   ├── index.ts                 ← Merges all routers
│   │   ├── calls.ts                 ← Call-related endpoints
│   │   ├── inventory.ts             ← Inventory/property endpoints
│   │   ├── team.ts                  ← Team member endpoints
│   │   ├── gamification.ts          ← XP, badges, leaderboard
│   │   ├── kpi.ts                   ← KPI endpoints
│   │   ├── training.ts              ← Training + roleplay
│   │   ├── ai.ts                    ← Unified AI endpoint
│   │   ├── playbook.ts              ← Playbook CRUD
│   │   ├── actions.ts               ← Universal CRM action execution
│   │   ├── auth.ts                  ← Auth endpoints
│   │   └── admin.ts                 ← Admin-only endpoints
│   │
│   ├── services/                     ← Business logic (pure functions)
│   │   ├── grading.ts               ← AI grading pipeline
│   │   ├── gamification.ts          ← Badge evaluation, XP, streaks
│   │   ├── coachStream.ts           ← AI coaching (streaming)
│   │   ├── playbooks.ts             ← Playbook assembly + resolution
│   │   ├── intelligence.ts          ← Learning loop jobs
│   │   └── opportunityDetection.ts  ← Missed opportunity analysis
│   │
│   ├── crm/                          ← CRM abstraction layer
│   │   ├── adapter.ts               ← CRM adapter interface
│   │   ├── ghl/                     ← GHL-specific implementation
│   │   │   ├── ghlAdapter.ts
│   │   │   ├── ghlOAuth.ts
│   │   │   ├── ghlSync.ts
│   │   │   ├── ghlActions.ts
│   │   │   └── ghlWebhook.ts
│   │   └── hubspot/                 ← Future: HubSpot adapter
│   │       └── hubspotAdapter.ts
│   │
│   ├── algorithms/                   ← Sorting algorithms with config objects
│   │   ├── inventorySort.ts
│   │   ├── buyerMatch.ts
│   │   ├── taskSort.ts
│   │   └── index.ts
│   │
│   ├── jobs/                         ← Scheduled/background jobs
│   │   ├── polling.ts               ← CRM polling (calls, tasks, appointments)
│   │   ├── reconciliation.ts        ← Daily/weekly data reconciliation
│   │   ├── intelligenceJobs.ts      ← User/tenant/industry insight generation
│   │   └── cleanup.ts              ← Stale data, expired sessions
│   │
│   └── middleware/                    ← Express middleware
│       ├── auth.ts                  ← JWT verification
│       ├── rateLimit.ts             ← Rate limiting rules
│       ├── security.ts              ← Helmet, CORS, headers
│       └── tenantScope.ts           ← Universal tenantId enforcement
│
├── shared/                           ← Shared types (frontend + backend)
│   ├── playbooks.ts                 ← Playbook type definitions
│   ├── types.ts                     ← Shared interfaces
│   └── constants.ts                 ← Shared constants
│
├── drizzle/
│   ├── schema.ts                    ← All DB tables (source of truth)
│   └── migrations/                  ← Generated migrations
│
├── playbook-seeds/                   ← Industry playbook seed data
│   ├── wholesaling.json
│   ├── solar.json
│   ├── insurance.json
│   ├── saas.json
│   └── homeServices.json
│
├── tests/
│   ├── server/                      ← Server unit tests (70+ existing)
│   ├── client/                      ← Frontend component tests (new)
│   └── e2e/                         ← Playwright E2E tests (new)
│
└── config files
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── vitest.config.ts
    ├── .prettierrc
    ├── eslint.config.js             ← NEW
    ├── playwright.config.ts         ← NEW
    └── REBUILD-PLAN.md              ← This file
```

### Router Split Plan

The 9,059-line `server/routers.ts` splits into ~12 focused routers:

| New Router | Approx Procedures | Source |
|---|---|---|
| `routers/calls.ts` | ~15 | Call CRUD, grading, inbox |
| `routers/inventory.ts` | ~12 | Property CRUD, stages, buyers |
| `routers/team.ts` | ~8 | Team members, invites, roles |
| `routers/gamification.ts` | ~8 | XP, badges, streaks, leaderboard |
| `routers/kpi.ts` | ~6 | KPI data entry, dashboards |
| `routers/training.ts` | ~8 | Materials, roleplay, sessions |
| `routers/ai.ts` | ~3 | Unified stream, suggestions |
| `routers/playbook.ts` | ~6 | Playbook CRUD, overrides |
| `routers/actions.ts` | ~10 | All CRM write-back actions |
| `routers/auth.ts` | ~5 | Login, signup, OAuth, session |
| `routers/admin.ts` | ~8 | Super admin, tenant management |
| `routers/settings.ts` | ~6 | Workspace config, CRM setup |

Each router file: <500 lines. Import business logic from `services/`. Keep routers thin.

---

## 20. Tools, APIs & Services Needed

### APIs to Integrate (Build Phase)

| API / Service | Purpose | Priority | Notes |
|---|---|---|---|
| **OpenAI GPT-4** | Grading, coaching, playbook AI editor, content generation | HAVE | Already integrated |
| **OpenAI Whisper** | Call transcription | HAVE | Already integrated |
| **GoHighLevel API** | CRM sync (calls, contacts, opportunities, tasks, SMS) | HAVE | Already integrated |
| **Stripe** | Billing, subscriptions, plan management | HAVE | Already integrated |
| **Resend** | Transactional email (invites, resets, reports) | HAVE | Already integrated |
| **Supabase Storage** | Call recording storage | HAVE | Already integrated |
| **Google OAuth** | Authentication | HAVE | Already integrated |
| **Sentry** | Error tracking (backend + frontend) | PARTIAL | Need `@sentry/react` for frontend |
| **PostHog** | Analytics + user behavior tracking | PARTIAL | Need JS client for frontend events |
| **Cloudflare Turnstile** | Bot protection on signup | HAVE | Already integrated |
| **HubSpot API** | Second CRM adapter | NEW | Phase 5+ (after GHL is solid) |
| **Salesforce API** | Third CRM adapter | FUTURE | After HubSpot proves the adapter pattern |
| **Twilio** | Direct SMS (bypass CRM) | EVALUATE | If CRM SMS proves unreliable |
| **Zillow/ATTOM API** | Property data enrichment (RE industry) | EVALUATE | For Industry Playbook intelligence |
| **Google Maps API** | Market visualization, address autocomplete | EVALUATE | Types already in devDeps |
| **BatchDialer API** | Dialer integration | HAVE | Already integrated (key exists) |
| **BatchLeads API** | Lead data enrichment | HAVE | Already integrated (key exists) |

### Internal Tools to Build

| Tool | Purpose | When |
|---|---|---|
| **Playbook Seeder CLI** | `npm run playbook:seed wholesaling` — seeds industry playbook from JSON | Phase 1 |
| **Migration Health Check** | Script that verifies all endpoints have tenantId enforcement | Phase 0 |
| **Sync Health Monitor** | Dashboard showing webhook/polling/reconciliation status | Phase 1 |
| **AI Cost Tracker** | Track OpenAI spend per tenant per day (for rate limiting + billing) | Phase 1 |
| **Playbook Diff Tool** | Show what changed between playbook versions | Phase 2 |

### External References & Inspirations

| Site/Product | What to Study | Aspect |
|---|---|---|
| **Linear** (linear.app) | Keyboard shortcuts, command palette, sidebar, transitions | Navigation + Speed |
| **Notion** (notion.so) | Block editor, clean typography, dark mode | Content + Flexibility |
| **Stripe Dashboard** (dashboard.stripe.com) | Data density, tables, chart styling, dark mode | Data Presentation |
| **Vercel** (vercel.com) | Landing page, deployment UI, status indicators | Design + Landing |
| **Attio** (attio.com) | CRM UI, pipeline views, relationship mapping | CRM Patterns |
| **Close** (close.com) | Sales CRM, inbox, calling, sequences | Sales Workflow |
| **Gong** (gong.io) | Call intelligence, coaching, deal boards | Call Coaching |
| **Chorus.ai** (chorus.ai) | Conversation intelligence, insights | AI Coaching |

---

## 21. Enhancement List — Premium Parity

Everything needed to put functionality and visuals on par with software selling for billions. Grouped by category.

### UI/UX Enhancements

| # | Enhancement | Current State | Target State | Priority |
|---|---|---|---|---|
| 1 | **Command palette (⌘K)** | cmdk installed but not wired up | Global search: pages, contacts, properties, actions, settings | HIGH |
| 2 | **Keyboard shortcuts** | None | `g` then `t` = Today, `g` then `c` = Calls, `g` then `i` = Inventory, etc. | MEDIUM |
| 3 | **Page transitions** | Instant swap (flash) | 200ms ease-out crossfade, shared layout animation | HIGH |
| 4 | **Empty states** | Some pages show blank white | Every list/table has designed empty state with CTA | HIGH |
| 5 | **Error boundaries** | None — React crash = white screen | Graceful error UI per section ("Something went wrong. Retry.") | HIGH |
| 6 | **Responsive tables** | Some tables break on small screens | All tables scroll horizontally or collapse to card view on mobile | MEDIUM |
| 7 | **Dark mode polish** | Mostly done, some inconsistencies | Full audit — every component, every state, both modes perfect | MEDIUM |
| 8 | **Loading skeleton consistency** | Mixed (some spinners, some skeleton, some blank) | All initial loads use skeleton. All actions use optimistic updates. | HIGH |
| 9 | **Notification system** | None | In-app notifications: badge earned, task due, call graded, suggestion ready | MEDIUM |
| 10 | **Breadcrumbs** | None | Show path on nested views (Inventory → Property → Buyers) | LOW |

### Data & Intelligence Enhancements

| # | Enhancement | Current State | Target State | Priority |
|---|---|---|---|---|
| 11 | **Real-time updates** | Polling on page focus | WebSocket or SSE for live data (new call, SMS, task completion) | MEDIUM |
| 12 | **Advanced search** | Basic text search on some pages | Full-text search across calls, contacts, properties, notes, transcripts | HIGH |
| 13 | **Export/reporting** | jsPDF exists but limited | Export any table to CSV. Weekly PDF report auto-emailed to admin. | MEDIUM |
| 14 | **Audit log** | Partial (some actions logged) | Complete audit trail: who did what, when, on which entity. Viewable in admin. | HIGH |
| 15 | **Data visualization upgrade** | Basic Recharts | Funnel charts, heat maps (call volume by hour), trend sparklines in tables | MEDIUM |

### AI Enhancements

| # | Enhancement | Current State | Target State | Priority |
|---|---|---|---|---|
| 16 | **Proactive suggestions** | None (reactive only) | AI suggests next actions based on patterns, shown as cards | HIGH (Phase 4) |
| 17 | **Call summary auto-generation** | Exists but basic | One-paragraph executive summary + key moments with timestamps | MEDIUM |
| 18 | **AI-generated training content** | Manual upload only | AI writes training modules based on team's weak areas | MEDIUM |
| 19 | **Sentiment analysis** | Not implemented | Real-time sentiment tracking during call playback | LOW |
| 20 | **Competitive intelligence** | None | AI researches competitors and adds to Industry Playbook | FUTURE |

### Gamification Enhancements (see Section 16 for full detail)

| # | Enhancement | Priority |
|---|---|---|
| 21 | Fix 4 unimplemented badge criteria | HIGH |
| 22 | Award improvement XP | HIGH |
| 23 | Daily/weekly challenges | MEDIUM |
| 24 | Badge rarity visuals with animation | MEDIUM |
| 25 | Achievement notifications (confetti + toast) | MEDIUM |
| 26 | XP history timeline | LOW |
| 27 | Custom tenant badges | FUTURE |
| 28 | Team challenges | FUTURE |

### Action & Workflow Enhancements

| # | Enhancement | Current State | Target State | Priority |
|---|---|---|---|---|
| 29 | **Bulk actions** | "Push All" with no warning | Select multiple → bulk action with count + warning + confirm | HIGH |
| 30 | **Action history** | Partial | Full action history per contact: every SMS, note, task, stage change, by whom, when | HIGH |
| 31 | **Undo support** | None | 5-second undo window after non-destructive actions (note, task) | MEDIUM |
| 32 | **Action templates** | None | Saved SMS/note templates per role (from Tenant Playbook) | MEDIUM |
| 33 | **Workflow builder** | None (uses CRM workflows) | Visual sequence builder: trigger → condition → action | FUTURE |

### Performance & Reliability Enhancements

| # | Enhancement | Current State | Target State | Priority |
|---|---|---|---|---|
| 34 | **CDN for static assets** | Railway serves everything | Cloudflare CDN for JS/CSS/images | MEDIUM |
| 35 | **Database query optimization** | No query analysis | Identify slow queries, add indexes, optimize N+1 patterns | HIGH |
| 36 | **Bundle size optimization** | No analysis | Code-split per route, lazy load heavy pages (Training, KPIs) | MEDIUM |
| 37 | **API response caching** | No caching layer | Cache playbook data, team members, frequently-read data (5-min TTL) | MEDIUM |
| 38 | **Health check endpoint** | None | `GET /health` returning DB, CRM, storage status — for monitoring | HIGH |
| 39 | **Graceful degradation** | CRM disconnect = broken UI | CRM disconnected: grading, training, gamification still work. Actions show "CRM offline" | HIGH |

### Security & Compliance Enhancements

| # | Enhancement | Current State | Target State | Priority |
|---|---|---|---|---|
| 40 | **SOC 2 readiness** | Not started | Audit logging, access controls, encryption at rest, data retention policies | FUTURE |
| 41 | **RBAC (Role-Based Access Control)** | Basic (admin vs member) | Granular: admin, manager, member with per-feature permissions | MEDIUM |
| 42 | **API key management** | No external API | Tenant API keys for external integrations (webhooks out, data export) | LOW |
| 43 | **Session management** | JWT only, no revocation | Session list in profile, "Sign out everywhere", revoke on password change | MEDIUM |
| 44 | **2FA** | None | TOTP 2FA optional for admin accounts | LOW |

---

## 22. Build Phases

> Updated to reflect new sections (Landing Pages, Gamification, Design, Organization).

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

### Phase 1: Software Playbook Layer + Codebase Restructure

Build the shell. Pages render from playbook data. No hardcoded labels anywhere. Restructure codebase for maintainability.

**Codebase organization (do first):**
- Split `server/routers.ts` (9,059 lines) → 12 focused router files in `server/routers/`
- Break `server/opportunityDetection.ts` (5,381 lines) → smaller service modules
- Create `server/crm/` adapter layer with GHL behind interface
- Create `server/algorithms/` with config-object pattern
- Create `server/jobs/` for scheduled tasks
- Create `server/middleware/` for auth, rate limiting, security
- Add ESLint + `eslint-config-prettier`
- Add `@sentry/react` for frontend error tracking
- Add Helmet + CORS + `express-rate-limit`
- Remove unused `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- Add `GET /health` endpoint

**Platform shell:**
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
- Webhook retry queue for incoming events
- DB-based deduplication for webhooks
- Command palette (⌘K) wired to cmdk
- Error boundaries on every page section
- Skeleton loading on every page

After this phase: site works but everything is "Asset", "Contact", "Stage 1". Functional but generic. Codebase is clean, organized, maintainable.

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

### Phase 4: User Playbook + Intelligence Loop + Voice Collection

- User profile summary (auto-generated after each graded call)
- Coaching memory distillation (weekly job)
- Action pattern analysis (from user_events)
- First intelligence jobs (user profile update, tenant intelligence)
- Wire existing unused data into AI context (past actions, XP/badges always loaded, full performance profile)
- Proactive suggestions (V2 AI — suggest without being asked)
- `user_voice_samples` + `user_voice_profiles` tables
- Voice sample extraction job (runs after grading, background priority)
- Consent toggle in Profile page
- Storage bucket: `gunner-voice-samples`
- Voice profile dashboard in Profile (total minutes, sample count, ready status)

### Phase 5: Landing Pages + Gamification + Premium Polish

**Landing pages:**
- Rebuild main landing page (empowerment messaging, login in nav, CRM-agnostic)
- Build industry page template (`IndustryLanding.tsx`)
- Create RE Wholesaling industry page (`/industries/wholesaling`) — FIRST
- Create 4 additional industry pages (solar, insurance, SaaS, home services)
- Re-enable signup (email + Google OAuth)
- Testimonials from DB (not hardcoded)
- Pricing from DB plans table

**Gamification fixes:**
- Implement Consistency King badge (consistency_days criteria)
- Implement Volume badges (weekly cron job for weekly_volume)
- Implement Closer badge (sync from CRM deals)
- Award improvement XP (+20 for 2+ letter grade jump)
- Fix gamification leaderboard (return full team member data)
- Add Dispo Manager badge icons
- Move all badge/XP/level definitions to playbooks
- Add achievement notifications (confetti + toast on badge/level up)

**Premium UI pass:**
- Premium UI pass on all 7 pages (Linear/Notion/Stripe quality)
- Page transitions (200ms ease-out crossfade)
- Dark mode full audit
- Consistent loading skeletons everywhere
- Empty states with guidance CTAs
- Responsive table views
- Self-onboarding CRM setup (one-button OAuth)
- Reconciliation job (daily/weekly sync verification)
- Full accessibility pass

### The Second Tenant Test

After the rebuild, onboarding a second RE wholesaling tenant should take <30 minutes and require ZERO code changes. Onboarding a solar company should require ZERO code changes — just creating a solar industry playbook template.

---

## 23. Architecture Rules

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
