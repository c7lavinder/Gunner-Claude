// GET /api/[tenant]/dayhub/contact-activity?contactId=xxx
// Returns today's activity (calls, texts) + graded calls for a GHL contact
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const url = new URL(req.url)
    const contactId = url.searchParams.get('contactId')
    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

    // Today's calls from our DB (Central time)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [todayCalls, gradedCalls, ghlNotes] = await Promise.all([
      // Today's calls for this contact
      db.call.findMany({
        where: {
          tenantId,
          ghlContactId: contactId,
          calledAt: { gte: todayStart },
        },
        select: {
          id: true,
          direction: true,
          durationSeconds: true,
          calledAt: true,
          callType: true,
          callOutcome: true,
          contactName: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { calledAt: 'desc' },
      }),

      // All graded calls for this contact (last 10)
      db.call.findMany({
        where: {
          tenantId,
          ghlContactId: contactId,
          gradingStatus: 'COMPLETED',
        },
        select: {
          id: true,
          calledAt: true,
          callType: true,
          callOutcome: true,
          score: true,
          aiSummary: true,
          durationSeconds: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { calledAt: 'desc' },
        take: 10,
      }),

      // Fetch notes from GHL
      (async () => {
        try {
          const tenant = await db.tenant.findUnique({
            where: { id: tenantId },
            select: { ghlAccessToken: true },
          })
          if (!tenant?.ghlAccessToken) return []
          const res = await fetch(
            `https://services.leadconnectorhq.com/contacts/${contactId}/notes`,
            {
              headers: {
                'Authorization': `Bearer ${tenant.ghlAccessToken}`,
                'Version': '2021-07-28',
              },
            }
          )
          if (!res.ok) return []
          const data = await res.json() as { notes?: Array<{ id: string; body: string; dateAdded: string; userId?: string }> }
          return (data.notes ?? []).slice(0, 10).map(n => ({
            id: n.id,
            body: n.body,
            dateAdded: n.dateAdded,
          }))
        } catch { return [] }
      })(),
    ])

    // Fetch today's SMS from GHL conversation
    let todayTexts: Array<{ id: string; body: string; direction: string; time: string }> = []
    try {
      const tenantForSms = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { ghlAccessToken: true, ghlLocationId: true },
      })
      if (tenantForSms?.ghlAccessToken && tenantForSms.ghlLocationId) {
        // Search for conversation by contactId (locationId required by GHL)
        const convRes = await fetch(
          `https://services.leadconnectorhq.com/conversations/search?locationId=${tenantForSms.ghlLocationId}&contactId=${contactId}`,
          {
            headers: {
              'Authorization': `Bearer ${tenantForSms.ghlAccessToken}`,
              'Version': '2021-07-28',
            },
          }
        )
        if (convRes.ok) {
          const convData = await convRes.json() as { conversations?: Array<{ id: string }> }
          const conv = convData.conversations?.[0]
          if (conv) {
            const msgRes = await fetch(
              `https://services.leadconnectorhq.com/conversations/${conv.id}/messages`,
              {
                headers: {
                  'Authorization': `Bearer ${tenantForSms.ghlAccessToken}`,
                  'Version': '2021-07-28',
                },
              }
            )
            if (msgRes.ok) {
              const msgData = await msgRes.json() as { messages?: { messages?: Array<{ id: string; body?: string; direction?: string; messageType?: string; dateAdded?: string }> } }
              const msgs = msgData.messages?.messages ?? []
              // Filter to today's SMS only
              todayTexts = msgs
                .filter(m => {
                  const type = (m.messageType ?? '').toUpperCase()
                  const isSMS = !!m.body && (type === 'TYPE_SMS' || type === 'SMS' || type === '')
                  if (!isSMS) return false
                  if (!m.dateAdded) return false
                  return new Date(m.dateAdded) >= todayStart
                })
                .map(m => ({
                  id: m.id,
                  body: m.body ?? '',
                  direction: (m.direction ?? '').toLowerCase(),
                  time: m.dateAdded ?? '',
                }))
                .reverse()
            }
          }
        }
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({
      todayCalls: todayCalls.map(c => ({
        id: c.id,
        direction: c.direction,
        durationSeconds: c.durationSeconds,
        calledAt: c.calledAt?.toISOString() ?? null,
        callType: c.callType,
        callOutcome: c.callOutcome,
        assignedToName: c.assignedTo?.name ?? null,
      })),
      todayTexts,
      gradedCalls: gradedCalls.map(c => ({
        id: c.id,
        calledAt: c.calledAt?.toISOString() ?? null,
        callType: c.callType,
        callOutcome: c.callOutcome,
        score: c.score,
        aiSummary: c.aiSummary,
        durationSeconds: c.durationSeconds,
        assignedToName: c.assignedTo?.name ?? null,
      })),
      notes: ghlNotes,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch contact activity'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
