// lib/v1_1/call_seller_autolink.ts
//
// v1.1 Wave 4 — auto-link Call.sellerId via (propertyId, ghlContactId).
// Closes plan §6 Q4: when a Call lands with propertyId + ghlContactId
// set but sellerId NULL, attempt to find the matching Seller through
// PropertySeller. Only writes when the match is unambiguous (exactly
// one Seller). Ambiguous (0 or 2+) cases stay NULL and are logged so
// admin can resolve manually.
//
// Two entry points:
//
//   1. autolinkCallSeller(tenantId, callId)
//      Single-call auto-link. Class-4 hardened. Idempotent. Fired
//      from the post-grade flow in lib/ai/grading.ts so new graded
//      calls auto-link before extract-deal-intel + rollup runs.
//
//   2. backfillCallSellerLinks(tenantId, opts)
//      Retroactive pass over historical unlinked calls. Used by the
//      Wave 4 diagnostic endpoint BEFORE the seller rollup runs, so
//      the rollup actually has data to roll up.
//
// Why pre-Wave-4: the live tenant has 16 Sellers + N graded calls,
// but Wave 2's seller backfill created/populated Sellers AFTER calls
// had already landed, so no Call.sellerId is currently set. Without
// auto-link the rollup is a no-op (Sellers have 0 calls per the
// Call.sellerId FK). This unblocks the rollup.
//
// Both idempotent — re-running is safe; calls with sellerId already
// set are skipped.

import { db } from '@/lib/db/client'

// ─── Types ──────────────────────────────────────────────────────────────

export interface AutolinkOpts {
  dryRun: boolean
  /** Cap calls processed per run. Defaults to no cap. */
  limit?: number
  /** Sample size for the report. Default 10. */
  sampleSize?: number
}

export interface AutolinkResult {
  status: 'linked' | 'already_linked' | 'no_property' | 'no_contact' | 'no_match' | 'ambiguous' | 'error'
  callId: string
  sellerId?: string
  candidateCount?: number
  error?: string
}

export interface AutolinkBackfillReport {
  scanned: number
  linked: number              // newly linked this run
  alreadyLinked: number       // sellerId was set already
  noProperty: number          // call.propertyId null
  noContact: number           // call.ghlContactId null
  noMatch: number             // no PropertySeller with matching ghlContactId
  ambiguous: number           // 2+ matching sellers — skipped, manual queue
  errors: number
  samples: Array<{
    callId: string
    propertyId: string
    ghlContactId: string
    sellerId: string
    sellerNamePreview: string
  }>
  ambiguousSamples: Array<{
    callId: string
    propertyId: string
    ghlContactId: string
    candidateCount: number
  }>
  errorSamples: Array<{ callId: string; error: string }>
}

// ─── Single-call auto-link ──────────────────────────────────────────────

