// scripts/poll-calls.ts
// Cron job — runs every 5 min via Railway Function
// Uses GHL client for auto-retry, token refresh, and correct API version
// Fetches recent conversations, finds call messages, transcribes, grades

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { gradeCall } from '../lib/ai/grading'
import { syncGHLUsers } from '../lib/ghl/sync-users'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'
import { transcribeRecording } from '../lib/ai/transcribe'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const MIN_CALL_DURATION = 45
const CONVERSATION_LIMIT = 100 // was 50 — busy teams need more coverage
const LOOKBACK_HOURS = 6 // was 4 — wider window to catch delayed conversations

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

        // Use GHL client for auto-retry + token refresh
        let ghl: Awaited<ReturnType<typeof getGHLClient>>
        try {
          ghl = await getGHLClient(tenant.id)
        } catch (err) {
          console.error(`[poll-calls] Cannot get GHL client for tenant ${tenant.id}:`, err instanceof Error ? err.message : err)
          continue
        }

        // Re-read token after potential refresh
        const freshTenant = await db.tenant.findUnique({
          where: { id: tenant.id },
          select: { ghlAccessToken: true, ghlLocationId: true },
        })
        if (!freshTenant?.ghlAccessToken) continue

        const headers = {
          'Authorization': `Bearer ${freshTenant.ghlAccessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        }

        const tenantUsers = await db.user.findMany({
          where: { tenantId: tenant.id, ghlUserId: { not: null } },
          select: { id: true, ghlUserId: true },
        })

        const existingIds = new Set(
          (await db.call.findMany({ where: { tenantId: tenant.id }, select: { ghlCallId: true } }))
            .map(c => c.ghlCallId).filter(Boolean) as string[]
        )

        const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)

        // Fetch recent conversations — increased limit for busy teams
        const convRes = await fetch(
          `${GHL_BASE_URL}/conversations/search?${new URLSearchParams({ locationId: freshTenant.ghlLocationId!, limit: String(CONVERSATION_LIMIT) })}`,
          { headers },
        )
        if (!convRes.ok) {
          const errorBody = await convRes.text().catch(() => 'unknown')
          console.error(`[poll-calls] Conversations fetch failed (${convRes.status}) for tenant ${tenant.id}: ${errorBody.slice(0, 200)}`)
          continue
        }

        const convData = await convRes.json() as { conversations?: Array<{ id: string; contactId?: string; contactName?: string; fullName?: string; phone?: string; userId?: string; assignedTo?: string }> }
        const conversations = convData.conversations ?? []
        console.log(`[poll-calls] Tenant ${tenant.id}: ${conversations.length} conversations fetched`)

        // Log contact names for debugging missed calls
        if (conversations.length > 0) {
          const names = conversations.slice(0, 10).map(c => c.contactName || c.fullName || c.phone || '?').join(', ')
          console.log(`[poll-calls] Recent contacts: ${names}${conversations.length > 10 ? ` ... +${conversations.length - 10} more` : ''}`)
        }

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
                if (['initiated', 'ringing', 'failed', 'busy'].includes(status)) {
                  console.log(`[poll-calls] Skip (status=${status}): ${conv.contactName || conv.fullName || 'Unknown'}`)
                  continue
                }
                if (realDuration < MIN_CALL_DURATION) {
                  console.log(`[poll-calls] Skip (${realDuration}s < ${MIN_CALL_DURATION}s): ${conv.contactName || conv.fullName || 'Unknown'}`)
                  continue
                }

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
                const rec = await fetchCallRecording(freshTenant.ghlAccessToken!, freshTenant.ghlLocationId!, String(msg.id))

                if (rec.status === 'success' && rec.recordingUrl) {
                  await db.call.update({ where: { id: call.id }, data: { recordingUrl: rec.recordingUrl } })
                  const trans = await transcribeRecording(rec.recordingUrl, freshTenant.ghlAccessToken!)
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
        console.error(`[poll-calls] Tenant error:`, err instanceof Error ? err.message : err)
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
