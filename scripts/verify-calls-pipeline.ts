// scripts/verify-calls-pipeline.ts
// Read-only bidirectional verification of the Gunner call pipeline.
//
// PASS A — INTEGRITY (DB → GHL)
//   Last 30 calls rows. For each, verify the source message exists in GHL,
//   verify it really is a call (apply same isCall logic as the webhook handler),
//   and verify basic fields match.
//
// PASS B — COVERAGE (GHL → DB)
//   Fetch real GHL call messages via /conversations/search?type=TYPE_CALL +
//   per-conversation /messages, applying the isCall check client-side
//   (the type filter on /messages/export is unreliable — returns SMS too).
//   Stop at 30 real calls. For each, find DB row, verify bucket + failures + transcript.
//
// SANITY CHECK
//   Before running A/B, fetch the latest few SKIPPED calls and verify Pass A
//   accepts them. If not, the script itself is wrong — fail fast.
//
// Spec for Pass B bucket assertions (matches current code shipped in 911bcb4):
//   0-44s  → gradingStatus=SKIPPED, callResult=short_call, score IS NULL
//   45-89s → gradingStatus=COMPLETED, aiSummary present
//   90s+   → gradingStatus=COMPLETED, score NOT NULL, rubricScores populated
//   FAILED also accepted for any bucket IF a matching logFailure audit_log row
//   exists — surfaced as "❌ failed", distinct from bucket drift.
//
// Exit 0 if BOTH passes are clean (and Pass B reached the 30-call target),
// 1 otherwise.
//
// Run:   npx tsx scripts/verify-calls-pipeline.ts
//        VERIFY_TENANT_SLUG=new-again-houses npx tsx scripts/verify-calls-pipeline.ts

import { promises as fs } from 'fs'
import path from 'path'

const TARGET_COUNT = 30
const GHL = 'https://services.leadconnectorhq.com'
const FALLBACK_MATCH_WINDOW_MS = 10 * 60_000  // ±10 min for contactId fallback (catches H2 cross-source merges)
const SANITY_SAMPLE = 8                       // ≥1 of N must verify — N=8 makes that a real signal

// ─── env loader (no dotenv dep — same pattern as visual-audit.ts) ───────────

async function loadEnvLocal(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch { /* .env.local optional */ }
}

// ─── isCall — VERBATIM COPY from lib/ghl/webhooks.ts:120-123 ────────────────
// IMPORTANT: keep in sync with that file. During audits, grep both locations:
//     grep -n "messageType.*toUpperCase" lib/ghl/webhooks.ts scripts/verify-calls-pipeline.ts
// If the two diverge, ingestion drift is invisible to the verifier.

function isCallMessage(msg: Record<string, unknown>): boolean {
  // ─── BEGIN VERBATIM COPY — lib/ghl/webhooks.ts:120-123 ───
  const msgType = (String((msg as { messageType?: unknown }).messageType ?? '')).toUpperCase()
  const typeId = typeof (msg as { messageTypeId?: unknown }).messageTypeId === 'number'
    ? (msg as { messageTypeId: number }).messageTypeId
    : -1
  const isCall = msgType === 'CALL' || msgType === 'TYPE_CALL' || typeId === 1 || typeId === 10
    || !!((msg as { callDuration?: unknown }).callDuration
       || (msg as { callStatus?: unknown }).callStatus
       || ((msg as { meta?: { call?: unknown } }).meta)?.call)
  // ─── END VERBATIM COPY ───
  return isCall
}

// ─── Tenant + headers ───────────────────────────────────────────────────────

interface TenantCtx {
  id: string
  slug: string
  ghlAccessToken: string
  ghlLocationId: string
}

async function pickTenant(db: import('@prisma/client').PrismaClient): Promise<TenantCtx> {
  const slug = process.env.VERIFY_TENANT_SLUG
  const tenants = await db.tenant.findMany({
    where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
    select: { id: true, slug: true, ghlAccessToken: true, ghlLocationId: true },
  })
  if (tenants.length === 0) throw new Error('No GHL-connected tenant found')
  const picked = slug
    ? tenants.find(t => t.slug === slug)
    : tenants[0]
  if (!picked) throw new Error(`Tenant slug "${slug}" not found. Available: ${tenants.map(t => t.slug).join(', ')}`)
  if (!picked.ghlAccessToken || !picked.ghlLocationId) throw new Error('Tenant missing GHL credentials')
  if (!slug && tenants.length > 1) {
    console.warn(`[verify] Multiple GHL-connected tenants — using first (${tenants[0].slug}). Set VERIFY_TENANT_SLUG to override.`)
  }
  return picked as TenantCtx
}

function ghlHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Version: '2021-07-28' }
}

// ─── PASS A — DB → GHL integrity ────────────────────────────────────────────

interface PassARow {
  callId: string
  ghlCallId: string | null
  status: string
  verdict: '✅' | '❌'
  reason: string
}

async function fetchGhlMessage(messageId: string, headers: Record<string, string>): Promise<{ ok: true; msg: Record<string, unknown> } | { ok: false; status: number }> {
  const res = await fetch(`${GHL}/conversations/messages/${messageId}`, { headers })
  if (!res.ok) return { ok: false, status: res.status }
  const data = await res.json() as Record<string, unknown>
  const msg = (data.message ?? data) as Record<string, unknown>
  return { ok: true, msg }
}

async function passA(tenant: TenantCtx, db: import('@prisma/client').PrismaClient): Promise<PassARow[]> {
  const headers = ghlHeaders(tenant.ghlAccessToken)
  const calls = await db.call.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
    take: TARGET_COUNT,
    select: { id: true, ghlCallId: true, gradingStatus: true, ghlContactId: true, calledAt: true, direction: true },
  })

  const rows: PassARow[] = []
  for (const c of calls) {
    if (!c.ghlCallId) {
      rows.push({ callId: c.id, ghlCallId: null, status: c.gradingStatus, verdict: '❌', reason: 'no ghlCallId on DB row' })
      continue
    }
    if (c.ghlCallId.startsWith('wf_')) {
      // Synthetic ID from automation webhooks — no GHL message exists for it.
      // Automation-source rows only fire for calls, so accept on faith.
      rows.push({
        callId: c.id, ghlCallId: c.ghlCallId, status: c.gradingStatus,
        verdict: '✅', reason: 'wf_ synthetic id (automation webhook source) — accepted, not GHL-fetchable',
      })
      continue
    }

    const res = await fetchGhlMessage(c.ghlCallId, headers)
    if (!res.ok) {
      rows.push({
        callId: c.id, ghlCallId: c.ghlCallId, status: c.gradingStatus,
        verdict: '❌', reason: `GHL returned ${res.status} for messageId — source missing`,
      })
      continue
    }
    if (!isCallMessage(res.msg)) {
      const mt = (res.msg as { messageType?: string }).messageType ?? '?'
      const tid = (res.msg as { messageTypeId?: number }).messageTypeId ?? '?'
      rows.push({
        callId: c.id, ghlCallId: c.ghlCallId, status: c.gradingStatus,
        verdict: '❌', reason: `GHL message exists but messageType=${mt}/typeId=${tid} — not a call`,
      })
      continue
    }
    // Field tolerance — contactId must match if both sides report one
    const ghlContact = (res.msg as { contactId?: string }).contactId ?? null
    if (c.ghlContactId && ghlContact && c.ghlContactId !== ghlContact) {
      rows.push({
        callId: c.id, ghlCallId: c.ghlCallId, status: c.gradingStatus,
        verdict: '❌', reason: `contactId mismatch: db=${c.ghlContactId}, ghl=${ghlContact}`,
      })
      continue
    }
    rows.push({
      callId: c.id, ghlCallId: c.ghlCallId, status: c.gradingStatus,
      verdict: '✅', reason: 'verified — GHL message is a call, fields aligned',
    })
  }
  return rows
}

// ─── PASS B — GHL → DB coverage ─────────────────────────────────────────────

interface RealCall {
  messageId: string
  conversationId: string
  contactId: string | null
  dateAdded: string | null
  durationSeconds: number
  hadRecordingInPayload: boolean
}

