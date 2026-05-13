# AI & Automation Audit — Gunner AI

> Date: 2026-05-11
> Purpose: Inventory every place Gunner uses AI, every cron, every webhook handler, and every GHL workflow / team task that's a candidate for replacement by a worker agent.
> Companion: `docs/agents/README.md` — the agent roadmap that builds on this inventory.

---

## 1. Overview

Gunner today has **21 modules in `lib/ai/`**, **8 Railway crons**, **5 GHL webhook event handlers**, and **17 AI-calling API routes**. The bulk of the work is real-time call grading and property enrichment. There is **no central agent orchestration layer yet** — every AI call is a one-shot or short multi-turn, and team members still do the majority of lead followup, qualification, and disposition manually.

This audit is the input to the agent roadmap. Each agent we build either:
- replaces a manual team task (e.g., lead qualification, walkthrough scheduling),
- replaces a GHL workflow (e.g., drip cadence, missed-call autoresponder),
- or hardens site operations (e.g., cron sentinel, webhook drift watchdog).

---

## 2. AI Capabilities — `lib/ai/`

### 2a. Call grading + intelligence (real-time AI)

| File | Purpose | Model | Trigger | DB writes |
|---|---|---|---|---|
| `lib/ai/grading.ts` | Orchestrates full call grading (transcribe → score → next steps). Duration routes <30s skip, 30-60s summary only, 60s+ full grade. | `claude-opus-4-6` × 2 streams | `poll-calls` cron, upload endpoint, reprocess, bulk-regrade | `calls.{gradingStatus, score, rubricScores, aiSummary, callResult, callOutcome, reasoning}` + TCP + story regen |
| `lib/ai/extract-deal-intel.ts` | Cumulative deal intelligence from call transcripts. Proposes property updates with approval history. | `claude-opus-4-6` (streaming) | After grading completes | `properties.dealIntel`, `calls.dealIntelHistory` |
| `lib/ai/transcribe.ts` | Downloads GHL audio + transcribes via Deepgram. | Deepgram (not Anthropic) | Called from grading.ts | None directly |
| `lib/ai/scoring.ts` | TCP (True Conversion Probability) 0.0-1.0 ensemble rule-based model. 8-factor formula. No LLM. | None (pure math) | After grading, stage change, task completion | `properties.{tcp_score, tcp_factors, tcp_updated_at}`, `sellers.likelihoodToSellScore` |

### 2b. Property AI

| File | Purpose | Model | Trigger | DB writes |
|---|---|---|---|---|
| `lib/ai/enrich-property.ts` | Background enrichment: ARV, repair estimate, rental estimate, neighborhood summary, flood zone, description. | `claude-sonnet-4-6` | Property POST/PUT, re-enrich endpoint | `properties.{arv, repair_estimate, rental_estimate, neighborhood_summary, flood_zone, description, field_sources, ai_enrichment_status}` |
| `lib/ai/generate-property-story.ts` | 180-260 word narrative synthesizing facts, milestones, recent calls, outreach, buyer matches. | `claude-sonnet-4-6` | After grading, nightly cron, user action | `properties.{story, storyUpdatedAt}` |
| `lib/ai/dispo-generators.ts` | Generates 3 dispo artifacts (description, full listing post, social post). | `claude-sonnet-4-6` × 2 | User clicks generate in Section 2 UI | `properties.dispoArtifacts` |
| `lib/ai/photo-classifier.ts` | Auto-categorize property photos into 7 buckets via vision. | `claude-haiku-4-5-20251001` | Fire-and-forget after photo upload | `property_photos.category` |

### 2c. Coaching + assistant

| File | Purpose | Model | Trigger | DB writes |
|---|---|---|---|---|
| `lib/ai/coach.ts` | AI coaching engine — generates proactive insights + multi-turn coaching responses. | `claude-sonnet-4-6` | `/api/ai/coach` user action | None (client-side state) |
| `lib/ai/assistant-tools.ts` | Tool definitions (send_sms, create_task, add_note, etc.) for Role Assistant multi-turn agent. | N/A — type defs | `/api/ai/assistant` user action | Via tools |
| `lib/ai/query-tools.ts` | 10+ query tools for cross-entity questions (properties, calls, tasks, KPIs, sellers, buyers, GHL pipeline, semantic search, similar deals). All tenant-scoped. | N/A — pure queries | Called by assistant when Claude invokes tool | None |
| `lib/ai/role-gates.ts` | Role-based capability gates for assistant tools. Enforces `ROLE_TOOL_MATRIX` at code level (defense-in-depth). | None | `/api/ai/assistant/*` routes | None |
| `lib/ai/session-summarizer.ts` | End-of-session rollup for Role Assistant cross-session memory. | `claude-haiku-4-5-20251001` | End of session or after N messages | `assistant_session_summaries` |
| `lib/ai/generate-user-profiles.ts` | Weekly auto-generation of user performance profiles from call data — feeds back into grading + coaching prompts. | `claude-sonnet-4-6` (per user) | Weekly cron (Sun 3am), admin trigger | `user_profiles` (upsert) |

