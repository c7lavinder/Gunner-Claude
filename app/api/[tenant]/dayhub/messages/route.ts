// GET /api/[tenant]/dayhub/messages?conversationId=xxx
// Returns SMS messages for a GHL conversation thread
// Paginates through call/email noise to find actual SMS messages
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

interface GHLMessage {
  id: string
  body?: string
  direction?: string
  messageType?: string
  dateAdded?: string
  contentType?: string
  attachments?: string[]
}

interface GHLMessagePage {
  messages?: GHLMessage[]
  lastMessageId?: string
  nextPage?: boolean
}

function isSMS(m: GHLMessage): boolean {
  const type = (m.messageType ?? '').toUpperCase()
  return !!m.body && (type === 'TYPE_SMS' || type === 'SMS' || type === '')
}

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const conversationId = url.searchParams.get('conversationId')
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    const tenantId = session.tenantId
    const tenant = await (await import('@/lib/db/client')).db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlAccessToken: true },
    })
    if (!tenant?.ghlAccessToken) return NextResponse.json({ error: 'No GHL connection' }, { status: 400 })

    const headers = {
      'Authorization': `Bearer ${tenant.ghlAccessToken}`,
      'Version': '2021-07-28',
    }

    // Paginate through messages until we find enough SMS (up to 5 pages)
    const smsMessages: GHLMessage[] = []
    let lastMessageId: string | undefined
    const TARGET_SMS = 15

    for (let page = 0; page < 5; page++) {
      const fetchUrl = `https://services.leadconnectorhq.com/conversations/${conversationId}/messages${lastMessageId ? `?lastMessageId=${lastMessageId}` : ''}`
      const res = await fetch(fetchUrl, { headers })
      if (!res.ok) break

      const data = await res.json() as { messages?: GHLMessagePage }
      const pageData = data.messages
      const msgs = pageData?.messages ?? []
      if (msgs.length === 0) break

      for (const m of msgs) {
        if (isSMS(m)) smsMessages.push(m)
      }

      if (smsMessages.length >= TARGET_SMS) break
      if (!pageData?.nextPage) break
      lastMessageId = pageData.lastMessageId
    }

    // Take last 15 SMS, reverse for chronological order
    const messages = smsMessages
      .slice(0, TARGET_SMS)
      .map(m => ({
        id: m.id,
        body: m.body ?? '',
        direction: (m.direction ?? '').toLowerCase(),
        type: 'SMS',
        time: m.dateAdded ?? '',
      }))
      .reverse()

    return NextResponse.json({ messages })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch messages'
    return NextResponse.json({ messages: [], error: message })
  }
}
