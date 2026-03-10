---
name: Fix Bug
description: Diagnose and fix a bug in the Gunner codebase
---

# Fix Bug Skill

## Steps
1. Read CLAUDE.md first to understand the stack
2. Identify the affected file(s) — check client/src/pages/, server/, or server/routers.ts
3. Read the broken code carefully before changing anything
4. Make the minimal surgical fix — don't refactor unrelated code
5. Run `npx tsc --noEmit` — must show 0 errors before committing
6. Commit with message: `fix: <short description>`
7. Push to `manus-migration` branch
8. Confirm Railway deploy triggered

## Rules
- Never touch `main` branch
- Never hardcode credentials — use process.env.*
- Never hardcode tenant ID 1 — always multi-tenant safe
- If fixing frontend: changes go in client/src/
- If fixing backend/API: changes go in server/ or server/routers.ts
- If fixing DB schema: edit drizzle/schema.ts → run `npm run db:generate` → `npm run db:migrate`