interface PassBRow {
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

function bucketFor(d: number): Bucket {
  if (d < 45) return 'short'
  if (d < 90) return 'summary'
  return 'full'
}

function parseRealCall(m: Record<string, unknown>, conversationId: string): RealCall | null {
  const messageId = String((m as { id?: string; messageId?: string }).id ?? (m as { messageId?: string }).messageId ?? '')
  if (!messageId) return null
  let meta: Record<string, unknown> = {}
  const rawMeta = (m as { meta?: unknown }).meta
  if (typeof rawMeta === 'string') { try { meta = JSON.parse(rawMeta) } catch { /* ignore */ } }
  else if (rawMeta && typeof rawMeta === 'object') meta = rawMeta as Record<string, unknown>
  const callMeta = (meta.call ?? {}) as Record<string, unknown>
  const dur = Math.max(
    Number(callMeta.duration ?? 0),
    Number(meta.duration ?? 0),
    Number((m as { callDuration?: unknown }).callDuration ?? 0),
    Number((m as { duration?: unknown }).duration ?? 0),
  )
  const recFromMeta = !!(callMeta.recordingUrl || (meta as { recordingUrl?: string }).recordingUrl)
  const recFromMsg = !!((m as { recordingUrl?: string }).recordingUrl
    || (m as { recording_url?: string }).recording_url)
  const recAtt = (m as { attachments?: unknown[] }).attachments
  const recFromAttachments = Array.isArray(recAtt) && recAtt.length > 0
  return {
    messageId,
    conversationId,
    contactId: (m as { contactId?: string }).contactId ? String((m as { contactId: string }).contactId) : null,
    dateAdded: (m as { dateAdded?: string }).dateAdded ? String((m as { dateAdded: string }).dateAdded) : null,
    durationSeconds: dur,
    hadRecordingInPayload: recFromMeta || recFromMsg || recFromAttachments,
  }
}

async function fetchRealCallsViaConvSearch(tenant: TenantCtx, target: number): Promise<RealCall[]> {
  // Mirrors poll-calls.ts Strategy 2 (callTypeConversationSearch).
  // Conversation-level filter is best-effort; the per-message isCall check
  // is the source of truth — same logic as lib/ghl/webhooks.ts:122-123.
  const headers = ghlHeaders(tenant.ghlAccessToken)
  const collected: RealCall[] = []
  const seen = new Set<string>()

  for (let page = 0; page < 5 && collected.length < target; page++) {
    const params = new URLSearchParams({
      locationId: tenant.ghlLocationId,
      type: 'TYPE_CALL',
      sortBy: 'last_message_date',
      sortOrder: 'desc',
      limit: '100',
    })
    if (page > 0) params.set('startAfter', String(page * 100))

    const res = await fetch(`${GHL}/conversations/search?${params}`, { headers })
    if (!res.ok) {
      console.warn(`[verify] /conversations/search returned ${res.status} on page ${page}`)
      break
    }
    const data = await res.json() as { conversations?: Array<{ id: string; lastMessageDate?: string }> }
    const convs = data.conversations ?? []
    if (convs.length === 0) break

    for (const conv of convs) {
      if (collected.length >= target) break
      const msgRes = await fetch(`${GHL}/conversations/${conv.id}/messages?limit=50`, { headers })
      if (!msgRes.ok) continue
      const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>> } }
      const msgs = msgData.messages?.messages ?? []
      for (const m of msgs) {
        if (!isCallMessage(m)) continue   // verbatim isCall — drops SMS/email/chat
        const parsed = parseRealCall(m, conv.id)
        if (!parsed) continue
        if (seen.has(parsed.messageId)) continue
        seen.add(parsed.messageId)
        collected.push(parsed)
        if (collected.length >= target) break
      }
    }
  }

  collected.sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''))
  return collected.slice(0, target)
}

// ── DB-side helpers (same logic as prior version, unchanged behavior) ──────

async function locateDbCall(tenantId: string, ghl: RealCall, db: import('@prisma/client').PrismaClient) {
  const sel = {
    id: true, durationSeconds: true, gradingStatus: true, callResult: true, score: true,
    rubricScores: true, aiSummary: true, transcript: true, recordingUrl: true, calledAt: true,
  } as const

  const byId = await db.call.findFirst({ where: { tenantId, ghlCallId: ghl.messageId }, select: sel })
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
      select: sel,
    })
  }
  return null
}

function checkBucket(
  bucket: Bucket,
  call: { gradingStatus: string; callResult: string | null; score: number | null; aiSummary: string | null; rubricScores: unknown },
  hasFailureLog: boolean,
): string[] {
  if (call.gradingStatus === 'FAILED' && hasFailureLog) return []  // real failure — accepted, surfaced as ❌ failed

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
    const populated = rubric && typeof rubric === 'object' && !Array.isArray(rubric)
      && Object.keys(rubric as Record<string, unknown>).length > 0
    if (!populated) issues.push('90s+ expects rubricScores populated, got empty/null')
  }
  return issues
}

