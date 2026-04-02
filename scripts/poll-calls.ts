// scripts/poll-calls.ts
// Cron job — runs every 5 min via Railway Function
// Uses GHL Export Messages endpoint to get ALL call messages for a location
// Cursor-based: picks up exactly where it left off, never misses a call
// Webhook is the primary real-time path; this is the reliability safety net

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { gradeCall } from '../lib/ai/grading'
import { syncGHLUsers } from '../lib/ghl/sync-users'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'
import { transcribeRecording } from '../lib/ai/transcribe'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const MIN_CALL_DURATION_FOR_GRADING = 45
const EXPORT_LIMIT = 100 // messages per page
const MAX_PAGES = 20 // safety cap: 2000 messages per run
const LOOKBACK_HOURS = 48 // only used on first run (no cursor yet)

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function pollCalls() {
  console.log('[poll-calls] Starting (export endpoint)...')

  try {
    const tenants = await db.tenant.findMany({
      where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
      select: { id: true, ghlLocationId: true, ghlAccessToken: true, lastCallExportCursor: true },
    })

    if (tenants.length === 0) {
      console.log('[poll-calls] No tenants')
      process.exit(0)
    }

    for (const tenant of tenants) {
      let totalNew = 0
      let totalDeduped = 0
      let totalProcessed = 0

      try {
        // Sync GHL user data
        await syncGHLUsers(tenant.id).catch(() => {})

        // Get fresh token
        let ghl: Awaited<ReturnType<typeof getGHLClient>>
        try {
          ghl = await getGHLClient(tenant.id)
        } catch (err) {
          console.error(`[poll-calls] Cannot get GHL client for tenant ${tenant.id}:`, err instanceof Error ? err.message : err)
          continue
        }

        const freshTenant = await db.tenant.findUnique({
          where: { id: tenant.id },
          select: { ghlAccessToken: true, ghlLocationId: true, lastCallExportCursor: true },
        })
        if (!freshTenant?.ghlAccessToken || !freshTenant.ghlLocationId) continue

        const headers = {
          'Authorization': `Bearer ${freshTenant.ghlAccessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        }

        const tenantUsers = await db.user.findMany({
          where: { tenantId: tenant.id, ghlUserId: { not: null } },
          select: { id: true, ghlUserId: true, role: true },
        })

        const existingIds = new Set(
          (await db.call.findMany({ where: { tenantId: tenant.id }, select: { ghlCallId: true } }))
            .map(c => c.ghlCallId).filter(Boolean) as string[]
        )

        // ─── Export messages endpoint: get ALL call messages ────────────
        let cursor = freshTenant.lastCallExportCursor ?? undefined
        let lastCursor = cursor

        // If no cursor, use lookback as starting point
        if (!cursor) {
          console.log(`[poll-calls] No cursor — first run, using ${LOOKBACK_HOURS}h lookback`)
        }

        for (let page = 0; page < MAX_PAGES; page++) {
          const params = new URLSearchParams({
            locationId: freshTenant.ghlLocationId,
            type: 'TYPE_VOICE_CALL',
            limit: String(EXPORT_LIMIT),
          })
          if (cursor) params.set('cursor', cursor)

          const res = await fetch(`${GHL_BASE_URL}/conversations/messages/export?${params}`, { headers })

          if (!res.ok) {
            const errorBody = await res.text().catch(() => 'unknown')
            console.error(`[poll-calls] Export fetch failed (${res.status}): ${errorBody.slice(0, 300)}`)

            // If export endpoint doesn't work, fall back to conversation search
            if (res.status === 404 || res.status === 400) {
              console.log('[poll-calls] Export endpoint not available — falling back to conversation search')
              await fallbackConversationSearch(tenant.id, freshTenant, headers, tenantUsers, existingIds)
            }
            break
          }

          const data = await res.json() as {
            messages?: Array<Record<string, unknown>>
            cursor?: string
            hasMore?: boolean
            nextCursor?: string
          }

          const messages = data.messages ?? []
          if (messages.length === 0) {
            console.log(`[poll-calls] No more messages (page ${page})`)
            break
          }

          // Process each call message
          for (const msg of messages) {
            totalProcessed++
            const messageId = String(msg.id ?? msg.messageId ?? '')
            const altId = msg.altId ? String(msg.altId) : null
            const dedupeId = altId || messageId

            if (!dedupeId) continue
            if (existingIds.has(dedupeId)) { totalDeduped++; continue }
            if (messageId && existingIds.has(messageId)) { totalDeduped++; continue }
            existingIds.add(dedupeId)

            // Skip if before lookback (first run only, when no cursor)
            if (!freshTenant.lastCallExportCursor) {
              const msgDate = new Date(String(msg.dateAdded ?? ''))
              const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)
              if (msgDate < cutoff) continue
            }

            // Extract duration from meta
            let meta: Record<string, unknown> = {}
            if (msg.meta && typeof msg.meta === 'string') {
              try { meta = JSON.parse(msg.meta) } catch {}
            } else if (msg.meta && typeof msg.meta === 'object') {
              meta = msg.meta as Record<string, unknown>
            }
            const callMeta = (meta.call ?? meta) as Record<string, unknown>
            const duration = Math.max(
              Number(callMeta.duration ?? 0),
              Number(meta.duration ?? 0),
              Number(msg.callDuration ?? 0),
              Number(msg.duration ?? 0),
            )

            // Direction: type 25 = outbound, type 26 = inbound
            const numType = typeof msg.type === 'number' ? msg.type : parseInt(String(msg.type ?? '0'), 10)
            const direction: 'INBOUND' | 'OUTBOUND' = numType === 26 ? 'INBOUND'
              : numType === 25 ? 'OUTBOUND'
              : String(msg.direction ?? '').toLowerCase() === 'inbound' ? 'INBOUND' : 'OUTBOUND'

            // Resolve contact info
            const contactId = String(msg.contactId ?? '')
            const conversationId = String(msg.conversationId ?? '')
            let contactName: string | null = null
            let contactAddress: string | null = null

            if (contactId) {
              try {
                const contact = await ghl.getContact(contactId)
                contactName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || null
                contactAddress = [contact.address1, contact.city, contact.state].filter(Boolean).join(', ') || null
              } catch {}
            }

            // Match to team member
            const ghlUserId = String(msg.userId ?? '')
            const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null

            // Match to property
            const property = contactId
              ? await db.property.findFirst({ where: { tenantId: tenant.id, ghlContactId: contactId }, select: { id: true } })
              : null

            // Check for recording
            const rec = await fetchCallRecording(freshTenant.ghlAccessToken!, freshTenant.ghlLocationId, messageId)
            const hasRecording = rec.status === 'success' && !!rec.recordingUrl

            const isGradeable = duration >= MIN_CALL_DURATION_FOR_GRADING || hasRecording
            const isNoAnswer = duration === 0 && !hasRecording
            const msgDate = new Date(String(msg.dateAdded ?? Date.now()))

            // Create call record
            const call = await db.call.create({
              data: {
                tenantId: tenant.id,
                ghlCallId: dedupeId,
                ghlContactId: contactId || undefined,
                contactName,
                contactAddress,
                assignedToId: user?.id ?? undefined,
                propertyId: property?.id ?? undefined,
                direction,
                durationSeconds: duration > 0 ? duration : undefined,
                calledAt: msgDate,
                recordingUrl: hasRecording ? rec.recordingUrl : undefined,
                callResult: isNoAnswer ? 'no_answer' : isGradeable ? undefined : 'short_call',
                gradingStatus: isGradeable ? 'PENDING' : 'FAILED',
                ...(isGradeable ? {} : { aiSummary: isNoAnswer ? 'No answer — zero duration.' : `Short call (${duration}s) — not graded.` }),
              },
            })

            // Auto-add team member to property
            if (property?.id && user?.id) {
              await db.propertyTeamMember.upsert({
                where: { propertyId_userId: { propertyId: property.id, userId: user.id } },
                create: { propertyId: property.id, userId: user.id, tenantId: tenant.id, role: user.role ?? 'Team', source: 'call' },
                update: {},
              }).catch(() => {})
            }

            // Transcribe + grade
            if (isGradeable) {
              if (hasRecording) {
                const trans = await transcribeRecording(rec.recordingUrl!, freshTenant.ghlAccessToken!)
                if (trans.status === 'success' && trans.transcript) {
                  await db.call.update({ where: { id: call.id }, data: { transcript: trans.transcript } })
                  if (duration === 0 && trans.transcript.length > 50) {
                    await db.call.update({ where: { id: call.id }, data: { durationSeconds: Math.max(Math.round(trans.transcript.length / 15), 45) } })
                  }
                }
              }

              await gradeCall(call.id).catch(err => {
                console.error(`[poll-calls] Grade failed ${call.id}:`, err instanceof Error ? err.message.slice(0, 80) : err)
              })
            }

            totalNew++
            console.log(`[poll-calls] New: ${contactName ?? 'Unknown'} | ${duration > 0 ? `${duration}s` : 'no duration'} | recording=${hasRecording} | ${isGradeable ? 'GRADE' : 'dial'}`)
            await sleep(100) // rate limit
          }

          // Update cursor
          lastCursor = data.nextCursor ?? data.cursor ?? cursor
          cursor = lastCursor

          if (!data.hasMore && !(data.nextCursor && data.nextCursor !== cursor)) break
          await sleep(200)
        }

        // Save cursor for next run
        if (lastCursor && lastCursor !== freshTenant.lastCallExportCursor) {
          await db.tenant.update({
            where: { id: tenant.id },
            data: { lastCallExportCursor: lastCursor },
          })
          console.log(`[poll-calls] Cursor saved: ${lastCursor?.slice(0, 30)}...`)
        }

        console.log(`[poll-calls] Tenant ${tenant.id}: processed=${totalProcessed} new=${totalNew} deduped=${totalDeduped}`)

      } catch (err) {
        console.error(`[poll-calls] Tenant error:`, err instanceof Error ? err.message : err)
      }
    }

    // ─── Retry failed transcriptions ──────────────────────────────────
    const retryWindow = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const failedCalls = await db.call.findMany({
      where: {
        gradingStatus: 'FAILED',
        recordingUrl: { not: null },
        transcript: null,
        calledAt: { gte: retryWindow },
      },
      select: {
        id: true, contactName: true, recordingUrl: true, durationSeconds: true,
        tenant: { select: { ghlAccessToken: true } },
      },
      take: 10,
    })

    if (failedCalls.length > 0) {
      console.log(`[poll-calls] Retrying ${failedCalls.length} failed transcriptions...`)
      for (const fc of failedCalls) {
        try {
          const trans = await transcribeRecording(fc.recordingUrl!, fc.tenant.ghlAccessToken ?? undefined)
          if (trans.status === 'success' && trans.transcript && trans.transcript.length > 20) {
            const estDuration = fc.durationSeconds ?? Math.max(Math.round(trans.transcript.length / 15), 45)
            await db.call.update({
              where: { id: fc.id },
              data: { transcript: trans.transcript, durationSeconds: estDuration, gradingStatus: 'PENDING', callResult: null, aiSummary: null },
            })
            console.log(`[poll-calls] Retry transcribed: ${fc.contactName ?? fc.id} (${trans.transcript.length} chars)`)
            await gradeCall(fc.id).catch(err => {
              console.error(`[poll-calls] Retry grade failed ${fc.id}:`, err instanceof Error ? err.message.slice(0, 80) : err)
            })
            await sleep(500)
          }
        } catch {}
      }
    }

    console.log(`[poll-calls] Complete.`)
  } catch (err) {
    console.error('[poll-calls] Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  process.exit(0)
}

// ─── Fallback: conversation search (if export endpoint unavailable) ─────────
// This is the old approach — kept as fallback only
async function fallbackConversationSearch(
  tenantId: string,
  tenant: { ghlAccessToken: string | null; ghlLocationId: string | null },
  headers: Record<string, string>,
  tenantUsers: Array<{ id: string; ghlUserId: string | null; role: string | null }>,
  existingIds: Set<string>,
) {
  if (!tenant.ghlAccessToken || !tenant.ghlLocationId) return

  console.log('[poll-calls] Running fallback conversation search...')
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Search conversations
  const params = new URLSearchParams({ locationId: tenant.ghlLocationId, limit: '100' })
  const convRes = await fetch(`${GHL_BASE_URL}/conversations/search?${params}`, { headers })
  if (!convRes.ok) return

  const convData = await convRes.json() as { conversations?: Array<{ id: string; contactId?: string; contactName?: string; fullName?: string; phone?: string; userId?: string; assignedTo?: string }> }
  const conversations = convData.conversations ?? []

  for (const conv of conversations) {
    try {
      const msgRes = await fetch(`${GHL_BASE_URL}/conversations/${conv.id}/messages`, { headers })
      if (!msgRes.ok) continue
      const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>> } }
      const msgs = msgData.messages?.messages ?? []

      for (const msg of msgs) {
        const msgType = String(msg.messageType ?? '').toUpperCase()
        const numType = typeof msg.type === 'number' ? msg.type : parseInt(String(msg.type ?? '0'), 10)
        const isCall = msgType === 'TYPE_VOICE_CALL' || msgType === 'TYPE_CALL' || msgType === 'CALL'
          || numType === 25 || numType === 26
          || !!(msg.callStatus || msg.callDuration || (msg.meta as Record<string, unknown>)?.call)
        if (!isCall) continue

        const msgDate = new Date(String(msg.dateAdded))
        if (msgDate < cutoff) continue

        const dedupeId = String(msg.altId || msg.id)
        if (existingIds.has(dedupeId)) continue
        existingIds.add(dedupeId)

        const duration = Math.max(Number((msg.meta as Record<string, unknown>)?.duration ?? 0), Number(msg.callDuration ?? 0))
        const direction: 'INBOUND' | 'OUTBOUND' = numType === 26 ? 'INBOUND' : 'OUTBOUND'
        const contactId = String(msg.contactId ?? conv.contactId ?? '')
        const ghlUserId = String(msg.userId || conv.userId || conv.assignedTo || '')
        const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null
        const isGradeable = duration >= MIN_CALL_DURATION_FOR_GRADING

        await db.call.create({
          data: {
            tenantId,
            ghlCallId: dedupeId,
            ghlContactId: contactId || undefined,
            contactName: conv.contactName || conv.fullName || conv.phone || null,
            assignedToId: user?.id ?? undefined,
            direction,
            durationSeconds: duration > 0 ? duration : undefined,
            calledAt: msgDate,
            callResult: duration === 0 ? 'no_answer' : isGradeable ? undefined : 'short_call',
            gradingStatus: isGradeable ? 'PENDING' : 'FAILED',
          },
        })

        if (isGradeable) {
          const { gradeCall: grade } = await import('../lib/ai/grading')
          // Grade will fetch recording internally
        }

        console.log(`[poll-calls] Fallback: ${conv.contactName ?? 'Unknown'} | ${duration}s`)
      }
    } catch { continue }
    await sleep(50)
  }
}

pollCalls()
