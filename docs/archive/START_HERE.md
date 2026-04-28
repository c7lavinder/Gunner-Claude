# START_HERE.md — Gunner AI · Claude Code Prompt Guide

> This file contains the exact prompts to use with Claude Code.
> Every session starts by reading this file first.

---

## What Claude Code is doing on this project

Claude Code is the **primary developer** on Gunner AI. It reads the memory system
(`CLAUDE.md`, `PROGRESS.md`, `docs/`) before every session, builds what's needed,
fixes what's broken, and updates `PROGRESS.md` when it's done.

You direct it in plain English. It does the work.

---

## ─── DAY 1 PROMPT ───────────────────────────────────────────────────────────

> Use this the very first time. Paste the entire block into Claude Code.

```
You are the lead developer on Gunner AI — a multi-tenant SaaS for real estate 
wholesalers. The full codebase is already built and sitting in this folder.

Before doing anything else, read these files in this exact order:
1. CLAUDE.md          — rules and constraints you must follow
2. PROGRESS.md        — current build status and what's broken
3. docs/ARCHITECTURE.md — how the system is designed
4. docs/MODULES.md    — every module explained

Once you've read them, your job right now is to get this running locally.
Do it in this exact order and stop to ask me if anything is unclear:

STEP 1 — Environment setup
- Read .env.example so you understand every variable needed
- Generate a secure NEXTAUTH_SECRET (openssl rand -base64 32)
- Set NEXTAUTH_URL to http://localhost:3000
- Ask me for my Supabase credentials (I'll paste them one at a time)
- Ask me for my Anthropic API key
- Skip GHL and Resend for now — not needed to run locally
- Write all values into .env.local

STEP 2 — Database
- Run: npm run db:generate
- Run: npm run db:migrate (name it "initial" if asked)
- Open prisma/rls-policies.sql and show me the contents so I can run 
  them in Supabase SQL Editor — tell me exactly what to do
- Run: npm run db:seed

STEP 3 — Verify
- Run: npm run dev
- Confirm the server starts without errors
- Tell me which URL to open and what login credentials to use
- If there are TypeScript or import errors, fix them before telling me to open the browser

STEP 4 — Report
- Tell me exactly what's working and what still needs GHL/Resend to function
- Update PROGRESS.md to log that local setup is complete

Do not skip steps. Do not assume things worked — verify each step before moving 
to the next. If you hit an error, fix it and tell me what it was.
```

---

## ─── EVERY SESSION AFTER THAT ───────────────────────────────────────────────

> Paste this at the start of every new Claude Code session.

```
Read CLAUDE.md and PROGRESS.md before doing anything.

Today's task: [DESCRIBE WHAT YOU WANT IN PLAIN ENGLISH]

Rules:
- Follow everything in CLAUDE.md
- Check PROGRESS.md for what's already built so you don't duplicate work
- If you make a decision that isn't already in docs/DECISIONS.md, add it
- Update PROGRESS.md when you're done
```

---

## ─── TASK-SPECIFIC PROMPTS ──────────────────────────────────────────────────

Copy the one that matches what you're doing.

### Build a new feature
```
Read CLAUDE.md and PROGRESS.md first.

Build [FEATURE NAME]. Here's what it needs to do:
[DESCRIBE THE FEATURE]

Check docs/MODULES.md to see if this touches any existing module.
Check docs/DECISIONS.md before making any architectural choice.
Follow all rules in CLAUDE.md — especially tenant isolation and TypeScript strict mode.
When done, update PROGRESS.md.
```

### Fix a bug
```
Read CLAUDE.md and PROGRESS.md first.

There's a bug: [DESCRIBE THE BUG — what you did, what you expected, what happened]

Reproduce it, find the root cause, fix it properly — not just the symptom.
Add it to the Known Bugs section of PROGRESS.md if it's not already there,
then mark it resolved when fixed.
```

### Deploy to Railway
```
Read CLAUDE.md and PROGRESS.md first. Read the Deployment Checklist in PROGRESS.md.

Help me deploy Gunner AI to Railway. Work through the checklist step by step.
Ask me for credentials when needed — never guess or hardcode them.
Verify each step actually worked before moving to the next.
```

