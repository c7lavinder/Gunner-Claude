---
name: Add Feature
description: Plan and build a new feature for Gunner
---

# Add Feature Skill

## Steps
1. Read `CLAUDE.md` first — understand the stack and 4-layer playbook architecture
2. Read `BUILD-STATUS.md` — check if this feature already exists or is partially built
3. Read `REBUILD-PLAN.md` — check if the feature is specified there (follow the spec)
4. **PLAN FIRST** — before writing any code, output a plan:
   - What files will be created or modified?
   - What DB schema changes are needed (if any)?
   - What API endpoints are needed (which router)?
   - What frontend components/pages are needed?
   - Does it need playbook integration?
   - Any risks or dependencies?
5. Wait for approval before building
6. Build backend first (router + service), then frontend
7. If schema changes: edit `drizzle/schema.ts` + add DDL to `server/seeds/startupMigrations.ts`
8. Run `npx tsc --noEmit` — 0 errors required
9. Commit: `feat: <description>`
10. Push to `manus-migration`

## Where Things Go
- **New API endpoints:** Add to the appropriate router in `server/routers/` (calls.ts, inventory.ts, team.ts, etc.)
- **New business logic:** Add to `server/services/<name>.ts` — keep routers thin
- **New CRM actions:** Add to `server/crm/ghl/ghlAdapter.ts` (behind the adapter interface)
- **New algorithms:** Add to `server/algorithms/` with a config object at the top
- **New scheduled jobs:** Add to `server/services/scheduledJobs.ts`
- **New pages:** Add to `client/src/pages/`
- **New reusable components:** Add to `client/src/components/`
- **New hooks:** Add to `client/src/hooks/`
- **Shared types:** Add to `shared/types.ts`

## Rules
- Always multi-tenant: never hardcode tenantId
- All env vars via `ENV` from `server/_core/env.ts` — never raw process.env
- Labels from playbooks via `useTenantConfig` hook — never hardcoded strings
- All CRM actions go through `ActionConfirmDialog` — no silent actions
- Never merge to main without Corey's explicit approval
