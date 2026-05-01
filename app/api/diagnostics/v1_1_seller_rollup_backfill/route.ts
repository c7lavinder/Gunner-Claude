// app/api/diagnostics/v1_1_seller_rollup_backfill/route.ts
//
// v1.1 Wave 4 backfill control surface — bearer-token gated.
//
//   GET  → dry-run report (NO writes). Always safe.
//   POST → apply both backfills (Seller rollup + Buyer matchScore copy).
//          Idempotent — re-running is safe and a no-op for already-
//          rolled-up sellers / already-populated matchScores.
//
// Two jobs run together (same as v1_1_seller_backfill in Wave 2):
//   1. backfillTenantSellerRollups — replays motivationScore +
//      likelihoodToSellScore + activity aggregates + additive lists
//      for every Seller in this tenant with at least one call. Uses
//      ONLY data that already exists in Call columns; no new Claude
//      calls fire.
//   2. backfillBuyerMatchScores — copies Buyer.matchLikelihoodScore →
//      PropertyBuyerStage.matchScore. setIfEmpty semantics. Skips rows
//      where the buyer has no source score.
//
// PUBLIC_PATHS already covers /api/diagnostics in middleware.ts; the
// bearer-token check below is the actual gate. Fail-closed when the env
// var is unset.
//
// Use:
//   curl -H "Authorization: Bearer $DIAGNOSTIC_TOKEN" \
//     "https://<host>/api/diagnostics/v1_1_seller_rollup_backfill?tenant=<slug>"
//   curl -X POST -H "Authorization: Bearer $DIAGNOSTIC_TOKEN" \
//     "https://<host>/api/diagnostics/v1_1_seller_rollup_backfill?tenant=<slug>"

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { backfillTenantSellerRollups } from '@/lib/v1_1/seller_rollup'
import { backfillCallSellerLinks } from '@/lib/v1_1/call_seller_autolink'

// v1.1 Wave 5 cutover — Buyer.matchLikelihoodScore was dropped, so the
// matchScore-copy backfill (lib/v1_1/wave_4_backfill.ts) is gone. The
// matchScore column on PropertyBuyerStage stays — it's now populated
// live via the buyers/route.ts GET handler (no backfill source column
// to copy from anymore).

function checkAuth(req: Request): NextResponse | null {
  const token = process.env.DIAGNOSTIC_TOKEN
  const auth = req.headers.get('authorization') ?? ''
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

async function resolveTenant(req: Request): Promise<
  | { tenantId: string; tenantSlug: string; tenantName: string }
  | NextResponse
> {
  const url = new URL(req.url)
  const tenantSlug = url.searchParams.get('tenant')
  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenant query param required' }, { status: 400 })
  }
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: `tenant ${tenantSlug} not found` }, { status: 404 })
  }
  return { tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.name }
}

async function runBackfill(req: Request, dryRun: boolean) {
  const authFail = checkAuth(req)
  if (authFail) return authFail

  const tenantOrErr = await resolveTenant(req)
  if (tenantOrErr instanceof NextResponse) return tenantOrErr
  const { tenantId, tenantSlug, tenantName } = tenantOrErr

  const url = new URL(req.url)
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : undefined
  if (limitParam && (Number.isNaN(limit) || (limit ?? 0) <= 0)) {
    return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 })
  }

  const startedAt = Date.now()

  // Run sequentially — order matters: auto-link FIRST so the rollup
  // pass has data to roll up. (Without auto-link, historical calls have
  // sellerId=null, so the Seller→calls FK returns 0 and the rollup is
  // a no-op.) Wave 5 dropped Buyer.matchLikelihoodScore — the matchScore
  // copy backfill that used to run here is gone.
  const autolinkReport = await backfillCallSellerLinks(tenantId, { dryRun, limit, sampleSize: 10 })
  const rollupReport = await backfillTenantSellerRollups(tenantId, { dryRun, limit, sampleSize: 10 })

  const durationMs = Date.now() - startedAt

  // Audit log on apply runs only — keeps audit_logs from filling up
  // with dry-run noise.
  if (!dryRun) {
    await db.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: 'v1_1_wave_4_rollup_backfill.applied',
        resource: 'tenant',
        resourceId: tenantId,
        severity: 'INFO',
        source: 'SYSTEM',
        payload: {
          durationMs,
          autolinkScanned: autolinkReport.scanned,
          autolinkLinked: autolinkReport.linked,
          autolinkNoMatch: autolinkReport.noMatch,
          autolinkAmbiguous: autolinkReport.ambiguous,
          autolinkErrors: autolinkReport.errors,
          rollupScanned: rollupReport.scanned,
          rollupUpdated: rollupReport.updated,
          rollupNoCalls: rollupReport.noCalls,
          rollupErrors: rollupReport.errors,
          rollupFieldsTouched: rollupReport.fieldsTouched,
        },
      },
    }).catch(err => console.error('[v1_1 wave 4 backfill] audit log failed:', err))
  }

  return NextResponse.json({
    mode: dryRun ? 'DRY_RUN' : 'APPLIED',
    tenant: { id: tenantId, slug: tenantSlug, name: tenantName },
    durationMs,
    callSellerAutolink: autolinkReport,
    sellerRollupBackfill: rollupReport,
    sources: {
      callSellerAutolink: 'lib/v1_1/call_seller_autolink.ts → backfillCallSellerLinks',
      sellerRollupBackfill: 'lib/v1_1/seller_rollup.ts → backfillTenantSellerRollups',
    },
    notes: dryRun
      ? 'Dry-run only — no writes. Counts and samples reflect what an APPLY would do. Run order on apply: auto-link → rollup (auto-link must precede rollup so the rollup has linked-call data to read).'
      : 'Applied. Idempotent — re-running is safe and a no-op for already-linked calls and already-rolled-up sellers.',
  })
}

export async function GET(req: Request) {
  return runBackfill(req, true)
}

export async function POST(req: Request) {
  return runBackfill(req, false)
}
