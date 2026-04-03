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

      if (calls.length === 0) {
        results.skipped++
        continue // No graded calls — can't generate profile
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

      // Also check for existing playbook profile to merge with
      const existingProfile = await db.userProfile.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { strengths: true, weaknesses: true, commonMistakes: true, communicationStyle: true, coachingPriorities: true, profileSource: true },
      })
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

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `You are a sales coaching AI. You MUST respond with ONLY a valid JSON object, no other text. No markdown, no explanation, no preamble.

The JSON must have this exact structure:
{"strengths":["..."],"weaknesses":["..."],"commonMistakes":["..."],"communicationStyle":"...","coachingPriorities":["..."]}

Each array should have 3-5 items. Be specific to wholesale real estate. If data is limited, base your analysis on the rep's role and whatever data is available. Never say you can't generate a profile — always produce one.`,
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
      const msg = err instanceof Error ? err.message : 'Unknown error'
      results.errors.push(`${user.name}: ${msg}`)
    }
  }

  return results
}
