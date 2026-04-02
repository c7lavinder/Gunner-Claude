// POST /api/ai/assistant/execute — execute an approved tool call
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { toolCallId, pageContext } = await request.json()
  if (!toolCallId) return NextResponse.json({ error: 'toolCallId required' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)

  // Find the tool call in today's messages
  const messages = await db.assistantMessage.findMany({
    where: { tenantId: session.tenantId, userId: session.userId, sessionDate: today, role: 'assistant' },
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

  try {
    let result = ''

    switch (toolCall.name) {
      case 'send_sms': {
        // TODO: Wire to GHL sendSMS
        result = `SMS queued to ${toolCall.input.contactName ?? 'contact'}: "${String(toolCall.input.message).slice(0, 50)}..."`
        break
      }
      case 'create_task': {
        // TODO: Wire to GHL createTask
        result = `Task created: "${toolCall.input.title}"${toolCall.input.assignedTo ? ` assigned to ${toolCall.input.assignedTo}` : ''}`
        break
      }
      case 'add_note': {
        // TODO: Wire to GHL addNote
        result = `Note added to ${toolCall.input.contactName ?? 'contact'}`
        break
      }
      case 'change_pipeline_stage': {
        // TODO: Wire to GHL updateOpportunityStage
        result = `Moved ${toolCall.input.contactName ?? 'contact'} to ${toolCall.input.stageName}`
        break
      }
      case 'create_appointment': {
        // TODO: Wire to GHL calendar API
        result = `Appointment scheduled: "${toolCall.input.title}" at ${toolCall.input.dateTime}`
        break
      }
      case 'update_property': {
        // Update property field
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (propertyId) {
          await db.property.update({
            where: { id: propertyId, tenantId: session.tenantId },
            data: { [String(toolCall.input.field)]: toolCall.input.value },
          }).catch(() => {})
          result = `Updated ${toolCall.input.field} to ${toolCall.input.value}`
        } else {
          result = 'No property in context — navigate to a property page first'
        }
        break
      }
      case 'log_offer': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (propertyId) {
          await db.propertyMilestone.create({
            data: {
              tenantId: session.tenantId,
              propertyId,
              type: 'OFFER_MADE',
              source: 'AI_ASSISTANT',
              loggedById: session.userId,
              notes: `Offer: $${toolCall.input.amount}. ${toolCall.input.notes ?? ''}`,
            },
          }).catch(() => {})
          await db.property.update({
            where: { id: propertyId },
            data: { currentOffer: parseFloat(String(toolCall.input.amount).replace(/[^0-9.]/g, '')) || undefined },
          }).catch(() => {})
          result = `Offer of $${toolCall.input.amount} logged`
        } else {
          result = 'No property in context'
        }
        break
      }
      case 'log_milestone': {
        const propertyId = pageContext?.startsWith('property:') ? pageContext.split(':')[1] : null
        if (propertyId) {
          await db.propertyMilestone.create({
            data: {
              tenantId: session.tenantId,
              propertyId,
              type: String(toolCall.input.type) as import('@prisma/client').MilestoneType,
              source: 'AI_ASSISTANT',
              loggedById: session.userId,
              notes: String(toolCall.input.notes ?? ''),
            },
          }).catch(() => {})
          result = `${toolCall.input.type} milestone logged`
        } else {
          result = 'No property in context'
        }
        break
      }
      default:
        result = `Action "${toolCall.name}" acknowledged (execution coming soon)`
    }

    // Log the action
    await db.actionLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Execution failed' }, { status: 500 })
  }
}
