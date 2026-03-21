// app/(tenant)/[tenant]/inbox/page.tsx
import { requireSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'
import { InboxClient } from '@/components/inbox/inbox-client'

export default async function InboxPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId

  let conversations: ConversationItem[] = []
  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)
    const result = await ghl.getConversations({ limit: 50 })

    // Resolve GHL user IDs to names
    let userMap = new Map<string, string>()
    try {
      const usersResult = await ghl.getLocationUsers()
      for (const u of (usersResult?.users ?? [])) {
        const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
        if (u.id && name) userMap.set(u.id, name)
      }
    } catch { /* non-fatal — continue without names */ }

    // Cross-reference contactIds against properties table
    const rawConversations = result.conversations ?? []
    const contactIds = rawConversations.map(c => c.contactId).filter(Boolean)

    const matchedProperties = contactIds.length > 0
      ? await db.property.findMany({
          where: {
            tenantId,
            ghlContactId: { in: contactIds },
          },
          select: { ghlContactId: true, address: true, city: true, state: true },
        })
      : []

    const propertyMap = new Map(
      matchedProperties
        .filter(p => p.ghlContactId)
        .map(p => [
          p.ghlContactId!,
          `${p.address}, ${p.city} ${p.state}`,
        ])
    )

    conversations = rawConversations.map((c) => ({
      id: c.id,
      contactId: c.contactId,
      contactName: c.contactName || c.fullName || 'Unknown',
      phone: c.phone || '',
      unreadCount: c.unreadCount ?? 0,
      lastMessage: c.lastMessageBody || c.lastMessage || '',
      lastMessageType: c.lastMessageType ?? '',
      updatedAt: typeof c.dateUpdated === 'number'
        ? new Date(c.dateUpdated).toISOString()
        : typeof c.lastMessageDate === 'number'
          ? new Date(c.lastMessageDate).toISOString()
          : new Date().toISOString(),
      toUserName: userMap.get(c.userId || c.assignedTo || '') ?? null,
      propertyAddress: propertyMap.get(c.contactId) ?? null,
    }))
  } catch (err) {
    console.error('[Inbox] GHL fetch failed:', err instanceof Error ? err.message : err)
    fetchError = true
  }

  return (
    <InboxClient
      conversations={conversations}
      fetchError={fetchError}
      tenantSlug={params.tenant}
    />
  )
}

interface ConversationItem {
  id: string
  contactId: string
  contactName: string
  phone: string
  unreadCount: number
  lastMessage: string
  lastMessageType: string
  updatedAt: string
  toUserName: string | null
  propertyAddress: string | null
}
