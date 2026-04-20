// scripts/verify-calls-pipeline.ts
// Read-only verification: fetches the last 30 call messages from GHL conversations
// and confirms each one flowed cleanly through the Gunner pipeline.
//
// Spec verified per call (matches current code shipped in 911bcb4):
//   (1) DB row exists in calls (matched by ghlCallId, fallback ghlContactId+time window)
//   (2) Duration bucket matches grading status:
//         0-44s  → gradingStatus=SKIPPED, callResult=short_call, score IS NULL
//         45-89s → gradingStatus=COMPLETED, aiSummary present
//         90s+   → gradingStatus=COMPLETED, score NOT NULL, rubricScores populated
//       gradingStatus=FAILED is also accepted for any bucket IF a matching
//       logFailure audit_log row exists — that's a real downstream failure,
//       reported as "❌ failed" rather than bucket drift.
//   (3) Zero ERROR audit_logs reference this call (resourceId, resource=call,
//       resource=call:<id>, resource=<callId>, or payload.callId)
//   (4) If the webhook payload (or GHL meta) had a recording URL, transcript is populated
//         OR a PENDING RecordingFetchJob exists for the call
//
// Output: console.table + per-failure reasons + "N / 30 PASS" summary.
// Exits 0 if every row passes, 1 otherwise.
//
// Run:   npx tsx scripts/verify-calls-pipeline.ts
//        VERIFY_TENANT_SLUG=new-again-houses npx tsx scripts/verify-calls-pipeline.ts

import { db } from '../lib/db/client'

const TARGET_COUNT = 30
const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const FALLBACK_MATCH_WINDOW_MS = 5 * 60_000 // ±5 min around dateAdded for contactId fallback

// ─── Types ──────────────────────────────────────────────────────────────────

interface GhlCallMessage {
  messageId: string
  contactId: string | null
  conversationId: string | null
  dateAdded: string | null
  durationSeconds: number
  hadRecordingInPayload: boolean
}

interface VerifyRow {
  callId: string | null
  ghlCallId: string
  duration: number
  status: string
  bucketMatch: boolean
  noFailures: boolean
  transcriptOk: boolean
  verdict: '✅' | '❌' | '❌ failed'
  reasons: string[]
}

type Bucket = 'short' | 'summary' | 'full'

function bucketFor(duration: number): Bucket {
  if (duration < 45) return 'short'
  if (duration < 90) return 'summary'
  return 'full'
}

// ─── GHL fetch ──────────────────────────────────────────────────────────────

async function pickTenant() {
  const slug = process.env.VERIFY_TENANT_SLUG
  const tenants = await db.tenant.findMany({
    where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
    select: { id: true, slug: true, ghlAccessToken: true, ghlLocationId: true },
  })
  if (tenants.length === 0) throw new Error('No GHL-connected tenant found')
  if (slug) {
    const t = tenants.find(x => x.slug === slug)
    if (!t) throw new Error(`Tenant slug "${slug}" not found. Available: ${tenants.map(t => t.slug).join(', ')}`)
    return t
  }
  if (tenants.length > 1) {
    console.warn(`[verify] Multiple GHL-connected tenants — using first (${tenants[0].slug}). Set VERIFY_TENANT_SLUG to override.`)
  }
  return tenants[0]
}

async function fetchLastNGhlCalls(
  tenant: { id: string; ghlAccessToken: string | null; ghlLocationId: string | null },
  n: number,
): Promise<GhlCallMessage[]> {
  if (!tenant.ghlAccessToken || !tenant.ghlLocationId) throw new Error('Tenant missing GHL credentials')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${tenant.ghlAccessToken}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  }

  const collected: GhlCallMessage[] = []
  let cursor: string | null = null

  for (let page = 0; page < 10 && collected.length < n; page++) {
    const params = new URLSearchParams({
      locationId: tenant.ghlLocationId,
      type: 'TYPE_CALL',
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`${GHL_BASE_URL}/conversations/messages/export?${params}`, { headers })
    if (!res.ok) {
      throw new Error(`GHL export endpoint returned ${res.status}: ${await res.text().catch(() => '')}`)
    }
    const data = await res.json() as {
      messages?: Array<Record<string, unknown>>
      cursor?: string
      nextCursor?: string
      hasMore?: boolean
    }
    const msgs = data.messages ?? []
    if (msgs.length === 0) break

    for (const msg of msgs) {
      const parsed = parseGhlCallMessage(msg)
      if (parsed) collected.push(parsed)
      if (collected.length >= n * 2) break // keep extra for sort/dedup
    }

    cursor = data.nextCursor ?? data.cursor ?? null
    if (!cursor || data.hasMore === false) break
  }

  // Newest first, then trim to n
  collected.sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''))
  return collected.slice(0, n)
}

