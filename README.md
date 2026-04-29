# Gunner AI

Internal repo. Production at `[PRODUCTION_URL]` (real value lives in Railway env + `.env.local`).

This README is for agents and the team. No marketing surface — what Gunner is and how it works lives in the orientation docs below.

## Reading order

1. **CLAUDE.md** — non-negotiable rules (8 rules + hard tech rules) + Session Start Protocol.
2. **AGENTS.md** — agent conventions (worker pattern, `withTenant`, tool contract, heartbeat).
3. **PROGRESS.md** — current session, What's Built, Known Bugs, Next Session pointer.
4. **docs/SYSTEM_MAP.md** — current architecture snapshot (philosophy, stack, modules, AI layer, call pipeline, safety gates).
5. **docs/OPERATIONS.md** — current operational state (crons, page roster, API surface, blockers, hygiene scripts, schema log).
6. **docs/DECISIONS.md** — only when about to reverse or extend an architectural decision.
7. **docs/AUDIT_PLAN.md** — only when working on an active blocker or audit item.

Older sessions: `docs/SESSION_ARCHIVE.md`. Superseded orientation docs: `docs/archive/`.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in all values
npm run db:generate
npm run db:migrate
npm run dev                   # localhost:3000
```

If rebasing across multiple sessions of remote work, also run `npx prisma generate && npm install` to sync local env (lesson learned in the docs reorg sprint, 2026-04-27 — stale Prisma client + missing deps produce false tsc errors).
