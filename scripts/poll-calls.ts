// scripts/poll-calls.ts
// Cron job — runs every 5 min via Railway Function
// Safety net for webhook — guarantees every call is captured
//
// Two strategies (tries both):
// 1. Export endpoint: GET /conversations/messages/export?locationId=X&type=TYPE_CALL
//    Cursor-based, catches everything. If unavailable, falls back to:
// 2. Per-user conversation search: searches each team member's conversations
//    individually so no call gets buried in SMS noise
//
// Verified against: marketplace.gohighlevel.com/docs + ghl-masterclass

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { gradeCall } from '../lib/ai/grading'
import { syncGHLUsers } from '../lib/ghl/sync-users'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'
import { transcribeRecording } from '../lib/ai/transcribe'
import { logFailure } from '../lib/audit'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const MIN_CALL_DURATION_FOR_GRADING = 45
const LOOKBACK_HOURS = 48 // first run only (no cursor yet)

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── Shared: process a single call message into the DB ─────────────────────

async function processCallMessage(
  msg: Record<string, unknown>,
  tenantId: string,
  ghl: Awaited<ReturnType<typeof getGHLClient>>,
  accessToken: string,
  locationId: string,
  tenantUsers: Array<{ id: string; ghlUserId: string | null; role: string | null }>,
  existingIds: Set<string>,
): Promise<'new' | 'deduped' | 'skipped'> {
  const messageId = String(msg.id ?? msg.messageId ?? '')
  const altId = msg.altId ? String(msg.altId) : null
  const dedupeId = altId || messageId
  if (!dedupeId) return 'skipped'
  if (existingIds.has(dedupeId)) return 'deduped'
  if (messageId && messageId !== dedupeId && existingIds.has(messageId)) return 'deduped'
  existingIds.add(dedupeId)

  // DB-level upgrade check: if call already exists, see if it needs fresh data
  const existing = await db.call.findFirst({
    where: {
      tenantId,
      OR: [
        { ghlCallId: dedupeId },
        ...(messageId && messageId !== dedupeId ? [{ ghlCallId: messageId }] : []),
      ],
    },
    select: { id: true, durationSeconds: true, recordingUrl: true, gradingStatus: true, callResult: true },
  })

  if (existing) {
    // Compute fresh values from the polling data
    let freshMeta: Record<string, unknown> = {}
    if (msg.meta && typeof msg.meta === 'string') { try { freshMeta = JSON.parse(msg.meta) } catch {} }
    else if (msg.meta && typeof msg.meta === 'object') { freshMeta = msg.meta as Record<string, unknown> }
    const freshCallMeta = (freshMeta.call ?? {}) as Record<string, unknown>
    const freshDuration = Math.max(
      Number(freshCallMeta.duration ?? 0),
      Number(freshMeta.duration ?? 0),
      Number(msg.callDuration ?? 0),
      Number(msg.duration ?? 0),
    )

    const rec = await fetchCallRecording(accessToken, locationId, messageId)
    const freshRecording = rec.status === 'success' ? rec.recordingUrl ?? null : null

    const needsDurationUpdate = freshDuration > 0 && (!existing.durationSeconds || existing.durationSeconds === 0)
    const needsRecordingUpdate = freshRecording && !existing.recordingUrl
    const wasFalselyFailed = existing.gradingStatus === 'FAILED'
      && (existing.callResult === 'no_answer' || existing.callResult === 'short_call')
      && (freshDuration >= 45 || !!freshRecording)

    if (needsDurationUpdate || needsRecordingUpdate || wasFalselyFailed) {
      const updates: Record<string, unknown> = {}
      if (needsDurationUpdate) updates.durationSeconds = freshDuration
      if (needsRecordingUpdate) updates.recordingUrl = freshRecording
      if (wasFalselyFailed) {
        updates.gradingStatus = 'PENDING'
        updates.callResult = null
        updates.aiSummary = null
      }
      await db.call.update({ where: { id: existing.id }, data: updates })
      console.log(`[poll-calls] UPGRADED call ${existing.id}: duration=${freshDuration}s, hasRec=${!!freshRecording}, wasFailed=${wasFalselyFailed}`)

      if (wasFalselyFailed || needsRecordingUpdate) {
        if (freshRecording) {
          const trans = await transcribeRecording(freshRecording, accessToken)
          if (trans.status === 'success' && trans.transcript) {
            await db.call.update({ where: { id: existing.id }, data: { transcript: trans.transcript } })
          }
        }
        await gradeCall(existing.id).catch(err =>
          logFailure(tenantId, 'poll.regrade_failed', 'call', err, { callId: existing.id, dedupeId })
        )
      }
      return 'new'
    }
    return 'deduped'
  }

  // Not in DB — fall through to existing creation logic below

  // Extract duration
  let meta: Record<string, unknown> = {}
  if (msg.meta && typeof msg.meta === 'string') {
    try { meta = JSON.parse(msg.meta) } catch {}
  } else if (msg.meta && typeof msg.meta === 'object') {
    meta = msg.meta as Record<string, unknown>
  }
  const callMeta = (meta.call ?? {}) as Record<string, unknown>
  const duration = Math.max(
    Number(callMeta.duration ?? 0),
    Number(meta.duration ?? 0),
    Number(msg.callDuration ?? 0),
    Number(msg.duration ?? 0),
  )

  // Direction: string field (verified from GHL docs)
  const direction: 'INBOUND' | 'OUTBOUND' =
    String(msg.direction ?? '').toLowerCase() === 'inbound' ? 'INBOUND' : 'OUTBOUND'

  // Contact info
  const contactId = String(msg.contactId ?? '')
  let contactName: string | null = null
  let contactAddress: string | null = null
  if (contactId) {
    try {
      const contact = await ghl.getContact(contactId)
      contactName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || null
      contactAddress = [contact.address1, contact.city, contact.state].filter(Boolean).join(', ') || null
    } catch (err) { await logFailure(tenantId, 'poll.contact_lookup_failed', 'call', err, { contactId }) }
  }

  // Match team member
  const ghlUserId = String(msg.userId ?? '')
  const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null

  // Match property
  const property = contactId
    ? await db.property.findFirst({ where: { tenantId, ghlContactId: contactId }, select: { id: true } })
    : null

  // Check for recording
  const rec = await fetchCallRecording(accessToken, locationId, messageId)
  const hasRecording = rec.status === 'success' && !!rec.recordingUrl

  const isGradeable = duration >= MIN_CALL_DURATION_FOR_GRADING || hasRecording
  const isNoAnswer = duration === 0 && !hasRecording
  const msgDate = new Date(String(msg.dateAdded ?? Date.now()))

  // Create call record
  const call = await db.call.create({
    data: {
      tenantId,
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
      create: { propertyId: property.id, userId: user.id, tenantId, role: user.role ?? 'Team', source: 'call' },
      update: {},
    }).catch(err => logFailure(tenantId, 'poll.team_member_upsert_failed', 'property_team_member', err, { propertyId: property?.id, userId: user?.id }))
  }

  // Transcribe + grade
  if (isGradeable) {
    if (hasRecording) {
      const trans = await transcribeRecording(rec.recordingUrl!, accessToken)
      if (trans.status === 'success' && trans.transcript) {
        await db.call.update({ where: { id: call.id }, data: { transcript: trans.transcript } })
        if (duration === 0 && trans.transcript.length > 50) {
          await db.call.update({ where: { id: call.id }, data: { durationSeconds: Math.max(Math.round(trans.transcript.length / 15), 45) } })
        }
      }
    }
    await gradeCall(call.id).catch(err =>
      logFailure(tenantId, 'poll.call_grade_failed', 'call', err, { callId: call.id, contactName, duration })
    )
  }

  console.log(`[poll-calls] New: ${contactName ?? 'Unknown'} | ${duration > 0 ? `${duration}s` : '0s'} | rec=${hasRecording} | ${isGradeable ? 'GRADE' : 'dial'}`)
  return 'new'
}

