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

  const body = await request.json().catch(() => ({}))
  const requestedType = (body as { actionType?: string }).actionType ?? null
  const userSummary = (body as { summary?: string }).summary ?? ''

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: {
      id: true, aiSummary: true, callOutcome: true, callType: true,
      transcript: true, contactName: true, aiNextSteps: true,
      assignedTo: { select: { name: true, role: true } },
      property: { select: { address: true, city: true, state: true, status: true, ghlPipelineStage: true } },
    },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  try {
    // AI Learning: fetch recent corrections from this tenant (last 30 days)
    const recentCorrections = await db.auditLog.findMany({
      where: {
        tenantId: session.tenantId,
        action: 'call.feedback',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { payload: true },
    })

    const corrections = recentCorrections
      .filter(f => {
        const p = f.payload as { type?: string } | null
        return p?.type === 'nextstep_correction'
      })
      .map(f => {
        const p = f.payload as { details?: string } | null
        try { return p?.details ? JSON.parse(p.details) : null } catch { return null }
      })
      .filter(Boolean)
      .slice(0, 10)

    const correctionContext = corrections.length > 0
      ? `\n\nLEARNING FROM PAST CORRECTIONS — these show what users changed vs what AI originally suggested. Adapt your output to match these preferences:\n${corrections.map((c: { actionType?: string; aiOriginal?: string; userEdited?: string }) =>
          `- ${c.actionType}: AI said "${c.aiOriginal}" → User changed to "${c.userEdited}"`
        ).join('\n')}`
      : ''

    const transcriptExcerpt = call.transcript ? call.transcript.slice(0, 2000) : 'No transcript available'
    const existingSteps = (call.aiNextSteps as Array<{ type: string; label: string }> | null) ?? []
    const existingTypes = existingSteps.map(s => s.type)

    // If requesting a specific action type (Add Action flow), generate just that one
    const typeInstruction = requestedType
      ? `Generate exactly 1 action of type "${requestedType}". ${userSummary ? `User's description: "${userSummary}"` : ''}`
      : `Generate 3-5 specific next step actions. Do NOT duplicate action types already generated: ${existingTypes.join(', ') || 'none yet'}.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a real estate wholesaling CRM assistant. Based on this call, ${typeInstruction}

VALID ACTION TYPES (use these exact strings):
- add_note: Add a note to the contact record (full narrative paragraph, first person from rep's perspective)
- create_task: Create a follow-up task (specific title like "Contact Name: Follow up on Address after outcome")
- check_off_task: Mark an existing task as completed
- update_task: Update an existing task's details
- change_stage: Move contact to a different pipeline stage (reference exact pipeline and stage names)
- create_appointment: Schedule an appointment
- send_sms: Send an SMS message to the contact
- schedule_sms: Schedule an SMS for a future date/time
- add_to_workflow: Add the contact to an automation workflow
- remove_from_workflow: Remove from a workflow

RULES:
- Every action must reference REAL specific data from the call (names, addresses, amounts, outcomes)
- Labels must be specific: "Drema Wrye: Follow up on 225 Edgewater Dr after offer rejection" NOT "Follow up with seller"
- Each action type can only appear ONCE. Do NOT generate two actions of the same type.
- Only suggest actions the transcript actually supports
- For add_note: Write a full paragraph summary in first person from the rep's perspective. Include exact numbers (prices, dates, percentages), seller name, property address, key outcomes, and what was discussed. This is the CRM note that gets pushed.
- For create_task: Write a specific title like "Contact Name: Follow up on Address after outcome". The reasoning should serve as the task description.

Return JSON array only, no other text:
[{ "type": "<action_type>", "label": "<specific action description>", "reasoning": "<why this action based on the call>" }]

Rep: ${call.assignedTo?.name ?? 'Unknown'} (${call.assignedTo?.role ?? 'Unknown'})
Contact: ${call.contactName ?? 'Unknown'}
Property: ${call.property ? `${call.property.address}, ${call.property.city}, ${call.property.state}` : 'Unknown'}
Property status: ${call.property?.status ?? 'Unknown'}
Pipeline stage: ${call.property?.ghlPipelineStage ?? 'Unknown'}
Call summary: ${call.aiSummary ?? 'No summary'}
Call outcome: ${call.callOutcome ?? 'Unknown'}
Call type: ${call.callType ?? 'Unknown'}
Transcript: ${transcriptExcerpt}${correctionContext}`,
      }],
    })

    const text = response.content[0]
    if (text.type !== 'text') throw new Error('Unexpected response')

    const jsonMatch = text.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in response')

    const rawSteps = JSON.parse(jsonMatch[0]) as Array<{ type: string; label: string; reasoning: string }>

    // Server-side dedup: only keep one action per type
    const seenTypes = new Set<string>()
    const steps = rawSteps.filter(s => {
      if (seenTypes.has(s.type)) return false
      seenTypes.add(s.type)
      return true
    })

    // Persist generated steps to DB (merge with existing if adding single action)
    if (requestedType) {
      const merged = [...existingSteps.map(s => ({ ...s, status: (s as { status?: string }).status ?? 'pending', pushedAt: (s as { pushedAt?: string | null }).pushedAt ?? null })), ...steps.map(s => ({ ...s, status: 'pending', pushedAt: null }))]
      await db.call.update({
        where: { id: params.id },
        data: { aiNextSteps: merged },
      })
    } else {
      const stepsWithStatus = steps.map(s => ({ ...s, status: 'pending', pushedAt: null }))
      await db.call.update({
        where: { id: params.id },
        data: { aiNextSteps: stepsWithStatus },
      })
    }

    return NextResponse.json({ steps })
  } catch (err) {
    console.error('[Generate Next Steps] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to generate next steps' }, { status: 500 })
  }
}
