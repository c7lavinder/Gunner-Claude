---
name: Fix Bug
description: Diagnose and fix a bug in the Gunner codebase
---

# Fix Bug Skill

## Steps
1. Read `CLAUDE.md` first to understand the stack and directory structure
2. Identify the affected area:
   - **Frontend pages:** `client/src/pages/`
   - **Frontend components:** `client/src/components/`
   - **API endpoints:** `server/routers/` (12 focused router files)
   - **Business logic:** `server/services/` (grading, gamification, playbooks, etc.)
   - **CRM integration:** `server/crm/ghl/ghlAdapter.ts`
   - **Webhooks:** `server/middleware/webhook.ts`
   - **Database schema:** `drizzle/schema.ts`
3. Read the broken code carefully before changing anything
4. Make the minimal surgical fix — don't refactor unrelated code
5. Run `npx tsc --noEmit` — must show 0 errors before committing
6. Commit with message: `fix: <short description>`
7. Push to `manus-migration` branch
8. Confirm Railway deploy triggered (auto-deploys in ~3 min)

## Key Router → Service Mapping
| Router | Service | Domain |
|---|---|---|
| `routers/calls.ts` | `services/grading.ts` | Call grading pipeline |
| `routers/inventory.ts` | `algorithms/inventorySort.ts` | Property pipeline |
| `routers/gamification.ts` | `services/gamification.ts` | XP, badges, streaks |
| `routers/training.ts` | `services/playbooks.ts` | Roleplay, materials |
| `routers/settings.ts` | `services/ghlOAuth.ts` | CRM OAuth connection |
| `routers/actions.ts` | `crm/ghl/ghlAdapter.ts` | CRM write-back |

## Rules
- Never touch `main` branch
- Never hardcode credentials — use `ENV` from `server/_core/env.ts`
- Never hardcode tenant ID — always multi-tenant safe
- If fixing DB schema: edit `drizzle/schema.ts` + add DDL to `server/seeds/startupMigrations.ts`
