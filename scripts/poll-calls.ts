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
const MIN_CALL_DURATION_FOR_GRADING = 45 // only grade calls >= 45s
const CONVERSATION_LIMIT = 100
const LOOKBACK_HOURS = 12 // full business day coverage

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

        // Fetch recent conversations — two passes to catch all calls
        // Pass 1: TYPE_CALL filter (gets call-specific conversations)
        // Pass 2: All conversations (catches calls that GHL doesn't tag as TYPE_CALL)
        type ConvItem = { id: string; contactId?: string; contactName?: string; fullName?: string; phone?: string; userId?: string; assignedTo?: string }
        const seenConvIds = new Set<string>()
        const conversations: ConvItem[] = []

        for (const searchType of ['TYPE_CALL', 'ALL']) {
          let startAfterId: string | undefined
          const maxPages = searchType === 'TYPE_CALL' ? 20 : 10
          for (let page = 0; page < maxPages; page++) {
            const params = new URLSearchParams({ locationId: freshTenant.ghlLocationId!, limit: String(CONVERSATION_LIMIT) })
            if (startAfterId) params.set('startAfterId', startAfterId)
            if (searchType === 'TYPE_CALL') params.set('type', 'TYPE_CALL')
            const convRes = await fetch(`${GHL_BASE_URL}/conversations/search?${params}`, { headers })
            if (!convRes.ok) {
              const errorBody = await convRes.text().catch(() => 'unknown')
              console.error(`[poll-calls] Conversations fetch failed (${convRes.status}, type=${searchType}): ${errorBody.slice(0, 200)}`)
              break
            }
            const convData = await convRes.json() as { conversations?: ConvItem[]; total?: number }
            const batch = convData.conversations ?? []
            for (const c of batch) {
              if (!seenConvIds.has(c.id)) {
                seenConvIds.add(c.id)
                conversations.push(c)
              }
            }
            if (batch.length < CONVERSATION_LIMIT) break
            startAfterId = batch[batch.length - 1]?.id
            if (!startAfterId) break
            await sleep(200)
          }
        }
        console.log(`[poll-calls] Tenant ${tenant.id}: ${conversations.length} unique conversations fetched`)

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
            for (let p = 0; p < 5; p++) {
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

                // Extract duration — check every possible GHL source, take highest non-zero
                let meta: Record<string, unknown> = {}
                if (msg.meta && typeof msg.meta === 'string') {
                  try { meta = JSON.parse(msg.meta) } catch {}
                } else if (msg.meta && typeof msg.meta === 'object') {
                  meta = msg.meta as Record<string, unknown>
                }
                const callMeta = (meta.call ?? {}) as Record<string, unknown>
                const durationCandidates = [
                  msg.callDuration as number | undefined,
                  callMeta.duration as number | undefined,
                  meta.duration as number | undefined,
                  msg.duration as number | undefined,
                  callMeta.totalDuration as number | undefined,
                  callMeta.billDuration as number | undefined,
                ].filter((d): d is number => typeof d === 'number' && d > 0)
                const elapsed = msg.dateUpdated
                  ? Math.round((new Date(String(msg.dateUpdated)).getTime() - msgDate.getTime()) / 1000)
                  : 0
                if (elapsed > 0) durationCandidates.push(elapsed)
                const realDuration = Math.min(Math.max(...durationCandidates, 0), 3600)

                const status = String((msg.callStatus ?? (msg.meta as { call?: { status?: string } })?.call?.status ?? msg.status) ?? '').toLowerCase()
                // Save all calls including failed/short — they count as dials
                // Only skip 'initiated' and 'ringing' (not yet connected)
                if (['initiated', 'ringing'].includes(status)) continue

                const dedupeId = String(msg.altId || msg.id)
                if (existingIds.has(dedupeId)) {
                  // Already exists — check if we can fill in missing data or rescue a FAILED call
                  const existing = await db.call.findFirst({
                    where: { tenantId: tenant.id, ghlCallId: dedupeId },
                    select: { id: true, gradingStatus: true, durationSeconds: true, recordingUrl: true },
                  })
                  if (existing) {
                    const needsDuration = existing.durationSeconds === null && realDuration > 0
                    // Check for recording if existing call doesn't have one
                    let foundRecording = false
                    if (!existing.recordingUrl) {
                      const recCheck = await fetchCallRecording(freshTenant.ghlAccessToken!, freshTenant.ghlLocationId!, String(msg.id))
                      if (recCheck.status === 'success' && recCheck.recordingUrl) {
                        await db.call.update({ where: { id: existing.id }, data: { recordingUrl: recCheck.recordingUrl } })
                        foundRecording = true
                      }
                    }
                    const hasRec = !!existing.recordingUrl || foundRecording
                    const effectiveDuration = realDuration > 0 ? realDuration : (existing.durationSeconds ?? 0)
                    const isGradeable = effectiveDuration >= MIN_CALL_DURATION_FOR_GRADING || hasRec

                    if (needsDuration || (isGradeable && existing.gradingStatus === 'FAILED')) {
                      await db.call.update({
                        where: { id: existing.id },
                        data: {
                          ...(needsDuration ? { durationSeconds: realDuration } : {}),
                          ...(isGradeable && existing.gradingStatus !== 'COMPLETED' ? { gradingStatus: 'PENDING', callResult: null, aiSummary: null } : {}),
                          ...(!isGradeable && needsDuration ? { gradingStatus: 'FAILED', callResult: 'short_call', aiSummary: `Short call (${realDuration}s) — not graded.` } : {}),
                        },
                      })
                      console.log(`[poll-calls] Rescued: ${conv.contactName || 'Unknown'} → ${effectiveDuration}s, recording=${hasRec} (queued for grading)`)
                      if (isGradeable && existing.gradingStatus !== 'COMPLETED') {
                        await gradeCall(existing.id).catch(err => {
                          console.error(`[poll-calls] Grade failed ${existing.id}:`, err instanceof Error ? err.message.slice(0, 80) : err)
                        })
                      }
                    }
                  }
                  continue
                }
                existingIds.add(dedupeId)

                const contactName = conv.contactName || conv.fullName || conv.phone || null
                const ghlUserId = String(msg.userId || conv.userId || conv.assignedTo || '')
                const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null

                // Resolve contact name + address from GHL
                let resolvedName = contactName
                let contactAddress: string | null = null
                const contactId = String(msg.contactId ?? conv.contactId ?? '')
                if (contactId) {
                  try {
                    const cRes = await fetch(`${GHL_BASE_URL}/contacts/${contactId}`, { headers })
                    if (cRes.ok) {
                      const cData = await cRes.json() as { contact?: { firstName?: string; lastName?: string; address1?: string; city?: string; state?: string } }
                      if (!resolvedName) {
                        resolvedName = `${cData.contact?.firstName ?? ''} ${cData.contact?.lastName ?? ''}`.trim() || null
                      }
                      contactAddress = [cData.contact?.address1, cData.contact?.city, cData.contact?.state].filter(Boolean).join(', ') || null
                    }
                  } catch { /* skip */ }
                }

                // Check for recording before deciding gradeability
                await sleep(100)
                const rec = await fetchCallRecording(freshTenant.ghlAccessToken!, freshTenant.ghlLocationId!, String(msg.id))
                const hasRecording = rec.status === 'success' && !!rec.recordingUrl

                // Safety rule: if recording exists, this is a real call — grade it regardless of duration
                const isGradeable = realDuration >= MIN_CALL_DURATION_FOR_GRADING || hasRecording
                // Only mark as no_answer if genuinely 0 duration AND no recording
                const isNoAnswer = realDuration === 0 && !hasRecording

                // Create call — ALL calls saved (including 0s dials) for accurate counts
                const call = await db.call.create({
                  data: {
                    tenantId: tenant.id,
                    ghlCallId: dedupeId,
                    ghlContactId: contactId || undefined,
                    contactName: resolvedName,
                    contactAddress,
                    assignedToId: user?.id ?? undefined,
                    direction: String(msg.direction) === 'inbound' ? 'INBOUND' : 'OUTBOUND',
                    durationSeconds: realDuration > 0 ? realDuration : undefined,
                    calledAt: msgDate,
                    recordingUrl: hasRecording ? rec.recordingUrl : undefined,
                    callResult: isNoAnswer ? 'no_answer' : isGradeable ? undefined : 'short_call',
                    gradingStatus: isGradeable ? 'PENDING' : 'FAILED',
                    ...(isGradeable ? {} : { aiSummary: isNoAnswer ? 'No answer — zero duration.' : `Short call (${realDuration}s) — not graded.` }),
                  },
                })

                // Fetch recording, transcribe, and grade for gradeable calls
                if (isGradeable) {
                  if (hasRecording) {
                    const trans = await transcribeRecording(rec.recordingUrl!, freshTenant.ghlAccessToken!)
                    if (trans.status === 'success' && trans.transcript) {
                      await db.call.update({ where: { id: call.id }, data: { transcript: trans.transcript } })
                      // If we didn't have duration but got transcript, estimate from transcript length
                      if (realDuration === 0 && trans.transcript.length > 50) {
                        const estDuration = Math.max(Math.round(trans.transcript.length / 15), 45)
                        await db.call.update({ where: { id: call.id }, data: { durationSeconds: estDuration } })
                      }
                    }
                  }

                  await gradeCall(call.id).catch(err => {
                    console.error(`[poll-calls] Grade failed ${call.id}:`, err instanceof Error ? err.message.slice(0, 80) : err)
                  })
                }

                totalNew++
                console.log(`[poll-calls] New: ${resolvedName ?? 'Unknown'} | ${realDuration > 0 ? `${realDuration}s` : 'no duration'} | recording=${hasRecording} | ${isGradeable ? 'GRADE' : 'dial'}`)
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

    // ─── Retry failed transcriptions ──────────────────────────────────
    // Find calls with recordings that failed to transcribe (FAILED status, has recording URL,
    // no transcript, created in the last 24 hours). Retry transcription + grading.
    const retryWindow = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const failedCalls = await db.call.findMany({
      where: {
        gradingStatus: 'FAILED',
        recordingUrl: { not: null },
        transcript: null,
        calledAt: { gte: retryWindow },
        // Retry ANY failed call with a recording — duration 0 is often a GHL data issue, not reality
      },
      select: {
        id: true, contactName: true, recordingUrl: true, durationSeconds: true,
        tenant: { select: { ghlAccessToken: true } },
      },
      take: 10, // cap retries per cycle
    })

    if (failedCalls.length > 0) {
      console.log(`[poll-calls] Retrying ${failedCalls.length} failed transcriptions...`)
      for (const fc of failedCalls) {
        try {
          const trans = await transcribeRecording(fc.recordingUrl!, fc.tenant.ghlAccessToken ?? undefined)
          if (trans.status === 'success' && trans.transcript && trans.transcript.length > 20) {
            // Estimate duration from transcript if we don't have it
            const estDuration = fc.durationSeconds ?? Math.max(Math.round(trans.transcript.length / 15), 45)
            await db.call.update({
              where: { id: fc.id },
              data: {
                transcript: trans.transcript,
                durationSeconds: estDuration,
                gradingStatus: 'PENDING',
                callResult: null,
                aiSummary: null,
              },
            })
            console.log(`[poll-calls] Retry transcribed: ${fc.contactName ?? fc.id} (${trans.transcript.length} chars)`)
            await gradeCall(fc.id).catch(err => {
              console.error(`[poll-calls] Retry grade failed ${fc.id}:`, err instanceof Error ? err.message.slice(0, 80) : err)
            })
            await sleep(500) // rate limit
          }
        } catch { /* continue to next */ }
      }
    }

    console.log(`[poll-calls] Complete.`)
  } catch (err) {
    console.error('[poll-calls] Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  process.exit(0)
}

pollCalls()
