---
name: Add Feature
description: Plan and build a new feature for Gunner
---

# Add Feature Skill

## Steps
1. Read CLAUDE.md first
2. **PLAN FIRST** — before writing any code, output a plan:
   - What files will be created or modified?
   - What DB schema changes are needed (if any)?
   - What API endpoints are needed?
   - What frontend components are needed?
   - Any risks or dependencies?
3. Wait for approval before building
4. Build backend first, then frontend
5. If schema changes: edit drizzle/schema.ts → `npm run db:generate` → `npm run db:migrate`
6. If new API endpoint: add to server/routers.ts
7. Run `npx tsc --noEmit` — 0 errors required
8. Commit: `feat: <description>`
9. Push to `manus-migration`

## Rules
- Always multi-tenant: never hardcode tenantId=1
- All env vars in server/_core/env.ts — never raw process.env in business logic
- New pages go in client/src/pages/
- New reusable components go in client/src/components/
- New server services go in server/<name>.ts
- Never merge to main without Corey's explicit approval
