# Adding a New Industry to Gunner

Step-by-step guide for adding a new industry vertical (e.g., "Roofing", "Mortgage", "Recruiting").

---

## Step 1: Create the Seed File

Create `server/seeds/{industryCode}.ts` using `server/seeds/reWholesaling.ts` as your template.

Your seed file must export a single `IndustryPlaybook` object with ALL of these fields:

| Field | Type | Description |
|---|---|---|
| `code` | `string` | Unique kebab-case identifier (e.g., `"roofing"`, `"mortgage"`) |
| `name` | `string` | Display name (e.g., `"Roofing Sales"`) |
| `terminology` | `Terminology` | What this industry calls things — Contact, Asset, Deal, Walkthrough, etc. |
| `roles` | `RoleDef[]` | At least 2 roles with code, name, description, color |
| `stages` | `StageDef[]` | At least 5 pipeline stages with code, name, pipeline, order |
| `callTypes` | `CallTypeDef[]` | At least 2 call types with code, name, description |
| `rubrics` | `RubricDef[]` | At least 1 rubric with criteria array (each criterion has name, maxPoints, description) |
| `outcomeTypes` | `string[]` | At least 4 possible call outcomes (e.g., "Appointment Set", "Not Interested") |
| `kpiFunnelStages` | `string[]` | At least 4 funnel stages for KPI tracking |
| `kpiMetrics` | `Array<{key, label}>` | Metric definitions matching the funnel stages |
| `algorithmDefaults` | `AlgorithmConfig` | Weights for inventorySort, buyerMatch, taskSort |
| `roleplayPersonas` | `RoleplayPersona[]` | At least 2 AI roleplay characters with personality, scenario, objections |
| `trainingCategories` | `TrainingCategory[]` | At least 3 training categories with code, name, description, order |
| `gradingPhilosophy` | `GradingPhilosophy` | Must include overview, criticalFailurePolicy, talkRatioGuidance, roleSpecific |
| `taskCategories` | `Array<{code, name}>` | Categories for task organization |
| `classificationLabels` | `Record<string, {label, color}>` | Colors must be "green", "red", "amber", or "gray" |

See `shared/types.ts` for the full TypeScript interfaces.

---

## Step 2: Register in the Industry Registry

Open `server/seeds/industries.ts` and:

1. Import your playbook: `import { YOUR_PLAYBOOK } from "./yourIndustry";`
2. Add it to the `ALL_INDUSTRY_PLAYBOOKS` array at the bottom of the file

---

## Step 3: Deploy

Push to the active deploy branch. On startup, `seedIndustryPlaybooks()` runs automatically and upserts your new industry into the `industry_playbooks` table. No manual migration needed.

---

## Step 4: Add a Landing Page (Optional)

Create `client/src/pages/landing/industryConfigs/{industryCode}.ts` with:

- Hero copy specific to the industry
- Feature highlights relevant to that vertical
- Social proof / testimonials if available

Then register it in the industry landing page router.

---

## Step 5: Verification Checklist

After deploying, verify each piece works:

- [ ] **Terminology** — Create a test tenant with this industry. Check that labels throughout the UI say the right things (e.g., "Homeowner" instead of "Contact")
- [ ] **Roles** — Team page shows the correct role options
- [ ] **Stages** — Inventory page shows the correct pipeline stages
- [ ] **Call Types** — Call inbox shows the correct call type filters
- [ ] **Rubrics** — Grade a test call. Verify the rubric criteria match your definitions
- [ ] **Grading Philosophy** — Check that AI grading feedback references industry-specific guidance
- [ ] **Outcome Types** — Call detail page shows the correct outcome options
- [ ] **KPI Funnel** — KPI page shows the correct funnel stages
- [ ] **KPI Metrics** — Dashboard metrics use the correct labels
- [ ] **Roleplay Personas** — Training page lists your personas with correct scenarios
- [ ] **Training Categories** — Training page shows the correct category tabs
- [ ] **Task Categories** — Today page task creation shows correct categories
- [ ] **Classification Labels** — Call cards show correct color-coded labels
- [ ] **Algorithm Config** — Inventory sort and task sort behave correctly for the industry's priorities

---

## How the Playbook Architecture Works

Gunner uses a 4-layer playbook system. Resolution order: User > Tenant > Industry > Software.

1. **Software Playbook** — Universal rules (grade scale, XP rewards, action types). Defined in `server/services/playbooks.ts`.
2. **Industry Playbook** — What you're adding. Everything that's true for this industry by default.
3. **Tenant Playbook** — Company-specific overrides. Individual companies can customize roles, stages, terminology on top of the industry defaults.
4. **User Playbook** — Per-person intelligence. Auto-updated after grading.

If an industry code lookup fails, the system falls back to `GENERIC_INDUSTRY_PLAYBOOK` in `server/services/playbooks.ts` — a basic sales coaching setup that works for any industry.
