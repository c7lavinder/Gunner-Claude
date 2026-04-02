// lib/ai/generate-user-profiles.ts
// Weekly auto-generation of user performance profiles from real call data.
// Analyzes rubric scores, coaching feedback, and patterns to build
// personalized profiles that feed into grading + coaching prompts.
//
// Called by: scripts/generate-profiles.ts (weekly cron) or POST /api/admin/generate-profiles
// WRITES TO: user_profiles table (upsert per user)
// READ BY: context-builder.ts → grading, assistant, coach

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'
import { logAiCall, startTimer } from '@/lib/ai/log'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ProfileAnalysis {
  strengths: string[]
  weaknesses: string[]
  commonMistakes: string[]
  communicationStyle: string
  coachingPriorities: string[]
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

      if (calls.length < 3) {
        results.skipped++
        continue // Not enough data to generate a meaningful profile
      }

      // Aggregate rubric scores across all calls
      const rubricTotals: Record<string, { total: number; count: number }> = {}
      for (const call of calls) {
        const scores = call.rubricScores as Record<string, number> | null
        if (!scores) continue
        for (const [category, score] of Object.entries(scores)) {
          if (typeof score !== 'number') continue
          if (!rubricTotals[category]) rubricTotals[category] = { total: 0, count: 0 }
          rubricTotals[category].total += score
          rubricTotals[category].count++
        }
      }

      const rubricAverages: Record<string, number> = {}
      for (const [cat, data] of Object.entries(rubricTotals)) {
        rubricAverages[cat] = Math.round(data.total / data.count)
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
          } catch {}
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

      // Use Claude to synthesize a profile from the data
      const timer = startTimer()
      const prompt = `Analyze this sales rep's performance data and generate a coaching profile.

Rep: ${user.name} (${user.role?.replace(/_/g, ' ') ?? 'Unknown Role'})
Total graded calls (90 days): ${calls.length}
Score trend: 30-day avg ${improvementVelocity.avg30 ?? 'N/A'} | 60-day avg ${improvementVelocity.avg60 ?? 'N/A'} | 90-day avg ${improvementVelocity.avg90 ?? 'N/A'}

Rubric category averages:
${Object.entries(rubricAverages).map(([cat, avg]) => `- ${cat}: ${avg}/100`).join('\n')}

Recent coaching feedback themes (from graded calls):
${allFeedback.slice(0, 30).join('\n')}

Recent coaching tips given:
${allTips.slice(0, 20).join('\n')}

Call outcomes breakdown:
${Object.entries(calls.reduce((acc, c) => {
  const outcome = c.callOutcome ?? 'unknown'
  acc[outcome] = (acc[outcome] ?? 0) + 1
  return acc
}, {} as Record<string, number>)).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Based on this data, return a JSON profile:
{
  "strengths": ["top 3-5 specific strengths based on high rubric scores and positive feedback"],
  "weaknesses": ["top 3-5 specific areas for improvement based on low rubric scores and repeated feedback"],
  "commonMistakes": ["3-5 most frequently noted mistakes or bad habits"],
  "communicationStyle": "one-sentence description of their communication style (warm/direct/analytical/etc + what types of sellers they work best with)",
  "coachingPriorities": ["ranked list of 3-5 specific coaching actions, most impactful first"]
}

RULES:
- Be SPECIFIC. Not "needs to improve objection handling" but "loses control when sellers raise price objection — needs to use Reversing technique"
- Base everything on the actual data above, not generic advice
- Strengths should acknowledge what they do well so coaching doesn't re-teach it
- Coaching priorities should be ordered by impact: fix the biggest score-dragger first
- Return ONLY valid JSON, no other text`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
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
      }).catch(() => {})

      const match = text.match(/\{[\s\S]*\}/)
      if (!match) {
        results.errors.push(`${user.name}: No JSON in AI response`)
        continue
      }

      const profile = JSON.parse(match[0]) as ProfileAnalysis

      // Upsert the profile
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
          scoringPatterns: rubricAverages,
          improvementVelocity,
          totalCallsGraded: calls.length,
          profileSource: 'auto',
        },
        update: {
          strengths: profile.strengths,
          weaknesses: profile.weaknesses,
          commonMistakes: profile.commonMistakes,
          communicationStyle: profile.communicationStyle,
          coachingPriorities: profile.coachingPriorities,
          scoringPatterns: rubricAverages,
          improvementVelocity,
          totalCallsGraded: calls.length,
          profileSource: 'auto',
        },
      })

      results.updated++
      console.log(`[Profile Gen] Updated profile for ${user.name}: ${profile.strengths.length} strengths, ${profile.weaknesses.length} weaknesses`)
    } catch (err) {
      results.errors.push(`${user.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return results
}