// ─── Strategy 1: Export endpoint ────────────────────────────────────────────

async function tryExportEndpoint(
  tenantId: string,
  accessToken: string,
  locationId: string,
  cursor: string | null,
  headers: Record<string, string>,
  ghl: Awaited<ReturnType<typeof getGHLClient>>,
  tenantUsers: Array<{ id: string; ghlUserId: string | null; role: string | null }>,
  existingIds: Set<string>,
): Promise<{ success: boolean; newCursor: string | null; totalNew: number }> {
  let totalNew = 0
  let currentCursor = cursor
  let lastCursor = cursor

  // Try type filters in order: TYPE_CALL, CALL, then no filter
  const typeFilters = ['TYPE_CALL', 'CALL', '']

  for (const typeFilter of typeFilters) {
    currentCursor = cursor // reset cursor for each attempt
    const params = new URLSearchParams({ locationId, limit: '100' })
    if (typeFilter) params.set('type', typeFilter)
    if (currentCursor) params.set('cursor', currentCursor)

    const testRes = await fetch(`${GHL_BASE_URL}/conversations/messages/export?${params}`, { headers })
    if (!testRes.ok) {
      console.log(`[poll-calls] Export with type=${typeFilter || 'none'} returned ${testRes.status}`)
      continue
    }

    console.log(`[poll-calls] Export endpoint works with type=${typeFilter || 'none'}`)

    // This type filter works — paginate through all results
    for (let page = 0; page < 20; page++) {
      const pageParams = new URLSearchParams({ locationId, limit: '100' })
      if (typeFilter) pageParams.set('type', typeFilter)
      if (currentCursor) pageParams.set('cursor', currentCursor)

      const res = page === 0 ? testRes : await fetch(`${GHL_BASE_URL}/conversations/messages/export?${pageParams}`, { headers })
      if (page > 0 && !res.ok) break

      const data = await res.json() as {
        messages?: Array<Record<string, unknown>>
        cursor?: string; nextCursor?: string; hasMore?: boolean
      }

      const messages = data.messages ?? []
      if (messages.length === 0) break

      for (const msg of messages) {
        // If no type filter, we need to check if it's a call
        if (!typeFilter) {
          const msgType = String(msg.messageType ?? '').toUpperCase()
          const typeId = typeof msg.messageTypeId === 'number' ? msg.messageTypeId : -1
          const isCall = msgType === 'CALL' || typeId === 1 || typeId === 10
            || !!(msg.callDuration || msg.callStatus || (msg.meta as Record<string, unknown>)?.call)
          if (!isCall) continue
        }

        // Skip old messages on first run (no cursor)
        if (!cursor) {
          const msgDate = new Date(String(msg.dateAdded ?? ''))
          if (msgDate < new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)) continue
        }

        const result = await processCallMessage(msg, tenantId, ghl, accessToken, locationId, tenantUsers, existingIds)
        if (result === 'new') totalNew++
        await sleep(100)
      }

      lastCursor = data.nextCursor ?? data.cursor ?? currentCursor
      currentCursor = lastCursor
      if (!data.hasMore && !(data.nextCursor && data.nextCursor !== currentCursor)) break
      await sleep(200)
    }

    return { success: true, newCursor: lastCursor, totalNew }
  }

  return { success: false, newCursor: null, totalNew: 0 }
}

