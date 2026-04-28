// app/api/[tenant]/calls/[id]/generate-next-steps/route.ts
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import Anthropic from '@anthropic-ai/sdk'
import { logAiCall, startTimer } from '@/lib/ai/log'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export const POST = withTenant<{ tenant: string; id: string }>(async (request, ctx, params) => {
  const body = await request.json().catch(() => ({}))
  const requestedType = (body as { actionType?: string }).actionType ?? null
  const userSummary = (body as { summary?: string }).summary ?? ''

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: {
      id: true, aiSummary: true, callOutcome: true, callType: true,
      transcript: true, contactName: true, aiNextSteps: true, calledAt: true,
      assignedTo: { select: { name: true, role: true } },
      property: { select: { address: true, city: true, state: true, status: true, ghlPipelineStage: true, ghlPipelineId: true } },
    },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Anchor relative dates + signal the rep's name so SMS bodies aren't signed
  // with a hallucinated name. Mirrors the grading.ts prompt.
  const anchorDate = call.calledAt ?? new Date()
  const todayIso = anchorDate.toISOString().slice(0, 10)
  const todayDow = anchorDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' })
  const repName = call.assignedTo?.name ?? 'the rep'
  const repFirst = repName.split(/\s+/)[0] ?? repName

  // Tenant-configured appointment types + live pipelines for explicit-ID routing
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { config: true },
  })
  const appointmentTypes = (((tenant?.config ?? {}) as { appointmentTypes?: Array<{ id: string; label: string; calendarId: string; defaultDurationMin?: number; titleTemplate?: string }> }).appointmentTypes) ?? []

  let pipelinesBlock = ''
  try {
    const { getGHLClient } = await import('@/lib/ghl/client')
    const ghl = await getGHLClient(ctx.tenantId)
    const pipelinesResp = await ghl.getPipelines()
    const lines: string[] = []
    for (const p of pipelinesResp.pipelines ?? []) {
      lines.push(`- pipelineId="${p.id}" name="${p.name}"`)
      for (const s of p.stages ?? []) {
        lines.push(`    stageId="${s.id}" name="${s.name}"`)
      }
    }
    pipelinesBlock = lines.join('\n')
  } catch {
    pipelinesBlock = '(pipelines unavailable)'
  }

  const appointmentTypesBlock = appointmentTypes.length === 0
    ? '(none configured — do NOT emit create_appointment without calendarId)'
    : appointmentTypes
        .map(t => `- id="${t.id}" label="${t.label}" calendarId="${t.calendarId}" defaultDurationMin=${t.defaultDurationMin ?? 30}${t.titleTemplate ? ` titleTemplate="${t.titleTemplate}"` : ''}`)
        .join('\n')

  // Load playbook knowledge for better next step suggestions
  const { buildKnowledgeContext, formatKnowledgeForPrompt } = await import('@/lib/ai/context-builder')
  const knowledge = await buildKnowledgeContext({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userRole: call.assignedTo?.role ?? null,
    callType: call.callType,
  })
  const knowledgeBlock = formatKnowledgeForPrompt(knowledge, 3000)

  try {
    // AI Learning: fetch recent corrections from this tenant (last 30 days)
    const recentCorrections = await db.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
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

    const timer = startTimer()
    const userContent = `You are a real estate wholesaling CRM assistant. Based on this call, ${typeInstruction}`
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      // Bumped from 1500 → 8000: the prompt now carries pipelines+stages +
      // appointmentTypes, and each action can include smsBody + reasoning.
      // 1500 was enough for 3-5 short labels but truncates mid-JSON now.
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are a real estate wholesaling CRM assistant. Based on this call, ${typeInstruction}

TODAY'S DATE: ${todayIso} (${todayDow}, America/Chicago). Any appointmentTime or sendAt MUST be at or after today — past dates are a bug.

THE REP ON THIS CALL: ${repFirst} (${repName}). Any SMS is FROM ${repFirst} — sign with their first name, not anyone else.

VALID ACTION TYPES (use these exact strings):
- add_note: Add a note to the contact record (full narrative paragraph, first person from rep's perspective)
- create_task: Create a follow-up task (specific title like "Contact Name: Follow up on Address after outcome")
- check_off_task: Mark an existing task as completed
- update_task: Update an existing task's details
- change_stage: Move contact to a different pipeline stage — MUST include explicit pipelineId + stageId from the list below
- create_appointment: Schedule an appointment — MUST include appointmentTypeId, calendarId, appointmentTime (ISO datetime) from the list below
- send_sms: Send an SMS — "label" is a short summary, "smsBody" is the actual text the contact receives. Optional "sendAt" (ISO datetime) + "timezone" to schedule.
- add_to_workflow: Add the contact to an automation workflow
- remove_from_workflow: Remove from a workflow

RULES:
- Every action must reference REAL specific data from the call (names, addresses, amounts, outcomes)
- Labels must be specific: "Drema Wrye: Follow up on 225 Edgewater Dr after offer rejection" NOT "Follow up with seller"
- Each action type can only appear ONCE. Do NOT generate two actions of the same type.
- Only suggest actions the transcript actually supports
- For add_note: "label" is a short action-card title like "Follow-up call with {contactName} — walkthrough scheduled". "noteBody" is the FULL paragraph in first person as ${repFirst} that gets pushed to GHL as the CRM note — include exact numbers (prices, dates, percentages), seller name, property address, key outcomes, and what was discussed. noteBody must be the full narrative; label is just the Gunner card title. Never duplicate the short label into noteBody.
- For create_task: Write a specific title like "Contact Name: Follow up on Address after outcome". The reasoning should serve as the task description.
- For send_sms: "label" is a short action-card summary like "Follow-up text after walkthrough". "smsBody" is the REAL message text that will be sent — written in first person as ${repFirst}, casual/friendly but professional, signed off as ${repFirst}. Never duplicate label text into smsBody. Never sign as a name other than ${repFirst}.
- For create_appointment: ONLY emit if an appointment type matches the call. Set appointmentTypeId + calendarId from the matching type. appointmentTime = ISO datetime AT OR AFTER ${todayIso}. If the transcript mentions a day like "Friday", resolve to the NEXT ${todayIso}-or-later Friday — never a past date. Weekdays only, 10am or 2pm local default. Set "label" using the titleTemplate if given; otherwise "{typeLabel} at {address} w/ {contactName}".
- For change_stage: ALWAYS emit explicit pipelineId AND stageId from the list. Never use stage names. Skip if no appropriate stage exists.

AVAILABLE APPOINTMENT TYPES (use these exact ids and calendarIds):
${appointmentTypesBlock}

AVAILABLE PIPELINES AND STAGES (use these exact ids for change_stage):
${pipelinesBlock}

Return JSON array only, no other text:
[{
  "type": "<action_type>",
  "label": "<specific action description>",
  "reasoning": "<why this action based on the call>",
  "noteBody": "only for add_note — the full paragraph pushed to GHL",
  "smsBody": "only for send_sms",
  "sendAt": "only for send_sms if scheduling — ISO datetime",
  "timezone": "only for send_sms if scheduling — IANA zone like America/Chicago",
  "appointmentTypeId": "only for create_appointment",
  "calendarId": "only for create_appointment",
  "appointmentTime": "only for create_appointment — ISO datetime",
  "durationMin": 30,
  "pipelineId": "only for change_stage",
  "stageId": "only for change_stage"
}]

Rep: ${call.assignedTo?.name ?? 'Unknown'} (${call.assignedTo?.role ?? 'Unknown'})
Contact: ${call.contactName ?? 'Unknown'}
Property: ${call.property ? `${call.property.address}, ${call.property.city}, ${call.property.state}` : 'Unknown'}
Property status: ${call.property?.status ?? 'Unknown'}
Pipeline stage: ${call.property?.ghlPipelineStage ?? 'Unknown'}
Current pipeline id: ${call.property?.ghlPipelineId ?? 'Unknown'}
Call summary: ${call.aiSummary ?? 'No summary'}
Call outcome: ${call.callOutcome ?? 'Unknown'}
Call type: ${call.callType ?? 'Unknown'}
Transcript: ${transcriptExcerpt}${correctionContext}

${knowledgeBlock ? `\nCOMPANY PLAYBOOK CONTEXT — use these to inform your action suggestions:\n${knowledgeBlock}` : ''}`,
      }],
    })

    const text = response.content[0]
    if (text.type !== 'text') throw new Error('Unexpected response')

    logAiCall({
      tenantId: ctx.tenantId, userId: ctx.userId,
      type: 'next_steps', pageContext: `call:${params.id}`,
      input: userContent.slice(0, 5000), output: text.text.slice(0, 5000),
      tokensIn: response.usage?.input_tokens, tokensOut: response.usage?.output_tokens,
      durationMs: timer(), model: 'claude-sonnet-4-6',
    }).catch(() => {})

    // Walk brackets with a string-aware counter so trailing prose after the
    // JSON array doesn't poison JSON.parse with "Unexpected non-whitespace
    // character after JSON". Symptom was silent empty aiNextSteps when the
    // model appended explanatory paragraphs. Mirrors grading.ts.
    const arrayText = (function extractFirstJsonArray(t: string): string | null {
      const start = t.indexOf('[')
      if (start < 0) return null
      let depth = 0, inString = false, escaped = false
      for (let i = start; i < t.length; i++) {
        const ch = t[i]
        if (escaped) { escaped = false; continue }
        if (ch === '\\') { escaped = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '[') depth++
        else if (ch === ']') {
          depth--
          if (depth === 0) return t.slice(start, i + 1)
        }
      }
      return null
    })(text.text)
    if (!arrayText) throw new Error('No balanced JSON array found in response')

    const rawSteps = JSON.parse(arrayText) as Array<{
      type: string; label: string; reasoning: string
      noteBody?: string
      smsBody?: string; sendAt?: string; timezone?: string
      appointmentTypeId?: string; calendarId?: string; appointmentTime?: string; durationMin?: number
      pipelineId?: string; stageId?: string
    }>

    // Legacy: AI may still emit "schedule_sms" despite the prompt update.
    // Collapse it into send_sms with sendAt preserved.
    for (const s of rawSteps) {
      if (s.type === 'schedule_sms') {
        s.type = 'send_sms'
        if (!s.sendAt && (s as { sendAtIso?: string; scheduleAt?: string }).sendAtIso) s.sendAt = (s as { sendAtIso?: string }).sendAtIso
      }
    }

    // Server-side dedup: only keep one action per type
    const seenTypes = new Set<string>()
    const steps = rawSteps.filter(s => {
      if (seenTypes.has(s.type)) return false
      seenTypes.add(s.type)
      return true
    })

    // Persist generated steps to DB (merge with existing if adding single action).
    // FIX (cross-tenant defense): prior code did `where: { id: params.id }` —
    // unscoped. Same pattern as deal-intel/route.ts:75: a mass-assignment via
    // params.id that happened to collide with a different-tenant call would
    // overwrite that tenant's aiNextSteps. tenantId scope makes the leak
    // structurally impossible.
    if (requestedType) {
      const merged = [...existingSteps.map(s => ({ ...s, status: (s as { status?: string }).status ?? 'pending', pushedAt: (s as { pushedAt?: string | null }).pushedAt ?? null })), ...steps.map(s => ({ ...s, status: 'pending', pushedAt: null }))]
      await db.call.update({
        where: { id: params.id, tenantId: ctx.tenantId },
        data: { aiNextSteps: merged },
      })
    } else {
      const stepsWithStatus = steps.map(s => ({ ...s, status: 'pending', pushedAt: null }))
      await db.call.update({
        where: { id: params.id, tenantId: ctx.tenantId },
        data: { aiNextSteps: stepsWithStatus },
      })
    }

    return NextResponse.json({ steps })
  } catch (err) {
    console.error('[Generate Next Steps] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to generate next steps' }, { status: 500 })
  }
})
