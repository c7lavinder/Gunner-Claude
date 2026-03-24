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
    const rawConversations = conversations.conversations ?? []

    // Resolve GHL user IDs → team member names
    let userMap = new Map<string, string>()
    try {
      const usersResult = await ghl.getLocationUsers()
      for (const u of (usersResult?.users ?? [])) {
        const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
        if (u.id && name) userMap.set(u.id, name)
      }
    } catch { /* non-fatal */ }

    // Cross-reference contactIds → property addresses
    const contactIds = rawConversations.map(c => c.contactId).filter(Boolean)
    const properties = contactIds.length > 0
      ? await db.property.findMany({
          where: { tenantId, ghlContactId: { in: contactIds } },
          select: { ghlContactId: true, address: true, city: true, state: true },
        })
      : []
    const propertyMap = new Map<string, string>()
    for (const p of properties) {
      if (p.ghlContactId) {
        propertyMap.set(p.ghlContactId, `${p.address}, ${p.city} ${p.state}`)
      }
    }

    const items = rawConversations.map(conv => {
      const lastDirection = (conv.lastMessageDirection ?? '').toLowerCase()
      const unread = conv.unreadCount ?? 0
      const isInbound = lastDirection === 'inbound'

      return {
        id: conv.id,
        contactId: conv.contactId,
        contactName: conv.contactName ?? conv.fullName ?? 'Unknown',
        phone: conv.phone ?? null,
        lastMessageBody: conv.lastMessageBody ?? '',
        lastMessageType: conv.lastMessageType ?? 'message',
        lastMessageDirection: lastDirection,
        dateUpdated: conv.dateUpdated ?? Date.now(),
        type: (conv.lastMessageType === 'TYPE_CALL') ? 'missed_call' as const : 'message' as const,
        unreadCount: unread,
        assignedTo: userMap.get(conv.userId || conv.assignedTo || '') ?? null,
        propertyAddress: propertyMap.get(conv.contactId) ?? null,
        // Categorization
        isUnread: unread > 0,
        isNoResponse: unread === 0 && isInbound, // read but last msg was from contact — no reply sent
      }
    })

    // Split into categories
    const unread = items.filter(i => i.isUnread)
    const noResponse = items.filter(i => i.isNoResponse)

    return NextResponse.json({ unread, noResponse, total: items.length })
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
