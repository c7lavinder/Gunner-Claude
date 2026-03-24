// GET /api/[tenant]/dayhub/inbox
// Returns recent GHL conversations for the Day Hub inbox
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const url = new URL(req.url)
    const filter = url.searchParams.get('filter') ?? 'all'

    const ghl = await getGHLClient(tenantId)
    const conversations = await ghl.getConversations({ limit: 30 })

    const items = (conversations.conversations ?? []).map(conv => ({
      id: conv.id,
      contactId: conv.contactId,
      contactName: conv.contactName ?? conv.fullName ?? 'Unknown',
      phone: conv.phone ?? null,
      lastMessageBody: conv.lastMessageBody ?? '',
      lastMessageType: conv.lastMessageType ?? 'message',
      dateUpdated: conv.dateUpdated ?? Date.now(),
      type: (conv.lastMessageType === 'TYPE_CALL') ? 'missed_call' as const : 'message' as const,
      unreadCount: conv.unreadCount ?? 0,
    }))

    // Apply filter
    const filtered = filter === 'missed'
      ? items.filter(i => i.type === 'missed_call')
      : filter === 'msgs'
      ? items.filter(i => i.type === 'message')
      : items

    return NextResponse.json({ items: filtered, total: items.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch inbox'
    return NextResponse.json({ items: [], total: 0, error: message })
  }
}

export async function POST(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const { contactId, message } = await req.json()

    if (!contactId || !message) {
      return NextResponse.json({ error: 'contactId and message required' }, { status: 400 })
    }

    const ghl = await getGHLClient(tenantId)
    await ghl.sendSMS(contactId, message)

    await db.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: 'sms.sent',
        source: 'USER',
        severity: 'INFO',
        payload: { contactId, messageLength: message.length },
      },
    })

    return NextResponse.json({ status: 'success' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send SMS'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