### 2d. Knowledge + RAG

| File | Purpose | Model | Trigger | DB writes |
|---|---|---|---|---|
| `lib/ai/embeddings.ts` | OpenAI `text-embedding-3-small` (1536-dim) — embeds knowledge documents + optionally call transcripts. | OpenAI (not Anthropic) | Knowledge doc create/update, backfill | `knowledge_documents.embedding`, `call_embeddings` |
| `lib/ai/embeddings-query.ts` | Thin helper for embedding a query vector at search time. | OpenAI | Called by query-tools | None |
| `lib/ai/industry-knowledge.ts` | Static 10-step wholesale sales methodology constant (rapport → pain → commitment → objections → proposal). | None (constant) | Injected into grading, coaching, profile prompts | None |
| `lib/ai/context-builder.ts` | Assembles full knowledge context for any AI call. Pulls from knowledge_documents, user_profiles, tenant config, property data, call history. | None — assembly helper | Called by grading, coaching, assistant, deal intel | None |

### 2e. Utilities

| File | Purpose |
|---|---|
| `lib/ai/json-utils.ts` | Shared parsers for Claude JSON responses (fence stripping, balanced array extraction). |
| `lib/ai/log.ts` | Central AI logging — every AI call writes to `ai_logs` table with tokens, cost, model, duration, status. |
| `lib/ai/rate-limit.ts` | In-memory sliding-window rate limiter (default 30 chat turns/min). |

### 2f. Model usage summary

| Model | Modules using it |
|---|---|
| `claude-opus-4-6` | `grading.ts` (2 streams: grade + next steps), `extract-deal-intel.ts` (streaming) |
| `claude-sonnet-4-6` | `coach.ts`, `enrich-property.ts`, `dispo-generators.ts` (×2), `generate-user-profiles.ts`, `generate-property-story.ts`, grading fallback |
| `claude-haiku-4-5-20251001` | `photo-classifier.ts`, `session-summarizer.ts` |
| OpenAI `text-embedding-3-small` | `embeddings.ts`, `embeddings-query.ts` |
| Deepgram | `transcribe.ts` |

---

## 3. Crons (Railway, 8 jobs)

| Cron | Schedule | Script | Calls AI? | Calls GHL? | Purpose |
|---|---|---|---|---|---|
| `poll-calls` | every minute | `scripts/poll-calls.ts` | indirectly (queues grading) | yes | Safety-net poll of GHL conversations — guarantees every call captured even when webhook drops. |
| `daily-audit` | 2am UTC | `scripts/audit.ts` | yes (`claude-opus-4-6`) | no | Self-audit: tsc + eslint + env + Claude code review for security/isolation/error handling. |
| `daily-kpi-snapshot` | midnight UTC | `scripts/kpi-snapshot.ts` | no | no | Saves per-user KPI snapshots for historical trends. |
| `weekly-profiles` | Sun 3am UTC | `scripts/generate-profiles.ts` | yes (`claude-sonnet-4-6`) | no | Regenerates user performance profiles from real call data. |
| `regenerate-stories` | daily 7am UTC | `scripts/regenerate-stories.ts` | yes (`claude-sonnet-4-6`, ~150/run, ~$2.25/day) | no | Refreshes Property Stories for properties touched since last gen. |
| `reconcile-ghl-pipelines` | daily 4am UTC | `scripts/reconcile-ghl-pipelines.ts` | no | yes | Fixes drift: missing Property rows + stale lane status. Logs CRITICAL if >5 fixes/run. |
| `enrich-pending` | every 5 min | `scripts/enrich-pending.ts` | no (vendor data) | yes | Phase 3 enrichment catch-up for stub rows: fetches GHL contact + multi-vendor enrichment. |
| `compute-aggregates` | daily 4am UTC | `scripts/compute-aggregates.ts` | no | no | Seller portfolio + call voice + buyer funnel aggregates. |

