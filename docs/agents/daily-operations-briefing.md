# daily-operations-briefing

> Wave: 2
> Status: spec
> Risk: low
> Replaces: reps figuring out where to start each morning (currently looking at Day Hub but no synthesis)

## 1. Purpose

Each morning, per user, generate a 5-bullet "here's your day" briefing: hottest leads, follow-ups due, buy signals, properties at risk, and one priority action. Internal-only — read in Day Hub.

## 2. Trigger

Cron, daily at 5:30am tenant-local time (`30 11 * * *` if tenants are US Eastern; will need per-tenant timezone handling).

```toml
[[cron]]
name = "daily-operations-briefing"
schedule = "30 11 * * *"
command = "npx tsx scripts/agents/daily-operations-briefing.ts"
```

(Schedule timezone TBD when multi-tenant rolls out.)

## 3. Inputs

- For each user:
  - Open tasks in their Day Hub (today + overdue).
  - Buy signals assigned to them (from `tcp-anomaly-surfacer`).
  - Properties at risk assigned to them (from `pipeline-janitor`).
  - Yesterday's call grades (top + bottom + total).
  - Appointments scheduled today.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getUserDayContext(userId, date)` | inputs | bundle of tasks, signals, risks, calls, appointments |
| `getYesterdayPerformance(userId)` | id | call count, avg score, deals advanced |
| `composeBriefing(context)` | context | LLM-generated 5-bullet summary |
| `saveBriefing(userId, date, content)` | inputs | writes `daily_briefings(userId, date, body, generatedAt)` |

## 5. Outputs

- `daily_briefings` row per user per day.
- Surfaced as a card on `/(tenant)/[tenant]/dashboard` and at the top of Day Hub.
- Optional: posted to `internal-alert-hub` (Wave 2) for in-app notification.

## 6. Approval gates

Fully autonomous. Internal-only. Worst case: low-value briefing — user ignores.

## 7. Completion signal

`stop_reason: "end_turn"`. Per user: gather → compose → save → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| User has zero activity (new user, vacation) | Generate a "welcome" or "no activity today" briefing. |
| LLM returns malformed JSON | Fall back to a template-only briefing (no LLM polish). |
| User logged in zero days this month | Skip; don't waste tokens. |

## 9. Test plan

- **Unit:** Briefing composition for: high-activity user, low-activity user, no-activity user.
- **Integration:** Fixture 10 users with varied activity. Run agent. Verify each gets an appropriate briefing.
- **Production rollout:** Generate but don't surface for 1 week. Manual review of briefings for quality. Then surface.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/daily-operations-briefing.ts`
  - `lib/agents/daily-operations-briefing/{index,tools}.ts`
  - `prisma/schema.prisma` — add `DailyBriefing` model.
- **Model:** `claude-haiku-4-5-20251001` (short generative task; quality bar is low — "this is fine" beats "this is silent").
- **Cost:** ~$0.10 per user per day. At 5 users/tenant = $15/month per tenant.
