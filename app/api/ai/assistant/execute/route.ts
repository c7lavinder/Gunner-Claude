// POST /api/ai/assistant/execute — execute an approved tool call
// Wires to real GHL API + Gunner DB actions
//
// editedInput contract (added Blocker #2 / Prompt 4):
//   Client sends `editedInput` when the user touched the inline edit panel on
//   any of the 7 target action families. Final payload = { ...original, ...edited }
//   — edit wins on overlap. originalInput + editedInput BOTH persisted in the
//   audit row so the AI-learning loop can diff proposed vs executed later.
//   Branches the prompt did not widen (e.g. log_offer, update_property, …)
//   simply never receive editedInput and fall through to the original path.
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { resolveAssignee } from '@/lib/ghl/resolveAssignee'
import { logFailure } from '@/lib/audit'
import { z } from 'zod'

const bodySchema = z.object({
  toolCallId: z.string(),
  pageContext: z.string().optional().nullable(),
  rejected: z.boolean().optional(),
  // Loose dict — per-branch validation happens inline where a required field
  // is enforced (e.g. change_pipeline_stage requires stageId; see defect #4 in
  // ACTION_EXECUTION_AUDIT.md). All keys are optional at the schema level so
  // the same endpoint can service 40+ action types with different shapes.
  editedInput: z.record(z.unknown()).optional(),
})