// ─── Strategy 2: Call-type conversation search ──────────────────────────────
// Searches for conversations where the last message type is a call.
// More reliable than per-user search because it asks GHL directly for calls.

async function callTypeConversationSearch(
  tenantId: string,
  accessToken: string,
  locationId: string,
  headers: Record<string, string>,
  ghl: Awaited<ReturnType<typeof getGHLClient>>,
  tenantUsers: Array<{ id: string; ghlUserId: string | null; role: string | null }>,
  existingIds: Set<string>,
): Promise<number> {
  let totalNew = 0
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)

  // Try searching for call-type conversations directly
  for (let page = 0; page < 10; page++) {
    try {
      const params = new URLSearchParams({
        locationId,
        limit: '100',
        type: 'TYPE_CALL',
        sortBy: 'last_message_date',
        sortOrder: 'desc',
      })
      if (page > 0) params.set('startAfter', String(page * 100))

      const res = await fetch(`${GHL_BASE_URL}/conversations/search?${params}`, { headers })
      if (!res.ok) {
        console.log(`[poll-calls] Call-type search returned ${res.status}, trying alternate type filter...`)
        // Try without type filter but sort by recent
        const altParams = new URLSearchParams({ locationId, limit: '100', sortBy: 'last_message_date', sortOrder: 'desc' })
        const altRes = await fetch(`${GHL_BASE_URL}/conversations/search?${altParams}`, { headers })
        if (!altRes.ok) break
        // Fall through to process — we'll filter for calls in the message fetch
      }

      const data = await (res.ok ? res : await fetch(`${GHL_BASE_URL}/conversations/search?${new URLSearchParams({ locationId, limit: '100', sortBy: 'last_message_date', sortOrder: 'desc' })}`, { headers })).json() as {
        conversations?: Array<{ id: string; contactId?: string; contactName?: string; fullName?: string; phone?: string; userId?: string; assignedTo?: string; lastMessageDate?: string; type?: string }>
      }

      const conversations = data.conversations ?? []
      if (conversations.length === 0) break

      // Check if we've gone past the lookback window
      const lastConvDate = conversations[conversations.length - 1]?.lastMessageDate
      if (lastConvDate && new Date(lastConvDate) < cutoff) {
        // Process remaining conversations in this batch, then stop
      }

      for (const conv of conversations) {
        try {
          // Skip if conversation is too old
          if (conv.lastMessageDate && new Date(conv.lastMessageDate) < cutoff) continue

          // Get messages for this conversation — look for calls
          const msgRes = await fetch(`${GHL_BASE_URL}/conversations/${conv.id}/messages?limit=50`, { headers })
          if (!msgRes.ok) continue

          const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>> } }
          const msgs = msgData.messages?.messages ?? []

          for (const msg of msgs) {
            const msgType = String(msg.messageType ?? '').toUpperCase()
            const typeId = typeof msg.messageTypeId === 'number' ? msg.messageTypeId : -1
            const isCall = msgType === 'CALL' || typeId === 1 || typeId === 10
              || !!(msg.callDuration || msg.callStatus || (msg.meta as Record<string, unknown>)?.call)
            if (!isCall) continue

            const msgDate = new Date(String(msg.dateAdded ?? ''))
            if (msgDate < cutoff) continue

            if (!msg.contactId && conv.contactId) msg.contactId = conv.contactId
            if (!msg.userId) msg.userId = conv.userId ?? conv.assignedTo

            const result = await processCallMessage(msg, tenantId, ghl, accessToken, locationId, tenantUsers, existingIds)
            if (result === 'new') totalNew++
            await sleep(50)
          }
        } catch (err) { await logFailure(tenantId, 'poll.conversation_search_failed', 'call', err, { conversationId: conv.id }); continue }
      }

      // If all conversations in batch are before cutoff, stop
      if (lastConvDate && new Date(lastConvDate) < cutoff) break
      if (conversations.length < 100) break
      await sleep(300)
    } catch (err) {
      console.error(`[poll-calls] Call-type search error:`, err instanceof Error ? err.message : err)
      break
    }
  }

  return totalNew
}

