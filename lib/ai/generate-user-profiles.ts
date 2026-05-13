// lib/ai/generate-user-profiles.ts
// Weekly auto-generation of user performance profiles from real call data.
// Analyzes rubric scores, coaching feedback, and patterns to build
// personalized profiles that feed into grading + coaching prompts.
//
// Called by: scripts/generate-profiles.ts (weekly cron) or POST /api/admin/generate-profiles
// WRITES TO: user_profiles table (upsert per user)
// READ BY: context-builder.ts → grading, assistant, coach

import { db } from '@/lib/db/client'
import { logAiCall, startTimer } from '@/lib/ai/log'
import { logFailure } from '@/lib/audit'
import { anthropic } from '@/config/anthropic'
import {
  buildUserProfileSystemPrompt,
  VERSION as USER_PROFILE_PROMPT_VERSION,
} from '@/lib/ai/prompts/user-profile'
import {
  buildSettingsContext,
  formatSettingsForPrompt,
} from '@/lib/ai/settings-context'

export { USER_PROFILE_PROMPT_VERSION }

interface ProfileAnalysis {
  strengths: string[]
  weaknesses: string[]
  commonMistakes: string[]
  communicationStyle: string
  coachingPriorities: string[]
}

/**
 * Canonical grouping key for a rubric category — case-insensitive,
 * punctuation- and whitespace-insensitive, with parenthesized unit
 * annotations stripped. Used to dedupe variants from different
 * call-type rubrics. Examples:
 *   "Opening" / "opening" / "OPENING"                  → "opening"
 *   "Opening (max 15 pts)" / "Opening (Max 20 pts)"    → "opening"
 *   "Next Steps" / "Next steps" / "nextSteps"          → "nextsteps"
 *   "Speed & Energy" / "speedAndEnergy"                → "speedandenergy"
 * "Next Steps & Timeline" stays distinct from "Next Steps" — those
 * are genuinely different rubric concepts.
 */
function normalizeRubricKey(category: string): string {
  return category
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/&/g, 'and')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Strip the same parenthesized unit annotations from the display label
 * so the output looks clean ("Opening" not "Opening (max 15 pts)").
 */
function cleanRubricLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}

/**
 * Given a frequency map of original-cased category labels seen across
 * graded calls, pick the most readable variant for the output
 * scoringPatterns key. Preference order:
 *   1. Highest frequency (the form the team uses most).
 *   2. Contains whitespace (natural English beats camelCase).
 *   3. Title Case beats all-lowercase.
 *   4. Lexicographic — deterministic tie-break.
 */
function chooseRubricLabel(labels: Record<string, number>): string {
  const entries = Object.entries(labels)
  if (entries.length === 1) return entries[0][0]
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    const aSp = /\s/.test(a[0]) ? 1 : 0
    const bSp = /\s/.test(b[0]) ? 1 : 0
    if (aSp !== bSp) return bSp - aSp
    const aTitle = /^[A-Z]/.test(a[0]) ? 1 : 0
    const bTitle = /^[A-Z]/.test(b[0]) ? 1 : 0
    if (aTitle !== bTitle) return bTitle - aTitle
    return a[0].localeCompare(b[0])
  })
  return entries[0][0]
}

