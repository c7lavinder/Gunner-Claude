// scripts/recover-stuck-calls.ts
// One-shot recovery for calls stuck in PENDING or FAILED.
//
// Handles:
//   - PENDING calls whose fire-and-forget grade never completed
//   - FAILED calls that hit the Apr 13 Anthropic credit exhaustion
//   - FAILED calls with aiFeedback starting "Grading failed:" (any retryable reason)
//   - Missing recordings via GHL conversation lookup (handles wf_ messageIds)
//
// Usage:
//   npx tsx scripts/recover-stuck-calls.ts
//   npx tsx scripts/recover-stuck-calls.ts --days=14 --limit=500 --dry-run

import { db } from '../lib/db/client'
import { gradeCall } from '../lib/ai/grading'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'
import { transcribeRecording } from '../lib/ai/transcribe'
import { Prisma } from '@prisma/client'

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? 'true']
  }),
)
const DAYS_BACK = Number(args.days ?? 30)
const LIMIT = Number(args.limit ?? 2000)
const DRY_RUN = args['dry-run'] === 'true'
const GRADE_CONCURRENCY = Number(args.concurrency ?? 8)
const SLEEP_BETWEEN_GRADES_MS = Number(args.sleep ?? 250)

const stats = {
  scanned: 0,
  recordingFetched: 0,
  transcribed: 0,
  failedFlippedToPending: 0,
  graded: 0,
  gradeFailed: 0,
  skipped: 0,
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function resolveMessageIdForWorkflowCall(
  tenantId: string,
  ghlContactId: string | null,
  calledAt: Date,
): Promise<{ messageId: string; accessToken: string; locationId: string } | null> {
  // For wf_* calls, we can't use the stored ghlCallId. Walk the contact's
  // conversations to find the TYPE_CALL message closest in time to calledAt.
  if (!ghlContactId) return null

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ghlAccessToken: true, ghlLocationId: true },
  })
  if (!tenant?.ghlAccessToken || !tenant.ghlLocationId) return null

  const headers = {
    Authorization: `Bearer ${tenant.ghlAccessToken}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  }

  try {
    const convRes = await fetch(
      `https://services.leadconnectorhq.com/conversations/search?locationId=${tenant.ghlLocationId}&contactId=${ghlContactId}&limit=10`,
      { headers },
    )
    if (!convRes.ok) return null
    const convData = await convRes.json() as { conversations?: Array<{ id: string }> }
    const conversations = convData.conversations ?? []

    let bestMatch: { id: string; dateAdded: number } | null = null
    const calledAtMs = calledAt.getTime()

    for (const conv of conversations) {
      const msgRes = await fetch(
        `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?limit=50`,
        { headers },
      )
      if (!msgRes.ok) continue
      const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>> } }
      const msgs = msgData.messages?.messages ?? []

      for (const msg of msgs) {
        const msgType = String(msg.messageType ?? '').toUpperCase()
        const typeId = typeof msg.messageTypeId === 'number' ? msg.messageTypeId : -1
        const isCall = msgType === 'CALL' || typeId === 1 || typeId === 10
          || !!(msg.callDuration || msg.callStatus || (msg.meta as Record<string, unknown>)?.call)
        if (!isCall) continue

        const id = String(msg.id ?? msg.messageId ?? '')
        if (!id || id.startsWith('wf_')) continue

        const dateMs = new Date(String(msg.dateAdded ?? '')).getTime()
        const dist = Math.abs(dateMs - calledAtMs)
        if (!bestMatch || dist < Math.abs(bestMatch.dateAdded - calledAtMs)) {
          bestMatch = { id, dateAdded: dateMs }
        }
      }
    }

    if (bestMatch) {
      return {
        messageId: bestMatch.id,
        accessToken: tenant.ghlAccessToken,
        locationId: tenant.ghlLocationId,
      }
    }
  } catch (err) {
    console.warn(`[recover] conversation lookup failed for contact ${ghlContactId}: ${err instanceof Error ? err.message : err}`)
  }
  return null
}