### Connect GHL
```
Read CLAUDE.md, PROGRESS.md, and docs/MODULES.md section on GHL Client & OAuth.

Help me set up the GHL Marketplace App and connect it to a tenant.
I need to:
1. Create the app in GHL developer settings
2. Get CLIENT_ID and CLIENT_SECRET
3. Set GHL_REDIRECT_URI correctly for my environment
4. Test the OAuth flow end to end
5. Verify webhooks are registered

Walk me through each step and verify it works before moving on.
```

### Run the self-audit
```
Read CLAUDE.md first.

Run the self-audit agent: npm run audit

Review the results. Fix any CRITICAL or ERROR issues immediately.
For WARNING issues, decide if they need fixing now or can go in PROGRESS.md backlog.
Update PROGRESS.md with what was found and fixed.
```

### Add a new tenant role or permission
```
Read CLAUDE.md and types/roles.ts first.

I need to [ADD ROLE / CHANGE PERMISSION]:
[DESCRIBE WHAT YOU WANT]

Remember: the permission system is the single source of truth in types/roles.ts.
Any new permission must be defined there first, then referenced in components.
Update docs/DECISIONS.md with the rationale for this change.
```

### Review and improve the codebase
```
Read CLAUDE.md, PROGRESS.md, and docs/ARCHITECTURE.md first.

Do a full code quality review. Look for:
1. Any API route missing session validation
2. Any DB query missing tenantId filter  
3. TypeScript errors or any remaining type casts
4. Unused imports or dead code
5. Anything in PROGRESS.md Known Bugs not yet fixed

Fix everything you find. Report what you changed. Update PROGRESS.md.
```

---

## ─── RULES FOR EVERY PROMPT ─────────────────────────────────────────────────

Always include these expectations when asking Claude Code to build something:

- **Read the docs first** — CLAUDE.md, PROGRESS.md, relevant section of MODULES.md
- **Don't duplicate** — check if it's already built before writing it
- **Verify it works** — run the thing, don't just write it
- **Update PROGRESS.md** — every session ends with an update
- **Follow the architecture** — no shortcuts around the patterns in CLAUDE.md

---

## ─── WHAT THE MEMORY SYSTEM IS ─────────────────────────────────────────────

| File | What it does | When to read it |
|---|---|---|
| `CLAUDE.md` | Rules, stack, hard constraints | Every session — always |
| `PROGRESS.md` | Build status, bugs, next tasks | Every session — always |
| `docs/ARCHITECTURE.md` | System design, data flows | When touching core systems |
| `docs/DECISIONS.md` | Why things are built the way they are | Before making a new architectural choice |
| `docs/MODULES.md` | Every module: inputs, outputs, gotchas | Before touching any specific module |
| `prisma/schema.prisma` | DB source of truth | Before touching the database |
| `types/roles.ts` | Permission source of truth | Before adding any access control |

Claude Code reads these files the same way a senior dev reads the wiki before 
touching an unfamiliar codebase. The better these files are, the better the output.
If something important is missing from them, add it.

---

## ─── IF SOMETHING GOES WRONG ────────────────────────────────────────────────

```
Something broke: [DESCRIBE WHAT HAPPENED]

Read CLAUDE.md and PROGRESS.md first.
Then read the error carefully before touching any code.
Tell me your diagnosis before you start fixing — I want to understand what went wrong.
Fix the root cause, not the symptom.
Update PROGRESS.md Known Bugs section when resolved.
```

---

## ─── STARTING A NEW MAJOR FEATURE (Phase 2+) ───────────────────────────────

```
Read CLAUDE.md, PROGRESS.md, docs/ARCHITECTURE.md, and docs/DECISIONS.md first.

I want to build: [FEATURE NAME]

Before writing any code:
1. Tell me how this fits into the existing architecture
2. What existing modules does it touch?
3. Do we need new DB tables? If so, show me the schema change first
4. What new permissions does this need in types/roles.ts?
5. Any decisions that need to go in docs/DECISIONS.md?

Get my approval on the plan before building anything.
Then build it, test it, and update all relevant docs.
```
