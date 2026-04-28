# Gunner AI — Intelligence Architecture Plan

> The LLM is the backbone of the entire site. Users interact with a smart, context-aware assistant and get on calls. Everything is AI-assisted — propose, edit, approve. The AI learns from every interaction and gradually earns autonomy.

---

## The Assistant

**Name:** Dynamic from user's role. `{Role} Assistant`. Role pulled from `user.role` at runtime — works for any current or future role without hardcoding.

**Location:** Right sidebar on every page. Replaces current AI Coach.

**Behavior:**
- Chat interface like ChatGPT
- Context persists through the day (resets at midnight CT or on manual clear)
- Conversation saved to DB — available for learning even after reset
- Fresh UI on page refresh but conversation continues where left off within the day
- Knows what page the user is on, adjusts context automatically
- Shows action cards inline (like next steps on calls page) — user edits and approves

---

## What the Assistant Knows

### Layer 1: Page Context (automatic, loaded on every message)

| Page | Data loaded |
|------|------------|
| Property detail | All 200+ fields: address, pricing (asking/MAO/offer/contract/ARV), deal intel (45+ fields across 8 categories), BatchData (valuation, ownership, equity, tax, mortgage, building, zoning, permits, flood), computed metrics (engagement, negotiation gap), milestones, team members, contacts/sellers, buyer matches + pipeline, calls with grades/summaries, tasks, appointments, internal notes, deal blast history, outreach logs |
| Call detail | Full transcript, grade + rubric scores, coaching (strengths/red flags/improvements/objection replies), deal intel extracted, next steps, key moments, sentiment, motivation, property data (if linked), prior calls with this contact, contact conversation history |
| Day Hub | Today's KPIs (dials, convos, apts, offers, contracts), tasks with priority scores + overdue status, appointments, inbox (unread + no-response), team members + performance, user's XP/level/badges |
| Inventory | All properties with status, pipeline stages, market, source, data quality issues, assigned team, deal values |
| Calls list | All calls with grades, outcomes, rep assignments, filter state |
| Buyers tab | Matched buyers with scores, pipeline stages (matched/responded/interested), blast history, response intents |
| Inbox | Conversation threads, contact details, message history |
| Settings | Tenant config, team roster, pipeline setup, rubrics, knowledge docs |

### Layer 2: Cross-Entity Context (loaded when relevant)

When discussing a property, the assistant also loads:
- All calls for contacts linked to that property (not just the most recent)
- Accumulated deal intel across all calls
- Full milestone timeline
- Buyer activity + responses
- Prior SMS/email threads from GHL
- Competing offers mentioned in any call
- Decision maker map built from deal intel
- Deal health trajectory (improving/declining)

When discussing a call, also loads:
- All other calls with the same contact
- Property deal history
- What the rep committed to on prior calls (from deal intel: commitmentsWeMade, promisesTheyMade)
- Rep's performance profile (scoring patterns, strengths, weaknesses)

When discussing a team member, also loads:
- Score trends (7/30/90 day)
- Rubric category averages
- Call volume and conversion rates
- Comparison to team averages
- Recent coaching points from graded calls

### Layer 3: Tenant Knowledge (uploaded by user, stored in DB)

| Type | Storage | Injected into |
|------|---------|--------------|
| Scripts per call type | `tenant.scripts` JSON | Grading system prompt, assistant |
| Company standards/rules | `tenant.companyStandards` | Grading red flags, assistant |
| Training materials/playbooks | `knowledge_documents` table | Assistant (RAG search), grading |
| Market knowledge | `knowledge_documents` with type=market | Assistant, grading, deal analysis |
| Calibration calls | `call.isCalibration` + `call.calibrationNotes` | Grading baseline |

### Layer 4: User Knowledge (auto-generated, updated weekly)

