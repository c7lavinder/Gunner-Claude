# Test Suite Audit Results (2026-03-07)

## Summary
- **Total test files:** 149
- **Passed files:** 143+ (only 5 files have actual failures)
- **Failed files:** 5

## Failing Tests

### 1. taskCenter.test.ts (3 of 107 failed)
- Phone-based inbox filtering — frontend LeftPanel > builds rolePhoneNumbers set from team members lcPhones
- Phone-based inbox filtering — frontend LeftPanel > filters conversations by teamPhone matching rolePhoneNumbers
- Phone-based inbox filtering — frontend LeftPanel > falls back to assignedTo when teamPhone is not available
**Root cause:** Likely test assertion mismatch after refactoring inbox filtering

### 2. emailService.test.ts (7 of 11 failed)
- sendEmail tests for password reset, team invite, welcome, churn outreach
- Email template content tests
**Root cause:** Email sending was disabled (Resend removed) after spam attack. Tests expect Resend to work.

### 3. loops.test.ts (2 of 3 failed)
- Loops API key validation and integration
**Root cause:** External API dependency (Loops) — no key configured

### 4. resendApiKey.test.ts (2 of 2 failed)
- Resend API key validation
**Root cause:** Resend was intentionally removed after spam attack

### 5. batchDialerAgents.test.ts (1 of 1 failed)
- Timeout after 60s
**Root cause:** External API call to BatchDialer timing out

## Analysis
- **3 of 5 failures are expected** (email/Resend/Loops disabled after spam attack)
- **1 failure is external API timeout** (BatchDialer agents)
- **1 failure needs fixing** (taskCenter phone-based filtering — 3 tests)
