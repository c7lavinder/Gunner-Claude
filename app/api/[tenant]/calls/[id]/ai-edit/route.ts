// POST /api/[tenant]/calls/[id]/ai-edit
// Uses Claude to edit a next step based on user instruction
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import Anthropic from '@anthropic-ai/sdk'
import { logAiCall, startTimer } from '@/lib/ai/log'

export async function POST(
  req: Request,
  { params }: { params: { tenant: string; id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { instruction, currentLabel } = await req.json()
  if (!instruction || !currentLabel) {
    return NextResponse.json({ error: 'instruction and currentLabel required' }, { status: 400 })
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const timer = startTimer()
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Edit this CRM action based on the user's instruction. Return ONLY the updated action text, nothing else.

Current action: "${currentLabel}"
User instruction: "${instruction}"

Updated action:`,
      }],
    })

    const newLabel = res.content[0].type === 'text' ? res.content[0].text.trim().replace(/^["']|["']$/g, '') : currentLabel

    logAiCall({
      tenantId: session.tenantId, userId: session.userId,
      type: 'action_execution', pageContext: `call:${params.id}`,
      input: `Edit: "${currentLabel}" → "${instruction}"`, output: newLabel,
      tokensIn: res.usage?.input_tokens, tokensOut: res.usage?.output_tokens,
      durationMs: timer(), model: 'claude-haiku-4-5-20251001',
    }).catch(() => {})

    return NextResponse.json({ newLabel })
  } catch {
    return NextResponse.json({ error: 'AI edit failed' }, { status: 500 })
  }
}
