// GET /api/[tenant]/dayhub/contact-activity?contactId=xxx
// Returns today's activity (calls, texts) + graded calls + GHL notes for a contact
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

// Strip HTML tags and decode common entities from GHL note bodies
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
    const contactId = url.searchParams.get('contactId')
    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

    // Use raw SQL for timezone-correct "today" in Central time
    // This matches the AM/PM query pattern in the tasks page
    const [todayCalls, gradedCalls, ghlNotes] = await Promise.all([
      // Today's calls for this contact (Central time)
      db.$queryRaw<Array<{
        id: string
        direction: string
        duration_seconds: number | null
        called_at: Date | null
        call_type: string | null
        call_outcome: string | null
        assigned_name: string | null
      }>>`
        SELECT
          c.id,
          c.direction,
          c.duration_seconds,
          c.called_at,
          c.call_type,
          c.call_outcome,
          u.name AS assigned_name
        FROM calls c
        LEFT JOIN users u ON u.id = c.assigned_to_id
        WHERE c.tenant_id = ${tenantId}
          AND c.ghl_contact_id = ${contactId}
          AND c.called_at IS NOT NULL
          AND (c.called_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
        ORDER BY c.called_at DESC
      `,

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
            body: stripHtml(n.body ?? ''),
            dateAdded: n.dateAdded,
          }))
        } catch { return [] }
      })(),
    ])

    // Fetch today's SMS from GHL conversation
    let todayTexts: Array<{ id: string; body: string; direction: string; time: string }> = []
    try {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { ghlAccessToken: true, ghlLocationId: true },
      })
      if (tenant?.ghlAccessToken && tenant.ghlLocationId) {
        // Search for conversation by contactId (locationId required per GHL masterclass)
        const convRes = await fetch(
          `https://services.leadconnectorhq.com/conversations/search?locationId=${tenant.ghlLocationId}&contactId=${contactId}`,
          {
            headers: {
              'Authorization': `Bearer ${tenant.ghlAccessToken}`,
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
                  'Authorization': `Bearer ${tenant.ghlAccessToken}`,
                  'Version': '2021-07-28',
                },
              }
            )
            if (msgRes.ok) {
              const msgData = await msgRes.json() as { messages?: { messages?: Array<{ id: string; body?: string; direction?: string; messageType?: string; dateAdded?: string }> } }
              const msgs = msgData.messages?.messages ?? []
              // Filter to today's SMS only — use Central time comparison
              const nowCentral = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
              const todayCentralStr = new Date(nowCentral).toISOString().slice(0, 10)
              todayTexts = msgs
                .filter(m => {
                  const type = (m.messageType ?? '').toUpperCase()
                  const isSMS = !!m.body && (type === 'TYPE_SMS' || type === 'SMS' || type === '')
                  if (!isSMS || !m.dateAdded) return false
                  // Compare date portion in Central time
                  const msgCentral = new Date(m.dateAdded).toLocaleString('en-US', { timeZone: 'America/Chicago' })
                  const msgDateStr = new Date(msgCentral).toISOString().slice(0, 10)
                  return msgDateStr === todayCentralStr
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
        durationSeconds: c.duration_seconds,
        calledAt: c.called_at?.toISOString() ?? null,
        callType: c.call_type,
        callOutcome: c.call_outcome,
        assignedToName: c.assigned_name,
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
