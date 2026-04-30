// app/api/diagnostics/v1_1_seller_backfill/route.ts
//
// v1.1 Wave 2 backfill control surface — bearer-token gated.
//
//   GET  → dry-run report (NO writes). Always safe.
//   POST → apply the backfill (writes empty Seller fields + creates
//          PropertyBuyerStage rows from manualBuyerIds). Idempotent —
//          re-running is safe.
//
// Both jobs:
//   1. Property → Seller backfill (only updates existing linked Sellers,
//      no auto-create per Corey's Wave 2 constraint).
//   2. manualBuyerIds[] → PropertyBuyerStage rows (only creates rows when
//      a Buyer with the matching ghlContactId already exists; otherwise
//      logged + skipped — no auto-create).
//
// PUBLIC_PATHS already covers /api/diagnostics in middleware.ts; the
// bearer-token check below is the actual gate. Fail-closed when the env
// var is unset.
//
// Use:
//   curl -H "Authorization: Bearer $DIAGNOSTIC_TOKEN" \
//     "https://<host>/api/diagnostics/v1_1_seller_backfill?tenant=<slug>"
//   curl -X POST -H "Authorization: Bearer $DIAGNOSTIC_TOKEN" \
//     "https://<host>/api/diagnostics/v1_1_seller_backfill?tenant=<slug>"

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import {
  backfillSellersFromProperty,
  migrateManualBuyerIdsForTenant,
} from '@/lib/v1_1/wave_2_backfill'

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

  const [sellerReport, buyerReport] = await Promise.all([
    backfillSellersFromProperty(tenantId, { dryRun, limit, sampleSize: 10 }),
    migrateManualBuyerIdsForTenant(tenantId, { dryRun, limit, sampleSize: 10 }),
  ])

  const durationMs = Date.now() - startedAt

  // Audit log on apply runs so we have a permanent record of what backfilled
  // and when. Dry-runs don't need to land in audit_logs.
  if (!dryRun) {
    await db.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: 'v1_1_wave_2_backfill.applied',
        resource: 'tenant',
        resourceId: tenantId,
        severity: 'INFO',
        source: 'SYSTEM',
        payload: {
          durationMs,
          sellerScanned: sellerReport.scanned,
          sellerUpdated: sellerReport.wouldUpdate,
          sellerSkippedNoLink: sellerReport.wouldSkipNoLink,
          sellerAlreadyComplete: sellerReport.alreadyComplete,
          sellerFieldsTouched: sellerReport.fieldsTouched,
          sellerErrorCount: sellerReport.errors.length,
          buyerStagesScanned: buyerReport.scanned,
          buyerStagesInserted: buyerReport.wouldInsert,
          buyerStagesAlreadyExisted: buyerReport.alreadyExists,
          buyerStagesSkippedNoBuyer: buyerReport.wouldSkipNoBuyer,
          buyerStagesErrorCount: buyerReport.errors.length,
        },
      },
    }).catch(err => console.error('[v1_1 backfill] audit log failed:', err))
  }

  return NextResponse.json({
    mode: dryRun ? 'DRY_RUN' : 'APPLIED',
    tenant: { id: tenantId, slug: tenantSlug, name: tenantName },
    durationMs,
    sellerBackfill: sellerReport,
    manualBuyerIdsMigration: buyerReport,
    sources: {
      sellerBackfill: 'lib/v1_1/wave_2_backfill.ts → backfillSellersFromProperty',
      manualBuyerIdsMigration: 'lib/v1_1/wave_2_backfill.ts → migrateManualBuyerIdsForTenant',
    },
    notes: dryRun
      ? 'Dry-run only — no writes. Counts and samples reflect what an APPLY would do.'
      : 'Applied. Idempotent — re-running is safe and a no-op for already-filled fields / already-existing rows.',
  })
}

export async function GET(req: Request) {
  return runBackfill(req, true)
}

export async function POST(req: Request) {
  return runBackfill(req, false)
}
