// lib/ai/coach.ts
// AI Coach v2 — conversation engine with proactive insights and session history
// Has full context: user's recent calls, scores, XP, badges, trends

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import type { UserRole } from '@/types/roles'
import { subDays, startOfWeek } from 'date-fns'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Proactive Insights ────────────────────────────────────────────────────

export interface CoachInsight {
  type: 'warning' | 'celebration' | 'tip'
  title: string
  detail: string
}

export async function generateInsights(
  tenantId: string,
  userId: string,
): Promise<CoachInsight[]> {
  const now = new Date()
  const weekAgo = subDays(now, 7)
  const twoWeeksAgo = subDays(now, 14)

  const [thisWeekCalls, lastWeekCalls, xpRecord, badgeCount] = await Promise.all([
    db.call.findMany({
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED', calledAt: { gte: weekAgo } },
      select: { score: true, calledAt: true },
      orderBy: { calledAt: 'desc' },
    }),
    db.call.findMany({
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED', calledAt: { gte: twoWeeksAgo, lt: weekAgo } },
      select: { score: true },
    }),
    db.userXp.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { totalXp: true, level: true, weeklyXp: true },
    }),
    db.userBadge.count({ where: { tenantId, userId } }),
  ])

  const insights: CoachInsight[] = []

  const thisWeekAvg = thisWeekCalls.length > 0
    ? Math.round(thisWeekCalls.reduce((s, c) => s + (c.score ?? 0), 0) / thisWeekCalls.length)
    : null
  const lastWeekAvg = lastWeekCalls.length > 0
    ? Math.round(lastWeekCalls.reduce((s, c) => s + (c.score ?? 0), 0) / lastWeekCalls.length)
    : null

  // Score trend alerts
  if (thisWeekAvg !== null && lastWeekAvg !== null) {
    const diff = thisWeekAvg - lastWeekAvg
    if (diff <= -10) {
      insights.push({
        type: 'warning',
        title: `Scores dropped ${Math.abs(diff)} points this week`,
        detail: `Last week avg: ${lastWeekAvg} → This week: ${thisWeekAvg}. Let's diagnose what changed.`,
      })
    } else if (diff >= 10) {
      insights.push({
        type: 'celebration',
        title: `Scores up ${diff} points this week!`,
        detail: `${lastWeekAvg} → ${thisWeekAvg}. Whatever you're doing, keep it up.`,
      })
    }
  }

  // Volume alerts
  if (thisWeekCalls.length === 0 && lastWeekCalls.length > 0) {
    insights.push({
      type: 'warning',
      title: 'No calls graded this week',
      detail: `You had ${lastWeekCalls.length} calls last week. Time to get on the phone.`,
    })
  } else if (thisWeekCalls.length > 0 && lastWeekCalls.length > 0 && thisWeekCalls.length < lastWeekCalls.length * 0.5) {
    insights.push({
      type: 'warning',
      title: 'Call volume is down',
      detail: `${thisWeekCalls.length} calls this week vs ${lastWeekCalls.length} last week.`,
    })
  }

  // XP milestones
  if (xpRecord) {
    if (xpRecord.weeklyXp >= 200) {
      insights.push({
        type: 'celebration',
        title: `${xpRecord.weeklyXp} XP earned this week`,
        detail: `Level ${xpRecord.level} — ${badgeCount} badges earned. You're grinding.`,
      })
    }
  }

  // High score celebration
  if (thisWeekCalls.length > 0) {
    const highScore = Math.max(...thisWeekCalls.map(c => c.score ?? 0))
    if (highScore >= 90) {
      insights.push({
        type: 'celebration',
        title: `Hit ${highScore}/100 on a call this week`,
        detail: 'That\'s elite performance. Study what you did differently on that call.',
      })
    }
  }

  return insights
}

// ─── Coach Response ────────────────────────────────────────────────────────

