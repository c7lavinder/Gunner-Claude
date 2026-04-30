// lib/v1_1/wave_4_backfill.ts
//
// v1.1 Wave 4 backfill — buyer matchScore migration. Companion to
// lib/v1_1/seller_rollup.ts (which owns the rollup-replay backfill).
//
// Single backfill job:
//
//   backfillBuyerMatchScores(tenantId, opts)
//     For every existing PropertyBuyerStage row, look up the linked
//     Buyer's `matchLikelihoodScore` and copy it onto
//     PropertyBuyerStage.matchScore. setIfEmpty semantics — only writes
//     when matchScore is currently null. Skips rows where the buyer
//     has no matchLikelihoodScore.
//
// Why: pre-Wave-4 the Buyer table carried a per-buyer
// `matchLikelihoodScore` column, which was the wrong unit — match
// quality is property-specific, not buyer-global. Wave 4 commit A added
// PropertyBuyerStage.matchScore. This backfill seeds the new column for
// existing rows; Wave 5 cutover drops Buyer.matchLikelihoodScore.
//
// Idempotent — re-running is safe and a no-op for rows that already
// have matchScore populated.

import { db } from '@/lib/db/client'

export interface BuyerMatchScoreOpts {
  dryRun: boolean
  /** Cap rows processed per run. Defaults to no cap. */
  limit?: number
  /** Sample size for the report. Default 10. */
  sampleSize?: number
}

export interface BuyerMatchScoreReport {
  scanned: number
  wouldUpdate: number
  alreadyHasScore: number      // PropertyBuyerStage.matchScore already populated
  buyerHasNoSourceScore: number // Buyer.matchLikelihoodScore is null
  samples: Array<{
    propertyBuyerStageId: string
    propertyId: string
    buyerId: string
    buyerNamePreview: string
    sourceScore: number
  }>
  errors: Array<{ propertyBuyerStageId: string; error: string }>
}

export async function backfillBuyerMatchScores(
  tenantId: string,
  opts: BuyerMatchScoreOpts,
): Promise<BuyerMatchScoreReport> {
  const sampleSize = opts.sampleSize ?? 10
  const report: BuyerMatchScoreReport = {
    scanned: 0,
    wouldUpdate: 0,
    alreadyHasScore: 0,
    buyerHasNoSourceScore: 0,
    samples: [],
    errors: [],
  }

  // tenantId-scoped fetch. Pulls only rows where matchScore is null
  // (the rest are already done — idempotent skip).
  const stages = await db.propertyBuyerStage.findMany({
    where: {
      tenantId,
      matchScore: null,
    },
    select: {
      id: true,
      propertyId: true,
      buyerId: true,
      buyer: {
        select: {
          id: true,
          name: true,
          matchLikelihoodScore: true,
        },
      },
    },
    take: opts.limit,
    orderBy: { createdAt: 'asc' },
  })

  for (const stage of stages) {
    report.scanned++

    const sourceScore = stage.buyer?.matchLikelihoodScore ?? null
    if (sourceScore === null) {
      report.buyerHasNoSourceScore++
      continue
    }

    report.wouldUpdate++

    if (report.samples.length < sampleSize) {
      report.samples.push({
        propertyBuyerStageId: stage.id,
        propertyId: stage.propertyId,
        buyerId: stage.buyerId,
        buyerNamePreview: (stage.buyer?.name ?? '').slice(0, 40),
        sourceScore,
      })
    }

    if (!opts.dryRun) {
      try {
        // Defense-in-depth: id+tenantId on the WHERE so a corrupted
        // row id can't ever leak a write cross-tenant.
        await db.propertyBuyerStage.update({
          where: { id: stage.id, tenantId },
          data: {
            matchScore: sourceScore,
            matchScoreUpdatedAt: new Date(),
          },
        })
      } catch (err) {
        report.errors.push({
          propertyBuyerStageId: stage.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  // Count rows that already have matchScore (for the dashboard, so the
  // total row count adds up). Cheap separate query.
  const alreadyDone = await db.propertyBuyerStage.count({
    where: { tenantId, matchScore: { not: null } },
  })
  report.alreadyHasScore = alreadyDone

  return report
}
