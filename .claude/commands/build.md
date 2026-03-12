Spawn the Agents Orchestrator to run a complete development pipeline for the following task:

$ARGUMENTS

The orchestrator must follow this pipeline in order:

1. **Context Loading** — Read REBUILD-PLAN.md and BUILD-STATUS.md to understand the full spec and current progress. Read CLAUDE.md for codebase rules and architecture.

2. **Backend Architecture** — If the task involves any server, database, API, or service work, spawn the Backend Architect agent to design and implement the backend changes. This includes schema updates, tRPC routers, services, startup migrations, and seed data. All work must follow the four-playbook architecture and use Drizzle ORM conventions.

3. **Frontend Development** — If the task involves any UI, page, component, or hook work, spawn the Frontend Developer agent to implement the frontend changes. This includes React pages, hooks, components, and styling with TailwindCSS + shadcn/ui. All labels must come from useTenantConfig, never hardcoded.

4. **Validation** — Spawn the Reality Checker agent to validate the completed work:
   - Run `npx tsc --noEmit` — must be 0 errors
   - Verify no hardcoded tenant IDs, credentials, or labels
   - Verify all new tables have idempotent CREATE TABLE IF NOT EXISTS in startupMigrations.ts
   - Verify all CRM actions go through ActionConfirmDialog
   - Check that the implementation matches the spec in REBUILD-PLAN.md

Each stage must pass before advancing to the next. If any stage fails, fix the issues before proceeding. Do NOT commit — present the final result for review.

After all stages complete, update BUILD-STATUS.md to reflect the new work.
