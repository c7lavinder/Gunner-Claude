// GET /api/[tenant]/dayhub/inbox
// Returns recent GHL conversations for the Day Hub inbox.
//
// Routing rule: a conversation belongs to the team member whose phone number
// appears on the most recent SMS in the thread (`from` for outbound,
// `to` for inbound). GHL's conv.assignedTo is the contact's static owner —
// using it would land conversations on the wrong person whenever a different
// team member actually texted last.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { resolveEffectiveUser } from '@/lib/auth/view-as'

function normalizePhone(p: string | null | undefined): string {
  if (!p) return ''
  return p.replace(/\D/g, '').slice(-10)
}

interface RecentMsg {
  direction?: string
  messageType?: string
  body?: string
  from?: string
  to?: string
  userId?: string
  dateAdded?: string
}

// Fetch the most recent SMS for a conversation. Returns null on failure (we
// fall back to GHL's assignedTo for that conversation rather than dropping it).
async function fetchActiveSenderPhone(
  conversationId: string,
  authHeader: { Authorization: string; Version: string },
): Promise<{ phone: string; userId: string | null } | null> {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/conversations/${conversationId}/messages`,
      { headers: authHeader },
    )
    if (!res.ok) return null
    const data = await res.json() as { messages?: { messages?: RecentMsg[] } }
    const msgs = data.messages?.messages ?? []
    // Find the most recent SMS (messages are returned newest-first)
    for (const m of msgs) {
      const t = (m.messageType ?? '').toUpperCase()
      const isSms = !m.messageType || t === 'TYPE_SMS' || t === 'SMS'
      if (!isSms) continue
      const dir = (m.direction ?? '').toLowerCase()
      const phone = dir === 'inbound' ? m.to : m.from
      const np = normalizePhone(phone)
      if (np) return { phone: np, userId: m.userId ?? null }
    }
  } catch { /* swallow — handled by null return */ }
  return null
}

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const url = new URL(req.url)

    const asUserId = url.searchParams.get('asUserId')
    const ghlUserIdsParam = url.searchParams.get('ghlUserIds') // comma-separated, for role tab
    const effective = await resolveEffectiveUser(session, asUserId)
    const isAdmin = !effective.isImpersonating && (effective.role === 'OWNER' || effective.role === 'ADMIN')

    const tenantRecord = await db.tenant.findUnique({
      where: { id: tenantId }, select: { ghlLocationId: true, ghlAccessToken: true },
    })
    const locationId = tenantRecord?.ghlLocationId ?? ''
    const authHeader = {
      Authorization: `Bearer ${tenantRecord?.ghlAccessToken ?? ''}`,
      Version: '2021-07-28',
    }

    const ghl = await getGHLClient(tenantId)
    const roleGhlIds = ghlUserIdsParam ? new Set(ghlUserIdsParam.split(',').filter(Boolean)) : null

    // Fetch the broadest possible set — we'll route client-side by active sender.
    // GHL's assignedTo filter would prune conversations a different team member
    // is actively handling, so we don't pass it here.
    const conversations = await ghl.getConversations({ limit: 50 })
    const rawConversations = conversations.conversations ?? []

    // Resolve GHL user IDs → name AND phone → name, so we can attribute
    // each conversation by either signal.
    const userMap = new Map<string, string>()
    const phoneToUser = new Map<string, { name: string; ghlUserId: string }>()
    try {
      const usersResult = await ghl.getLocationUsers()
      for (const u of (usersResult?.users ?? [])) {
        const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
        if (u.id && name) userMap.set(u.id, name)
        const np = normalizePhone(u.phone)
        if (np && u.id && name) phoneToUser.set(np, { name, ghlUserId: u.id })
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

    const smsConversations = rawConversations.filter(conv => {
      const msgType = (conv.lastMessageType ?? '').toUpperCase()
      return msgType === 'TYPE_SMS' || msgType === 'SMS' || msgType === ''
    })

    // For each conversation, determine the ACTIVE team member by peeking at the
    // most recent message's from/to phone. Parallelized with chunks of 10 to
    // keep per-request latency under ~1s for a 50-conversation page.
    const activeByConvId = new Map<string, { name: string | null; ghlUserId: string | null }>()
    const CHUNK = 10
    for (let i = 0; i < smsConversations.length; i += CHUNK) {
      const slice = smsConversations.slice(i, i + CHUNK)
      const results = await Promise.all(slice.map(c => fetchActiveSenderPhone(c.id, authHeader)))
      slice.forEach((conv, idx) => {
        const r = results[idx]
        if (r) {
          const u = phoneToUser.get(r.phone)
          if (u) {
            activeByConvId.set(conv.id, { name: u.name, ghlUserId: u.ghlUserId })
            return
          }
          // Phone matched no team member — fall back to message's userId
          if (r.userId && userMap.has(r.userId)) {
            activeByConvId.set(conv.id, { name: userMap.get(r.userId) ?? null, ghlUserId: r.userId })
            return
          }
        }
        // Final fallback: GHL's static contact-owner assignment
        const fallbackId = conv.userId || conv.assignedTo || ''
        activeByConvId.set(conv.id, {
          name: userMap.get(fallbackId) ?? null,
          ghlUserId: fallbackId || null,
        })
      })
    }

    // Apply scope filters using the resolved active team member
    const inScope = (conv: typeof smsConversations[0]): boolean => {
      const active = activeByConvId.get(conv.id)
      const activeId = active?.ghlUserId ?? ''
      if (roleGhlIds) return roleGhlIds.has(activeId)
      if (isAdmin || !effective.ghlUserId) return true
      return activeId === effective.ghlUserId
    }
    const filtered = smsConversations.filter(inScope)

    const items = filtered.map(conv => {
      const lastDirection = (conv.lastMessageDirection ?? '').toLowerCase()
      const unread = conv.unreadCount ?? 0
      const isInbound = lastDirection === 'inbound'
      const active = activeByConvId.get(conv.id)

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
        // Now reflects the team member who actually texted last, not GHL's
        // static contact owner.
        assignedTo: active?.name ?? null,
        propertyAddress: propertyMap.get(conv.contactId) ?? null,
        isUnread: unread > 0,
        isNoResponse: unread === 0 && isInbound,
      }
    })

    const unread = items.filter(i => i.isUnread)
    const noResponse = items.filter(i => i.isNoResponse)

    return NextResponse.json({ unread, noResponse, total: items.length, locationId })
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
    const { contactId, message, fromNumber } = await req.json()

    if (!contactId || !message) {
      return NextResponse.json({ error: 'contactId and message required' }, { status: 400 })
    }

    const ghl = await getGHLClient(tenantId)
    await ghl.sendSMS(contactId, message, fromNumber || undefined)

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