function parseGhlCallMessage(msg: Record<string, unknown>): GhlCallMessage | null {
  const messageId = String(msg.id ?? msg.messageId ?? '')
  if (!messageId) return null

  let meta: Record<string, unknown> = {}
  if (typeof msg.meta === 'string') { try { meta = JSON.parse(msg.meta) } catch { /* ignore */ } }
  else if (msg.meta && typeof msg.meta === 'object') meta = msg.meta as Record<string, unknown>
  const callMeta = (meta.call ?? {}) as Record<string, unknown>

  const duration = Math.max(
    Number(callMeta.duration ?? 0),
    Number(meta.duration ?? 0),
    Number(msg.callDuration ?? 0),
    Number(msg.duration ?? 0),
  )

  const recordingFromMeta = !!(callMeta.recordingUrl || meta.recordingUrl)
  const recordingFromMsg = !!(msg.recordingUrl || (msg as { recording_url?: string }).recording_url)
  const recordingFromAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0

  return {
    messageId,
    contactId: msg.contactId ? String(msg.contactId) : null,
    conversationId: msg.conversationId ? String(msg.conversationId) : null,
    dateAdded: msg.dateAdded ? String(msg.dateAdded) : null,
    durationSeconds: duration,
    hadRecordingInPayload: recordingFromMeta || recordingFromMsg || recordingFromAttachments,
  }
}

// ─── Per-call verification ──────────────────────────────────────────────────

async function locateDbCall(tenantId: string, ghl: GhlCallMessage) {
  const callSelect = {
    id: true,
    durationSeconds: true,
    gradingStatus: true,
    callResult: true,
    score: true,
    rubricScores: true,
    aiSummary: true,
    transcript: true,
    recordingUrl: true,
    calledAt: true,
  } as const

  const byId = await db.call.findFirst({
    where: { tenantId, ghlCallId: ghl.messageId },
    select: callSelect,
  })
  if (byId) return byId

  if (ghl.contactId && ghl.dateAdded) {
    const t = new Date(ghl.dateAdded)
    return db.call.findFirst({
      where: {
        tenantId,
        ghlContactId: ghl.contactId,
        calledAt: {
          gte: new Date(t.getTime() - FALLBACK_MATCH_WINDOW_MS),
          lte: new Date(t.getTime() + FALLBACK_MATCH_WINDOW_MS),
        },
      },
      orderBy: { calledAt: 'desc' },
      select: callSelect,
    })
  }
  return null
}

function checkBucket(
  bucket: Bucket,
  call: { gradingStatus: string; callResult: string | null; score: number | null; aiSummary: string | null; rubricScores: unknown },
  hasFailureLog: boolean,
): string[] {
  // FAILED + a matching logFailure row is a real downstream failure, accepted
  // as a valid terminal state for any bucket. Surfaced as "❌ failed" elsewhere.
  if (call.gradingStatus === 'FAILED' && hasFailureLog) return []

  const issues: string[] = []
  if (bucket === 'short') {
    if (call.gradingStatus !== 'SKIPPED') issues.push(`<45s expects gradingStatus=SKIPPED, got ${call.gradingStatus}`)
    if (call.callResult !== 'short_call') issues.push(`<45s expects callResult=short_call, got ${call.callResult ?? 'null'}`)
    if (call.score !== null && call.score !== undefined) issues.push(`<45s expects score=null, got ${call.score}`)
  } else if (bucket === 'summary') {
    if (call.gradingStatus !== 'COMPLETED') issues.push(`45-89s expects gradingStatus=COMPLETED, got ${call.gradingStatus}`)
    if (!call.aiSummary || call.aiSummary.trim().length === 0) issues.push('45-89s expects aiSummary to be populated')
  } else {
    if (call.gradingStatus !== 'COMPLETED') issues.push(`90s+ expects gradingStatus=COMPLETED, got ${call.gradingStatus}`)
    if (call.score === null || call.score === undefined) issues.push('90s+ expects score!=null')
    const rubric = call.rubricScores
    const populated = rubric && typeof rubric === 'object' && !Array.isArray(rubric) && Object.keys(rubric as Record<string, unknown>).length > 0
    if (!populated) issues.push('90s+ expects rubricScores populated, got empty/null')
  }
  return issues
}

async function countFailureLogs(tenantId: string, callId: string): Promise<number> {
  // Shapes used by logFailure / grading observed in production:
  //   resourceId = callId             (grading.ts call.grading.failed)
  //   resource   = `call:${callId}`   (grading.ts ai_log_failed / next_steps_log_failed)
  //   resource   = callId             (grading.ts grading.workflows_trigger_failed — bare cuid)
  //   payload.callId = callId         (kept for forward compat — matches 0 rows today per audit shape probe)
  return db.auditLog.count({
    where: {
      tenantId,
      severity: 'ERROR',
      OR: [
        { resourceId: callId },
        { resource: `call:${callId}` },
        { resource: callId },
        { payload: { path: ['callId'], equals: callId } },
      ],
    },
  })
}

