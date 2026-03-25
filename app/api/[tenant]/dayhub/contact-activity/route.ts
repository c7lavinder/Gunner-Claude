// GET /api/[tenant]/dayhub/contact-activity?contactId=xxx
// Returns today's activity (calls, texts, emails from GHL) + graded calls + notes
// GHL conversations are the source of truth for activity — not our local DB
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

// Check if a date string falls on "today" in Central time
function isTodayCentral(dateStr: string): boolean {
  const nowCentral = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const todayStr = new Date(nowCentral).toISOString().slice(0, 10)
  const msgCentral = new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const msgStr = new Date(msgCentral).toISOString().slice(0, 10)
  return msgStr === todayStr
}

// Get Central hour from a date string
function getCentralHour(dateStr: string): number {
  const central = new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })
  return parseInt(central, 10)
}

interface GHLMessage {
  id: string
  body?: string
  direction?: string
  messageType?: string
  type?: number
  dateAdded?: string
  meta?: { duration?: number }
  userId?: string
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

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlAccessToken: true, ghlLocationId: true },
    })
    if (!tenant?.ghlAccessToken || !tenant.ghlLocationId) {
      return NextResponse.json({ todayCalls: [], todayTexts: [], gradedCalls: [], notes: [], hasAm: false, hasPm: false })
    }

    const headers = {
      'Authorization': `Bearer ${tenant.ghlAccessToken}`,
      'Version': '2021-07-28',
    }

    // Fetch GHL conversations + messages, graded calls from DB, and notes — all in parallel
    const [ghlActivity, gradedCalls, ghlNotes] = await Promise.all([
      // GHL conversations → messages (source of truth for calls, texts, emails)
      (async () => {
        try {
          // Step 1: Get conversations for this contact (per GHL masterclass)
          const convRes = await fetch(
            `https://services.leadconnectorhq.com/conversations/search?locationId=${tenant.ghlLocationId}&contactId=${contactId}&limit=5`,
            { headers }
          )
          if (!convRes.ok) return { calls: [], texts: [], emails: [] }
          const convData = await convRes.json() as { conversations?: Array<{ id: string }> }
          const conversations = convData.conversations ?? []

          const allCalls: Array<{ id: string; direction: string; duration: number | null; time: string }> = []
          const allTexts: Array<{ id: string; body: string; direction: string; time: string }> = []
          const allEmails: Array<{ id: string; body: string; direction: string; time: string }> = []

          // Step 2: Get messages from each conversation
          for (const conv of conversations.slice(0, 3)) {
            const msgRes = await fetch(
              `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?limit=50`,
              { headers }
            )
            if (!msgRes.ok) continue
            const msgData = await msgRes.json() as { messages?: { messages?: GHLMessage[] } }
            const msgs = msgData.messages?.messages ?? []

            for (const m of msgs) {
              if (!m.dateAdded || !isTodayCentral(m.dateAdded)) continue

              const msgType = (m.messageType ?? '').toUpperCase()
              const typeInt = m.type ?? 0
              const dir = (m.direction ?? '').toLowerCase()

              // Calls: TYPE_VOICE_CALL or type 25 (outbound) / 26 (inbound) per masterclass
              if (msgType === 'TYPE_VOICE_CALL' || typeInt === 25 || typeInt === 26) {
                allCalls.push({
                  id: m.id,
                  direction: typeInt === 25 ? 'outbound' : typeInt === 26 ? 'inbound' : dir,
                  duration: m.meta?.duration ?? null,
                  time: m.dateAdded,
                })
              }
              // SMS
              else if (m.body && (msgType === 'TYPE_SMS' || msgType === 'SMS' || msgType === '')) {
                allTexts.push({
                  id: m.id,
                  body: m.body,
                  direction: dir,
                  time: m.dateAdded,
                })
              }
              // Email
              else if (msgType === 'TYPE_EMAIL' || msgType === 'EMAIL') {
                allEmails.push({
                  id: m.id,
                  body: stripHtml(m.body ?? '').slice(0, 200),
                  direction: dir,
                  time: m.dateAdded,
                })
              }
            }
          }

          return {
            calls: allCalls.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
            texts: allTexts.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
            emails: allEmails.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
          }
        } catch { return { calls: [], texts: [], emails: [] } }
      })(),

      // Graded calls from our DB (last 10)
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

      // Notes from GHL
      (async () => {
        try {
          const res = await fetch(
            `https://services.leadconnectorhq.com/contacts/${contactId}/notes`,
            { headers }
          )
          if (!res.ok) return []
          const data = await res.json() as { notes?: Array<{ id: string; body: string; dateAdded: string }> }
          return (data.notes ?? []).slice(0, 10).map(n => ({
            id: n.id,
            body: stripHtml(n.body ?? ''),
            dateAdded: n.dateAdded,
          }))
        } catch { return [] }
      })(),
    ])

    // Compute AM/PM from GHL calls (source of truth)
    let hasAm = false
    let hasPm = false
    for (const call of ghlActivity.calls) {
      const hour = getCentralHour(call.time)
      if (hour < 12) hasAm = true
      else hasPm = true
    }

    return NextResponse.json({
      todayCalls: ghlActivity.calls,
      todayTexts: ghlActivity.texts,
      todayEmails: ghlActivity.emails,
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
      hasAm,
      hasPm,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch contact activity'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
