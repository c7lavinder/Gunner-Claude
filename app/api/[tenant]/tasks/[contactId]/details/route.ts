// app/api/[tenant]/tasks/[contactId]/details/route.ts
// Fetches contact details for task expand panel: notes, last call, today's activity
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { startOfDay } from 'date-fns'

export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string; contactId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const tenantId = session.tenantId
  const contactId = params.contactId

  try {
    const ghl = await getGHLClient(tenantId)

    // Parallel fetch: notes, last graded call, today's conversations
    const [notesResult, lastCall, conversationsResult] = await Promise.allSettled([
      // 1. Last 5 GHL notes for this contact
      ghl.getContactNotes(contactId),

      // 2. Last graded call — find calls linked via ghlCallId that match this contact's conversations
      db.call.findFirst({
        where: {
          tenantId,
          gradingStatus: 'COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          score: true,
          aiSummary: true,
          createdAt: true,
        },
      }),

      // 3. Today's conversation activity
      ghl.getConversations({ limit: 10 }),
    ])

    // Process notes
    const notes = notesResult.status === 'fulfilled'
      ? (notesResult.value.notes ?? []).slice(0, 5).map(n => ({
          id: n.id,
          body: n.body,
          dateAdded: n.dateAdded,
        }))
      : []

    // Process last call
    const lastCallData = lastCall.status === 'fulfilled' && lastCall.value
      ? {
          id: lastCall.value.id,
          score: lastCall.value.score,
          summary: lastCall.value.aiSummary,
          createdAt: lastCall.value.createdAt.toISOString(),
        }
      : null

    // Process today's activity — filter to conversations matching this contactId
    const todayActivity: Array<{ type: string; direction: string; body: string; dateAdded: string }> = []
    if (conversationsResult.status === 'fulfilled') {
      const convs = conversationsResult.value.conversations ?? []
      const contactConvs = convs.filter(c => c.contactId === contactId)
      const todayStart = startOfDay(new Date()).getTime()

      for (const conv of contactConvs) {
        const msgDate = conv.lastMessageDate ?? conv.dateUpdated
        if (typeof msgDate === 'number' && msgDate >= todayStart) {
          todayActivity.push({
            type: conv.lastMessageType ?? 'message',
            direction: conv.lastMessageDirection ?? 'outbound',
            body: conv.lastMessageBody ?? conv.lastMessage ?? '',
            dateAdded: new Date(msgDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          })
        }
      }
    }

    return NextResponse.json({ notes, lastCall: lastCallData, todayActivity })
  } catch (err) {
    console.error('[Task Details] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ notes: [], lastCall: null, todayActivity: [] })
  }
}