async function countFailureLogs(tenantId: string, callId: string, db: import('@prisma/client').PrismaClient): Promise<number> {
  // Shapes used by logFailure / grading observed in production:
  //   resourceId = callId             (grading.ts call.grading.failed)
  //   resource   = `call:${callId}`   (grading.ts ai_log_failed / next_steps_log_failed)
  //   resource   = callId             (grading.ts grading.workflows_trigger_failed)
  //   payload.callId = callId         (forward compat — matches 0 rows today)
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

async function checkTranscript(
  tenantId: string,
  ghl: RealCall,
  call: { id: string; transcript: string | null; recordingUrl: string | null },
  db: import('@prisma/client').PrismaClient,
): Promise<{ ok: boolean; reason?: string }> {
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

async function verifyCoverageRow(tenantId: string, ghl: RealCall, db: import('@prisma/client').PrismaClient): Promise<PassBRow> {
  const call = await locateDbCall(tenantId, ghl, db)
  if (!call) {
    return {
      callId: null, ghlCallId: ghl.messageId, duration: ghl.durationSeconds, status: 'MISSING',
      bucketMatch: false, noFailures: false, transcriptOk: false, verdict: '❌',
      reasons: ['no DB row found by ghlCallId or ghlContactId+10min window'],
    }
  }
  const reasons: string[] = []
  const dur = call.durationSeconds ?? ghl.durationSeconds
  const bucket = bucketFor(dur)

  const failureCount = await countFailureLogs(tenantId, call.id, db)
  const hasFailureLog = failureCount > 0

  const bucketIssues = checkBucket(bucket, call, hasFailureLog)
  reasons.push(...bucketIssues)
  if (failureCount > 0) reasons.push(`${failureCount} ERROR audit_logs reference this call`)

  const trans = await checkTranscript(tenantId, ghl, call, db)
  if (!trans.ok && trans.reason) reasons.push(trans.reason)

  const bucketMatch = bucketIssues.length === 0
  const noFailures = failureCount === 0
  const transcriptOk = trans.ok
  const isRealFailure = call.gradingStatus === 'FAILED' && hasFailureLog
  const pass = bucketMatch && noFailures && transcriptOk

  let verdict: PassBRow['verdict']
  if (pass) verdict = '✅'
  else if (isRealFailure) verdict = '❌ failed'
  else verdict = '❌'

  return {
    callId: call.id, ghlCallId: ghl.messageId, duration: dur, status: call.gradingStatus,
    bucketMatch, noFailures, transcriptOk, verdict, reasons,
  }
}

// ─── Sanity check ───────────────────────────────────────────────────────────

async function sanityCheck(tenant: TenantCtx, db: import('@prisma/client').PrismaClient): Promise<boolean> {
  const headers = ghlHeaders(tenant.ghlAccessToken)
  // Filter to rows with known provenance. Legacy/off-path rows (e.g. recovery
  // scripts that left source=null with no contactId/duration) can't be verified
  // against GHL by design and would falsely fail sanity. Those still surface
  // in Pass A's per-row failure list — that's correct.
  const skipped = await db.call.findMany({
    where: {
      tenantId: tenant.id,
      gradingStatus: 'SKIPPED',
      ghlCallId: { not: null },
      source: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: SANITY_SAMPLE,
    select: { id: true, ghlCallId: true },
  })
  if (skipped.length === 0) {
    console.log('[verify] sanity: no source-tagged SKIPPED rows in DB to test against — skipping sanity check')
    return true
  }

  const failures: string[] = []
  let verified = 0
  let unverifiable = 0
  for (const c of skipped) {
    if (!c.ghlCallId) continue
    if (c.ghlCallId.startsWith('wf_')) { unverifiable++; continue }
    const res = await fetchGhlMessage(c.ghlCallId, headers)
    if (!res.ok) { failures.push(`${c.id} (ghlCallId=${c.ghlCallId}): GHL ${res.status}`); continue }
    if (!isCallMessage(res.msg)) {
      const mt = (res.msg as { messageType?: string }).messageType ?? '?'
      failures.push(`${c.id} (ghlCallId=${c.ghlCallId}): GHL says messageType=${mt}`)
      continue
    }
    verified++
  }

  const probedCount = skipped.length - unverifiable
  // Halt ONLY if we tried to probe at least one row and zero verified.
  // That means the endpoint is broken, auth is wrong, or every sample row is orphaned —
  // any of which makes Pass A's results meaningless. Individual stale rows below the
  // halt threshold show up in Pass A's per-row failure list, which is correct behavior.
  if (probedCount > 0 && verified === 0) {
    console.error(`[verify] SANITY CHECK FAILED — 0/${probedCount} probed rows verified. Endpoint or auth likely broken:`)
    for (const f of failures) console.error(`  ${f}`)
    return false
  }
  if (failures.length > 0) {
    console.warn(`[verify] sanity: ${verified}/${probedCount} verified, ${failures.length} stale (will appear in Pass A), ${unverifiable} wf_ synthetic`)
    for (const f of failures) console.warn(`  ${f}`)
  } else {
    console.log(`[verify] sanity: ${verified}/${probedCount} verified, ${unverifiable} wf_ synthetic (skipped)`)
  }
  return true
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await loadEnvLocal()
  const { db } = await import('../lib/db/client')
  const tenant = await pickTenant(db)
  console.log(`[verify] Tenant: ${tenant.slug} (${tenant.id})`)

  // ── Sanity ──
  console.log('\n[verify] Sanity check — known-good SKIPPED calls...')
  const sanityOk = await sanityCheck(tenant, db)
  if (!sanityOk) {
    console.error('[verify] Halting before A/B because sanity check failed.')
    await db.$disconnect()
    process.exit(1)
  }

  // ── Pass A ──
  console.log('\n[verify] PASS A — Integrity (DB → GHL)')
  console.log(`[verify] Pulling last ${TARGET_COUNT} calls rows; resolving each against GHL...`)
  const aRows = await passA(tenant, db)
  console.table(aRows.map(r => ({
    call_id: r.callId.slice(0, 12),
    ghl_call_id: r.ghlCallId ? r.ghlCallId.slice(0, 22) : '—',
    status: r.status,
    verdict: r.verdict,
  })))
  const aFail = aRows.filter(r => r.verdict !== '✅')
  if (aFail.length > 0) {
    console.log('\nPass A failures:')
    for (const r of aFail) console.log(`  ${r.callId} (ghlCallId=${r.ghlCallId ?? '—'}): ${r.reason}`)
  }
  console.log(`\nPass A: ${aRows.length - aFail.length} / ${aRows.length} integrity`)

  // ── Pass B ──
  console.log('\n[verify] PASS B — Coverage (GHL → DB)')
  console.log(`[verify] Fetching real calls from GHL via /conversations/search?type=TYPE_CALL + per-message isCall filter...`)
  const realCalls = await fetchRealCallsViaConvSearch(tenant, TARGET_COUNT)
  console.log(`[verify] Got ${realCalls.length} real calls from GHL.`)
  if (realCalls.length === 0) {
    console.error('[verify] No real calls returned — coverage check inconclusive.')
    await db.$disconnect()
    process.exit(1)
  }

  const bRows: PassBRow[] = []
  for (const c of realCalls) bRows.push(await verifyCoverageRow(tenant.id, c, db))

  console.table(bRows.map(r => ({
    call_id: r.callId ? r.callId.slice(0, 12) : '— missing',
    duration: `${r.duration}s`,
    status: r.status,
    bucket_match: r.bucketMatch ? '✓' : '✗',
    no_failures: r.noFailures ? '✓' : '✗',
    transcript_ok: r.transcriptOk ? '✓' : '✗',
    verdict: r.verdict,
  })))
  const bFail = bRows.filter(r => r.verdict !== '✅')
  if (bFail.length > 0) {
    console.log('\nPass B failures:')
    for (const r of bFail) {
      const id = r.callId ?? `ghl:${r.ghlCallId}`
      const tag = r.verdict === '❌ failed' ? ' (failed — see logs)' : ''
      console.log(`  ${id}${tag}: ${r.reasons.join('; ')}`)
    }
  }
  console.log(`\nPass B: ${bRows.length - bFail.length} / ${bRows.length} coverage`)

  // ── Overall ──
  const passACheck = aFail.length === 0
  const passBCheck = bFail.length === 0 && bRows.length === TARGET_COUNT
  const overallOk = passACheck && passBCheck
  console.log(`\nOverall: ${overallOk ? '✅ PASS' : '❌ FAIL'} (Pass A ${passACheck ? '✅' : '❌'}, Pass B ${passBCheck ? '✅' : '❌'})`)

  // Canary: counts off-path ingestion (rows with no source tag). Not gated —
  // if this number grows over time, something is silently writing calls outside
  // the webhook/poll paths.
  const sourceNullCount = await db.call.count({ where: { tenantId: tenant.id, source: null } })
  console.log(`[canary] calls with source IS NULL: ${sourceNullCount}`)

  await db.$disconnect()
  process.exit(overallOk ? 0 : 1)
}

main().catch(async err => {
  console.error('[verify] Fatal:', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
