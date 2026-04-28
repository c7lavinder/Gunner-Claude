// GET /api/[tenant]/dayhub/contact-activity?contactId=xxx
// Returns today's activity (calls, texts, emails from GHL) + graded calls + notes
// GHL conversations are the source of truth — uses GHL client for auto token refresh
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

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
  // Use toLocaleDateString to get just the date portion in Central time
  // Do NOT round-trip through new Date() — that re-interprets in server timezone (UTC)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) // en-CA gives YYYY-MM-DD
  const msgStr = new Date(dateStr).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return msgStr === todayStr
}

// Get Central hour from a date string
function getCentralHour(dateStr: string): number {
  const central = new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })
  return parseInt(central, 10)
}

export const GET = withTenant<{ tenant: string }>(async (req, ctx) => {
  try {
    const tenantId = ctx.tenantId
    const url = new URL(req.url)
    const contactId = url.searchParams.get('contactId')
    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlAccessToken: true, ghlLocationId: true },
    })
    if (!tenant?.ghlAccessToken || !tenant.ghlLocationId) {
      return NextResponse.json({ todayCalls: [], todayTexts: [], todayEmails: [], gradedCalls: [], notes: [], hasAm: false, hasPm: false })
    }

    // Use GHL client for auto token refresh + retry on 401/429
    const ghl = await getGHLClient(tenantId)

    // Re-read token after potential refresh (getGHLClient may have refreshed it)
    const freshTenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlAccessToken: true },
    })
    const token = freshTenant?.ghlAccessToken ?? tenant.ghlAccessToken
    const locationId = tenant.ghlLocationId

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Version': '2021-07-28',
    }

    // Fetch everything in parallel
    const [ghlActivity, gradedCalls, ghlNotes] = await Promise.all([
      // GHL conversations → messages (calls, texts, emails)
      (async () => {
        const allCalls: Array<{ id: string; direction: string; duration: number | null; time: string }> = []
        const allTexts: Array<{ id: string; body: string; direction: string; time: string }> = []
        const allEmails: Array<{ id: string; body: string; direction: string; time: string }> = []

        try {
          // Step 1: Search conversations for this contact
          // Per masterclass: GET /conversations/search?locationId=xxx&contactId=xxx
          const convRes = await fetch(
            `https://services.leadconnectorhq.com/conversations/search?locationId=${locationId}&contactId=${contactId}&limit=5`,
            { headers }
          )

          if (!convRes.ok) {
            console.error('[contact-activity] conversations/search failed:', convRes.status, await convRes.text().catch(() => ''))
            return { calls: allCalls, texts: allTexts, emails: allEmails }
          }

          const convData = await convRes.json()
          const conversations = convData.conversations ?? []

          if (conversations.length === 0) {
            return { calls: allCalls, texts: allTexts, emails: allEmails }
          }

          // Step 2: Get messages from each conversation
          // Per masterclass: GET /conversations/{conversationId}/messages?limit=50
          for (const conv of conversations.slice(0, 3)) {
            const msgRes = await fetch(
              `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?limit=50`,
              { headers }
            )

            if (!msgRes.ok) {
              console.error('[contact-activity] messages fetch failed for conv', conv.id, ':', msgRes.status)
              continue
            }

            const msgData = await msgRes.json()

            // GHL returns: { messages: { messages: [...], nextPage, lastMessageId } }
            // OR sometimes: { messages: [...] } depending on endpoint version
            let msgs: Array<Record<string, unknown>> = []
            if (msgData.messages) {
              if (Array.isArray(msgData.messages)) {
                msgs = msgData.messages
              } else if (msgData.messages.messages && Array.isArray(msgData.messages.messages)) {
                msgs = msgData.messages.messages
              }
            }

            for (const m of msgs) {
              const dateAdded = String(m.dateAdded ?? '')
              if (!dateAdded || !isTodayCentral(dateAdded)) continue

              const msgType = String(m.messageType ?? '').toUpperCase()
              const typeInt = typeof m.type === 'number' ? m.type : 0
              // direction field can be unreliable for emails — if userId is set, it was sent by our team
              const hasUserId = !!m.userId
              const rawDir = String(m.direction ?? '').toLowerCase()
              const dir = hasUserId ? 'outbound' : (rawDir || 'inbound')
              const body = String(m.body ?? '')

              // Calls: TYPE_CALL or messageTypeId/type === 1 (matches webhook + poll-calls)
              if (msgType === 'TYPE_CALL' || msgType === 'CALL' || typeInt === 1) {
                const meta = (m.meta && typeof m.meta === 'object') ? m.meta as Record<string, unknown> : null
                const callMeta = (meta?.call && typeof meta.call === 'object') ? meta.call as Record<string, unknown> : null
                allCalls.push({
                  id: String(m.id ?? ''),
                  direction: dir || 'outbound',
                  duration: callMeta?.duration ? Number(callMeta.duration) : meta?.duration ? Number(meta.duration) : null,
                  time: dateAdded,
                })
              }
              // SMS: TYPE_SMS or empty type with body
              else if (body && (msgType === 'TYPE_SMS' || msgType === 'SMS' || msgType === '')) {
                allTexts.push({
                  id: String(m.id ?? ''),
                  body,
                  direction: dir,
                  time: dateAdded,
                })
              }
              // Email
              else if (msgType === 'TYPE_EMAIL' || msgType === 'EMAIL') {
                allEmails.push({
                  id: String(m.id ?? ''),
                  body: stripHtml(body).slice(0, 200),
                  direction: dir,
                  time: dateAdded,
                })
              }
            }
          }
        } catch (err) {
          console.error('[contact-activity] GHL fetch error:', err instanceof Error ? err.message : err)
        }

        return {
          calls: allCalls.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
          texts: allTexts.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
          emails: allEmails.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
        }
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

      // Notes from GHL: GET /contacts/{contactId}/notes
      (async () => {
        try {
          const res = await fetch(
            `https://services.leadconnectorhq.com/contacts/${contactId}/notes`,
            { headers }
          )
          if (!res.ok) {
            console.error('[contact-activity] notes fetch failed:', res.status)
            return []
          }
          const data = await res.json()
          const notes = data.notes ?? []
          return notes.slice(0, 10).map((n: Record<string, unknown>) => ({
            id: String(n.id ?? ''),
            body: stripHtml(String(n.body ?? '')),
            dateAdded: String(n.dateAdded ?? ''),
          }))
        } catch { return [] }
      })(),
    ])

    // Compute AM/PM from GHL calls (source of truth for labels)
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
    console.error('[contact-activity] top-level error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
