// POST /api/ai/outreach-action — LLM parses natural language into structured outreach action
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { anthropic } from '@/config/anthropic'
import { logAiCall, startTimer } from '@/lib/ai/log'
import { logFailure } from '@/lib/audit'

export const POST = withTenant(async (request, ctx) => {
  const { message, propertyId } = await request.json()
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  try {
    const timer = startTimer()
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You parse natural language into outreach actions for a real estate wholesaling CRM.

Return a JSON object with the parsed action. If you cannot parse an outreach action, return {"type": "none", "reply": "your helpful response"}.

ACTIONS YOU CAN PARSE:

1. Record an offer:
{"type": "offer", "recipientName": "John Smith", "offerAmount": "150000", "notes": "Cash offer, 30 day close", "channel": "call"}

2. Accept/reject/counter an offer:
{"type": "offer_update", "offerStatus": "Accepted|Rejected|Countered|Expired", "offerAmount": "150000", "recipientName": "John Smith"}

3. Schedule a showing:
{"type": "showing", "recipientName": "John Smith", "showingDate": "2026-03-28", "showingTime": "15:00", "notes": "Buyer wants to see kitchen"}

4. Log a send (SMS, email, call):
{"type": "send", "recipientName": "John Smith", "channel": "sms|email|call", "notes": "Follow up on contract terms"}

RULES:
- Always title case names
- Parse dollar amounts to plain numbers (no $ or commas)
- Parse dates to YYYY-MM-DD format
- Parse times to HH:MM 24hr format
- If a name isn't mentioned, use "Unknown"
- Return ONLY the JSON object, nothing else`,
      messages: [{ role: 'user', content: message }],
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : '{}'

    logAiCall({
      tenantId: ctx.tenantId, userId: ctx.userId,
      type: 'action_execution', pageContext: propertyId ? `property:${propertyId}` : null,
      input: message, output: text.slice(0, 500),
      tokensIn: res.usage?.input_tokens, tokensOut: res.usage?.output_tokens,
      durationMs: timer(), model: 'claude-haiku-4-5-20251001',
    }).catch(err => logFailure(ctx.tenantId, 'outreach.ai_call_log_failed', 'aiCall', err))

    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return NextResponse.json({ action: parsed })
    }
    return NextResponse.json({ action: { type: 'none', reply: text } })
  } catch (err) {
    console.error('[AI Outreach] Parse failed:', err)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
})