async function recoverCall(call: {
  id: string
  tenantId: string
  ghlCallId: string | null
  ghlContactId: string | null
  recordingUrl: string | null
  transcript: string | null
  durationSeconds: number | null
  gradingStatus: string
  aiFeedback: string | null
  calledAt: Date | null
  tenantAccessToken: string | null
  tenantLocationId: string | null
}) {
  stats.scanned++
  const tag = call.id.slice(0, 8)

  if (DRY_RUN) {
    console.log(`[recover] DRY status=${call.gradingStatus} rec=${!!call.recordingUrl} trans=${!!call.transcript} ghl=${call.ghlCallId?.slice(0, 20)} id=${tag}`)
    return
  }

  // Flip FAILED → PENDING so grader re-processes
  if (call.gradingStatus === 'FAILED') {
    await db.call.update({
      where: { id: call.id },
      data: { gradingStatus: 'PENDING', aiFeedback: null },
    })
    stats.failedFlippedToPending++
  }

  // Fetch missing recording
  if (!call.recordingUrl && call.ghlCallId && call.tenantAccessToken && call.tenantLocationId) {
    const messageId = call.ghlCallId
    let rec: { recordingUrl?: string; status: string } | null = null

    if (messageId.startsWith('wf_')) {
      const resolved = await resolveMessageIdForWorkflowCall(
        call.tenantId,
        call.ghlContactId,
        call.calledAt ?? new Date(),
      )
      if (resolved) {
        rec = await fetchCallRecording(resolved.accessToken, resolved.locationId, resolved.messageId)
        if (rec.status === 'success') {
          // Replace synthetic wf_ id with the real one — but only if another
          // call row doesn't already own it (workflow webhook + real webhook
          // can create two rows for the same call; leave both, let cron pick
          // the real one up naturally).
          const conflict = await db.call.findFirst({
            where: { tenantId: call.tenantId, ghlCallId: resolved.messageId, id: { not: call.id } },
            select: { id: true },
          })
          if (!conflict) {
            await db.call.update({ where: { id: call.id }, data: { ghlCallId: resolved.messageId } })
          }
        }
      }
    } else {
      rec = await fetchCallRecording(call.tenantAccessToken, call.tenantLocationId, messageId)
    }

    if (rec?.status === 'success' && rec.recordingUrl) {
      await db.call.update({ where: { id: call.id }, data: { recordingUrl: rec.recordingUrl } })
      call.recordingUrl = rec.recordingUrl
      stats.recordingFetched++
    }
  }

  // Transcribe if we have a recording but no transcript
  if (call.recordingUrl && !call.transcript) {
    const trans = await transcribeRecording(call.recordingUrl, call.tenantAccessToken ?? undefined)
    if (trans.status === 'success' && trans.transcript) {
      const estDuration = trans.duration
        ?? (call.durationSeconds && call.durationSeconds > 0 ? call.durationSeconds : Math.max(Math.round(trans.transcript.length / 15), 45))
      await db.call.update({
        where: { id: call.id },
        data: {
          transcript: trans.transcript,
          ...(call.durationSeconds === null || call.durationSeconds === 0 ? { durationSeconds: estDuration } : {}),
        },
      })
      call.transcript = trans.transcript
      stats.transcribed++
    } else {
      console.warn(`[recover] ${tag} transcription failed: ${trans.error}`)
    }
  }

  // Grade (or re-grade)
  try {
    await gradeCall(call.id)
    stats.graded++
    console.log(`[recover] ${tag} graded`)
  } catch (err) {
    stats.gradeFailed++
    console.error(`[recover] ${tag} grading threw: ${err instanceof Error ? err.message : err}`)
  }
  await sleep(SLEEP_BETWEEN_GRADES_MS)
}

async function main() {
  const since = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000)
  console.log(`[recover] Scanning calls since ${since.toISOString()} (limit ${LIMIT}, dry-run=${DRY_RUN})`)

  const rows = await db.$queryRaw<Array<{
    id: string
    tenant_id: string
    ghl_call_id: string | null
    ghl_contact_id: string | null
    recording_url: string | null
    transcript: string | null
    duration_seconds: number | null
    grading_status: string
    ai_feedback: string | null
    called_at: Date | null
    ghl_access_token: string | null
    ghl_location_id: string | null
  }>>(Prisma.sql`
    SELECT c.id, c.tenant_id, c.ghl_call_id, c.ghl_contact_id,
           c.recording_url, c.transcript, c.duration_seconds,
           c.grading_status::text AS grading_status, c.ai_feedback, c.called_at,
           t.ghl_access_token, t.ghl_location_id
    FROM calls c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.grading_status IN ('PENDING', 'FAILED')
      AND c.called_at >= ${since}
    ORDER BY c.called_at DESC
    LIMIT ${LIMIT}
  `)
  console.log(`[recover] Found ${rows.length} candidate calls`)

  // Process in parallel batches bounded by GRADE_CONCURRENCY
  for (let i = 0; i < rows.length; i += GRADE_CONCURRENCY) {
    const batch = rows.slice(i, i + GRADE_CONCURRENCY)
    await Promise.all(batch.map(r => recoverCall({
      id: r.id,
      tenantId: r.tenant_id,
      ghlCallId: r.ghl_call_id,
      ghlContactId: r.ghl_contact_id,
      recordingUrl: r.recording_url,
      transcript: r.transcript,
      durationSeconds: r.duration_seconds,
      gradingStatus: r.grading_status,
      aiFeedback: r.ai_feedback,
      calledAt: r.called_at,
      tenantAccessToken: r.ghl_access_token,
      tenantLocationId: r.ghl_location_id,
    }).catch(err => {
      stats.skipped++
      console.error(`[recover] ${r.id.slice(0, 8)} skipped due to error: ${err instanceof Error ? err.message : err}`)
    })))
    if ((i + GRADE_CONCURRENCY) % 30 === 0) {
      console.log(`[recover] Progress ${i + batch.length}/${rows.length} — ${JSON.stringify(stats)}`)
    }
  }

  console.log('\n[recover] Complete')
  console.table(stats)
  await db.$disconnect()
}

main().catch(err => {
  console.error('[recover] Fatal:', err)
  process.exit(1)
})
