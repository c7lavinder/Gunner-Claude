// POST /api/ai/assistant — Role Assistant main endpoint
// Receives user message, builds full context, calls Claude with tools, returns response
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import Anthropic from '@anthropic-ai/sdk'
import { logAiCall, startTimer } from '@/lib/ai/log'
import { ASSISTANT_TOOLS } from '@/lib/ai/assistant-tools'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, pageContext } = await request.json()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const tenantId = session.tenantId
  const userId = session.userId
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  try {
    // Get user info
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true },
    })

    // Get tenant info
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, companyStandards: true },
    })

    // Load today's conversation history
    const priorMessages = await db.assistantMessage.findMany({
      where: { tenantId, userId, sessionDate: today },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, toolCalls: true },
    })

    // Save user message
    await db.assistantMessage.create({
      data: { tenantId, userId, sessionDate: today, role: 'user', content: message, pageContext },
    })

    // Build conversation history for Claude
    const conversationHistory: Anthropic.MessageParam[] = priorMessages.map(m => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }))
    conversationHistory.push({ role: 'user', content: message })

    // Build page-specific context
    let pageData = ''
    if (pageContext?.startsWith('property:')) {
      const propertyId = pageContext.split(':')[1]
      const property = await db.property.findUnique({
        where: { id: propertyId, tenantId },
        select: {
          address: true, city: true, state: true, zip: true, status: true, dispoStatus: true,
          askingPrice: true, arv: true, mao: true, currentOffer: true, contractPrice: true,
          sellerMotivation: true, sellerTimeline: true, propertyCondition: true, dealIntel: true,
          propertyMarkets: true, projectType: true, beds: true, baths: true, sqft: true, yearBuilt: true,
          sellers: { select: { seller: { select: { name: true, phone: true } }, role: true } },
          calls: { take: 5, orderBy: { calledAt: 'desc' }, select: { score: true, aiSummary: true, callOutcome: true, calledAt: true, assignedTo: { select: { name: true } } } },
          tasks: { take: 5, select: { title: true, priority: true, dueAt: true } },
        },
      })
      if (property) {
        pageData = `CURRENT PROPERTY: ${property.address}, ${property.city}, ${property.state} ${property.zip}
Status: ${property.status}${property.dispoStatus ? ` | Dispo: ${property.dispoStatus}` : ''}
Pricing: Asking ${property.askingPrice ?? 'N/A'} | ARV ${property.arv ?? 'N/A'} | MAO ${property.mao ?? 'N/A'} | Current Offer ${property.currentOffer ?? 'N/A'} | Contract ${property.contractPrice ?? 'N/A'}
Details: ${property.beds ?? '?'}bd/${property.baths ?? '?'}ba, ${property.sqft ?? '?'}sqft, built ${property.yearBuilt ?? '?'}
Motivation: ${property.sellerMotivation ?? 'N/A'} | Timeline: ${property.sellerTimeline ?? 'N/A'} | Condition: ${property.propertyCondition ?? 'N/A'}
Sellers: ${property.sellers.map(s => `${s.seller.name} (${s.role}) ${s.seller.phone ?? ''}`).join(', ') || 'None linked'}
Recent Calls: ${property.calls.map(c => `${c.calledAt?.toISOString().slice(0, 10) ?? '?'} by ${c.assignedTo?.name ?? '?'}: Score ${c.score ?? '?'}, ${c.callOutcome ?? 'unknown'} — ${c.aiSummary?.slice(0, 100) ?? 'N/A'}`).join(' | ') || 'None'}
Open Tasks: ${property.tasks.map(t => `${t.title} (${t.priority}, due ${t.dueAt?.toISOString().slice(0, 10) ?? 'N/A'})`).join(' | ') || 'None'}
${property.dealIntel ? `Deal Intel: ${JSON.stringify(property.dealIntel).slice(0, 500)}` : ''}`
      }
    } else if (pageContext?.startsWith('call:')) {
      const callId = pageContext.split(':')[1]
      const call = await db.call.findUnique({
        where: { id: callId, tenantId },
        select: {
          contactName: true, score: true, aiSummary: true, callOutcome: true, callType: true,
          durationSeconds: true, direction: true, calledAt: true, transcript: true,
          assignedTo: { select: { name: true } },
          property: { select: { address: true, city: true, state: true } },
        },
      })
      if (call) {
        pageData = `CURRENT CALL: ${call.contactName ?? 'Unknown'} | ${call.direction} | ${call.durationSeconds ?? 0}s | Score: ${call.score ?? 'ungraded'}
Type: ${call.callType ?? 'Unknown'} | Outcome: ${call.callOutcome ?? 'Unknown'}
Rep: ${call.assignedTo?.name ?? 'Unknown'} | Date: ${call.calledAt?.toISOString().slice(0, 10) ?? '?'}
Property: ${call.property ? `${call.property.address}, ${call.property.city}` : 'None linked'}
Summary: ${call.aiSummary ?? 'N/A'}
${call.transcript ? `Transcript excerpt: ${call.transcript.slice(0, 500)}` : 'No transcript'}`
      }
    }

    // Load user profile for personalization
    const userProfile = await db.userProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { strengths: true, weaknesses: true, coachingPriorities: true, communicationStyle: true },
    })

    const roleName = user?.role?.replace(/_/g, ' ') ?? 'Team Member'
    const timer = startTimer()

    // System prompt
    const systemPrompt = `You are the ${roleName} Assistant for ${tenant?.name ?? 'this company'}, a wholesale real estate company.

User: ${user?.name ?? 'Unknown'} (${roleName})

YOUR CAPABILITIES:
- Answer any question about properties, calls, deals, team performance, KPIs
- Execute actions in GHL (send SMS, create tasks, change stages, add notes, etc.)
- Execute actions in Gunner (update properties, log milestones, manage deals)
- Reference company scripts, playbooks, and training materials
- Provide personalized coaching based on the user's performance profile

RULES:
- Be concise. Short, direct responses unless asked for detail.
- When the user asks you to DO something (send SMS, create task, etc.), use the appropriate tool. Don't just describe what to do.
- When proposing actions, fill in ALL fields with real data from context. Never leave placeholders.
- You are AI-assisted, not autonomous. Always propose actions for user approval before executing.

${pageData ? `\n${pageData}` : ''}

${userProfile ? `USER PERFORMANCE PROFILE:
Strengths: ${(userProfile.strengths as string[]).join(', ')}
Areas for Growth: ${(userProfile.weaknesses as string[]).join(', ')}
Coaching Focus: ${(userProfile.coachingPriorities as string[]).join(', ')}
Style: ${userProfile.communicationStyle ?? 'Unknown'}` : ''}

${tenant?.companyStandards ? `\nCOMPANY STANDARDS:\n${tenant.companyStandards}` : ''}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      tools: ASSISTANT_TOOLS,
      messages: conversationHistory,
    })

    // Process response — extract text and tool calls
    let replyText = ''
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown>; status: string }> = []

    for (const block of response.content) {
      if (block.type === 'text') {
        replyText += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
          status: 'pending',
        })
      }
    }

    // If tool calls but no text, add a description
    if (toolCalls.length > 0 && !replyText.trim()) {
      replyText = `I'll ${toolCalls.map(tc => tc.name.replace(/_/g, ' ')).join(' and ')} for you. Please review and approve:`
    }

    // Save assistant response
    await db.assistantMessage.create({
      data: {
        tenantId, userId, sessionDate: today,
        role: 'assistant', content: replyText,
        toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
        pageContext,
      },
    })

    // Log AI call
    logAiCall({
      tenantId, userId, type: 'assistant_chat', pageContext,
      input: message, output: replyText,
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      durationMs: timer(),
      model: 'claude-sonnet-4-6',
      toolsCalled: toolCalls.length > 0 ? toolCalls : undefined,
    }).catch(() => {})

    return NextResponse.json({
      reply: replyText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      userRole: user?.role,
    })
  } catch (err) {
    console.error('[Assistant] Error:', err)
    return NextResponse.json({ error: 'Assistant unavailable' }, { status: 500 })
  }
}
