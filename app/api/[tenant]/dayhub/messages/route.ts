// GET /api/[tenant]/dayhub/messages?conversationId=xxx
// Returns messages for a GHL conversation thread
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'

interface GHLMessage {
  id: string
  body?: string
  direction?: string
  messageType?: string
  dateAdded?: string
  contentType?: string
  attachments?: string[]
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

    // Fetch messages from GHL conversation
    const res = await fetch(
      `https://services.leadconnectorhq.com/conversations/${conversationId}/messages`,
      {
        headers: {
          'Authorization': `Bearer ${tenant.ghlAccessToken}`,
          'Version': '2021-07-28',
        },
      }
    )

    if (!res.ok) {
      return NextResponse.json({ messages: [], error: 'Failed to fetch messages' })
    }

    const data = await res.json() as { messages?: { messages?: GHLMessage[] } }
    const rawMessages = data.messages?.messages ?? []

    // Map and return last N messages (newest first from GHL, we reverse for chronological)
    const messages = rawMessages
      .filter(m => m.body || m.messageType === 'TYPE_CALL')
      .slice(0, 20)
      .map(m => ({
        id: m.id,
        body: m.body ?? (m.messageType === 'TYPE_CALL' ? '📞 Call' : ''),
        direction: (m.direction ?? '').toLowerCase(),
        type: m.messageType ?? 'SMS',
        time: m.dateAdded ?? '',
      }))
      .reverse() // chronological order (oldest first)

    return NextResponse.json({ messages })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch messages'
    return NextResponse.json({ messages: [], error: message })
  }
}
