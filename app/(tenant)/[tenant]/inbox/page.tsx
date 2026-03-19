import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/inbox/page.tsx


import { getGHLClient } from '@/lib/ghl/client'
import { InboxClient } from '@/components/inbox/inbox-client'

export default async function InboxPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  const tenantId = session.tenantId

  let conversations: ConversationItem[] = []
  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)
    const result = await ghl.getConversations({ limit: 50 })
    conversations = (result.conversations ?? []).map((c) => ({
      id: c.id,
      contactId: c.contactId,
      unreadCount: c.unreadCount,
      lastMessage: c.lastMessage,
      lastMessageType: c.lastMessageType,
      updatedAt: c.updatedAt,
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
  unreadCount: number
  lastMessage: string
  lastMessageType: string
  updatedAt: string
}
