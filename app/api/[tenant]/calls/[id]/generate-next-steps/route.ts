// app/api/[tenant]/calls/[id]/generate-next-steps/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: {
      id: true, aiSummary: true, callOutcome: true, callType: true,
      transcript: true,
      property: { select: { address: true } },
    },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  try {
    const transcriptExcerpt = call.transcript ? call.transcript.slice(0, 500) : 'No transcript available'

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a real estate wholesaling CRM assistant. Based on this call, generate 3-5 specific next step actions. Return JSON array only, no other text:
[{ "type": "add_note"|"create_task"|"send_sms"|"create_appointment"|"change_stage", "label": string, "reasoning": string }]

Call summary: ${call.aiSummary ?? 'No summary'}
Call outcome: ${call.callOutcome ?? 'Unknown'}
Call type: ${call.callType ?? 'Unknown'}
Property: ${call.property?.address ?? 'Unknown'}
Transcript excerpt: ${transcriptExcerpt}`,
      }],
    })

    const text = response.content[0]
    if (text.type !== 'text') throw new Error('Unexpected response')

    // Parse JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in response')

    const steps = JSON.parse(jsonMatch[0]) as Array<{ type: string; label: string; reasoning: string }>

    // Persist generated steps to DB
    const stepsWithStatus = steps.map(s => ({ ...s, status: 'pending', pushedAt: null }))
    await db.call.update({
      where: { id: params.id },
      data: { aiNextSteps: stepsWithStatus },
    })

    return NextResponse.json({ steps })
  } catch (err) {
    console.error('[Generate Next Steps] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to generate next steps' }, { status: 500 })
  }
}
