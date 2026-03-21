// scripts/poll-calls.ts
// Polling fallback for call grading — runs every 60s via Railway cron
// Iterates individual call MESSAGES within GHL conversations
// Fetches recordings via /conversations/messages/{id}/locations/{locId}/recording

import { db } from '../lib/db/client'
import { gradeCall } from '../lib/ai/grading'
import { syncGHLUsers } from '../lib/ghl/sync-users'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-04-15'
const MIN_CALL_DURATION = 45

interface GHLMessage {
  id: string
  messageType: string
  messageTypeId?: number
  direction: string
  status: string
  type: number
  contactId: string
  conversationId: string
  userId?: string
  dateAdded: string
  dateUpdated?: string
  meta?: { call?: { duration?: number; status?: string } }
  altId?: string
  callDuration?: number
  callStatus?: string
}

async function pollCalls() {
  console.log('[poll-calls] Starting call poll...')

  try {
    const tenants = await db.tenant.findMany({
      where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
      select: { id: true, ghlLocationId: true, ghlAccessToken: true },
    })

    if (tenants.length === 0) {
      console.log('[poll-calls] No tenants with GHL connections')
      process.exit(0)
    }

    let totalNewCalls = 0

    for (const tenant of tenants) {
      try {
        // Sync GHL user data on every poll cycle
        const syncResult = await syncGHLUsers(tenant.id)
        if (syncResult.synced > 0) {
          console.log(`[poll-calls] Synced ${syncResult.synced} user(s) from GHL`)
        }

        const headers = {
          'Authorization': `Bearer ${tenant.ghlAccessToken}`,
          'Content-Type': 'application/json',
          'Version': GHL_API_VERSION,
        }

        // Pre-fetch team members and existing call IDs
        const tenantUsers = await db.user.findMany({
          where: { tenantId: tenant.id, ghlUserId: { not: null } },
          select: { id: true, ghlUserId: true },
        })

        const existingCalls = await db.call.findMany({
          where: { tenantId: tenant.id },
          select: { ghlCallId: true },
        })
        const existingIds = new Set(existingCalls.map(c => c.ghlCallId).filter(Boolean))

        // Only check recent conversations (last 2 hours of activity)
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)

        // Fetch recent conversations
        const convRes = await fetch(
          `${GHL_BASE_URL}/conversations/search?${new URLSearchParams({ locationId: tenant.ghlLocationId!, limit: '50' })}`,
          { headers },
        )
        if (!convRes.ok) continue
        const convData = await convRes.json() as { conversations?: Array<{ id: string; contactName?: string; fullName?: string; phone?: string; contactId?: string; userId?: string; assignedTo?: string }> }
        const conversations = convData.conversations ?? []

        for (const conv of conversations) {
          try {
            // Paginate messages within conversation
            let lastMessageId: string | undefined

            for (let p = 0; p < 3; p++) {
              const msgUrl = `${GHL_BASE_URL}/conversations/${conv.id}/messages${lastMessageId ? `?lastMessageId=${lastMessageId}` : ''}`
              const msgRes = await fetch(msgUrl, { headers })
              if (!msgRes.ok) break

              const msgData = await msgRes.json() as { messages?: { messages?: GHLMessage[]; lastMessageId?: string; nextPage?: boolean } }
              const pageData = msgData.messages
              const messages = pageData?.messages ?? []
              if (messages.length === 0) break

              let hitOld = false

              for (const msg of messages) {
                const msgType = (msg.messageType ?? '').toUpperCase()
                const isCall = msgType === 'TYPE_CALL' || msgType === 'CALL' || msg.type === 1
                if (!isCall) continue

                const msgDate = new Date(msg.dateAdded)
                if (msgDate < cutoff) { hitOld = true; continue }

                // Real duration = max of meta.call.duration, callDuration, and elapsed time
                const metaDuration = msg.callDuration ?? msg.meta?.call?.duration ?? 0
                const elapsed = msg.dateUpdated
                  ? Math.round((new Date(msg.dateUpdated).getTime() - new Date(msg.dateAdded).getTime()) / 1000)
                  : 0
                const realDuration = Math.max(metaDuration, elapsed)

                if (realDuration < MIN_CALL_DURATION) continue

                // Deduplicate
                const dedupeId = msg.altId || msg.id
                if (existingIds.has(dedupeId) || existingIds.has(msg.id)) continue
                existingIds.add(dedupeId)

                const ghlUserId = msg.userId || conv.userId || conv.assignedTo
                const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null
                const direction = msg.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND'
                const contactName = conv.contactName || conv.fullName || conv.phone || 'Unknown'

                // Create call record
                const call = await db.call.create({
                  data: {
                    tenantId: tenant.id,
                    ghlCallId: dedupeId,
                    ghlContactId: msg.contactId ?? conv.contactId ?? undefined,
                    assignedToId: user?.id ?? undefined,
                    direction: direction as 'INBOUND' | 'OUTBOUND',
                    durationSeconds: realDuration,
                    calledAt: msgDate,
                    gradingStatus: 'PENDING',
                  },
                })
                totalNewCalls++

                // Fetch recording
                const recordingResult = await fetchCallRecording(
                  tenant.ghlAccessToken!,
                  tenant.ghlLocationId!,
                  msg.id,
                )
                if (recordingResult.status === 'success' && recordingResult.recordingUrl) {
                  await db.call.update({
                    where: { id: call.id },
                    data: { recordingUrl: recordingResult.recordingUrl },
                  })
                  console.log(`[poll-calls] New call: ${contactName} | ${realDuration}s | RECORDING: YES`)
                } else {
                  console.log(`[poll-calls] New call: ${contactName} | ${realDuration}s | recording: ${recordingResult.status}`)
                }

                // Trigger grading
                gradeCall(call.id).catch(err => {
                  console.error(`[poll-calls] Grading failed for ${call.id}:`, err instanceof Error ? err.message : err)
                })
              }

              if (hitOld || !pageData?.nextPage) break
              lastMessageId = pageData?.lastMessageId
            }
          } catch { continue }
        }
      } catch (err) {
        console.error(`[poll-calls] Error for tenant ${tenant.id}:`, err instanceof Error ? err.message : err)
      }
    }

    console.log(`[poll-calls] Done. New calls: ${totalNewCalls}`)
  } catch (err) {
    console.error('[poll-calls] Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  process.exit(0)
}

pollCalls()
