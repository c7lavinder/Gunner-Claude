// lib/ai/session-summarizer.ts
// Cross-session memory for the Role Assistant.
//
// Why this exists:
//   Conversations in AssistantMessage are partitioned by sessionDate
//   (YYYY-MM-DD). Every new day starts fresh. That breaks continuity —
//   "follow up on what we discussed yesterday" used to return nothing.
//
// What this does:
//   - summarizeSession: at end-of-session (or after N messages), generate
//     a 1-paragraph rollup of the day's conversation. Stored in
//     AssistantSessionSummary, keyed on (tenantId, userId, sessionDate).
//   - getRecentSessionMemory: load the last N daily summaries and format
//     them as a context block to inject into the next session.
//
// Trade-offs:
//   - Cheap: Haiku 4.5, max 400 tokens out, 1 call per session.
//   - Idempotent: re-running for the same day overwrites the row.
//   - Lossy: 100 messages → 1 paragraph. The full history is still in
//     AssistantMessage if anyone needs it.

import { db } from '@/lib/db/client'
import { anthropic } from '@/config/anthropic'
import { logAiCall, startTimer } from '@/lib/ai/log'
import { logFailure } from '@/lib/audit'

const SUMMARIZER_MODEL = 'claude-haiku-4-5-20251001'

/** Format: ISO YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

interface RawMessage {
  role: string
  content: string
  createdAt: Date
}

/**
 * summarizeSession — runs Haiku over the day's transcript and persists a
 * one-paragraph rollup. Idempotent; safe to call multiple times per day
 * (the latest call wins; the row is upserted).
 *
 * Returns the summary string (or null if there were no messages worth
 * summarizing, e.g. fewer than 4 turns).
 */
export async function summarizeSession(
  tenantId: string,
  userId: string,
  sessionDate: string = today(),
): Promise<string | null> {
  // Pull the day's messages.
  const messages: RawMessage[] = await db.assistantMessage.findMany({
    where: { tenantId, userId, sessionDate },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true },
    take: 200, // hard cap so a runaway session never blows the prompt
  })

  // Skip trivially short sessions — not worth the LLM call.
  if (messages.length < 4) return null

  // Format the transcript compactly. Strip empty assistant messages
  // (which can happen when the assistant only emits tool_use blocks).
  const transcript = messages
    .filter(m => m.content?.trim().length > 0)
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 800)}`)
    .join('\n\n')

  if (!transcript.trim()) return null

  const systemPrompt = `You write 1-paragraph memory summaries of AI assistant conversations.

The summary will be loaded as context in future conversations so the assistant remembers what was discussed. Be specific, mention names/addresses/numbers, and capture decisions and open threads.

Rules:
- 3-5 sentences MAX. No bullet points.
- Lead with the user's main goal or topic.
- Mention specific entities by name (people, properties, deals).
- Note any commitments made or actions taken.
- End with anything still open or pending.
- Past tense. Third person ("the user asked about X").
- No fluff. No restating context the reader already has.`

  const timer = startTimer()
  let summary: string | null = null
  let keyFacts: string[] = []

  try {
    const resp = await anthropic.messages.create({
      model: SUMMARIZER_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation from ${sessionDate}:\n\n${transcript}\n\nReturn exactly two sections:\nSUMMARY: <one paragraph>\nKEY_FACTS: <comma-separated list of 3-6 specific facts (names, addresses, decisions)>`,
        },
      ],
    })

    const text = resp.content.find(b => b.type === 'text')
    if (text && text.type === 'text') {
      const raw = text.text.trim()
      const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*KEY_FACTS:|$)/i)
      const keyFactsMatch = raw.match(/KEY_FACTS:\s*([\s\S]*)/i)
      summary = summaryMatch?.[1]?.trim() || raw
      if (keyFactsMatch?.[1]) {
        keyFacts = keyFactsMatch[1]
          .split(/[,\n]/)
          .map(s => s.trim().replace(/^[-*]\s*/, ''))
          .filter(s => s.length > 0 && s.length < 200)
          .slice(0, 8)
      }
    }

    // Reuse 'assistant_chat' as the type — the logAiCall enum is narrow
    // and adding a new value would force a migration. Recognizable via
    // input prefix ("Summarize this conversation from <date>") if a future
    // dashboard wants to filter.
    await logAiCall({
      tenantId, userId,
      type: 'assistant_chat',
      pageContext: 'session_summary',
      input: transcript.slice(0, 1000),
      output: summary ?? '',
      tokensIn: resp.usage?.input_tokens,
      tokensOut: resp.usage?.output_tokens,
      durationMs: timer(),
      model: SUMMARIZER_MODEL,
    }).catch(err => logFailure(tenantId, 'session_summary.log_failed', 'aiLog', err))
  } catch (err) {
    await logFailure(tenantId, 'session_summary.generation_failed', `user:${userId}`, err)
    return null
  }

  if (!summary) return null

  // Upsert — latest summary for the day wins.
  await db.assistantSessionSummary.upsert({
    where: { tenantId_userId_sessionDate: { tenantId, userId, sessionDate } },
    create: { tenantId, userId, sessionDate, summary, keyFacts, messageCount: messages.length },
    update: { summary, keyFacts, messageCount: messages.length },
  }).catch(err => logFailure(tenantId, 'session_summary.upsert_failed', `user:${userId}`, err))

  return summary
}

