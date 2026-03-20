// app/api/[tenant]/calls/[id]/actions/route.ts
// Quick actions: add note, create task, send SMS from call detail page
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { z } from 'zod'
import { addDays, format } from 'date-fns'

const schema = z.object({
  type: z.enum(['add_note', 'create_task', 'send_sms']),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: {
      id: true, aiSummary: true, calledAt: true, ghlCallId: true,
      property: {
        select: {
          id: true, address: true, ghlContactId: true,
          sellers: { include: { seller: true }, take: 1 },
        },
      },
    },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Resolve contact ID from property's GHL contact or seller
  const contactId = call.property?.ghlContactId
  if (!contactId) {
    return NextResponse.json({ success: false, message: 'No GHL contact linked to this call\'s property' }, { status: 400 })
  }

  try {
    const ghl = await getGHLClient(session.tenantId)
    const callDate = call.calledAt ? format(new Date(call.calledAt), 'MMM d') : 'recent'

    switch (parsed.data.type) {
      case 'add_note': {
        const noteBody = `Call on ${callDate}: ${call.aiSummary ?? 'Call graded — see Gunner AI for details.'}`
        await ghl.addNote(contactId, noteBody)
        break
      }
      case 'create_task': {
        const title = `Follow up: ${call.property?.address ?? 'Contact'}`
        const dueDate = format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm:ss'Z'")
        await ghl.createTask(contactId, { title, dueDate })
        break
      }
      case 'send_sms': {
        // TODO: Implement SMS sending — needs message composition UI
        return NextResponse.json({ success: false, message: 'SMS feature coming soon — compose message in GHL' }, { status: 200 })
      }
    }

    await db.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: `call.action.${parsed.data.type}`,
        resource: 'call',
        resourceId: params.id,
        source: 'USER',
        severity: 'INFO',
        payload: { contactId, type: parsed.data.type },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[Call Action] ${parsed.data.type} failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, message: 'GHL action failed' }, { status: 500 })
  }
}