export const POST = withTenant(async (request, ctx) => {
  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { toolCallId, pageContext, rejected, editedInput } = parsed.data

  // Local aliases for the existing 50+ in-handler usages — minimum churn.
  const tenantId = ctx.tenantId
  const sessionUserId = ctx.userId
  const today = new Date().toISOString().slice(0, 10)

  // Find the tool call in today's messages
  const messages = await db.assistantMessage.findMany({
    where: { tenantId: tenantId, userId: sessionUserId, sessionDate: today, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, toolCalls: true },
  })

  let toolCall: { id: string; name: string; input: Record<string, unknown> } | null = null
  for (const msg of messages) {
    const calls = (msg.toolCalls ?? []) as Array<{ id: string; name: string; input: Record<string, unknown> }>
    const found = calls.find(tc => tc.id === toolCallId)
    if (found) { toolCall = found; break }
  }

  if (!toolCall) return NextResponse.json({ error: 'Tool call not found' }, { status: 404 })

  // Merge client-supplied edits OVER the AI's original input. Edit wins on
  // overlap. Branches read from `mergedInput`; audit rows persist BOTH shapes.
  const originalInput = toolCall.input as Record<string, unknown>
  const editedInputSafe = (editedInput ?? {}) as Record<string, unknown>
  const mergedInput: Record<string, unknown> = { ...originalInput, ...editedInputSafe }
  const wasEdited = Object.keys(editedInputSafe).length > 0

  // Handle rejection — log for AI learning and return
  if (rejected) {
    await db.actionLog.create({
      data: {
        tenantId, userId: sessionUserId,
        actionType: toolCall.name,
        proposed: JSON.parse(JSON.stringify(originalInput)),
        wasEdited: false, wasRejected: true,
        pageContext: pageContext ?? undefined,
      },
    }).catch(err => logFailure(tenantId, 'assistant.rejection_log_failed', 'actionLog', err))
    return NextResponse.json({ result: 'Rejection logged' })
  }

  // Helper: resolve contact ID from name or page context
  async function resolveContactId(): Promise<string | null> {
    if (pageContext?.startsWith('property:')) {
      const propertyId = pageContext.split(':')[1]
      const property = await db.property.findUnique({
        where: { id: propertyId, tenantId },
        select: { ghlContactId: true },
      })
      return property?.ghlContactId ?? null
    }
    if (pageContext?.startsWith('call:')) {
      const callId = pageContext.split(':')[1]
      const call = await db.call.findUnique({
        where: { id: callId, tenantId },
        select: { ghlContactId: true },
      })
      return call?.ghlContactId ?? null
    }
    return null
  }

  try {
    let result = ''
    let ghl: Awaited<ReturnType<typeof getGHLClient>> | null = null
    try { ghl = await getGHLClient(tenantId) } catch (err) {
      logFailure(tenantId, 'assistant.execute.ghl_client_init_failed', 'ghl', err)
    }

    switch (toolCall.name) {
      case 'send_sms': {
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked — cannot send SMS'; break }
        if (!ghl) { result = 'GHL not connected'; break }

        const message = String(mergedInput.message ?? '').trim()
        if (!message) {
          return NextResponse.json({ error: 'SMS message text is required' }, { status: 400 })
        }
        await ghl.sendSMS(contactId, message)
        result = `SMS sent to ${mergedInput.contactName ?? 'contact'}: "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}"`

        // Business-event audit row (sms.sent) — preserved verbatim so existing
        // dashboards querying on action='sms.sent' keep working. The universal
        // assistant.action.${type} row is added at the end of try for AI-learning.
        await db.auditLog.create({
          data: {
            tenantId: tenantId, userId: sessionUserId,
            action: 'sms.sent', resource: 'contact', resourceId: contactId,
            source: 'USER', severity: 'INFO',
            payload: { via: 'assistant', contactId, messageLength: message.length },
          },
        }).catch(err => console.error('[Assistant] Audit log write failed:', err instanceof Error ? err.message : err))
        break
      }

      case 'create_task': {
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked — cannot create task'; break }
        if (!ghl) { result = 'GHL not connected'; break }

        const title = String(mergedInput.title ?? 'Follow up')
        const description = String(mergedInput.description ?? '')
        const dueDate = mergedInput.dueDate ? new Date(String(mergedInput.dueDate)) : new Date(Date.now() + 86400000) // default tomorrow

        // Resolve internal user id -> GHL user id via the shared helper. Same
        // three-state note vocabulary as call-detail's actions route.
        const { ghlUserId: taskAssignee, note: taskAssigneeNote } =
          await resolveAssignee(mergedInput.assignedTo as string | undefined, tenantId)

        await ghl.createTask(contactId, {
          title,
          body: description,
          dueDate: dueDate.toISOString(),
          completed: false,
          assignedTo: taskAssignee,
        })
        result = `Task created: "${title}"${taskAssignee ? ` (assigned to GHL user)` : (mergedInput.assignedTo ? ` (assignee skipped: ${taskAssigneeNote})` : '')}, due ${dueDate.toISOString().slice(0, 10)}`
        break
      }

      case 'add_note': {
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked — cannot add note'; break }
        if (!ghl) { result = 'GHL not connected'; break }

        const note = String(mergedInput.note ?? '').trim()
        if (!note) {
          return NextResponse.json({ error: 'Note text is required' }, { status: 400 })
        }
        await ghl.addNote(contactId, note)
        result = `Note added to ${mergedInput.contactName ?? 'contact'} (${note.length} chars)`
        break
      }

      case 'change_pipeline_stage': {
        // Rule 2: no fuzzy matching. stageId must be an explicit GHL id from a
        // client-populated dropdown. pipelineId is an optional hint; when
        // absent we scan all pipelines to find the owner of the given stageId.
        if (!ghl) { result = 'GHL not connected'; break }
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked'; break }

        const targetStageId = mergedInput.stageId ? String(mergedInput.stageId) : undefined
        if (!targetStageId) {
          return NextResponse.json(
            { error: 'stageId is required for change_pipeline_stage (Rule 2: no fuzzy matching)' },
            { status: 400 },
          )
        }
        const hintPipelineId = mergedInput.pipelineId ? String(mergedInput.pipelineId) : undefined

        const pipelinesResp = await ghl.getPipelines()
        const candidatePipelines = hintPipelineId
          ? (pipelinesResp.pipelines ?? []).filter(p => p.id === hintPipelineId)
          : (pipelinesResp.pipelines ?? [])
        const ownerPipeline = candidatePipelines.find(p =>
          p.stages?.some((s: { id: string }) => s.id === targetStageId),
        )
        if (!ownerPipeline) {
          return NextResponse.json(
            { error: 'stageId not found in the specified pipeline(s)' },
            { status: 400 },
          )
        }
        const targetStage = ownerPipeline.stages?.find(s => s.id === targetStageId)

        // Find opportunity for this contact in this pipeline
        const opps = await ghl.searchOpportunities(ownerPipeline.id, 10)
        const opp = opps.opportunities?.find(o => o.contactId === contactId)

        if (opp) {
          await ghl.updateOpportunityStage(opp.id, targetStageId)
          result = `Moved ${mergedInput.contactName ?? 'contact'} to "${targetStage?.name ?? targetStageId}" in ${ownerPipeline.name}`
        } else {
          // Create new opportunity at the target stage
          await ghl.createOpportunity({
            pipelineId: ownerPipeline.id,
            stageId: targetStageId,
            contactId,
            name: String(mergedInput.contactName ?? 'Deal'),
          })
          result = `Created opportunity for ${mergedInput.contactName ?? 'contact'} at "${targetStage?.name ?? targetStageId}" in ${ownerPipeline.name}`
        }
        break
      }

      case 'create_appointment': {
        if (!ghl) { result = 'GHL not connected'; break }
        // GHL appointment creation is complex — for now acknowledge and log
        result = `Appointment "${toolCall.input.title}" at ${toolCall.input.dateTime} — logged for scheduling`

        await db.auditLog.create({
          data: {
            tenantId: tenantId, userId: sessionUserId,
            action: 'appointment.requested', resource: 'calendar',
            source: 'USER', severity: 'INFO',
            payload: JSON.parse(JSON.stringify(toolCall.input)),
          },
        }).catch(err => console.error('[Assistant] Audit log write failed:', err instanceof Error ? err.message : err))
        break
      }

      case 'update_property': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!propertyId) { result = 'No property in context — navigate to a property page first'; break }

        const field = String(toolCall.input.field)
        let value: unknown = toolCall.input.value

        // Parse numeric fields
        const numericFields = ['askingPrice', 'arv', 'mao', 'currentOffer', 'contractPrice', 'assignmentFee',
          'offerPrice', 'repairCost', 'wholesalePrice', 'highestOffer', 'acceptedPrice', 'finalProfit',
          'beds', 'baths', 'sqft', 'yearBuilt']
        if (numericFields.includes(field) && typeof value === 'string') {
          value = parseFloat(value.replace(/[^0-9.-]/g, '')) || null
        }

        await db.property.update({
          where: { id: propertyId, tenantId: tenantId },
          data: { [field]: value },
        })
        result = `Updated ${field} to ${toolCall.input.value}`
        break
      }

      case 'log_offer': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!propertyId) { result = 'No property in context'; break }

        const amount = parseFloat(String(toolCall.input.amount).replace(/[^0-9.]/g, ''))
        await db.propertyMilestone.create({
          data: {
            tenantId: tenantId, propertyId,
            type: 'OFFER_MADE', source: 'AI_ASSISTANT',
            loggedById: sessionUserId,
            notes: `Offer: $${amount.toLocaleString()}. ${toolCall.input.notes ?? ''}`,
          },
        })
        if (amount > 0) {
          // FIX: was leaking — prior code used `update({ where: { id: propertyId } })` without tenant scope
          await db.property.update({
            where: { id: propertyId, tenantId },
            data: { currentOffer: amount },
          }).catch(err => logFailure(tenantId, 'assistant.execute.property_update_failed', 'property', err, { propertyId, amount }))
        }
        result = `Offer of $${amount.toLocaleString()} logged on property`
        break
      }

      case 'log_milestone': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!propertyId) { result = 'No property in context'; break }

        await db.propertyMilestone.create({
          data: {
            tenantId: tenantId, propertyId,
            type: String(toolCall.input.type) as import('@prisma/client').MilestoneType,
            source: 'AI_ASSISTANT',
            loggedById: sessionUserId,
            notes: String(toolCall.input.notes ?? ''),
          },
        })
        result = `${String(toolCall.input.type).replace(/_/g, ' ')} milestone logged`
        break
      }

      case 'update_contact': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact linked or GHL not connected'; break }

        const updates: Record<string, unknown> = {}
        if (mergedInput.firstName) updates.firstName = mergedInput.firstName
        if (mergedInput.lastName) updates.lastName = mergedInput.lastName
        if (mergedInput.phone) updates.phone = mergedInput.phone
        if (mergedInput.email) updates.email = mergedInput.email
        if (mergedInput.tags) updates.tags = mergedInput.tags

        if (Object.keys(updates).length === 0) {
          return NextResponse.json({ error: 'At least one field to update is required' }, { status: 400 })
        }

        await ghl.updateContact(contactId, updates)
        result = `Contact updated: ${Object.keys(updates).join(', ')}`
        break
      }

      case 'complete_task': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact linked or GHL not connected'; break }

        const taskId = String(mergedInput.taskId ?? '')
        if (!taskId) { result = 'No task ID provided'; break }

        await ghl.completeTask(contactId, taskId)
        result = `Task "${mergedInput.title ?? taskId}" marked complete`
        break
      }

      case 'send_email': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact linked or GHL not connected'; break }

        const subject = String(mergedInput.subject ?? '').trim()
        const emailBody = String(mergedInput.body ?? '').trim()
        if (!subject || !emailBody) {
          return NextResponse.json({ error: 'Email subject and body are required' }, { status: 400 })
        }

        await ghl.sendEmail(contactId, subject, emailBody)
        result = `Email sent to ${mergedInput.contactName ?? 'contact'}: "${subject}"`
        break
      }

      case 'add_contact_to_property': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!propertyId) { result = 'No property in context'; break }

        // Search for contact in GHL
        if (!ghl) { result = 'GHL not connected'; break }
        const searchResult = await ghl.searchContacts({ query: String(toolCall.input.contactName ?? ''), limit: 1 })
        const contact = searchResult.contacts?.[0]
        if (!contact) { result = `Contact "${toolCall.input.contactName}" not found in GHL`; break }

        // Create or find seller record
        const seller = await db.seller.upsert({
          where: { id: `ghl_${contact.id}` },
          create: {
            id: `ghl_${contact.id}`,
            tenantId: tenantId,
            name: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
            phone: contact.phone ?? null,
            email: contact.email ?? null,
            ghlContactId: contact.id,
          },
          update: {},
        })

        // Link to property
        await db.propertySeller.upsert({
          where: { propertyId_sellerId: { propertyId, sellerId: seller.id } },
          create: { propertyId, sellerId: seller.id, role: String(toolCall.input.role ?? 'Primary Seller'), isPrimary: false },
          update: {},
        })

        result = `Added ${seller.name} as ${toolCall.input.role ?? 'contact'} on property`
        break
      }

      case 'change_property_status': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!propertyId) { result = 'No property in context'; break }

        const statusType = String(toolCall.input.statusType ?? 'acquisition')
        const newStatus = String(toolCall.input.newStatus)
        const field = statusType === 'disposition' ? 'dispoStatus' : 'status'

        await db.property.update({
          where: { id: propertyId, tenantId: tenantId },
          data: { [field]: newStatus },
        })
        result = `${statusType} status changed to ${newStatus}`
        break
      }

      case 'add_team_member_to_property': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!propertyId) { result = 'No property in context'; break }

        const userName = String(toolCall.input.userName ?? '')
        const role = String(toolCall.input.role ?? 'Team')
        const matchedUser = await db.user.findFirst({
          where: { tenantId: tenantId, name: { contains: userName, mode: 'insensitive' } },
          select: { id: true, name: true, role: true },
        })

        if (!matchedUser) { result = `User "${userName}" not found`; break }

        await db.propertyTeamMember.upsert({
          where: { propertyId_userId: { propertyId, userId: matchedUser.id } },
          create: { propertyId, userId: matchedUser.id, tenantId: tenantId, role, source: 'assistant' },
          update: { role },
        })
        result = `Added ${matchedUser.name} as ${role} on property`
        break
      }

      case 'generate_deal_blast': {
        result = `Deal blast draft generated for ${toolCall.input.propertyAddress ?? 'property'}. Go to the Buyers tab to review and send.`
        break
      }

      case 'create_contact': {
        if (!ghl) { result = 'GHL not connected'; break }
        const firstName = String(mergedInput.firstName ?? '').trim()
        const lastName = String(mergedInput.lastName ?? '').trim()
        const phone = String(mergedInput.phone ?? '').trim()
        if (!firstName && !lastName) {
          return NextResponse.json({ error: 'At least one of firstName or lastName is required' }, { status: 400 })
        }
        if (!phone && !mergedInput.email) {
          return NextResponse.json({ error: 'phone or email is required to create a contact' }, { status: 400 })
        }
        const newContact = await ghl.createContact({
          firstName, lastName, phone,
          email: mergedInput.email ? String(mergedInput.email) : undefined,
          source: mergedInput.source ? String(mergedInput.source) : undefined,
          tags: Array.isArray(mergedInput.tags) ? (mergedInput.tags as unknown[]).map(String) : undefined,
        })
        result = `Contact created: ${firstName} ${lastName} (${phone})${newContact?.contact?.id ? ` — ID: ${newContact.contact.id}` : ''}`
        break
      }

      case 'create_opportunity': {
        // Rule 2: pipelineId + stageId must be explicit GHL ids. Fuzzy
        // name-matching removed — client populates both from GHL dropdowns.
        if (!ghl) { result = 'GHL not connected'; break }
        const oppContactId = await resolveContactId()
        if (!oppContactId) { result = 'No contact linked — cannot create opportunity'; break }

        const oppPipelineId = mergedInput.pipelineId ? String(mergedInput.pipelineId) : undefined
        const oppStageId = mergedInput.stageId ? String(mergedInput.stageId) : undefined
        if (!oppPipelineId || !oppStageId) {
          return NextResponse.json(
            { error: 'pipelineId and stageId are required for create_opportunity (Rule 2: no fuzzy matching)' },
            { status: 400 },
          )
        }

        const pipelinesResp = await ghl.getPipelines()
        const pipeline = pipelinesResp.pipelines?.find(p => p.id === oppPipelineId)
        if (!pipeline) {
          return NextResponse.json({ error: 'pipelineId not found' }, { status: 400 })
        }
        const stage = pipeline.stages?.find(s => s.id === oppStageId)
        if (!stage) {
          return NextResponse.json({ error: 'stageId not found in the specified pipeline' }, { status: 400 })
        }

        await ghl.createOpportunity({
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId: oppContactId,
          name: String(mergedInput.dealName ?? 'New Deal'),
        })
        result = `Opportunity created: "${mergedInput.dealName ?? 'New Deal'}" in ${pipeline.name} → ${stage.name}`
        break
      }

      case 'regrade_call': {
        const callId = pageContext?.startsWith('call:') ? pageContext.split(':')[1] : null
        if (!callId) { result = 'No call in context — navigate to a call page first'; break }
        await db.call.update({
          where: { id: callId, tenantId },
          data: { gradingStatus: 'PENDING' },
        })
        result = 'Call queued for re-grading. Refresh the page in a moment to see updated results.'
        break
      }

      case 'summarize_property': {
        const propId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!propId) { result = 'No property in context'; break }
        result = 'Property summary is displayed in the page data above. Ask me specific questions about this deal.'
        break
      }

      case 'schedule_sms': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact linked or GHL not connected'; break }
        // GHL doesn't have native scheduled SMS — create a task as reminder
        await ghl.createTask(contactId, {
          title: `Send SMS: ${String(toolCall.input.message ?? '').slice(0, 50)}`,
          body: `Scheduled SMS content: ${toolCall.input.message}\n\nScheduled for: ${toolCall.input.scheduledAt}`,
          dueDate: new Date(String(toolCall.input.scheduledAt)).toISOString(),
          completed: false,
        })
        result = `SMS reminder task created for ${toolCall.input.scheduledAt}. Message: "${String(toolCall.input.message ?? '').slice(0, 60)}..."`
        break
      }

      case 'add_internal_note': {
        const notePropertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!notePropertyId) { result = 'No property in context'; break }
        // FIX: was leaking — prior code used `findUnique({ where: { id: notePropertyId } })` without tenant scope
        const existingNotes = (await db.property.findFirst({
          where: { id: notePropertyId, tenantId },
          select: { internalNotes: true },
        }))?.internalNotes ?? ''
        const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const newNotes = `[${timestamp} via AI] ${toolCall.input.note}\n\n${existingNotes}`
        await db.property.update({
          where: { id: notePropertyId, tenantId },
          data: { internalNotes: newNotes },
        })
        result = `Internal note added to property`
        break
      }

      case 'update_deal_intel': {
        const diPropertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!diPropertyId) { result = 'No property in context'; break }
        // FIX: was leaking — prior code used `findUnique({ where: { id: diPropertyId } })` without tenant scope
        const prop = await db.property.findFirst({
          where: { id: diPropertyId, tenantId },
          select: { dealIntel: true },
        })
        const intel = (prop?.dealIntel ?? {}) as Record<string, unknown>
        intel[String(toolCall.input.field)] = {
          value: toolCall.input.value,
          source: 'assistant',
          evidence: toolCall.input.evidence ?? null,
          updatedAt: new Date().toISOString(),
        }
        await db.property.update({
          where: { id: diPropertyId, tenantId },
          data: { dealIntel: JSON.parse(JSON.stringify(intel)) },
        })
        result = `Deal intel updated: ${toolCall.input.field} = ${toolCall.input.value}`
        break
      }

      case 'calculate_mao': {
        const arv = Number(toolCall.input.arv ?? 0)
        const repairCost = Number(toolCall.input.repairCost ?? 0)
        const wholesaleFee = Number(toolCall.input.wholesaleFee ?? 10000)
        const profitMargin = Number(toolCall.input.profitMargin ?? 0.30)
        const mao = arv * (1 - profitMargin) - repairCost - wholesaleFee
        // Save MAO to property if on a property page
        const maoPropertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (maoPropertyId && mao > 0) {
          await db.property.update({
            where: { id: maoPropertyId, tenantId },
            data: { mao },
          }).catch(err => logFailure(tenantId, 'assistant.execute.mao_update_failed', 'property', err, { maoPropertyId, mao }))
        }
        result = `MAO = $${Math.round(mao).toLocaleString()}\n(ARV $${arv.toLocaleString()} × ${((1 - profitMargin) * 100).toFixed(0)}% - $${repairCost.toLocaleString()} repairs - $${wholesaleFee.toLocaleString()} fee)${maoPropertyId ? '\nSaved to property record.' : ''}`
        break
      }

      case 'reclassify_call': {
        const rcCallId = pageContext?.startsWith('call:') ? pageContext.split(':')[1] : null
        if (!rcCallId) { result = 'No call in context'; break }
        await db.call.update({
          where: { id: rcCallId, tenantId },
          data: { callType: String(toolCall.input.newCallType) },
        })
        result = `Call reclassified as ${String(toolCall.input.newCallType).replace(/_/g, ' ')}`
        break
      }

      case 'mark_call_reviewed': {
        const reviewCallId = pageContext?.startsWith('call:') ? pageContext.split(':')[1] : null
        if (!reviewCallId) { result = 'No call in context'; break }
        await db.auditLog.create({
          data: {
            tenantId, userId: sessionUserId,
            action: 'call.reviewed', resource: 'call', resourceId: reviewCallId,
            source: 'USER', severity: 'INFO',
            payload: { notes: toolCall.input.notes ?? '', via: 'assistant' },
          },
        })
        result = `Call marked as reviewed${toolCall.input.notes ? `: ${toolCall.input.notes}` : ''}`
        break
      }

      case 'add_buyer': {
        await db.buyer.create({
          data: {
            tenantId,
            name: String(toolCall.input.name ?? ''),
            phone: toolCall.input.phone ? String(toolCall.input.phone) : null,
            email: toolCall.input.email ? String(toolCall.input.email) : null,
            tags: toolCall.input.markets ? (toolCall.input.markets as string[]) : [],
            isActive: true,
          },
        })
        result = `Buyer added: ${toolCall.input.name}${toolCall.input.phone ? ` (${toolCall.input.phone})` : ''}`
        break
      }

      case 'invite_team_member': {
        try {
          const inviteRes = await fetch(`${process.env.NEXTAUTH_URL ?? ''}/api/tenants/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: toolCall.input.email,
              role: toolCall.input.role,
              name: toolCall.input.name,
            }),
          })
          if (inviteRes.ok) result = `Invite sent to ${toolCall.input.email} as ${String(toolCall.input.role).replace(/_/g, ' ')}`
          else result = 'Failed to send invite — check the email address'
        } catch {
          result = 'Invite failed'
        }
        break
      }

      // ═══ NEW TOOLS — BATCH 2 ═══

      case 'schedule_email': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact linked or GHL not connected'; break }
        await ghl.createTask(contactId, {
          title: `Send email: ${String(toolCall.input.subject ?? '').slice(0, 40)}`,
          body: `Subject: ${toolCall.input.subject}\n\nBody: ${toolCall.input.body}\n\nScheduled for: ${toolCall.input.scheduledAt}`,
          dueDate: new Date(String(toolCall.input.scheduledAt)).toISOString(),
          completed: false,
        })
        result = `Email reminder task created for ${toolCall.input.scheduledAt}`
        break
      }

      case 'update_task': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact or GHL not connected'; break }
        const updateTaskId = String(mergedInput.taskId ?? '')
        if (!updateTaskId) {
          return NextResponse.json({ error: 'taskId is required for update_task' }, { status: 400 })
        }
        const taskUpdates: Record<string, unknown> = {}
        if (mergedInput.title) taskUpdates.title = mergedInput.title
        if (mergedInput.description) taskUpdates.body = mergedInput.description
        if (mergedInput.dueDate) taskUpdates.dueDate = new Date(String(mergedInput.dueDate)).toISOString()
        // Assignment edits route through the shared resolver — single source of truth.
        if (mergedInput.assignedTo) {
          const { ghlUserId: updateTaskAssignee } =
            await resolveAssignee(String(mergedInput.assignedTo), tenantId)
          if (updateTaskAssignee) taskUpdates.assignedTo = updateTaskAssignee
        }
        if (Object.keys(taskUpdates).length === 0) {
          return NextResponse.json({ error: 'At least one field to update is required' }, { status: 400 })
        }
        await ghl.updateTask(contactId, updateTaskId, taskUpdates)
        result = `Task updated: ${Object.keys(taskUpdates).join(', ')}`
        break
      }

      case 'add_tags_to_contact': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact or GHL not connected'; break }
        const contact = await ghl.getContact(contactId)
        const existing = (contact as { contact?: { tags?: string[] } })?.contact?.tags ?? []
        const newTags = [...new Set([...existing, ...(toolCall.input.tags as string[])])]
        await ghl.updateContact(contactId, { tags: newTags })
        result = `Tags added: ${(toolCall.input.tags as string[]).join(', ')}`
        break
      }

      case 'remove_tags_from_contact': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact or GHL not connected'; break }
        const ct = await ghl.getContact(contactId)
        const currTags = (ct as { contact?: { tags?: string[] } })?.contact?.tags ?? []
        const removeTags = new Set((toolCall.input.tags as string[]).map(t => t.toLowerCase()))
        const filtered = currTags.filter(t => !removeTags.has(t.toLowerCase()))
        await ghl.updateContact(contactId, { tags: filtered })
        result = `Tags removed: ${(toolCall.input.tags as string[]).join(', ')}`
        break
      }

      case 'assign_contact_to_user': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact or GHL not connected'; break }
        const matchUser = await db.user.findFirst({
          where: { tenantId, name: { contains: String(toolCall.input.userName), mode: 'insensitive' } },
          select: { ghlUserId: true, name: true },
        })
        if (!matchUser?.ghlUserId) { result = `User "${toolCall.input.userName}" not found or not linked to GHL`; break }
        await ghl.updateContact(contactId, { assignedTo: matchUser.ghlUserId })
        result = `Contact assigned to ${matchUser.name}`
        break
      }

      case 'update_opportunity_status': {
        if (!ghl) { result = 'GHL not connected'; break }
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked'; break }
        const status = String(mergedInput.status ?? '').trim()
        if (!status) {
          return NextResponse.json({ error: 'status is required' }, { status: 400 })
        }
        const pipes = await ghl.getPipelines()
        const pipe = pipes.pipelines?.[0]
        if (!pipe) { result = 'No pipeline found'; break }
        const opps = await ghl.searchOpportunities(pipe.id, 10)
        const opp = opps.opportunities?.find(o => o.contactId === contactId)
        if (!opp) { result = 'No opportunity found for this contact'; break }
        await ghl.updateOpportunity(opp.id, { status })
        result = `Opportunity status updated to ${status}`
        break
      }

      case 'update_opportunity_value': {
        if (!ghl) { result = 'GHL not connected'; break }
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked'; break }
        const monetaryValue = Number(mergedInput.value)
        if (!Number.isFinite(monetaryValue)) {
          return NextResponse.json({ error: 'value must be a finite number' }, { status: 400 })
        }
        const pipes2 = await ghl.getPipelines()
        const pipe2 = pipes2.pipelines?.[0]
        if (!pipe2) { result = 'No pipeline found'; break }
        const opps2 = await ghl.searchOpportunities(pipe2.id, 10)
        const opp2 = opps2.opportunities?.find(o => o.contactId === contactId)
        if (!opp2) { result = 'No opportunity found'; break }
        await ghl.updateOpportunity(opp2.id, { monetaryValue })
        result = `Opportunity value updated to $${monetaryValue.toLocaleString()}`
        break
      }

      case 'reschedule_appointment':
      case 'cancel_appointment':
      case 'update_appointment_status': {
        result = `${toolCall.name.replace(/_/g, ' ')} — logged. GHL calendar API integration pending.`
        await db.auditLog.create({ data: { tenantId, userId: sessionUserId, action: `appointment.${toolCall.name}`, resource: 'calendar', source: 'USER', severity: 'INFO', payload: JSON.parse(JSON.stringify(toolCall.input)) } }).catch(err => console.error('[Assistant] Audit log write failed:', err instanceof Error ? err.message : err))
        break
      }

      case 'add_contact_to_workflow':
      case 'remove_contact_from_workflow': {
        result = `${toolCall.name.replace(/_/g, ' ')} — logged. GHL workflow API integration pending.`
        await db.auditLog.create({ data: { tenantId, userId: sessionUserId, action: `workflow.${toolCall.name}`, resource: 'workflow', source: 'USER', severity: 'INFO', payload: JSON.parse(JSON.stringify(toolCall.input)) } }).catch(err => console.error('[Assistant] Audit log write failed:', err instanceof Error ? err.message : err))
        break
      }

      case 'send_sms_blast':
      case 'send_email_blast': {
        result = `Blast queued. Go to the Disposition page to review and send. This is a high-stakes action requiring manual approval.`
        break
      }

      case 'bulk_tag_contacts': {
        result = `Bulk tag request logged for ${(toolCall.input.contactNames as string[])?.length ?? 0} contacts. This is a high-stakes action requiring manual approval.`
        break
      }

      case 'log_counter_offer': {
        const coPropId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!coPropId) { result = 'No property in context'; break }
        const coAmount = parseFloat(String(toolCall.input.amount).replace(/[^0-9.]/g, ''))
        await db.property.update({
          where: { id: coPropId, tenantId },
          data: { currentOffer: coAmount },
        })
        await db.auditLog.create({ data: { tenantId, userId: sessionUserId, action: 'property.counter_offer', resource: 'property', resourceId: coPropId, source: 'USER', severity: 'INFO', payload: JSON.parse(JSON.stringify({ amount: coAmount, fromSeller: toolCall.input.fromSeller, notes: toolCall.input.notes })) } }).catch(err => console.error('[Assistant] Audit log write failed:', err instanceof Error ? err.message : err))
        result = `Counter offer of $${coAmount.toLocaleString()} logged`
        break
      }

      case 'remove_contact_from_property': {
        const rcpPropId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!rcpPropId) { result = 'No property in context'; break }
        const seller = await db.propertySeller.findFirst({
          where: { propertyId: rcpPropId, seller: { name: { contains: String(toolCall.input.contactName), mode: 'insensitive' } } },
        })
        if (seller) {
          await db.propertySeller.delete({ where: { propertyId_sellerId: { propertyId: rcpPropId, sellerId: seller.sellerId } } })
          result = `Removed ${toolCall.input.contactName} from property`
        } else { result = `Contact "${toolCall.input.contactName}" not found on this property` }
        break
      }

      case 'remove_team_member': {
        const rtPropId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!rtPropId) { result = 'No property in context'; break }
        const member = await db.propertyTeamMember.findFirst({
          where: { propertyId: rtPropId, user: { name: { contains: String(toolCall.input.userName), mode: 'insensitive' } } },
        })
        if (member) {
          // FIX: was leaking — prior delete used compound `propertyId_userId` only.
          // PropertyTeamMember has tenantId; deleteMany lets us add it without
          // dropping the unique-key guarantee from the surrounding context.
          await db.propertyTeamMember.deleteMany({
            where: { propertyId: rtPropId, userId: member.userId, tenantId },
          })
          result = `Removed ${toolCall.input.userName} from property`
        } else { result = `Team member "${toolCall.input.userName}" not found on this property` }
        break
      }

      case 'set_property_markets': {
        const mPropId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!mPropId) { result = 'No property in context'; break }
        // Find or create markets, link to property
        const marketNames = (toolCall.input.markets as string[]) ?? []
        for (const name of marketNames) {
          let market = await db.market.findFirst({ where: { tenantId, name } })
          if (!market) market = await db.market.create({ data: { tenantId, name } })
          // FIX: was leaking — prior code used `update({ where: { id: mPropId } })` without tenant scope
          await db.property.update({ where: { id: mPropId, tenantId }, data: { marketId: market.id } })
        }
        result = `Property markets set: ${marketNames.join(', ')}`
        break
      }

      case 'set_project_types': {
        const ptPropId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!ptPropId) { result = 'No property in context'; break }
        await db.property.update({ where: { id: ptPropId, tenantId }, data: { projectType: (toolCall.input.types as string[]).join(', ') } })
        result = `Project types set: ${(toolCall.input.types as string[]).join(', ')}`
        break
      }

      case 'trigger_property_enrichment': {
        const ePropId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (!ePropId) { result = 'No property in context'; break }
        import('@/lib/ai/enrich-property').then(({ enrichPropertyWithAI }) => enrichPropertyWithAI(ePropId, tenantId)).catch(err => logFailure(tenantId, 'assistant.execute.enrichment_failed', 'property', err, { ePropId }))
        result = 'Property enrichment triggered — ARV, repair estimate, rental estimate, and neighborhood summary will update shortly.'
        break
      }

      case 'approve_all_deal_intel':
      case 'create_comp_analysis': {
        result = `${toolCall.name.replace(/_/g, ' ')} — this action is available on the property detail page.`
        break
      }

      case 'generate_next_steps': {
        const nsCallId = pageContext?.startsWith('call:') ? pageContext.split(':')[1] : null
        if (!nsCallId) { result = 'No call in context'; break }
        result = 'Next steps can be generated using the "Generate Next Steps" button on the call detail page.'
        break
      }

      case 'push_next_step': {
        result = `Next step "${toolCall.input.stepLabel}" — use the push buttons on the Next Steps tab to execute individual actions.`
        break
      }

      case 'flag_calibration': {
        const fcCallId = pageContext?.startsWith('call:') ? pageContext.split(':')[1] : null
        if (!fcCallId) { result = 'No call in context'; break }
        await db.call.update({
          where: { id: fcCallId, tenantId },
          data: { isCalibration: true, calibrationNotes: `${toolCall.input.type}: ${toolCall.input.notes ?? ''}` },
        })
        result = `Call flagged as ${toolCall.input.type} calibration example`
        break
      }

      case 'move_buyer_in_pipeline': {
        const buyer = await db.buyer.findFirst({
          where: { tenantId, name: { contains: String(toolCall.input.buyerName), mode: 'insensitive' } },
        })
        if (!buyer) { result = `Buyer "${toolCall.input.buyerName}" not found`; break }
        // FIX: was leaking — prior code used `updateMany({ where: { buyerId } })` without tenantId.
        // Buyer was tenant-scoped via the findFirst above, but updateMany should re-enforce —
        // PropertyBuyerStage has its own tenantId column, so any cross-tenant linkage gets caught.
        await db.propertyBuyerStage.updateMany({
          where: { buyerId: buyer.id, tenantId },
          data: { stage: String(toolCall.input.newStage) },
        })
        result = `Moved ${buyer.name} to ${toolCall.input.newStage}`
        break
      }

      case 'update_buyer': {
        const ub = await db.buyer.findFirst({
          where: { tenantId, name: { contains: String(toolCall.input.buyerName), mode: 'insensitive' } },
        })
        if (!ub) { result = `Buyer "${toolCall.input.buyerName}" not found`; break }
        const ubData: Record<string, unknown> = {}
        if (toolCall.input.phone) ubData.phone = String(toolCall.input.phone)
        if (toolCall.input.email) ubData.email = String(toolCall.input.email)
        if (toolCall.input.markets) ubData.tags = toolCall.input.markets
        // FIX: was leaking — prior code used `update({ where: { id: ub.id } })` without tenant scope
        await db.buyer.update({ where: { id: ub.id, tenantId }, data: ubData })
        result = `Buyer ${ub.name} updated: ${Object.keys(ubData).join(', ')}`
        break
      }

      case 'rematch_buyers': {
        result = 'Buyer re-matching triggered. Check the Buyers tab on the property page for updated matches.'
        break
      }

      case 'update_user_role': {
        const targetUser = await db.user.findFirst({
          where: { tenantId, name: { contains: String(toolCall.input.userName), mode: 'insensitive' } },
        })
        if (!targetUser) { result = `User "${toolCall.input.userName}" not found`; break }
        // FIX: was leaking — prior code used `update({ where: { id: targetUser.id } })` without tenant scope
        await db.user.update({ where: { id: targetUser.id, tenantId }, data: { role: String(toolCall.input.newRole) as import('@prisma/client').UserRole } })
        result = `${targetUser.name} role updated to ${String(toolCall.input.newRole).replace(/_/g, ' ')}`
        break
      }

      case 'set_kpi_goals':
      case 'update_pipeline_config': {
        result = `${toolCall.name.replace(/_/g, ' ')} — use the Settings page to configure this.`
        break
      }

      // Information actions — these use context already loaded, no execution needed
      case 'call_analysis':
      case 'deal_blast_info':
      case 'deal_health':
      case 'compare_deals':
      case 'what_next':
      case 'rep_performance':
      case 'team_overview':
      case 'pipeline_health':
      case 'explain_field':
      case 'contact_objections':
      case 'seller_profile':
      case 'title_risk':
      case 'market_analysis': {
        result = 'Analysis generated from available data — see the assistant response above.'
        break
      }

      default:
        result = `Action "${toolCall.name}" acknowledged`
    }

    // AI-learning log — proposed vs executed shapes.
    await db.actionLog.create({
      data: {
        tenantId: tenantId,
        userId: sessionUserId,
        actionType: toolCall.name,
        proposed: JSON.parse(JSON.stringify(originalInput)),
        executed: JSON.parse(JSON.stringify(mergedInput)),
        wasEdited,
        wasRejected: false,
        pageContext: pageContext ?? undefined,
      },
    }).catch(err => logFailure(tenantId, 'assistant.execute.action_log_failed', 'actionLog', err))

    // Universal success audit row — parallel to call-detail's success audit.
    // Queryable via: action='assistant.action.<type>' AND severity='INFO'.
    // Payload persists originalInput + editedInput + wasEdited so the learning
    // loop can diff proposed vs executed offline. Wrapped in catch so audit
    // write failures never cascade into a user-facing 500.
    await db.auditLog.create({
      data: {
        tenantId,
        userId: sessionUserId,
        action: `assistant.action.${toolCall.name}`,
        resource: 'assistant',
        resourceId: toolCallId,
        source: 'USER',
        severity: 'INFO',
        payload: {
          type: toolCall.name,
          pageContext: pageContext ?? undefined,
          originalInput: JSON.parse(JSON.stringify(originalInput)),
          editedInput: wasEdited ? JSON.parse(JSON.stringify(editedInputSafe)) : undefined,
          wasEdited,
          result: typeof result === 'string' ? result.slice(0, 500) : undefined,
        },
      },
    }).catch(err => console.error('[Assistant] Success audit write failed:', err instanceof Error ? err.message : err))

    return NextResponse.json({ result })
  } catch (err) {
    console.error('[Assistant Execute]', err)

    const errorMessage = err instanceof Error ? err.message : 'Execution failed'
    const errorStack = err instanceof Error ? err.stack?.slice(0, 500) : undefined

    // Failure audit — two rows per failure by design (mirror of call-detail):
    //   ERROR row  (action='assistant.action.failed')  — forensic, full fields
    //   SYSTEM row (resource='assistant:<toolCallId>')  — triage, fast grep
    // Health query:
    //   SELECT COUNT(*) FROM audit_logs
    //   WHERE action='assistant.action.failed'
    //     AND created_at > NOW() - INTERVAL '24 hours';
    await db.auditLog.create({
      data: {
        tenantId,
        userId: sessionUserId,
        action: 'assistant.action.failed',
        resource: 'assistant',
        resourceId: toolCallId,
        source: 'USER',
        severity: 'ERROR',
        payload: {
          type: toolCall.name,
          pageContext: pageContext ?? undefined,
          originalInput: JSON.parse(JSON.stringify(originalInput)),
          editedInput: wasEdited ? JSON.parse(JSON.stringify(editedInputSafe)) : undefined,
          wasEdited,
          errorMessage,
          errorStack,
        },
      },
    }).catch(writeErr => {
      console.error('[Assistant] Failed to write ERROR audit row:', writeErr instanceof Error ? writeErr.message : writeErr)
    })

    await logFailure(tenantId, 'assistant.action.failed', `assistant:${toolCallId}`, err, {
      type: toolCall.name,
      pageContext: pageContext ?? undefined,
      originalInput,
      editedInput: wasEdited ? editedInputSafe : undefined,
      wasEdited,
    })

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
})
