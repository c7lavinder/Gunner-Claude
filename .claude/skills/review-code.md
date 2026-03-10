---
name: Review Code
description: Review recently changed code for bugs, security issues, and quality
---

# Review Code Skill

## Steps
1. Run `git diff HEAD~1` to see what changed
2. Review with zero bias — pretend you didn't write this code
3. Check for:
   - Hardcoded credentials or tenant IDs
   - TypeScript errors (`npx tsc --noEmit`)
   - Missing error handling (unhandled promises, no try/catch)
   - SQL injection risks (raw queries without parameterization)
   - Logic bugs — does it handle edge cases?
   - Multi-tenant safety — is every DB query scoped by tenantId?
   - Env var usage — all secrets via process.env?
4. Output findings as: CRITICAL / WARNING / SUGGESTION
5. Fix all CRITICAL issues immediately
6. Report WARNINGs and SUGGESTIONs to Corey for decision

## Automatic Fails (must fix before push)
- Any hardcoded secret key, API key, or password
- Any raw `tenantId = 1` in business logic
- TypeScript errors
- Unhandled promise rejections in API routes
