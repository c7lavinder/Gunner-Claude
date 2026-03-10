---
name: Deploy Check
description: Pre-deploy checklist — run before every push to ensure clean deploy
---

# Deploy Check Skill

## Run These In Order

1. **TypeScript** — `npx tsc --noEmit` → must be 0 errors
2. **Build** — `npm run build` → must succeed
3. **Branch check** — `git branch --show-current` → must be `manus-migration`, never `main`
4. **Diff review** — `git diff HEAD` → scan for accidental debug code, console.logs, hardcoded values
5. **Commit** — meaningful message: `fix:`, `feat:`, `docs:`, `refactor:`
6. **Push** — `git push origin manus-migration`
7. **Confirm deploy** — Railway auto-deploys in ~3 min; staging URL: https://gunner-app-production.up.railway.app

## If Build Fails
- Read the error carefully
- Fix the specific error — don't change unrelated code
- Re-run tsc check
- Only push when clean

## Never
- Push directly to `main`
- Push with TypeScript errors
- Push with hardcoded secrets