/**
 * getRecentSessionMemory — load up to N most-recent prior daily summaries
 * for this user, EXCLUDING today. Returns a context block ready to append
 * to a system prompt, or empty string if there are no summaries to load.
 *
 * Capped to look back 30 days. Anything older is not load-bearing memory
 * and would just bloat the prompt.
 */
export async function getRecentSessionMemory(
  tenantId: string,
  userId: string,
  limit = 3,
): Promise<string> {
  const cutoff = daysAgoIso(30)
  const summaries = await db.assistantSessionSummary.findMany({
    where: {
      tenantId,
      userId,
      sessionDate: { gte: cutoff, lt: today() },
      // Phase 5 (Session 86): respect user's "Forget this conversation"
      // choice. Excluded rows stay in the table for audit but never
      // re-enter the prompt.
      excludedFromHistory: false,
    },
    orderBy: { sessionDate: 'desc' },
    take: Math.max(1, Math.min(limit, 7)),
    select: { sessionDate: true, summary: true, keyFacts: true },
  })

  if (summaries.length === 0) return ''

  // Phase 5: log every memory injection for privacy audit. Fire-and-forget
  // so memory loading stays fast.
  void db.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'assistant.memory.loaded',
      resource: 'assistant_session_summary',
      source: 'SYSTEM',
      severity: 'INFO',
      payload: {
        summariesInjected: summaries.length,
        dates: summaries.map((s) => s.sessionDate),
      },
    },
  }).catch((err) => logFailure(tenantId, 'assistant.memory.audit_failed', `user:${userId}`, err))

  const formatted = summaries.map(s => {
    const facts = Array.isArray(s.keyFacts) && s.keyFacts.length > 0
      ? `\n  Key facts: ${(s.keyFacts as string[]).join('; ')}`
      : ''
    return `[${s.sessionDate}] ${s.summary}${facts}`
  }).join('\n\n')

  return `\nPRIOR CONVERSATIONS WITH THIS USER (memory):\n${formatted}\n\nUse this only if the user references something we discussed before. Don't bring it up unprompted.`
}

/**
 * Phase 5: user-controlled "forget" — mark a session summary as excluded
 * from future memory injection. Row is preserved for audit but
 * getRecentSessionMemory will skip it.
 *
 * Tenant + user scoping enforced by the caller (API route uses withTenant
 * + checks ownership before invoking).
 */
export async function forgetSession(
  tenantId: string,
  userId: string,
  sessionDate: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const existing = await db.assistantSessionSummary.findUnique({
    where: { tenantId_userId_sessionDate: { tenantId, userId, sessionDate } },
    select: { id: true, excludedFromHistory: true },
  })
  if (!existing) return { ok: false, reason: 'no_summary_for_date' }
  if (existing.excludedFromHistory) return { ok: true } // idempotent

  await db.assistantSessionSummary.update({
    where: { id: existing.id },
    data: { excludedFromHistory: true, excludedAt: new Date() },
  })

  await db.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'assistant.memory.forgotten',
      resource: 'assistant_session_summary',
      resourceId: existing.id,
      source: 'USER',
      severity: 'INFO',
      payload: { sessionDate },
    },
  }).catch((err) => logFailure(tenantId, 'assistant.memory.forget_audit_failed', `user:${userId}`, err))

  return { ok: true }
}

/**
 * Background trigger — fire-and-forget summary refresh. Called from the
 * assistant route after every Nth user message so the summary stays
 * roughly current within the day. Idempotent.
 */
export function scheduleSessionSummary(tenantId: string, userId: string): void {
  // Run in background. We don't await — the user's response shouldn't
  // wait on the summarizer. Errors are logged inside summarizeSession.
  void summarizeSession(tenantId, userId).catch(() => undefined)
}