export async function autolinkCallSeller(
  tenantId: string,
  callId: string,
): Promise<AutolinkResult> {
  // Class-4: tenantId in every internal WHERE.
  const call = await db.call.findFirst({
    where: { id: callId, tenantId },
    select: { id: true, propertyId: true, ghlContactId: true, sellerId: true },
  })
  if (!call) {
    return { status: 'error', callId, error: 'Call not found or wrong tenant' }
  }
  if (call.sellerId) {
    return { status: 'already_linked', callId, sellerId: call.sellerId }
  }
  if (!call.propertyId) {
    return { status: 'no_property', callId }
  }
  if (!call.ghlContactId) {
    return { status: 'no_contact', callId }
  }

  // Find Sellers linked to this property whose ghlContactId matches.
  // PropertySeller has no tenantId column — both sides of the join carry
  // tenantId, so scoping via property + seller in the WHERE keeps the
  // tenant boundary defended even though the join row itself is unscoped.
  const matches = await db.propertySeller.findMany({
    where: {
      propertyId: call.propertyId,
      property: { tenantId },
      seller: { ghlContactId: call.ghlContactId, tenantId },
    },
    select: { sellerId: true, seller: { select: { id: true, name: true } } },
  })

  if (matches.length === 0) {
    return { status: 'no_match', callId, candidateCount: 0 }
  }
  if (matches.length > 1) {
    // Ambiguous — log + bail. Admin queue can resolve manually.
    await db.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: 'v1_1_call_seller_autolink.ambiguous',
        resource: 'call',
        resourceId: callId,
        severity: 'WARNING',
        source: 'SYSTEM',
        payload: {
          propertyId: call.propertyId,
          ghlContactId: call.ghlContactId,
          candidateSellerIds: matches.map(m => m.sellerId),
        },
      },
    }).catch(err => console.error('[autolink] audit log failed:', err))
    return { status: 'ambiguous', callId, candidateCount: matches.length }
  }

  // Single unambiguous match — link it. id+tenantId on the WHERE for
  // defense-in-depth.
  const sellerId = matches[0].sellerId
  try {
    await db.call.update({
      where: { id: callId, tenantId },
      data: { sellerId },
    })
    await db.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: 'v1_1_call_seller_autolink.linked',
        resource: 'call',
        resourceId: callId,
        severity: 'INFO',
        source: 'SYSTEM',
        payload: {
          propertyId: call.propertyId,
          ghlContactId: call.ghlContactId,
          sellerId,
        },
      },
    }).catch(err => console.error('[autolink] audit log failed:', err))
    return { status: 'linked', callId, sellerId }
  } catch (err) {
    return {
      status: 'error',
      callId,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Retroactive backfill pass ──────────────────────────────────────────

export async function backfillCallSellerLinks(
  tenantId: string,
  opts: AutolinkOpts,
): Promise<AutolinkBackfillReport> {
  const sampleSize = opts.sampleSize ?? 10
  const report: AutolinkBackfillReport = {
    scanned: 0,
    linked: 0,
    alreadyLinked: 0,
    noProperty: 0,
    noContact: 0,
    noMatch: 0,
    ambiguous: 0,
    errors: 0,
    samples: [],
    ambiguousSamples: [],
    errorSamples: [],
  }

  // Pull every Call in this tenant where sellerId is null. The auto-link
  // function's early-outs handle the no-property / no-contact cases —
  // we still scan them so the report counts are honest.
  const calls = await db.call.findMany({
    where: { tenantId, sellerId: null },
    select: {
      id: true,
      propertyId: true,
      ghlContactId: true,
    },
    take: opts.limit,
    orderBy: { calledAt: 'desc' },
  })

  for (const call of calls) {
    report.scanned++

    if (!call.propertyId) {
      report.noProperty++
      continue
    }
    if (!call.ghlContactId) {
      report.noContact++
      continue
    }

    // For dry-run, just count matches without writing.
    // Same dual-side tenant scoping as autolinkCallSeller above.
    const matches = await db.propertySeller.findMany({
      where: {
        propertyId: call.propertyId,
        property: { tenantId },
        seller: { ghlContactId: call.ghlContactId, tenantId },
      },
      select: { sellerId: true, seller: { select: { id: true, name: true } } },
    })

    if (matches.length === 0) {
      report.noMatch++
      continue
    }
    if (matches.length > 1) {
      report.ambiguous++
      if (report.ambiguousSamples.length < sampleSize) {
        report.ambiguousSamples.push({
          callId: call.id,
          propertyId: call.propertyId,
          ghlContactId: call.ghlContactId,
          candidateCount: matches.length,
        })
      }
      continue
    }

    // Unique match — would link.
    report.linked++
    const m = matches[0]
    if (report.samples.length < sampleSize) {
      report.samples.push({
        callId: call.id,
        propertyId: call.propertyId,
        ghlContactId: call.ghlContactId,
        sellerId: m.sellerId,
        sellerNamePreview: (m.seller?.name ?? '').slice(0, 40),
      })
    }

    if (!opts.dryRun) {
      try {
        await db.call.update({
          where: { id: call.id, tenantId },
          data: { sellerId: m.sellerId },
        })
      } catch (err) {
        report.errors++
        report.linked-- // didn't actually link — undo the count
        if (report.errorSamples.length < sampleSize) {
          report.errorSamples.push({
            callId: call.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  // Audit log on apply runs only — single bulk row covers the whole pass.
  if (!opts.dryRun && report.linked > 0) {
    await db.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: 'v1_1_call_seller_autolink.backfill_applied',
        resource: 'tenant',
        resourceId: tenantId,
        severity: 'INFO',
        source: 'SYSTEM',
        payload: {
          scanned: report.scanned,
          linked: report.linked,
          alreadyLinked: report.alreadyLinked,
          noMatch: report.noMatch,
          ambiguous: report.ambiguous,
          errors: report.errors,
        },
      },
    }).catch(err => console.error('[autolink backfill] audit log failed:', err))
  }

  return report
}