async function checkTranscript(
  tenantId: string,
  ghl: GhlCallMessage,
  call: { id: string; transcript: string | null; recordingUrl: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  // Recording presence sources, in priority order:
  //   1. GHL message payload meta/attachments
  //   2. WebhookLog rawPayload for this messageId (or callId match)
  //   3. DB call.recordingUrl (we eventually fetched one)
  let hadRecording = ghl.hadRecordingInPayload || !!call.recordingUrl

  if (!hadRecording) {
    const log = await db.webhookLog.findFirst({
      where: { tenantId, OR: [{ messageId: ghl.messageId }, { callId: call.id }] },
      select: { rawPayload: true },
    })
    if (log && rawPayloadHasRecording(log.rawPayload)) hadRecording = true
  }

  if (!hadRecording) return { ok: true }

  if (call.transcript && call.transcript.trim().length > 0) return { ok: true }

  const pendingJob = await db.recordingFetchJob.findFirst({
    where: { tenantId, callId: call.id, status: 'PENDING' },
    select: { id: true },
  })
  if (pendingJob) return { ok: true }

  return { ok: false, reason: 'recording present but transcript empty and no PENDING RecordingFetchJob' }
}

function rawPayloadHasRecording(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (p.recordingUrl || (p as { recording_url?: string }).recording_url) return true
  const meta = p.meta as Record<string, unknown> | undefined
  const call = meta?.call as Record<string, unknown> | undefined
  if (call?.recordingUrl) return true
  if (Array.isArray(p.attachments) && p.attachments.length > 0) return true
  return false
}

async function verifyCall(tenantId: string, ghl: GhlCallMessage): Promise<VerifyRow> {
  const call = await locateDbCall(tenantId, ghl)
  if (!call) {
    return {
      callId: null,
      ghlCallId: ghl.messageId,
      duration: ghl.durationSeconds,
      status: 'MISSING',
      bucketMatch: false,
      noFailures: false,
      transcriptOk: false,
      verdict: '❌',
      reasons: ['no DB row found by ghlCallId or ghlContactId+time window'],
    }
  }

  const reasons: string[] = []
  const dur = call.durationSeconds ?? ghl.durationSeconds
  const bucket = bucketFor(dur)

  const failureCount = await countFailureLogs(tenantId, call.id)
  const hasFailureLog = failureCount > 0

  const bucketIssues = checkBucket(bucket, call, hasFailureLog)
  reasons.push(...bucketIssues)

  if (failureCount > 0) reasons.push(`${failureCount} ERROR audit_logs reference this call`)

  const transcriptResult = await checkTranscript(tenantId, ghl, call)
  if (!transcriptResult.ok && transcriptResult.reason) reasons.push(transcriptResult.reason)

  const bucketMatch = bucketIssues.length === 0
  const noFailures = failureCount === 0
  const transcriptOk = transcriptResult.ok
  const isRealFailure = call.gradingStatus === 'FAILED' && hasFailureLog
  const pass = bucketMatch && noFailures && transcriptOk

  let verdict: VerifyRow['verdict']
  if (pass) verdict = '✅'
  else if (isRealFailure) verdict = '❌ failed'
  else verdict = '❌'

  return {
    callId: call.id,
    ghlCallId: ghl.messageId,
    duration: dur,
    status: call.gradingStatus,
    bucketMatch,
    noFailures,
    transcriptOk,
    verdict,
    reasons,
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const tenant = await pickTenant()
  console.log(`[verify] Tenant: ${tenant.slug} (${tenant.id})`)
  console.log(`[verify] Fetching last ${TARGET_COUNT} call messages from GHL...`)

  const ghlCalls = await fetchLastNGhlCalls(tenant, TARGET_COUNT)
  console.log(`[verify] Got ${ghlCalls.length} call messages from GHL.\n`)
  if (ghlCalls.length === 0) {
    console.error('[verify] No GHL call messages returned — cannot verify.')
    await db.$disconnect()
    process.exit(1)
  }

  const rows: VerifyRow[] = []
  for (const c of ghlCalls) {
    const r = await verifyCall(tenant.id, c)
    rows.push(r)
  }

  console.table(rows.map(r => ({
    call_id: r.callId ? r.callId.slice(0, 12) : '— missing',
    duration: `${r.duration}s`,
    status: r.status,
    bucket_match: r.bucketMatch ? '✓' : '✗',
    no_failures: r.noFailures ? '✓' : '✗',
    transcript_ok: r.transcriptOk ? '✓' : '✗',
    verdict: r.verdict,
  })))

  const failed = rows.filter(r => r.verdict !== '✅')
  if (failed.length > 0) {
    console.log('\nFailure details:')
    for (const r of failed) {
      const id = r.callId ?? `ghl:${r.ghlCallId}`
      const tag = r.verdict === '❌ failed' ? ' (failed — see logs)' : ''
      console.log(`  ${id}${tag}: ${r.reasons.join('; ')}`)
    }
  }

  const passed = rows.length - failed.length
  console.log(`\n${passed} / ${rows.length} PASS`)

  await db.$disconnect()
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch(async err => {
  console.error('[verify] Fatal:', err instanceof Error ? err.stack ?? err.message : err)
  await db.$disconnect().catch(() => { /* ignore */ })
  process.exit(1)
})
