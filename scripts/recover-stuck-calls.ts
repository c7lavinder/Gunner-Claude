// scripts/recover-stuck-calls.ts
// Two-phase recovery for stuck calls.
//
// PHASE 1 — bulk SQL (zero AI calls):
//   - Any PENDING/FAILED call <45s → SKIPPED (short_call)
//   - Any PENDING/FAILED with no duration + no recording → SKIPPED (no_answer)
//   - Any COMPLETED call <45s → flipped to SKIPPED (historical cleanup of the
//     bug where short calls slipped through grading)
//
// PHASE 2 — grade (AI calls):
//   For the remaining PENDING/FAILED with duration ≥45 OR unknown duration + a
//   recording, resolve wf_* ids, fetch recording if missing, transcribe,
//   enforce <45s SKIP after transcription, then gradeCall().
//
// Flags: --days=30 --limit=2000 --concurrency=20 --sleep=0 --dry-run
//        --skip-phase1 --skip-phase2

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
const SKIP_PHASE_1 = args['skip-phase1'] === 'true'
const SKIP_PHASE_2 = args['skip-phase2'] === 'true'
const GRADE_CONCURRENCY = Number(args.concurrency ?? 20)
const SLEEP_BETWEEN_GRADES_MS = Number(args.sleep ?? 0)
const MIN_GRADABLE_SECONDS = 45

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── Phase 1 ────────────────────────────────────────────────────────────────

async function phase1BulkSkip(since: Date) {
  console.log('\n[recover] === PHASE 1: bulk SKIP ===')
  if (DRY_RUN) {
    const preview = await db.$queryRaw<Array<{ bucket: string; count: bigint }>>(Prisma.sql`
      SELECT 'short_lt45' AS bucket, COUNT(*)::bigint AS count FROM calls
      WHERE grading_status IN ('PENDING','FAILED') AND duration_seconds > 0 AND duration_seconds < ${MIN_GRADABLE_SECONDS} AND called_at >= ${since}
      UNION ALL
      SELECT 'no_answer' AS bucket, COUNT(*)::bigint AS count FROM calls
      WHERE grading_status IN ('PENDING','FAILED') AND (duration_seconds IS NULL OR duration_seconds = 0) AND recording_url IS NULL AND called_at >= ${since}
      UNION ALL
      SELECT 'historical_graded_short' AS bucket, COUNT(*)::bigint AS count FROM calls
      WHERE grading_status = 'COMPLETED' AND duration_seconds > 0 AND duration_seconds < ${MIN_GRADABLE_SECONDS}
      UNION ALL
      SELECT 'historical_graded_null' AS bucket, COUNT(*)::bigint AS count FROM calls
      WHERE grading_status = 'COMPLETED' AND (duration_seconds IS NULL OR duration_seconds = 0) AND recording_url IS NULL
    `)
    for (const r of preview) console.log(`  DRY would flip ${r.bucket.padEnd(26)} ${r.count}`)
    return
  }

  const shortResult = await db.$executeRaw`
    UPDATE calls
    SET grading_status = 'SKIPPED',
        call_result = 'short_call',
        ai_summary = 'Short call (' || duration_seconds || 's) — skipped.',
        ai_feedback = NULL
    WHERE grading_status IN ('PENDING','FAILED')
      AND duration_seconds > 0
      AND duration_seconds < ${MIN_GRADABLE_SECONDS}
      AND called_at >= ${since}
  `
  console.log(`  [phase1] PENDING/FAILED <45s → SKIPPED: ${shortResult}`)

  const noAnswerResult = await db.$executeRaw`
    UPDATE calls
    SET grading_status = 'SKIPPED',
        call_result = 'no_answer',
        ai_summary = 'No answer — no duration, no recording.',
        ai_feedback = NULL
    WHERE grading_status IN ('PENDING','FAILED')
      AND (duration_seconds IS NULL OR duration_seconds = 0)
      AND recording_url IS NULL
      AND called_at >= ${since}
  `
  console.log(`  [phase1] PENDING/FAILED zero/null + no recording → SKIPPED: ${noAnswerResult}`)

  // Historical cleanup — any COMPLETED call <45s was a bug. Flip to SKIPPED and
  // null out AI fields so the dashboard reflects the corrected status.
  const histResult = await db.$executeRaw`
    UPDATE calls
    SET grading_status = 'SKIPPED',
        call_result = 'short_call',
        ai_summary = 'Short call (' || duration_seconds || 's) — skipped.',
        score = NULL,
        rubric_scores = NULL,
        ai_feedback = NULL,
        ai_coaching_tips = NULL,
        ai_next_steps = NULL,
        graded_at = NULL
    WHERE grading_status = 'COMPLETED'
      AND duration_seconds > 0
      AND duration_seconds < ${MIN_GRADABLE_SECONDS}
  `
  console.log(`  [phase1] COMPLETED <45s (historical cleanup) → SKIPPED: ${histResult}`)

  const nullResult = await db.$executeRaw`
    UPDATE calls
    SET grading_status = 'SKIPPED',
        call_result = 'no_answer',
        ai_summary = 'No duration + no recording — skipped.',
        score = NULL,
        rubric_scores = NULL,
        ai_feedback = NULL,
        ai_coaching_tips = NULL,
        ai_next_steps = NULL,
        graded_at = NULL
    WHERE grading_status = 'COMPLETED'
      AND (duration_seconds IS NULL OR duration_seconds = 0)
      AND recording_url IS NULL
  `
  console.log(`  [phase1] COMPLETED null/zero + no recording (historical cleanup) → SKIPPED: ${nullResult}`)
}

