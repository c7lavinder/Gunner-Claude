Spawn the Senior Developer agent to fix the following bug or issue:

$ARGUMENTS

The agent must:

1. **Investigate** — Read the relevant files to understand the root cause. Do not guess — trace the actual code path that produces the bug.

2. **Fix** — Implement the minimal, focused fix. Do not refactor surrounding code or add unrelated improvements. Follow all rules in CLAUDE.md (no hardcoded credentials, no hardcoded tenant IDs, labels from playbooks).

3. **Validate** — Run `npx tsc --noEmit` and confirm 0 errors.

4. **Reality Check** — Spawn the Reality Checker agent to verify:
   - The fix addresses the reported issue
   - No regressions were introduced
   - TypeScript compiles cleanly
   - No security vulnerabilities (XSS, injection, etc.)

Do NOT commit — present the fix for review.