---

## 4. GHL Webhooks (`lib/ghl/webhooks.ts`)

Single route: `POST /api/webhooks/ghl` with HMAC-SHA256 signature verification.

| Event | Handler | Does AI? | Writes |
|---|---|---|---|
| `CallCompleted` / `call.completed` | `handleCallCompleted()` | indirectly (queues grading) | `calls`, audit log |
| `InboundMessage` / `OutboundMessage` | `handleMessage()` | no | logs SMS/chat |
| `OpportunityCreate` | `handleOpportunityCreate()` | no | `properties` (stub from opp) |
| `OpportunityStageChanged` / `OpportunityUpdate` | `handleOpportunityUpdate()` | no (triggers TCP recalc downstream) | `properties.acqStatus/dispoStatus/longtermStatus` |
| `OpportunityDelete` | `handleOpportunityDelete()` | no | `properties` (soft delete) |
| `ContactCreate` / `ContactUpdate` / `ContactDelete` | `handleContactChange()` | no | `sellers` |
| `TaskCompleted` | `handleTaskCompleted()` | no | awards XP, may trigger workflows |
| `AppointmentCreated` | `handleAppointmentCreated()` | no | audit log |

**Observation:** No webhook directly calls AI. Grading is deliberately decoupled via the `poll-calls` cron for robustness.

---

## 5. API Routes Calling AI

| Route | Function | Trigger |
|---|---|---|
| `POST /api/ai/assistant` | Multi-turn agent (sonnet) | User chat message |
| `POST /api/ai/assistant/execute` | Tool execution (role-gated) | User approves tool suggestion |
| `POST /api/ai/coach` | `getCoachResponse()` | User opens coach panel |
| `POST /api/[tenant]/calls/upload` | `gradeCall()` | User uploads recording |
| `POST /api/[tenant]/calls/[id]/reprocess` | `gradeCall()` | User clicks reprocess |
| `POST /api/[tenant]/calls/[id]/reclassify` | `gradeCall()` + `extractDealIntel()` | Manual re-grade |
| `POST /api/[tenant]/calls/[id]/generate-next-steps` | Next steps stream | User request |
| `POST /api/[tenant]/calls/bulk-regrade` | `gradeCall()` × N | Admin batch |
| `POST /api/properties` | `enrichPropertyWithAI()` (bg) | Create property |
| `POST /api/properties/[propertyId]/re-enrich` | `enrichPropertyWithAI()` (bg) | User re-enrich |
| `GET /api/properties/[propertyId]/story` | `generatePropertyStory()` | Story tab view |
| `POST /api/properties/[propertyId]/dispo-generate` | `generateDispoArtifact()` | User generates artifact |
| `POST /api/properties/[propertyId]/photos` | `classifyPhoto()` (bg) | Photo upload |
| `POST /api/admin/generate-profiles` | `generateUserProfiles()` | Admin trigger |
| `POST /api/admin/knowledge` | `embedDocument()` (bg) | Knowledge doc create/update |
| `POST /api/admin/embed-knowledge` | `embedAllDocuments()` (bg) | Admin backfill |
| `POST /api/diagnostics/embed-calls-backfill` | `embedCallTranscript()` × N (bg) | Backfill |

---

## 6. RAG / Embeddings

- **What's embedded:** Knowledge documents (company standards, scripts, objection handling, training, industry knowledge), optionally call transcripts.
- **Where stored:** `knowledge_documents.embedding` (vector(1536)), `call_embeddings`.
- **Who queries:**
  - `context-builder.ts → searchKnowledgeBySimilarity()` — feeds grading, coaching, assistant.
  - `query-tools.ts → semanticSearchCalls()` — assistant tool, finds calls with similar transcripts.
  - `query-tools.ts → findSimilarDeals()` — find similar property deals.

---

## 7. Schema fields holding AI output