// ─── Phase 2 helpers ─────────────────────────────────────────────────────────

const stats = {
  scanned: 0,
  recordingFetched: 0,
  shortCallAfterTranscribe: 0,
  transcribed: 0,
  failedFlippedToPending: 0,
  graded: 0,
  gradeFailed: 0,
  noTranscript: 0,
  skipped: 0,
}

async function resolveMessageIdForWorkflowCall(
  tenantId: string,
  ghlContactId: string | null,
  calledAt: Date,
): Promise<{ messageId: string; accessToken: string; locationId: string } | null> {
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

    let bestMatch: { id: string; dateAdded: number } | null = null
    const calledAtMs = calledAt.getTime()

    for (const conv of convData.conversations ?? []) {
      const msgRes = await fetch(
        `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?limit=50`,
        { headers },
      )
      if (!msgRes.ok) continue
      const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>> } }

      for (const msg of msgData.messages?.messages ?? []) {
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

    if (bestMatch) return { messageId: bestMatch.id, accessToken: tenant.ghlAccessToken, locationId: tenant.ghlLocationId }
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
  calledAt: Date | null
  tenantAccessToken: string | null
  tenantLocationId: string | null
}) {
  stats.scanned++
  const tag = call.id.slice(0, 8)

  if (DRY_RUN) {
    console.log(`[recover] DRY status=${call.gradingStatus} dur=${call.durationSeconds} rec=${!!call.recordingUrl} trans=${!!call.transcript} ghl=${call.ghlCallId?.slice(0, 20)} id=${tag}`)
    return
  }

  if (call.gradingStatus === 'FAILED') {
    await db.call.update({
      where: { id: call.id },
      data: { gradingStatus: 'PENDING', aiFeedback: null },
    })
    stats.failedFlippedToPending++
  }

  // Fetch missing recording (wf_ ids need conversation lookup first)
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

  // No recording available — cannot grade. Skip.
  if (!call.recordingUrl) {
    await db.call.update({
      where: { id: call.id },
      data: {
        gradingStatus: 'SKIPPED',
        callResult: 'no_answer',
        aiSummary: 'No recording available — cannot grade.',
      },
    })
    stats.skipped++
    return
  }

  // Transcribe and determine real duration BEFORE deciding to grade
  if (!call.transcript) {
    const trans = await transcribeRecording(call.recordingUrl, call.tenantAccessToken ?? undefined)
    if (trans.status === 'success' && trans.transcript) {
      const realDuration = trans.duration ?? call.durationSeconds ?? Math.max(Math.round(trans.transcript.length / 15), 45)

      // Enforce <45s → SKIP HERE, before writing transcript — otherwise gradeCall
      // will see an existing transcript and skip its own short-call check.
      if (realDuration > 0 && realDuration < MIN_GRADABLE_SECONDS) {
        await db.call.update({
          where: { id: call.id },
          data: {
            gradingStatus: 'SKIPPED',
            callResult: 'short_call',
            durationSeconds: realDuration,
            aiSummary: `Short call (${realDuration}s) — skipped.`,
            transcript: trans.transcript,
          },
        })
        stats.shortCallAfterTranscribe++
        return
      }

      await db.call.update({
        where: { id: call.id },
        data: {
          transcript: trans.transcript,
          ...(call.durationSeconds === null || call.durationSeconds === 0 ? { durationSeconds: realDuration } : {}),
        },
      })
      call.transcript = trans.transcript
      call.durationSeconds = realDuration
      stats.transcribed++
    } else {
      console.warn(`[recover] ${tag} transcription failed: ${trans.error}`)
      await db.call.update({
        where: { id: call.id },
        data: {
          gradingStatus: 'SKIPPED',
          callResult: 'no_answer',
          aiSummary: `Transcription failed: ${trans.error?.slice(0, 120) ?? 'unknown'}`,
        },
      })
      stats.noTranscript++
      return
    }
  }

  try {
    await gradeCall(call.id)
    stats.graded++
    console.log(`[recover] ${tag} graded (${call.durationSeconds}s)`)
  } catch (err) {
    stats.gradeFailed++
    console.error(`[recover] ${tag} grading threw: ${err instanceof Error ? err.message : err}`)
  }
  if (SLEEP_BETWEEN_GRADES_MS > 0) await sleep(SLEEP_BETWEEN_GRADES_MS)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const since = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000)
  console.log(`[recover] Since ${since.toISOString()} limit=${LIMIT} concurrency=${GRADE_CONCURRENCY} dry=${DRY_RUN}`)

  if (!SKIP_PHASE_1) await phase1BulkSkip(since)

  if (SKIP_PHASE_2) {
    console.log('[recover] Skipping phase 2 (per flag)')
    await db.$disconnect()
    return
  }

  console.log('\n[recover] === PHASE 2: grade survivors ===')
  const rows = await db.$queryRaw<Array<{
    id: string
    tenant_id: string
    ghl_call_id: string | null
    ghl_contact_id: string | null
    recording_url: string | null
    transcript: string | null
    duration_seconds: number | null
    grading_status: string
    called_at: Date | null
    ghl_access_token: string | null
    ghl_location_id: string | null
  }>>(Prisma.sql`
    SELECT c.id, c.tenant_id, c.ghl_call_id, c.ghl_contact_id,
           c.recording_url, c.transcript, c.duration_seconds,
           c.grading_status::text AS grading_status, c.called_at,
           t.ghl_access_token, t.ghl_location_id
    FROM calls c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.grading_status IN ('PENDING', 'FAILED')
      AND c.called_at >= ${since}
    ORDER BY c.called_at DESC
    LIMIT ${LIMIT}
  `)
  console.log(`[recover] ${rows.length} survivors to grade`)

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
      calledAt: r.called_at,
      tenantAccessToken: r.ghl_access_token,
      tenantLocationId: r.ghl_location_id,
    }).catch(err => {
      stats.gradeFailed++
      console.error(`[recover] ${r.id.slice(0, 8)} threw: ${err instanceof Error ? err.message : err}`)
    })))
    if ((i + GRADE_CONCURRENCY) % 40 === 0) {
      console.log(`[recover] ${i + batch.length}/${rows.length} — ${JSON.stringify(stats)}`)
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
