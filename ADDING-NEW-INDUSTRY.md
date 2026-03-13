# Adding a New Industry to Gunner

## Overview
Each industry in Gunner gets a complete playbook that drives grading rubrics, AI coaching, terminology, roles, stages, and more. Adding a new industry is a data-only task — no code changes required.

## Steps

### 1. Create the industry seed file
Create `server/seeds/{industryCode}.ts` using `server/seeds/reWholesaling.ts` as a template.

Required fields:
- `code` — unique slug (e.g., "solar", "insurance", "roofing")
- `name` — display name (e.g., "Solar Installation")
- `terminology` — contact/asset/deal/walkthrough terms for this industry
- `roles` — at least 2 roles with code, name, description, color
- `stages` — at least 5 pipeline stages with code, name, order
- `callTypes` — at least 2 call types with code, name, description
- `rubrics` — at least 1 rubric per call type, each with criteria array (name, maxPoints, description)
- `gradingPhilosophy` — overview, criticalFailurePolicy, talkRatioGuidance, roleSpecific (keyed by role code)
- `outcomeTypes` — at least 4 (positive, neutral, negative, not reached)
- `kpiFunnelStages` — at least 4 stages for the KPI funnel
- `roleplayPersonas` — at least 2 personas for training
- `trainingCategories` — at least 3 categories
- `algorithmDefaults` — inventorySort, taskSort (with keys matching your roles), buyerMatch
- `taskCategories` — at least 3
- `classificationLabels` — labels and colors for call outcomes
- `kpiMetrics` — metrics tracked on the KPI page

### 2. Register in the industry registry
In `server/seeds/industries.ts`, import your playbook and add it to `ALL_INDUSTRY_PLAYBOOKS`.

### 3. Deploy
Push to production. `seedIndustryPlaybooks()` runs automatically on every deploy and upserts the new industry.

### 4. Add a landing page (optional)
Create `client/src/pages/landing/industryConfigs/{code}.ts` with hero text, features, and testimonials.

### 5. Verify
- [ ] Terminology appears correctly on all pages
- [ ] Grading uses the industry rubric (not generic fallback)
- [ ] AI Coach uses industry-specific terms
- [ ] Roleplay uses industry personas
- [ ] KPI page shows industry metrics
- [ ] Pipeline stages match the industry