| Data | Source | Feeds into |
|------|--------|-----------|
| Avg score per rubric category | All graded calls | Grading (personalized coaching) |
| Top 3 strengths | Categories scoring 80%+ consistently | Coaching (acknowledge, don't re-teach) |
| Top 3 weaknesses | Categories scoring <60% consistently | Coaching (focus areas) |
| Communication style | Transcript analysis | Grading (evaluate outcomes not style) |
| Score velocity | 30/60/90 day trends | Manager reports, coaching |
| Common mistakes | Repeated red flags across calls | Targeted coaching |
| Preferred action types | Which next steps they approve vs reject | Action generation |

### Layer 5: Industry Knowledge (exists, will expand)

Current: 148 lines covering 10-step framework, personality selling, objection handling, DQ guidance.

Expansions:
- Market-specific pricing/deal context per market
- Expanded objection library (6 → 25+)
- Detailed playbooks per call type
- Negotiation frameworks specific to wholesale
- Common seller scenarios (inherited, pre-foreclosure, tired landlord, divorce, relocation)

### Layer 6: Learning Memory (accumulated over time)

| What's stored | How it's used |
|--------------|---------------|
| Every grade correction (category, direction, reason) | Injected into grading prompt (last 30 days) |
| Every next step edit (original vs final) | Learn preferred action format |
| Every next step rejection | Learn what NOT to suggest |
| Every deal intel edit/skip | Learn extraction precision preferences |
| Every assistant action approval/edit/rejection | Learn which actions users trust |
| Every question asked to assistant | Understand what info users need most |
| Coach conversation history | Build understanding of rep's self-awareness |

---

## Complete Action Inventory

Every action the assistant can execute. All follow: propose → user edits → user approves → executes.

### GHL Contact Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 1 | Send SMS | to (name+phone), from (user+number), message text | `ghl.sendSMS()` |
| 2 | Send email | to, from, subject, HTML body | `ghl.sendEmail()` |
| 3 | Schedule SMS | same as send + scheduled datetime | `ghl.sendSMS()` with schedule |
| 4 | Schedule email | same as send email + scheduled datetime | `ghl.sendEmail()` with schedule |
| 5 | Add note to contact | contact, note text | `ghl.addNote()` |
| 6 | Create task | title, description, due date, assigned to, contact | `ghl.createTask()` |
| 7 | Complete task | task title, task ID | `ghl.completeTask()` |
| 8 | Update task | task ID, fields to change | `ghl.updateTask()` |
| 9 | Create contact | first name, last name, phone, email, tags, source | `ghl.createContact()` |
| 10 | Update contact fields | contact, field(s) to change | `ghl.updateContact()` |
| 11 | Add tags to contact | contact, tags | `ghl.updateContact()` |
| 12 | Remove tags from contact | contact, tags | `ghl.updateContact()` |
| 13 | Assign contact to user | contact, user | `ghl.updateContact()` |

### GHL Pipeline Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 14 | Create opportunity | pipeline, stage, contact, name, value | `ghl.createOpportunity()` |
| 15 | Change pipeline stage | opportunity, pipeline, new stage | `ghl.updateOpportunityStage()` |
| 16 | Update opportunity status | opportunity, status (won/lost/open/abandoned) | `ghl.updateOpportunity()` |
| 17 | Update opportunity value | opportunity, monetary value | `ghl.updateOpportunity()` |

### GHL Calendar Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 18 | Create appointment | calendar, contact, date/time, title, assigned to | GHL calendar API |
| 19 | Reschedule appointment | appointment ID, new date/time | GHL calendar API |
| 20 | Cancel appointment | appointment ID, reason | GHL calendar API |
| 21 | Update appointment status | appointment ID, status (confirmed/showed/no-show) | GHL calendar API |

### GHL Workflow Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 22 | Add contact to workflow | contact, workflow name | GHL workflow trigger |
| 23 | Remove contact from workflow | contact, workflow name | GHL workflow API |

### GHL Bulk Actions (require explicit approval)

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 24 | Send SMS blast to buyers | property, buyer tier, message | Blast system |
| 25 | Send email blast to buyers | property, buyer tier, subject, body | Blast system |
| 26 | Bulk tag contacts | contact list, tags | Batch `ghl.updateContact()` |

### Gunner Property Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 27 | Update any property field | field name, new value | `PATCH /api/properties/{id}` |
| 28 | Log offer | amount, date, terms, notes | Milestone + property fields |
| 29 | Log counter offer | amount, notes | Property fields |
| 30 | Change acquisition status | new status, reason | Property update |
| 31 | Change dispo status | new status, reason | Property update |
| 32 | Add contact/seller to property | contact (search GHL), role | Property seller link |
| 33 | Remove contact from property | contact | Property seller unlink |
| 34 | Add team member to property | user, role | PropertyTeamMember |
| 35 | Remove team member | user | PropertyTeamMember delete |
| 36 | Log milestone | type, notes, date, logged by | PropertyMilestone |
| 37 | Update deal intel field | field, value | Property dealIntel JSON |
| 38 | Approve all pending deal intel | — | Batch deal intel approval |
| 39 | Add internal note | note text | Property notes |
| 40 | Set property markets | market names | Property propertyMarkets |
| 41 | Set project types | types (flip, rental, etc) | Property projectType |
| 42 | Trigger property enrichment | — | BatchData API call |
| 43 | Generate deal blast copy | tier, tone | AI generates SMS/email |
| 44 | Create comp analysis | — | AI generates from BatchData |
| 45 | Calculate MAO | formula inputs | Computed from ARV - repairs - fee |

### Gunner Call Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 46 | Regrade call | — | Re-run grading pipeline |
| 47 | Reclassify call type | new type | Call update |
| 48 | Generate next steps | — | AI generates |
| 49 | Push next step to CRM | action details | GHL API |
| 50 | Mark call reviewed | notes | Call update |
| 51 | Flag call as calibration (good/bad) | type, notes | Call update |

### Gunner Buyer Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 52 | Add buyer to GHL + DB | name, phone, email, tier, markets, buybox | GHL + DB |
| 53 | Move buyer in pipeline | buyer, new stage (matched/responded/interested) | PropertyBuyerStage |
| 54 | Update buyer details | fields to change | Buyer update |
| 55 | Sync buyers from GHL | — | Sync script |
| 56 | Rematch buyers for property | — | Re-run matching |

### Gunner Team/Admin Actions

| # | Action | What AI fills | Executes via |
|---|--------|--------------|-------------|
| 57 | Invite team member | email, role | Invite API |
| 58 | Update user role | user, new role | User update |
| 59 | Set KPI goals | role, metric, target | Tenant config |
| 60 | Update pipeline config | pipeline, trigger stage | Tenant settings |

### Information Actions (no approval needed — just answers)

| # | Action | What it does |
|---|--------|-------------|
| 61 | Summarize this property | Full deal brief from all 200+ data points |
| 62 | How did this call go | Grade + coaching + key moments + next steps |
| 63 | Deal blast info for property | Specs, pricing, signals, suggested copy |
| 64 | Deal status / health | Timeline, milestones, activity, risk assessment |
| 65 | Compare to similar deals | Pull comparable properties |
| 66 | What should I do next | Prioritized actions based on deal state |
| 67 | Rep performance summary | Score trends, strengths, weaknesses, volume |
| 68 | Team performance overview | All reps compared, who needs attention |
| 69 | Pipeline health | Stage distribution, velocity, stuck deals |
| 70 | Explain this data point | What any field means, where it came from, confidence |
| 71 | What objections came up | All objections across all calls for a contact |
| 72 | Seller communication profile | Style, triggers, what not to say, best approach |
| 73 | Title/legal risk assessment | From deal intel: liens, taxes, title issues |
| 74 | Market analysis for property | From BatchData + market knowledge |

---

## Learning Architecture

### Immediate Learning (same session)

Every user interaction within a session builds context. If the user corrects the AI at 9am, the AI remembers at 2pm.

### Short-term Learning (30-day rolling window)

| Source | What's learned | How it's applied |
|--------|---------------|-----------------|
| Grade corrections | Which rubric categories are scored too high/low | Injected into grading system prompt |
| Next step edits | How user prefers actions formatted | Shapes next generation |
| Deal intel edits | Which fields user cares about, preferred format | Extraction calibration |
| Action approvals | Which actions AI gets right | Builds confidence baseline |
| Action rejections | Which actions AI gets wrong | Reduces false suggestions |

### Long-term Learning (persistent)

| Source | What's learned | How it's applied |
|--------|---------------|-----------------|
| User performance profiles | Rep strengths/weaknesses over career | Personalized coaching |
| Calibration calls | What "good" and "bad" look like for this company | Grading baseline |
| Company knowledge docs | Scripts, processes, standards | All AI touchpoints |
| Deal outcomes | Which patterns led to closed deals vs dead deals | Predictive scoring (future) |
| Action patterns | Which actions are always approved for auto-execution (future) | Autonomy progression |

### Autonomy Progression (future — admin-controlled)

Not building this now, but the architecture supports it:

1. **Trust score per action type** — calculated from approval rate over 90 days
2. **Admin toggle** — per action type, can set to "auto-execute if trust > 90%"
3. **Notification on auto-execute** — user sees "I did X" instead of "Should I do X?"
4. **Rollback** — every auto-executed action is reversible for 24 hours

---

## Technical Architecture

### New DB Models

```
KnowledgeDocument {
  id, tenantId, createdAt, updatedAt
  title        — "Cold Call Script v3"
  type         — script | standard | playbook | training | market | objection
  callType     — cold_call | qualification_call | etc (nullable)
  content      — full text content
  embedding    — vector (pgvector) for semantic search
  isActive     — soft delete
}

AssistantMessage {
  id, tenantId, userId, createdAt
  sessionDate  — date (conversations persist within a day)
  role         — user | assistant | tool_call | tool_result
  content      — message text
  toolCalls    — JSON: actions proposed/executed
  pageContext  — what page + resource the user was on
}

UserProfile {
  id, tenantId, userId, updatedAt
  scoringPatterns     — JSON: avg per rubric category
  strengths           — string array
  weaknesses          — string array
  commonMistakes      — string array
  communicationStyle  — string
  improvementVelocity — JSON: 30/60/90 day trends
  preferredActions    — JSON: action type approval rates
  totalCallsGraded    — number
}

ActionLog {
  id, tenantId, userId, createdAt
  actionType      — send_sms | create_task | change_stage | etc
  proposed        — JSON: what AI suggested
  executed        — JSON: what was actually executed
  wasEdited       — boolean
  wasRejected     — boolean
  editDiff        — JSON: what fields changed
  pageContext     — where initiated
  sessionId       — link to assistant session
}
```

### Schema Changes to Existing Models

```
Tenant:
  + scripts          Json @default("{}")  — keyed by call type
  + companyStandards String? @db.Text     — company rules
  + calibrationCalls Json @default("[]")  — [{callId, type, notes}]

Call:
  + isCalibration    Boolean @default(false)
  + calibrationNotes String?
```

### pgvector for Knowledge Search

Using Supabase's built-in pgvector extension (already available):

1. When a knowledge document is saved, generate embedding via Claude/OpenAI
2. Before any AI call, search for relevant docs: `SELECT * FROM knowledge_documents ORDER BY embedding <=> query_embedding LIMIT 5`
3. Top 5 relevant docs injected into prompt context
4. Handles scripts, playbooks, training materials, market research — all searchable

### Context Builder

```typescript
async function buildAssistantContext(params: {
  tenantId: string
  userId: string
  pageType: string
  resourceId?: string
  conversationHistory?: AssistantMessage[]
}): Promise<{
  pageData: Record<string, unknown>
  crossEntityData: Record<string, unknown>
  tenantKnowledge: string
  userProfile: UserProfile
  industryKnowledge: string
  learningContext: string
  availableTools: ToolDefinition[]
}>
```

Single function used by: assistant chat, grading, deal intel, next steps, coaching, property enrichment, blast generation — all AI touchpoints get the same rich context.

---

## Settings UI for Knowledge Management

### Settings → Knowledge (new section)

**Scripts tab:**
- Text area per call type (cold, qualification, offer, follow-up, dispo, purchase agreement, admin)
- "Your team's actual script for this call type"
- Saved to `tenant.scripts` JSON

**Standards tab:**
- Single rich text area for company rules/standards
- "Rules and standards your team must follow"
- Saved to `tenant.companyStandards`

**Training Materials tab:**
- Upload/paste documents
- Title + type selector (playbook, training, market, objection)
- List of uploaded docs with edit/delete
- Stored in `knowledge_documents` table

**Calibration tab:**
- List of calls marked as calibration examples
- Flag button on call detail page to mark good/bad
- Shows call summary + calibration notes
- Used by grading to understand your standards

---

## Build Sequence

| # | What | Effort | Builds on |
|---|------|--------|-----------|
| 1 | Schema changes + migrations (all new models) | Small | Nothing |
| 2 | Context builder function | Medium | #1 |
| 3 | Claude tool definitions (all 60 actions) | Medium | Nothing |
| 4 | Settings → Knowledge UI (scripts, standards, materials, calibration) | Medium | #1 |
| 5 | Rename coach → Role Assistant + persist daily context | Small | Nothing |
| 6 | Assistant chat with tool use + action approval cards | Large | #2, #3, #5 |
| 7 | Wire context builder into grading (cross-call, user profile, tenant knowledge) | Medium | #2 |
| 8 | User performance profile auto-generation (weekly) | Medium | #1 |
| 9 | pgvector embeddings for knowledge search | Medium | #4 |
| 10 | Action logging + learning feedback loop | Small | #6 |
| 11 | Wire context builder into all other AI touchpoints | Medium | #2 |
| 12 | Expand industry knowledge (objections, scenarios, market data) | Medium | Nothing |

**Phase 1 (foundation): #1, #2, #3, #4, #5** — schema, context builder, tools, knowledge UI, rename
**Phase 2 (the assistant): #6** — the main feature, everything wired together
**Phase 3 (intelligence): #7, #8, #9, #10, #11** — grading enhancement, learning, search
**Phase 4 (depth): #12** — expanded knowledge

---

## What You Provide

| # | Material | Where it goes | When needed |
|---|----------|--------------|-------------|
| 1 | Scripts per call type | Settings → Knowledge → Scripts | Before Phase 3 (#7) |
| 2 | Company standards/rules | Settings → Knowledge → Standards | Before Phase 3 (#7) |
| 3 | Training materials | Settings → Knowledge → Materials | Anytime |
| 4 | Mark good/bad call examples | Call detail → flag button | Before Phase 3 (#7) |

Infrastructure gets built first. Your materials go through the UI we build. Nothing needed from you to start.

---

## Admin AI Log Page

**Location:** `/{tenant}/ai-logs` — admin/owner only

**Purpose:** See every AI interaction, catch failures, identify gaps in the AI's knowledge, and improve it fast.

### What gets logged (every AI call, no exceptions)

| Field | Description |
|-------|-------------|
| Timestamp | When the AI call happened |
| User | Who triggered it (or "SYSTEM" for auto-grading) |
| Type | `assistant_chat` / `call_grading` / `deal_intel` / `next_steps` / `blast_gen` / `buyer_scoring` / `property_enrich` / `action_execution` |
| Page context | What page + resource the user was on |
| Input summary | The user's message or trigger (truncated for display, full on click) |
| Output summary | What the AI responded or produced (truncated for display, full on click) |
| Tools called | Which actions the AI proposed (if any) |
| Status | `success` / `error` / `rejected` / `edited` |
| Error details | Error message if failed (model error, GHL error, validation error) |
| Tokens used | Input + output token count |
| Cost | Estimated cost of this call |
| Duration | How long the AI call took (ms) |
| Model | Which Claude model was used |

### UI Features

**Main view:** Scrollable table/feed of all AI interactions, most recent first.

**Filters:**
- By type (grading, assistant, deal intel, etc.)
- By user
- By status (errors only, rejections only)
- By date range
- Search by input/output text

**Detail view (click to expand):**
- Full input prompt (what was sent to Claude)
- Full output response (what Claude returned)
- Tool calls with proposed values
- If edited: original vs final values
- If error: full error stack
- Context that was loaded (which data sources)

**Dashboard cards at top:**
- Total AI calls today / this week
- Error rate (% failed)
- Most common user questions (grouped)
- Most common errors (grouped)
- Avg response time
- Estimated cost today / this week

**Actionable insights:**
- Questions the AI couldn't answer well (low user satisfaction or immediate re-asks)
- Repeated errors (same failure happening multiple times)
- Actions that get edited most (AI needs calibration)
- Actions that get rejected most (AI suggesting wrong things)

### DB Model

```
AiLog {
  id, tenantId, createdAt
  userId        — who triggered (nullable for system)
  type          — assistant_chat | call_grading | deal_intel | next_steps | etc
  pageContext   — string: "property:abc123" or "call:xyz789" or "dayhub"
  inputSummary  — first 200 chars of input
  inputFull     — full input text/prompt (stored but not displayed in list)
  outputSummary — first 200 chars of output
  outputFull    — full output (stored but not displayed in list)
  toolsCalled   — JSON array of tool names + params
  status        — success | error | rejected | edited
  errorMessage  — string if status=error
  tokensIn      — number
  tokensOut     — number
  estimatedCost — float (dollars)
  durationMs    — how long the call took
  model         — which Claude model
}
```

### Build sequence
Added to Phase 1 (foundation) — the logging infrastructure should exist before the assistant launches so we capture everything from day one.

| # | Updated build item |
|---|-------------------|
| 1 | Schema changes + migrations (includes AiLog model) |
| 1b | **AI Log page — admin only** |

