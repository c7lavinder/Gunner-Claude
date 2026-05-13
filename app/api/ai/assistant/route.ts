// POST /api/ai/assistant — Role Assistant main endpoint
// Receives user message, builds full context, calls Claude with tools, returns response
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { anthropic } from '@/config/anthropic'
import type Anthropic from '@anthropic-ai/sdk'
import { logAiCall, startTimer } from '@/lib/ai/log'
import { ASSISTANT_TOOLS } from '@/lib/ai/assistant-tools'
import { filterToolsForRole } from '@/lib/ai/role-gates'
import { checkRateLimit } from '@/lib/ai/rate-limit'
import { getRecentSessionMemory, scheduleSessionSummary } from '@/lib/ai/session-summarizer'
import { buildAssistantSystemPrompt, VERSION as ASSISTANT_PROMPT_VERSION } from '@/lib/ai/prompts/assistant'
import { logFailure } from '@/lib/audit'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export const POST = withTenant(async (request, ctx) => {
  // Rate limit: 20 chat turns per minute per user. Real usage is closer
  // to 1-3 per minute; anything above 20 is a runaway loop or abuse.
  const rl = checkRateLimit(ctx.userId, 'assistant-chat', 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many messages in a short window. Please wait a moment.', retryAfterMs: rl.retryAfterMs },
      { status: 429 },
    )
  }

  const { message, pageContext } = await request.json()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const tenantId = ctx.tenantId
  const userId = ctx.userId
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  try {
    // SIMPLIFY: dropped redundant db.user.findUnique — ctx.userName is canonical
    // (added to TenantContext in Wave 3 cleanup commit 2).

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
          address: true, city: true, state: true, zip: true,
          ...PROPERTY_LANE_SELECT,
          askingPrice: true, arv: true, mao: true, currentOffer: true, contractPrice: true,
          propertyCondition: true, dealIntel: true,
          propertyMarkets: true, projectType: true, beds: true, baths: true, sqft: true, yearBuilt: true,
          sellers: { select: { seller: { select: { name: true, phone: true } }, role: true } },
          calls: { take: 5, orderBy: { calledAt: 'desc' }, select: { score: true, aiSummary: true, callOutcome: true, calledAt: true, assignedTo: { select: { name: true } } } },
          tasks: { take: 5, select: { title: true, priority: true, dueAt: true } },
        },
      })
      if (property) {
        pageData = `CURRENT PROPERTY: ${property.address}, ${property.city}, ${property.state} ${property.zip}
Status: ${effectiveStatus(property)}${property.dispoStatus ? ` | Dispo: ${property.dispoStatus}` : ''}
Pricing: Asking ${property.askingPrice ?? 'N/A'} | ARV ${property.arv ?? 'N/A'} | MAO ${property.mao ?? 'N/A'} | Current Offer ${property.currentOffer ?? 'N/A'} | Contract ${property.contractPrice ?? 'N/A'}
Details: ${property.beds ?? '?'}bd/${property.baths ?? '?'}ba, ${property.sqft ?? '?'}sqft, built ${property.yearBuilt ?? '?'}
Condition: ${property.propertyCondition ?? 'N/A'}
Sellers: ${(property.sellers as { seller: { name: string; phone: string | null }; role: string }[]).map(s => `${s.seller.name} (${s.role}) ${s.seller.phone ?? ''}`).join(', ') || 'None linked'}
Recent Calls: ${(property.calls as { calledAt: Date | null; score: number | null; aiSummary: string | null; callOutcome: string | null; assignedTo: { name: string | null } | null }[]).map(c => `${c.calledAt?.toISOString().slice(0, 10) ?? '?'} by ${c.assignedTo?.name ?? '?'}: Score ${c.score ?? '?'}, ${c.callOutcome ?? 'unknown'} — ${c.aiSummary?.slice(0, 100) ?? 'N/A'}`).join(' | ') || 'None'}
Open Tasks: ${(property.tasks as { title: string; priority: string; dueAt: Date | null }[]).map(t => `${t.title} (${t.priority}, due ${t.dueAt?.toISOString().slice(0, 10) ?? 'N/A'})`).join(' | ') || 'None'}
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

    // Load playbook knowledge for this user's role (with semantic search if embeddings available)
    const { buildKnowledgeContext, formatKnowledgeForPrompt } = await import('@/lib/ai/context-builder')
    const knowledge = await buildKnowledgeContext({
      tenantId, userId, userRole: ctx.userRole ?? null,
      query: message, // Semantic search: finds relevant playbook docs for the user's question
    })
    const knowledgeBlock = formatKnowledgeForPrompt(knowledge, 8000)

    // Load recent rejected actions for learning (last 30 days)
    const recentRejections = await db.actionLog.findMany({
      where: { tenantId, userId, wasRejected: true, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { actionType: true, proposed: true },
    })
    const rejectionContext = recentRejections.length > 0
      ? `\nRECENTLY REJECTED ACTIONS — the user has rejected these, avoid suggesting similar:\n${recentRejections.map(r => `- ${r.actionType}: ${JSON.stringify(r.proposed).slice(0, 100)}`).join('\n')}`
      : ''

    // Cross-session memory — load last 3 daily summaries (skipped if no
    // prior sessions). See lib/ai/session-summarizer.ts.
    const memoryBlock = await getRecentSessionMemory(tenantId, userId, 3)

    const timer = startTimer()

    // Phase 2 (Session 86): assistant prompt now built in lib/ai/prompts/assistant.ts.
    // Carries the 5-section structure (IDENTITY / VOICE / USER CONTEXT /
    // OPERATING RULES) plus Rules 1-7 (always-text, traffic-light, no-tool-
    // hallucination, real-data, no-placeholders, playbook-coaching, team-
    // profiles). Prompt VERSION is logged with every ai_logs row for Phase 9
    // drift detection.
    //
    // Caching: stableSystem + pageBlock are cache-eligible; variableTail
    // recomputed each turn (semantic search depends on the query).
    const builtPrompt = buildAssistantSystemPrompt({
      tenantName: tenant?.name ?? 'this company',
      userName: ctx.userName || 'Unknown',
      userRole: ctx.userRole,
      businessContext: knowledgeBlock,
      memoryBlock,
      pageBlock: pageData ? `\n${pageData}` : '',
      rejectionContext,
    })
    const { stableSystem, pageBlock, variableTail } = builtPrompt

    // Rule 4 (CLAUDE.md): role-based capability gating. Tools the user is
    // not allowed to use are removed before Claude sees them, so the LLM
    // can't propose actions the user lacks permission for. Execute route
    // re-checks (defense in depth) — see lib/ai/role-gates.ts.
    const allowedTools = filterToolsForRole(ASSISTANT_TOOLS, ctx.userRole)

    // Mark the last tool with cache_control so the entire tool list above
    // it gets cached. Tool.cache_control is part of the standard SDK type
    // since 0.90 — no cast needed.
    const cachedTools: Anthropic.Tool[] = allowedTools.length > 0
      ? [
          ...allowedTools.slice(0, -1),
          { ...allowedTools[allowedTools.length - 1], cache_control: { type: 'ephemeral' } },
        ]
      : allowedTools

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: [
        { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
        ...(pageBlock ? [{ type: 'text' as const, text: pageBlock, cache_control: { type: 'ephemeral' as const } }] : []),
        { type: 'text', text: variableTail },
      ],
      tools: cachedTools,
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

    // Cross-session memory: refresh the session summary in the background
    // every ~6 user turns. Fire-and-forget — does not block the response.
    // priorMessages.length here counts everything saved before THIS turn,
    // so `+1` (the user msg just inserted) keeps the cadence intuitive.
    // See lib/ai/session-summarizer.ts.
    const turnsThisSession = Math.floor((priorMessages.length + 1) / 2)
    if (turnsThisSession >= 3 && turnsThisSession % 6 === 0) {
      scheduleSessionSummary(tenantId, userId)
    }

    // Log AI call
    logAiCall({
      tenantId, userId, type: 'assistant_chat', pageContext,
      input: message, output: replyText,
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      durationMs: timer(),
      model: 'claude-sonnet-4-6',
      toolsCalled: toolCalls.length > 0 ? toolCalls : undefined,
      promptVersion: ASSISTANT_PROMPT_VERSION,
    }).catch(err => logFailure(tenantId, 'assistant.ai_call_log_failed', 'aiCall', err))

    return NextResponse.json({
      reply: replyText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      userRole: ctx.userRole,
    })
  } catch (err) {
    console.error('[Assistant] Error:', err)
    return NextResponse.json({ error: 'Assistant unavailable' }, { status: 500 })
  }
})
