// POST /api/ai/assistant/execute — execute an approved tool call
// Wires to real GHL API + Gunner DB actions
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

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
    }).catch(() => {})
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
    try { ghl = await getGHLClient(tenantId) } catch {}

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
        }).catch(() => {})
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
        }).catch(() => {})
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
          }).catch(() => {})
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
          }).catch(() => {})
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
    }).catch(() => {})

    return NextResponse.json({ result })
  } catch (err) {
    console.error('[Assistant Execute]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Execution failed' }, { status: 500 })
  }
}