// ─── Strategy 3: Per-user conversation search ───────────────────────────────

async function perUserConversationSearch(
  tenantId: string,
  accessToken: string,
  locationId: string,
  headers: Record<string, string>,
  ghl: Awaited<ReturnType<typeof getGHLClient>>,
  tenantUsers: Array<{ id: string; ghlUserId: string | null; role: string | null }>,
  existingIds: Set<string>,
): Promise<number> {
  let totalNew = 0
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)
  const usersWithGhl = tenantUsers.filter(u => u.ghlUserId)

  console.log(`[poll-calls] Per-user search: ${usersWithGhl.length} team members`)

  for (const user of usersWithGhl) {
    try {
      // Search this user's conversations (up to 5 pages = 500 conversations)
      let startAfterId: string | undefined
      for (let page = 0; page < 5; page++) {
        const params = new URLSearchParams({
          locationId,
          assignedTo: user.ghlUserId!,
          limit: '100',
        })
        if (startAfterId) params.set('lastId', startAfterId)

        const convRes = await fetch(`${GHL_BASE_URL}/conversations/search?${params}`, { headers })
        if (!convRes.ok) break

        const convData = await convRes.json() as {
          conversations?: Array<{ id: string; contactId?: string; contactName?: string; fullName?: string; phone?: string; userId?: string; assignedTo?: string }>
          total?: number
        }
        const conversations = convData.conversations ?? []
        if (conversations.length === 0) break

        for (const conv of conversations) {
          try {
            // Get messages for this conversation
            const msgRes = await fetch(`${GHL_BASE_URL}/conversations/${conv.id}/messages`, { headers })
            if (!msgRes.ok) continue

            const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>> } }
            const msgs = msgData.messages?.messages ?? []

            for (const msg of msgs) {
              // Check if it's a call (verified types from GHL docs)
              const msgType = String(msg.messageType ?? '').toUpperCase()
              const typeId = typeof msg.messageTypeId === 'number' ? msg.messageTypeId : -1
              const isCall = msgType === 'CALL' || typeId === 1 || typeId === 10
                || !!(msg.callDuration || msg.callStatus || (msg.meta as Record<string, unknown>)?.call)
              if (!isCall) continue

              const msgDate = new Date(String(msg.dateAdded))
              if (msgDate < cutoff) continue

              // Add conversation-level data to message for processing
              if (!msg.contactId && conv.contactId) msg.contactId = conv.contactId
              if (!msg.userId) msg.userId = conv.userId ?? conv.assignedTo ?? user.ghlUserId

              const result = await processCallMessage(msg, tenantId, ghl, accessToken, locationId, tenantUsers, existingIds)
              if (result === 'new') totalNew++
              await sleep(50)
            }
          } catch (err) { await logFailure(tenantId, 'poll.user_conversation_failed', 'call', err, { conversationId: conv.id, ghlUserId: user.ghlUserId }); continue }
        }

        if (conversations.length < 100) break
        startAfterId = conversations[conversations.length - 1]?.id
        if (!startAfterId) break
        await sleep(200)
      }
    } catch (err) {
      console.error(`[poll-calls] User search failed for ${user.ghlUserId}:`, err instanceof Error ? err.message : err)
    }
  }

  return totalNew
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function pollCalls() {
  console.log('[poll-calls] Starting...')

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
      try {
        await syncGHLUsers(tenant.id).catch(err => logFailure(tenant.id, 'poll.sync_users_failed', 'user', err))

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

        const existingCalls = await db.call.findMany({ where: { tenantId: tenant.id }, select: { ghlCallId: true } })
        const existingIds = new Set(existingCalls.map(c => c.ghlCallId).filter(Boolean) as string[])
        console.log(`[poll-calls] ${existingIds.size} existing calls in DB, ${tenantUsers.length} users mapped`)

        // ── Strategy 1: Try export endpoint ──
        const exportResult = await tryExportEndpoint(
          tenant.id, freshTenant.ghlAccessToken, freshTenant.ghlLocationId,
          freshTenant.lastCallExportCursor, headers, ghl, tenantUsers, existingIds,
        )

        if (exportResult.success) {
          console.log(`[poll-calls] Export: ${exportResult.totalNew} new calls`)
          if (exportResult.newCursor && exportResult.newCursor !== freshTenant.lastCallExportCursor) {
            await db.tenant.update({
              where: { id: tenant.id },
              data: { lastCallExportCursor: exportResult.newCursor },
            })
          }
        }

        // ── Strategy 2: Call-type conversation search (most reliable for built-in dialer) ──
        const callConvNew = await callTypeConversationSearch(
          tenant.id, freshTenant.ghlAccessToken, freshTenant.ghlLocationId,
          headers, ghl, tenantUsers, existingIds,
        )
        if (callConvNew > 0) {
          console.log(`[poll-calls] Call-type search found ${callConvNew} additional calls`)
        }

        // ── Strategy 3: Per-user conversation search (catches anything else) ──
        const searchNew = await perUserConversationSearch(
          tenant.id, freshTenant.ghlAccessToken, freshTenant.ghlLocationId,
          headers, ghl, tenantUsers, existingIds,
        )
        if (searchNew > 0) {
          console.log(`[poll-calls] Per-user search found ${searchNew} additional calls`)
        }

        console.log(`[poll-calls] Tenant ${tenant.id} complete`)

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
            await gradeCall(fc.id).catch(err => logFailure(null, 'poll.retry_grade_failed', 'call', err, { callId: fc.id }))
            await sleep(500)
          }
        } catch (err) { await logFailure(null, 'poll.retry_transcription_failed', 'call', err, { callId: fc.id, contactName: fc.contactName }) }
      }
    }

    // ─── Grade stale PENDING calls (backfill recovery + stuck calls) ──
    // Catches calls that were flipped to PENDING by the backfill migration
    // or got stuck in PENDING because the cursor already passed them.
    const stalePending = await db.call.findMany({
      where: {
        gradingStatus: 'PENDING',
        calledAt: { gte: retryWindow },
      },
      select: {
        id: true, contactName: true, recordingUrl: true, durationSeconds: true,
        ghlCallId: true, transcript: true,
        tenant: { select: { ghlAccessToken: true, ghlLocationId: true } },
      },
      take: 20,
    })

    if (stalePending.length > 0) {
      console.log(`[poll-calls] Grading ${stalePending.length} stale PENDING calls...`)
      for (const pc of stalePending) {
        try {
          // Try to fetch recording if missing
          if (!pc.recordingUrl && pc.ghlCallId && pc.tenant.ghlAccessToken && pc.tenant.ghlLocationId) {
            const rec = await fetchCallRecording(pc.tenant.ghlAccessToken, pc.tenant.ghlLocationId, pc.ghlCallId)
            if (rec.status === 'success' && rec.recordingUrl) {
              await db.call.update({ where: { id: pc.id }, data: { recordingUrl: rec.recordingUrl } })
              pc.recordingUrl = rec.recordingUrl
              console.log(`[poll-calls] Fetched recording for stale PENDING ${pc.id}`)
            }
          }
          // Transcribe if recording but no transcript
          if (pc.recordingUrl && !pc.transcript) {
            const trans = await transcribeRecording(pc.recordingUrl, pc.tenant.ghlAccessToken ?? undefined)
            if (trans.status === 'success' && trans.transcript) {
              await db.call.update({ where: { id: pc.id }, data: { transcript: trans.transcript } })
              if (!pc.durationSeconds && trans.transcript.length > 50) {
                await db.call.update({ where: { id: pc.id }, data: { durationSeconds: Math.max(Math.round(trans.transcript.length / 15), 45) } })
              }
            }
          }
          await gradeCall(pc.id).catch(err =>
            logFailure(null, 'poll.stale_pending_grade_failed', 'call', err, { callId: pc.id, contactName: pc.contactName })
          )
          await sleep(500)
        } catch (err) {
          await logFailure(null, 'poll.stale_pending_failed', 'call', err, { callId: pc.id, contactName: pc.contactName })
        }
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