export async function getCoachResponse(
  tenantId: string,
  userId: string,
  userRole: UserRole,
  userName: string,
  messages: CoachMessage[],
  propertyId?: string,
): Promise<string> {
  const now = new Date()
  const weekAgo = subDays(now, 7)

  // Pull context to make the coach genuinely useful
  const [recentCalls, weekCalls, activeTasks, recentProperties, xpRecord] = await Promise.all([
    db.call.findMany({
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { score: true, aiFeedback: true, aiCoachingTips: true, callType: true, callOutcome: true, calledAt: true, contactName: true, transcript: true, aiSummary: true, keyMoments: true },
    }),
    db.call.findMany({
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED', calledAt: { gte: weekAgo } },
      select: { score: true },
    }),
    db.task.count({
      where: { tenantId, assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    }),
    db.property.count({
      where: { tenantId, assignedToId: userId, status: { notIn: ['SOLD', 'DEAD'] } },
    }),
    db.userXp.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { totalXp: true, level: true, weeklyXp: true },
    }),
  ])

  const avgScore = recentCalls.length > 0
    ? Math.round(recentCalls.reduce((s, c) => s + (c.score ?? 0), 0) / recentCalls.length)
    : null

  const weekAvg = weekCalls.length > 0
    ? Math.round(weekCalls.reduce((s, c) => s + (c.score ?? 0), 0) / weekCalls.length)
    : null

  // Fetch current property context if on a property page
  let propertyContext = ''
  if (propertyId) {
    try {
      const prop = await db.property.findUnique({
        where: { id: propertyId, tenantId },
        include: {
          sellers: { include: { seller: true }, where: { isPrimary: true }, take: 1 },
          assignedTo: { select: { name: true } },
          market: { select: { name: true } },
          _count: { select: { calls: true, tasks: true } },
        },
      })
      if (prop) {
        const fmt = (v: unknown) => v != null ? `$${Number(v).toLocaleString()}` : 'N/A'
        propertyContext = `
CURRENT PROPERTY (user is viewing this property right now):
- Address: ${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}
- Status: ${prop.status}
- Market: ${prop.market?.name ?? 'Unknown'}
- Assigned to: ${prop.assignedTo?.name ?? 'Unassigned'}
- Seller: ${prop.sellers[0]?.seller.name ?? 'No seller linked'}
- Asking Price: ${fmt(prop.askingPrice)}
- ARV: ${fmt(prop.arv)}
- MAO: ${fmt(prop.mao)}
- Contract Price: ${fmt(prop.contractPrice)}
- Offer Price: ${fmt(prop.offerPrice)}
- Assignment Fee: ${fmt(prop.assignmentFee)}
- Repair Cost: ${fmt(prop.repairCost)}
- Wholesale Price: ${fmt(prop.wholesalePrice)}
- Beds: ${prop.beds ?? 'N/A'} | Baths: ${prop.baths ?? 'N/A'} | Sqft: ${prop.sqft ?? 'N/A'} | Built: ${prop.yearBuilt ?? 'N/A'}
- Property Type: ${prop.propertyType ?? 'N/A'} | Occupancy: ${prop.occupancy ?? 'N/A'}
- Days on market: ${Math.floor((Date.now() - prop.createdAt.getTime()) / 86400000)}
- Calls: ${prop._count.calls} | Tasks: ${prop._count.tasks}
${prop.description ? `- Description: ${prop.description.slice(0, 200)}` : ''}
${prop.internalNotes ? `- Internal Notes: ${prop.internalNotes.slice(0, 200)}` : ''}

When the user asks about "this property" or "this deal", they mean the property above. Use these numbers for analysis.`
      }
    } catch {}
  }

  const systemPrompt = `You are Gunner, an elite AI coach for real estate wholesaling teams.

You are talking with ${userName}, who is a ${formatRole(userRole)} on their wholesaling team.

YOUR PERSONALITY:
- Direct, high-energy, like a world-class sales coach
- Give specific, actionable advice — no fluff
- Use wholesaling industry language naturally
- Push them to be better, celebrate wins
- Short answers for simple questions, deeper for complex ones

THEIR CURRENT CONTEXT:
${avgScore !== null ? `- Recent avg call score: ${avgScore}/100 (last 5 calls)` : '- No graded calls yet'}
${weekAvg !== null ? `- This week avg: ${weekAvg}/100 across ${weekCalls.length} calls` : ''}
${activeTasks > 0 ? `- ${activeTasks} open tasks` : '- No open tasks'}
${recentProperties > 0 ? `- ${recentProperties} active properties assigned` : ''}
${xpRecord ? `- Level ${xpRecord.level} (${xpRecord.totalXp} total XP, +${xpRecord.weeklyXp} this week)` : ''}
${propertyContext}

${recentCalls.length > 0 ? `RECENT CALL HISTORY:
${recentCalls.map((c, i) => {
  const tips = (c.aiCoachingTips as string[] | null) ?? []
  const moments = (c.keyMoments as Array<{ type: string; description: string }> | null) ?? []
  return `Call ${i + 1}: ${c.contactName ?? 'Unknown'} | ${c.callType ?? 'unknown type'} | Score: ${c.score ?? '-'}/100 | Outcome: ${c.callOutcome ?? 'unknown'}
  Summary: ${c.aiSummary?.slice(0, 200) ?? 'No summary'}
  Feedback: ${c.aiFeedback?.slice(0, 200) ?? 'No feedback'}
  ${tips.length > 0 ? `Tips: ${tips.slice(0, 2).join('; ')}` : ''}
  ${moments.length > 0 ? `Key moments: ${moments.slice(0, 2).map(m => m.description).join('; ')}` : ''}
  ${c.transcript ? `Transcript excerpt: "${c.transcript.slice(0, 300)}..."` : ''}`
}).join('\n\n')}` : ''}

WHAT YOU KNOW:
- Deep expertise in real estate wholesaling: cold calling, acquisitions, dispositions, ARV calculations, MAO, assigning contracts
- Lead manager best practices: quick qualification, setting appointments
- Acquisition manager best practices: building rapport with sellers, uncovering motivation, making offers
- Disposition manager best practices: building buyer lists, marketing deals, fast closings
- GHL CRM optimization for wholesaling workflows
- Objection handling scripts specific to motivated sellers
- KPIs and metrics that matter in wholesaling

RULES:
- Never make up specific market data or prices
- If they ask about their calls/scores, reference the context above
- Keep answers conversational, not listy unless a list is truly the best format
- If they ask you to take an action in GHL (send SMS, create task, etc), tell them to use the Actions button in the interface
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  // Save to coach_logs
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()
  if (lastUserMsg) {
    await db.coachLog.create({
      data: {
        tenantId,
        userId,
        message: lastUserMsg.content,
        role: 'user',
      },
    }).catch(() => {}) // non-blocking

    await db.coachLog.create({
      data: {
        tenantId,
        userId,
        message: content.text,
        role: 'assistant',
      },
    }).catch(() => {}) // non-blocking
  }

  return content.text
}

function formatRole(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    OWNER: 'business owner',
    ADMIN: 'admin',
    TEAM_LEAD: 'team lead',
    LEAD_MANAGER: 'lead manager',
    ACQUISITION_MANAGER: 'acquisition manager',
    DISPOSITION_MANAGER: 'disposition manager',
  }
  return labels[role] ?? role
}