| Model | Field | Type | Writer |
|---|---|---|---|
| `Call` | `score`, `rubricScores`, `aiSummary`, `callResult`, `callOutcome`, `reasoning`, `gradingStatus`, `gradedAt`, `dealIntelHistory` | mixed | `gradeCall()` + `extractDealIntel()` |
| `Property` | `arv`, `repair_estimate`, `rental_estimate`, `neighborhood_summary`, `flood_zone`, `description`, `field_sources`, `ai_enrichment_status`, `story`, `storyUpdatedAt`, `dispoArtifacts`, `dealIntel`, `tcp_score`, `tcp_factors`, `tcp_updated_at` | mixed | `enrichPropertyWithAI()`, story gen, dispo gen, `calculateTCP()`, deal intel |
| `Seller` | `likelihoodToSellScore`, voice aggregates | mixed | `calculateTCP()` fanout, `compute-aggregates` |
| `PropertyPhoto` | `category` | enum | `classifyPhoto()` |
| `UserProfile` | full doc | json | `generateUserProfiles()` |
| `KpiSnapshot` | `metrics` | json | `kpi-snapshot.ts` |
| `KnowledgeDocument` | `embedding` | vector | `embedDocument()` |
| `AssistantSessionSummary` | full doc | text | `summarizeSession()` |
| `AiLog` | `tokens`, `cost`, `model`, `duration`, `status` | mixed | `logAiCall()` |

---

## 8. Gap analysis — where AI is missing today

### Site operations (no agent watching)
- No agent monitors cron health. If `poll-calls` silently stops firing, the only signal is delayed call grades — humans notice eventually.
- No agent watches webhook drop rate. `reconcile-ghl-pipelines` runs once at 4am — drift between drops and reconciliation is invisible.
- No agent detects stuck calls (gradingStatus=PROCESSING > 1hr). Manual scripts exist (`recover-stuck-calls.ts`, `flip-failed-to-pending.ts`) but require human invocation.
- No agent surfaces TCP anomalies (a property whose TCP jumped from 0.3 → 0.85 in a day is a buy signal — currently invisible unless someone reviews dashboards).

### Team workflow (manual today)
- **Lead triage:** New GHL leads are scored by humans (or unscored). No agent reads the contact + first touch and assigns owner / tags / urgency.
- **Followup decisions:** After a graded call, `generate-next-steps` exists but is user-triggered. No agent autonomously creates the next task or queues the next touch.
- **Buyer matching outreach:** Inventory has buyer-match logic, but actually sending the blast SMS list is manual. No agent handles the "new property → match buyers → queue vetted SMS template → log responses" loop.
- **Walkthrough scheduling:** Pure human work today. Coordinating times with sellers, blocking calendars, sending reminders.
- **Pipeline hygiene:** Properties stuck in a stage > N days are invisible. No agent surfaces them or routes to the right owner.

### GHL workflows still active (need user input — see Section 9)

---

## 9. GHL workflows still active (TO BE CONFIRMED)

Corey has indicated the following categories of GHL workflows exist and are candidates for migration into Gunner-controlled agents:

- **SMS/email drip campaigns** — time-based message sequences triggered by tags/stages/forms.
- **Stage routing & pipeline progression** — workflows that move opps between stages (no answer, voicemail, appointment set).
- **Task creation & assignment** — auto-create tasks on stage change or contact events.
- **Notifications & internal alerts** — Slack/email/SMS alerts to team (hot lead, missed call, appointment booked).

**Open question:** Need the actual list of currently active GHL workflows + their triggers + their actions. Cannot be read from code — needs export from the GHL UI.

---

## 10. Constraints & guardrails for the agent build

From `CLAUDE.md` Rule 4 (Worker Agent Architecture) and Corey's autonomy-bar feedback:

1. **Completion signal:** `stop_reason: "end_turn"` only. Never parse natural language for completion.
2. **High-stakes gates:** SMS sends, mass deletes, bulk updates → require code-level interceptors with explicit human approval. Prompt instructions are NOT security boundaries.
3. **Autonomy bar (Corey, 2026-05-11):** Customer-facing sends (SMS/email) restricted to a hard allow-list of pre-approved scenarios with vetted templates. No free-form messaging initially.
4. **Isolated context:** Every sub-agent spawn passes full context explicitly. Never assume inherited context.
5. **Self-healing tools:** All tools return structured JSON: `{status, data?, error?, suggestion?}`.
6. **Defense in depth:** Code-level role gates (`role-gates.ts` pattern) in addition to prompt-level rules.

---

## 11. Next steps

See `docs/agents/README.md` — the agent roadmap that turns this audit into a build order, with one spec doc per candidate agent.
