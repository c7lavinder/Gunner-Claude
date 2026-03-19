// lib/ai/coach.ts
// AI Coach conversation engine
// Has full context: user's recent calls, scores, KPIs, industry knowledge

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'
import type { UserRole } from '@/types/roles'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function getCoachResponse(
  tenantId: string,
  userId: string,
  userRole: UserRole,
  userName: string,
  messages: CoachMessage[],
): Promise<string> {
  // Pull context to make the coach genuinely useful
  const [recentCalls, activeTasks, recentProperties, roleConfig] = await Promise.all([
    db.call.findMany({
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { score: true, aiFeedback: true, aiCoachingTips: true, callType: true, calledAt: true },
    }),
    db.task.count({
      where: { tenantId, assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    }),
    db.property.count({
      where: { tenantId, assignedToId: userId, status: { notIn: ['SOLD', 'DEAD'] } },
    }),
    db.roleConfig.findUnique({
      where: { tenantId_role: { tenantId, role: userRole } },
    }),
  ])

  const avgScore = recentCalls.length > 0
    ? Math.round(recentCalls.reduce((s, c) => s + (c.score ?? 0), 0) / recentCalls.length)
    : null

  // Build a rich system prompt with user context
  const systemPrompt = `You are Gunner, an elite AI coach for real estate wholesaling teams.

You are talking with ${userName}, who is a ${formatRole(userRole)} on their wholesaling team.

YOUR PERSONALITY:
- Direct, high-energy, like a world-class sales coach
- Give specific, actionable advice — no fluff
- Use wholesaling industry language naturally
- Push them to be better, celebrate wins
- Short answers for simple questions, deeper for complex ones

THEIR CURRENT CONTEXT:
${avgScore !== null ? `- Recent avg call score: ${avgScore}/100` : '- No graded calls yet'}
${recentCalls.length > 0 ? `- Last ${recentCalls.length} calls graded` : ''}
${activeTasks > 0 ? `- ${activeTasks} open tasks` : '- No open tasks'}
${recentProperties > 0 ? `- ${recentProperties} active properties assigned` : ''}

${recentCalls.length > 0 && recentCalls[0].aiFeedback ? `MOST RECENT CALL FEEDBACK:
"${recentCalls[0].aiFeedback}"` : ''}

${recentCalls.length > 0 && recentCalls[0].aiCoachingTips ? `COACHING TIPS FROM LAST CALL:
${(recentCalls[0].aiCoachingTips as string[]).map((t, i) => `${i + 1}. ${t}`).join('\n')}` : ''}

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
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')
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
