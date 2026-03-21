// scripts/poll-calls.ts
// Cron job — runs every 60s via Railway
// Hybrid approach: check recent conversations + contact lookup for missed calls
// Fetches recordings, transcribes, grades. Caches contact names.

import { db } from '../lib/db/client'
import { gradeCall } from '../lib/ai/grading'
import { syncGHLUsers } from '../lib/ghl/sync-users'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'
import { transcribeRecording } from '../lib/ai/transcribe'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-04-15'
const MIN_CALL_DURATION = 45

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function pollCalls() {
  console.log('[poll-calls] Starting...')

  try {
    const tenants = await db.tenant.findMany({
      where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
      select: { id: true, ghlLocationId: true, ghlAccessToken: true },
    })

    if (tenants.length === 0) {
      console.log('[poll-calls] No tenants')
      process.exit(0)
    }

    let totalNew = 0

    for (const tenant of tenants) {
      try {
        // Sync GHL user data
        await syncGHLUsers(tenant.id).catch(() => {})

        const headers = {
          'Authorization': `Bearer ${tenant.ghlAccessToken}`,
          'Content-Type': 'application/json',
          'Version': GHL_API_VERSION,
        }

        const tenantUsers = await db.user.findMany({
          where: { tenantId: tenant.id, ghlUserId: { not: null } },
          select: { id: true, ghlUserId: true },
        })

        const existingIds = new Set(
          (await db.call.findMany({ where: { tenantId: tenant.id }, select: { ghlCallId: true } }))
            .map(c => c.ghlCallId).filter(Boolean) as string[]
        )

        const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000) // last 4 hours

        // Fetch recent conversations (catches most new calls)
        const convRes = await fetch(
          `${GHL_BASE_URL}/conversations/search?${new URLSearchParams({ locationId: tenant.ghlLocationId!, limit: '50' })}`,
          { headers },
        )
        if (!convRes.ok) continue

        const convData = await convRes.json() as { conversations?: Array<{ id: string; contactId?: string; contactName?: string; fullName?: string; phone?: string; userId?: string; assignedTo?: string }> }
        const conversations = convData.conversations ?? []

        for (const conv of conversations) {
          await sleep(50)
          try {
            // Paginate messages
            let lastMsgId: string | undefined
            for (let p = 0; p < 3; p++) {
              const msgUrl = `${GHL_BASE_URL}/conversations/${conv.id}/messages${lastMsgId ? `?lastMessageId=${lastMsgId}` : ''}`
              const msgRes = await fetch(msgUrl, { headers })
              if (!msgRes.ok) break

              const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>>; lastMessageId?: string; nextPage?: boolean } }
              const pageData = msgData.messages
              const msgs = pageData?.messages ?? []
              if (msgs.length === 0) break

              let hitOld = false

              for (const msg of msgs) {
                const msgType = String(msg.messageType ?? '').toUpperCase()
                const isCall = msgType === 'TYPE_CALL' || msgType === 'CALL' || msg.type === 1
                if (!isCall) continue

                const msgDate = new Date(String(msg.dateAdded))
                if (msgDate < cutoff) { hitOld = true; continue }

                const metaDur = (msg.callDuration ?? (msg.meta as { call?: { duration?: number } })?.call?.duration ?? 0) as number
                const elapsed = msg.dateUpdated
                  ? Math.round((new Date(String(msg.dateUpdated)).getTime() - msgDate.getTime()) / 1000)
                  : 0
                const realDuration = Math.min(Math.max(metaDur, elapsed), 1800)

                const status = String((msg.callStatus ?? (msg.meta as { call?: { status?: string } })?.call?.status ?? msg.status) ?? '').toLowerCase()
                if (['initiated', 'ringing', 'failed', 'busy'].includes(status)) continue
                if (realDuration < MIN_CALL_DURATION) continue

                const dedupeId = String(msg.altId || msg.id)
                if (existingIds.has(dedupeId)) continue
                existingIds.add(dedupeId)

                const contactName = conv.contactName || conv.fullName || conv.phone || null
                const ghlUserId = String(msg.userId || conv.userId || conv.assignedTo || '')
                const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null

                // Resolve contact name from GHL if not on conversation
                let resolvedName = contactName
                const contactId = String(msg.contactId ?? conv.contactId ?? '')
                if (!resolvedName && contactId) {
                  try {
                    const cRes = await fetch(`${GHL_BASE_URL}/contacts/${contactId}`, { headers })
                    if (cRes.ok) {
                      const cData = await cRes.json() as { contact?: { firstName?: string; lastName?: string } }
                      resolvedName = `${cData.contact?.firstName ?? ''} ${cData.contact?.lastName ?? ''}`.trim() || null
                    }
                  } catch { /* skip */ }
                }

                // Create call
                const call = await db.call.create({
                  data: {
                    tenantId: tenant.id,
                    ghlCallId: dedupeId,
                    ghlContactId: contactId || undefined,
                    contactName: resolvedName,
                    assignedToId: user?.id ?? undefined,
                    direction: String(msg.direction) === 'inbound' ? 'INBOUND' : 'OUTBOUND',
                    durationSeconds: realDuration,
                    calledAt: msgDate,
                    gradingStatus: 'PENDING',
                  },
                })

                // Fetch recording + transcribe
                await sleep(100)
                const rec = await fetchCallRecording(tenant.ghlAccessToken!, tenant.ghlLocationId!, String(msg.id))

                if (rec.status === 'success' && rec.recordingUrl) {
                  await db.call.update({ where: { id: call.id }, data: { recordingUrl: rec.recordingUrl } })
                  const trans = await transcribeRecording(rec.recordingUrl, tenant.ghlAccessToken!)
                  if (trans.status === 'success' && trans.transcript) {
                    await db.call.update({ where: { id: call.id }, data: { transcript: trans.transcript } })
                  }
                }

                // Grade (with or without transcript)
                await gradeCall(call.id).catch(err => {
                  console.error(`[poll-calls] Grade failed ${call.id}:`, err instanceof Error ? err.message.slice(0, 80) : err)
                })

                totalNew++
                console.log(`[poll-calls] New: ${resolvedName ?? 'Unknown'} | ${realDuration}s | ${rec.status === 'success' ? 'REC' : 'no rec'}`)
              }

              if (hitOld || !pageData?.nextPage) break
              lastMsgId = pageData?.lastMessageId
            }
          } catch { continue }
        }
      } catch (err) {
        console.error(`[poll-calls] Error:`, err instanceof Error ? err.message : err)
      }
    }

    console.log(`[poll-calls] Done. New calls: ${totalNew}`)
  } catch (err) {
    console.error('[poll-calls] Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  process.exit(0)
}

pollCalls()
