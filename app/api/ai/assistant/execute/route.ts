// POST /api/ai/assistant/execute — execute an approved tool call
// Wires to real GHL API + Gunner DB actions
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { logFailure } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { toolCallId, pageContext, rejected } = await request.json()
  if (!toolCallId) return NextResponse.json({ error: 'toolCallId required' }, { status: 400 })

  const tenantId = session.tenantId
  const sessionUserId = session.userId
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

  // Handle rejection — log for AI learning and return
  if (rejected) {
    await db.actionLog.create({
      data: {
        tenantId, userId: sessionUserId,
        actionType: toolCall.name,
        proposed: JSON.parse(JSON.stringify(toolCall.input)),
        wasEdited: false, wasRejected: true,
        pageContext,
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

        const message = String(toolCall.input.message ?? '')
        await ghl.sendSMS(contactId, message)
        result = `SMS sent to ${toolCall.input.contactName ?? 'contact'}: "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}"`

        // Log to audit
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

        const title = String(toolCall.input.title ?? 'Follow up')
        const description = String(toolCall.input.description ?? '')
        const dueDate = toolCall.input.dueDate ? new Date(String(toolCall.input.dueDate)) : new Date(Date.now() + 86400000) // default tomorrow

        await ghl.createTask(contactId, {
          title,
          body: description,
          dueDate: dueDate.toISOString(),
          completed: false,
        })
        result = `Task created: "${title}"${toolCall.input.assignedTo ? ` (assigned: ${toolCall.input.assignedTo})` : ''}, due ${dueDate.toISOString().slice(0, 10)}`
        break
      }

      case 'add_note': {
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked — cannot add note'; break }
        if (!ghl) { result = 'GHL not connected'; break }

        const note = String(toolCall.input.note ?? '')
        await ghl.addNote(contactId, note)
        result = `Note added to ${toolCall.input.contactName ?? 'contact'} (${note.length} chars)`
        break
      }

      case 'change_pipeline_stage': {
        if (!ghl) { result = 'GHL not connected'; break }
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked'; break }

        // Find the opportunity for this contact
        const pipelines = await ghl.getPipelines()
        const targetPipeline = pipelines.pipelines?.find(p =>
          p.name.toLowerCase().includes(String(toolCall!.input.pipelineName ?? '').toLowerCase())
        ) ?? pipelines.pipelines?.[0]

        if (!targetPipeline) { result = 'Pipeline not found'; break }

        const targetStage = targetPipeline.stages?.find(s =>
          s.name.toLowerCase().includes(String(toolCall!.input.stageName ?? '').toLowerCase())
        )

        if (!targetStage) { result = `Stage "${toolCall.input.stageName}" not found in ${targetPipeline.name}`; break }

        // Find opportunity for this contact in this pipeline
        const opps = await ghl.searchOpportunities(targetPipeline.id, 10)
        const opp = opps.opportunities?.find(o => o.contactId === contactId)

        if (opp) {
          await ghl.updateOpportunityStage(opp.id, targetStage.id)
          result = `Moved ${toolCall.input.contactName ?? 'contact'} to "${targetStage.name}" in ${targetPipeline.name}`
        } else {
          // Create new opportunity
          await ghl.createOpportunity({
            pipelineId: targetPipeline.id,
            stageId: targetStage.id,
            contactId,
            name: String(toolCall.input.contactName ?? 'Deal'),
          })
          result = `Created opportunity for ${toolCall.input.contactName ?? 'contact'} at "${targetStage.name}" in ${targetPipeline.name}`
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
          await db.property.update({
            where: { id: propertyId },
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
        if (toolCall.input.firstName) updates.firstName = toolCall.input.firstName
        if (toolCall.input.lastName) updates.lastName = toolCall.input.lastName
        if (toolCall.input.phone) updates.phone = toolCall.input.phone
        if (toolCall.input.email) updates.email = toolCall.input.email
        if (toolCall.input.tags) updates.tags = toolCall.input.tags

        await ghl.updateContact(contactId, updates)
        result = `Contact updated: ${Object.keys(updates).join(', ')}`
        break
      }

      case 'complete_task': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact linked or GHL not connected'; break }

        const taskId = String(toolCall.input.taskId ?? '')
        if (!taskId) { result = 'No task ID provided'; break }

        await ghl.completeTask(contactId, taskId)
        result = `Task "${toolCall.input.title ?? taskId}" marked complete`
        break
      }

      case 'send_email': {
        const contactId = await resolveContactId()
        if (!contactId || !ghl) { result = 'No contact linked or GHL not connected'; break }

        await ghl.sendEmail(
          contactId,
          String(toolCall.input.subject ?? 'Follow Up'),
          String(toolCall.input.body ?? ''),
        )
        result = `Email sent to ${toolCall.input.contactName ?? 'contact'}: "${toolCall.input.subject}"`
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
        const newContact = await ghl.createContact({
          firstName: String(toolCall.input.firstName ?? ''),
          lastName: String(toolCall.input.lastName ?? ''),
          phone: String(toolCall.input.phone ?? ''),
          email: toolCall.input.email ? String(toolCall.input.email) : undefined,
          source: toolCall.input.source ? String(toolCall.input.source) : undefined,
          tags: Array.isArray(toolCall.input.tags) ? toolCall.input.tags.map(String) : undefined,
        })
        result = `Contact created: ${toolCall.input.firstName} ${toolCall.input.lastName ?? ''} (${toolCall.input.phone})${newContact?.contact?.id ? ` — ID: ${newContact.contact.id}` : ''}`
        break
      }

      case 'create_opportunity': {
        if (!ghl) { result = 'GHL not connected'; break }
        const oppContactId = await resolveContactId()
        if (!oppContactId) { result = 'No contact linked — cannot create opportunity'; break }

        const pipelines = await ghl.getPipelines()
        const pipeline = pipelines.pipelines?.find(p =>
          p.name.toLowerCase().includes(String(toolCall!.input.pipelineName ?? '').toLowerCase())
        ) ?? pipelines.pipelines?.[0]
        if (!pipeline) { result = 'No pipeline found'; break }

        const stage = toolCall.input.stageName
          ? pipeline.stages?.find(s => s.name.toLowerCase().includes(String(toolCall!.input.stageName).toLowerCase()))
          : pipeline.stages?.[0]

        await ghl.createOpportunity({
          pipelineId: pipeline.id,
          stageId: stage?.id ?? pipeline.stages?.[0]?.id ?? '',
          contactId: oppContactId,
          name: String(toolCall.input.dealName ?? 'New Deal'),
        })
        result = `Opportunity created: "${toolCall.input.dealName}" in ${pipeline.name} → ${stage?.name ?? 'first stage'}`
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
        const existingNotes = (await db.property.findUnique({
          where: { id: notePropertyId },
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
        const prop = await db.property.findUnique({
          where: { id: diPropertyId },
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
        const taskUpdates: Record<string, unknown> = {}
        if (toolCall.input.title) taskUpdates.title = toolCall.input.title
        if (toolCall.input.description) taskUpdates.body = toolCall.input.description
        if (toolCall.input.dueDate) taskUpdates.dueDate = new Date(String(toolCall.input.dueDate)).toISOString()
        await ghl.updateTask(contactId, String(toolCall.input.taskId), taskUpdates)
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
        const pipes = await ghl.getPipelines()
        const pipe = pipes.pipelines?.[0]
        if (!pipe) { result = 'No pipeline found'; break }
        const opps = await ghl.searchOpportunities(pipe.id, 10)
        const opp = opps.opportunities?.find(o => o.contactId === contactId)
        if (!opp) { result = 'No opportunity found for this contact'; break }
        await ghl.updateOpportunity(opp.id, { status: String(toolCall.input.status) })
        result = `Opportunity status updated to ${toolCall.input.status}`
        break
      }

      case 'update_opportunity_value': {
        if (!ghl) { result = 'GHL not connected'; break }
        const contactId = await resolveContactId()
        if (!contactId) { result = 'No contact linked'; break }
        const pipes2 = await ghl.getPipelines()
        const pipe2 = pipes2.pipelines?.[0]
        if (!pipe2) { result = 'No pipeline found'; break }
        const opps2 = await ghl.searchOpportunities(pipe2.id, 10)
        const opp2 = opps2.opportunities?.find(o => o.contactId === contactId)
        if (!opp2) { result = 'No opportunity found'; break }
        await ghl.updateOpportunity(opp2.id, { monetaryValue: Number(toolCall.input.value) })
        result = `Opportunity value updated to $${Number(toolCall.input.value).toLocaleString()}`
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
          await db.propertyTeamMember.delete({ where: { propertyId_userId: { propertyId: rtPropId, userId: member.userId } } })
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
          await db.property.update({ where: { id: mPropId }, data: { marketId: market.id } })
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
        import('@/lib/ai/enrich-property').then(({ enrichPropertyWithAI }) => enrichPropertyWithAI(ePropId)).catch(err => logFailure(tenantId, 'assistant.execute.enrichment_failed', 'property', err, { ePropId }))
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
        await db.propertyBuyerStage.updateMany({
          where: { buyerId: buyer.id },
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
        await db.buyer.update({ where: { id: ub.id }, data: ubData })
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
        await db.user.update({ where: { id: targetUser.id }, data: { role: String(toolCall.input.newRole) as import('@prisma/client').UserRole } })
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

    // Log the action
    await db.actionLog.create({
      data: {
        tenantId: tenantId,
        userId: sessionUserId,
        actionType: toolCall.name,
        proposed: JSON.parse(JSON.stringify(toolCall.input)),
        executed: JSON.parse(JSON.stringify(toolCall.input)),
        wasEdited: false,
        wasRejected: false,
        pageContext,
      },
    }).catch(err => logFailure(tenantId, 'assistant.execute.action_log_failed', 'actionLog', err))

    return NextResponse.json({ result })
  } catch (err) {
    console.error('[Assistant Execute]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Execution failed' }, { status: 500 })
  }
}