export async function generateUserProfiles(tenantId: string): Promise<{
  updated: number
  skipped: number
  errors: string[]
}> {
  const results = { updated: 0, skipped: 0, errors: [] as string[] }

  // Get all users with graded calls
  const users = await db.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, role: true },
  })

  for (const user of users) {
    try {
      // Get all graded calls for this user (last 90 days)
      const calls = await db.call.findMany({
        where: {
          tenantId,
          assignedToId: user.id,
          gradingStatus: 'COMPLETED',
          score: { not: null },
          calledAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { calledAt: 'desc' },
        select: {
          score: true,
          rubricScores: true,
          aiFeedback: true,
          aiCoachingTips: true,
          callType: true,
          callOutcome: true,
          calledAt: true,
        },
      })

      if (calls.length === 0) {
        results.skipped++
        continue // No graded calls — can't generate profile
      }

      // Aggregate rubric scores across all calls.
      // Phase 6 fix (Session 87): rubricScores is Record<category, {score,
      // maxScore, notes}> — not Record<category, number>. The legacy
      // implementation tested `typeof score !== 'number'` and skipped every
      // entry, producing empty rubricAverages. Now we walk into .score on
      // each object, with a number-typed fallback for any old rows that
      // stored the flat shape.
      //
      // Session 88 fix: rubric category keys vary across call types
      // ("Opening" vs "opening" vs "openingAndRapport" — same concept,
      // 3 distinct keys). Aggregating raw keys produced 30+ entries with
      // case/space duplicates per user. Normalize for grouping
      // (lowercase + strip non-alphanumeric) then pick the most readable
      // variant seen as the display label.
      const rubricBuckets: Record<
        string,
        { total: number; count: number; labels: Record<string, number> }
      > = {}
      for (const call of calls) {
        const scores = call.rubricScores as Record<string, unknown> | null
        if (!scores) continue
        for (const [category, raw] of Object.entries(scores)) {
          let n: number | null = null
          if (typeof raw === 'number' && Number.isFinite(raw)) {
            n = raw
          } else if (raw && typeof raw === 'object') {
            const s = (raw as Record<string, unknown>).score
            if (typeof s === 'number' && Number.isFinite(s)) n = s
          }
          if (n === null) continue
          const key = normalizeRubricKey(category)
          if (!key) continue
          if (!rubricBuckets[key]) rubricBuckets[key] = { total: 0, count: 0, labels: {} }
          rubricBuckets[key].total += n
          rubricBuckets[key].count++
          rubricBuckets[key].labels[category] = (rubricBuckets[key].labels[category] ?? 0) + 1
        }
      }

      const rubricAverages: Record<string, number> = {}
      for (const data of Object.values(rubricBuckets)) {
        const label = cleanRubricLabel(chooseRubricLabel(data.labels))
        rubricAverages[label] = Math.round(data.total / data.count)
      }

      // Collect all coaching feedback
      const allFeedback: string[] = []
      const allTips: string[] = []
      for (const call of calls.slice(0, 20)) { // Cap at 20 most recent
        if (call.aiFeedback) {
          try {
            const feedback = typeof call.aiFeedback === 'string'
              ? JSON.parse(call.aiFeedback)
              : call.aiFeedback
            if (feedback.redFlags) allFeedback.push(...(feedback.redFlags as string[]))
            if (feedback.improvements) allFeedback.push(...(feedback.improvements as string[]))
            if (feedback.strengths) allFeedback.push(...(feedback.strengths as string[]))
          } catch (err) {
            logFailure(tenantId, 'generate_profiles.parse_feedback_failed', `user:${user.id}`, err)
          }
        }
        if (call.aiCoachingTips) {
          const tips = call.aiCoachingTips as string[]
          allTips.push(...tips)
        }
      }

      // Calculate score trends (30/60/90 day)
      const now = Date.now()
      const last30 = calls.filter(c => c.calledAt && now - c.calledAt.getTime() < 30 * 86400000)
      const last60 = calls.filter(c => c.calledAt && now - c.calledAt.getTime() < 60 * 86400000)
      const avg = (arr: typeof calls) => arr.length > 0
        ? Math.round(arr.reduce((s, c) => s + (c.score ?? 0), 0) / arr.length)
        : null

      const improvementVelocity = {
        avg30: avg(last30),
        avg60: avg(last60),
        avg90: avg(calls),
        count30: last30.length,
        count60: last60.length,
        count90: calls.length,
      }

      // Check for existing profile — skip if manually edited (preserve user's changes)
      const existingProfile = await db.userProfile.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { strengths: true, weaknesses: true, commonMistakes: true, communicationStyle: true, coachingPriorities: true, profileSource: true },
      })
      if (existingProfile?.profileSource === 'manual') {
        results.skipped++
        continue // Don't overwrite manually edited profiles
      }
      const existingContext = existingProfile
        ? `\nEXISTING PROFILE (from ${existingProfile.profileSource}):\nStrengths: ${(existingProfile.strengths as string[]).join('; ')}\nWeaknesses: ${(existingProfile.weaknesses as string[]).join('; ')}\nStyle: ${existingProfile.communicationStyle ?? 'Unknown'}\nUpdate this profile with any new patterns from the call data. Keep existing insights that still apply.`
        : ''

      // Use Claude to synthesize a profile from the data
      const timer = startTimer()
      const rubricSection = Object.keys(rubricAverages).length > 0
        ? `Rubric category averages:\n${Object.entries(rubricAverages).map(([cat, avg]) => `- ${cat}: ${avg}/100`).join('\n')}`
        : 'No rubric scores available yet.'
      const feedbackSection = allFeedback.length > 0
        ? `Recent coaching feedback themes:\n${allFeedback.slice(0, 30).join('\n')}`
        : 'No coaching feedback yet.'
      const tipsSection = allTips.length > 0
        ? `Recent coaching tips given:\n${allTips.slice(0, 20).join('\n')}`
        : 'No coaching tips yet.'

      const prompt = `Rep: ${user.name} (${user.role?.replace(/_/g, ' ') ?? 'Unknown Role'})
Total graded calls (90 days): ${calls.length}
Score trend: 30-day avg ${improvementVelocity.avg30 ?? 'N/A'} | 60-day avg ${improvementVelocity.avg60 ?? 'N/A'} | 90-day avg ${improvementVelocity.avg90 ?? 'N/A'}

${rubricSection}

${feedbackSection}

${tipsSection}

Call outcomes: ${Object.entries(calls.reduce((acc, c) => {
  const outcome = c.callOutcome ?? 'unknown'
  acc[outcome] = (acc[outcome] ?? 0) + 1
  return acc
}, {} as Record<string, number>)).map(([k, v]) => `${k}: ${v}`).join(', ') || 'No outcomes yet'}
${existingContext}

Generate a coaching profile as JSON. If data is limited, use the existing profile and role-based defaults. Always return valid JSON.`

      // Phase 6 (Session 87): inject tenant settings (markets + KPI vocab)
      // so the coaching AI calibrates "good" against the tenant's actual
      // KPI targets (e.g. LEAD_MANAGER 150 dials / 20 convos / 3 appts).
      // Best-effort — settings fetch failure falls through.
      let settingsBlock: string | undefined
      try {
        const settings = await buildSettingsContext({ tenantId, userId: user.id })
        settingsBlock = formatSettingsForPrompt(settings, 1500)
      } catch (err) {
        logFailure(tenantId, 'generate_profiles.settings_load_failed', `user:${user.id}`, err)
      }

      // Session 88: bumped from 1000 → 2000. At 1000, real profile JSON
      // (5 strengths + 5 weaknesses + 5 commonMistakes + style sentence +
      // 5 coachingPriorities, each ~30-60 tokens) truncates mid-array on
      // every call, the closing `}` never lands, and the parse regex
      // silently drops the entire result. Verified via _phase6-profile-debug.ts.
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: buildUserProfileSystemPrompt({ settingsBlock }),
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'

      logAiCall({
        tenantId, userId: user.id,
        type: 'property_enrich', // closest type
        pageContext: `user-profile:${user.id}`,
        input: `Generate profile for ${user.name}`,
        output: text.slice(0, 2000),
        tokensIn: response.usage?.input_tokens,
        tokensOut: response.usage?.output_tokens,
        durationMs: timer(),
        model: 'claude-sonnet-4-6',
      }).catch((err) => {
        logFailure(tenantId, 'generate_profiles.profile_log_failed', `user:${user.id}`, err)
      })

      // Session 88 fix: parse AI response separately from mechanical fields.
      // Mechanical fields (scoringPatterns + improvementVelocity +
      // totalCallsGraded) come from real call data — they shouldn't be
      // blocked by an AI parse failure. The legacy code silently dropped
      // them on every parse miss, which (a) hid real errors behind
      // results.skipped++ and (b) prevented rubric-key normalization from
      // taking effect when the AI flaked. Now: always upsert mechanical
      // fields. Only upsert AI-narrative fields when parsing succeeded.
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      let profile: ProfileAnalysis | null = null
      let parseFailureReason: string | null = null
      if (!match) {
        parseFailureReason = 'No JSON in AI response'
      } else {
        try {
          profile = JSON.parse(match[0]) as ProfileAnalysis
        } catch (parseErr) {
          parseFailureReason =
            parseErr instanceof Error
              ? `Invalid JSON in AI response: ${parseErr.message}`
              : 'Invalid JSON in AI response'
        }
      }

      const mechanicalFields = {
        scoringPatterns: rubricAverages,
        improvementVelocity,
        totalCallsGraded: calls.length,
      }

      if (profile) {
        // AI parse succeeded — full update with both narrative + mechanical.
        await db.userProfile.upsert({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          create: {
            tenantId,
            userId: user.id,
            strengths: profile.strengths,
            weaknesses: profile.weaknesses,
            commonMistakes: profile.commonMistakes,
            communicationStyle: profile.communicationStyle,
            coachingPriorities: profile.coachingPriorities,
            ...mechanicalFields,
            profileSource: 'auto',
          },
          update: {
            strengths: profile.strengths,
            weaknesses: profile.weaknesses,
            commonMistakes: profile.commonMistakes,
            communicationStyle: profile.communicationStyle,
            coachingPriorities: profile.coachingPriorities,
            ...mechanicalFields,
            profileSource: 'auto',
          },
        })
        results.updated++
        console.log(
          `[Profile Gen] Updated profile for ${user.name}: ${profile.strengths.length} strengths, ${profile.weaknesses.length} weaknesses`,
        )
        continue
      }

      // AI parse failed. Update mechanical fields only when we have an
      // existing profile to preserve the narrative on. If no existing
      // profile, push the error (legacy behavior).
      if (existingProfile) {
        await db.userProfile.update({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          data: mechanicalFields,
        })
        results.skipped++
        logFailure(
          tenantId,
          'generate_profiles.ai_parse_failed',
          `user:${user.id}`,
          new Error(`${parseFailureReason ?? 'unknown'} (mechanical fields refreshed)`),
        )
        console.log(
          `[Profile Gen] ${user.name}: AI parse failed (${parseFailureReason}); refreshed scoringPatterns + totalCallsGraded`,
        )
        continue
      }
      results.errors.push(`${user.name}: ${parseFailureReason ?? 'AI response unparseable'}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      results.errors.push(`${user.name}: ${msg}`)
    }
  }

  return results
}
