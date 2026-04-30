// lib/v1_1/wave_2_backfill.ts
//
// v1.1 Wave 2 backfill logic. Lives in `lib/` so the diagnostic endpoint
// (app/api/diagnostics/v1_1_seller_backfill/route.ts) and any future
// debug script call the same code path.
//
// Two backfill jobs:
//
//   1. backfillSellersFromProperty(tenantId, opts)
//      For every Property with owner_* data populated, find linked Seller
//      rows via PropertySeller and fill the NEW Wave 1 columns (firstName /
//      lastName / skipTraced* / portfolio aggregates / person flags) using
//      setIfEmpty semantics — only writes empty fields, never overwrites.
//      Properties WITHOUT a linked Seller are skipped + logged. Per Corey's
//      Wave 2 constraint: no auto-create of Sellers.
//
//   2. migrateManualBuyerIdsForTenant(tenantId, opts)
//      For every Property with non-empty manualBuyerIds[], iterate the
//      JSON array of GHL contact IDs. For each ID, find the matching Buyer.
//      If found AND no existing PropertyBuyerStage row, insert one with
//      stage='added', source='manual'. If Buyer not found, skip + log.
//      No auto-create of Buyers.
//
// Both are idempotent — re-running is safe and a no-op for already-filled
// fields / already-existing rows.

import { db } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'

// ─── Shared types ────────────────────────────────────────────────────────

export interface BackfillOpts {
  dryRun: boolean
  /** Cap properties processed per run. Defaults to no cap. */
  limit?: number
  /** Sample size for the report's `samples` array. Default 10. */
  sampleSize?: number
}

export interface SellerBackfillReport {
  scanned: number
  wouldUpdate: number       // properties whose linked seller(s) had at least one empty field that would be filled
  wouldSkipNoLink: number   // properties with owner data but no linked Seller — manual creation needed
  alreadyComplete: number   // properties whose linked seller(s) already had every relevant field populated
  fieldsTouched: Record<string, number>  // { firstName: 47, skipTracedPhone: 38, ... }
  samples: Array<{
    propertyId: string
    propertyAddress: string
    sellerId: string
    sellerNamePreview: string
    fieldsToFill: string[]   // which Seller columns would be filled
    sample: Record<string, unknown>  // up to ~5 example values
  }>
  skippedPropertySamples: Array<{
    propertyId: string
    propertyAddress: string
    populatedOwnerFields: string[]
  }>
  errors: Array<{ propertyId: string; error: string }>
}

export interface ManualBuyerIdsReport {
  scanned: number              // properties with non-empty manualBuyerIds
  totalIdsConsidered: number
  wouldInsert: number          // PropertyBuyerStage rows that would be created
  alreadyExists: number        // (propertyId, buyerId) pair already in PropertyBuyerStage
  wouldSkipNoBuyer: number     // GHL contact ID has no matching Buyer row — manual creation needed
  samples: Array<{
    propertyId: string
    propertyAddress: string
    buyerId: string
    buyerNamePreview: string
  }>
  skippedSamples: Array<{
    propertyId: string
    propertyAddress: string
    ghlContactId: string
  }>
  errors: Array<{ propertyId: string; error: string }>
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Parse "First Middle Last" into structured parts. Same shape as
 *  splitName in lib/enrichment/sync-seller.ts:307. Duplicated here to
 *  avoid pulling that file's import surface (sync-seller imports
 *  BatchData types we don't need). Plain string-splitting — no risk. */
function splitName(full: string): {
  firstName?: string
  middleName?: string
  lastName?: string
} {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

/** A field is "empty" if it's null/undefined, empty string, or false (for
 *  boolean flags where false is indistinguishable from "unset" — we only
 *  flip these to true, never to false). Numbers must be treated as set
 *  even when 0 (e.g. ownerPortfolioCount = 0 is a meaningful answer). */
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v === '') return true
  return false
}

/** Same logic, but treats `false` boolean as empty so the person flags
 *  can be flipped from false → true on backfill. Person flags default to
 *  null on the schema; existing rows may have false from prior writes. */
function isEmptyOrFalse(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v === '') return true
  if (v === false) return true
  return false
}

// ─── Seller backfill ────────────────────────────────────────────────────

/** The Property fields we read for the backfill — kept narrow so the query
 *  doesn't pull every vendor column. */
const PROPERTY_OWNER_SELECT = {
  id: true,
  tenantId: true,
  address: true, city: true, state: true,
  ghlContactId: true,
  // Owner identity
  ownerPhone: true,
  ownerEmail: true,
  ownerType: true,
  ownershipLengthYears: true,
  secondOwnerName: true,
  secondOwnerPhone: true,
  secondOwnerEmail: true,
  ownerFirstName1: true,
  ownerLastName1: true,
  ownerFirstName2: true,
  ownerLastName2: true,
  // Person flags (Q3 lock — strip targets)
  seniorOwner: true,
  deceasedOwner: true,
  cashBuyerOwner: true,
  // Portfolio aggregates (strip targets)
  ownerPortfolioCount: true,
  ownerPortfolioTotalEquity: true,
  ownerPortfolioTotalValue: true,
  ownerPortfolioTotalPurchase: true,
  ownerPortfolioAvgAssessed: true,
  ownerPortfolioAvgPurchase: true,
  ownerPortfolioAvgYearBuilt: true,
  ownerPortfolioJson: true,
  sellers: {
    select: {
      isPrimary: true,
      sellerId: true,
      seller: {
        select: {
          id: true, tenantId: true, name: true,
          firstName: true, middleName: true, lastName: true, nameSuffix: true,
          phone: true, email: true,
          mailingAddress: true, mailingCity: true, mailingState: true, mailingZip: true,
          ownershipType: true, yearsOwned: true,
          // New skip-trace fallback columns
          skipTracedPhone: true,
          skipTracedEmail: true,
          skipTracedMailingAddress: true,
          skipTracedMailingCity: true,
          skipTracedMailingState: true,
          skipTracedMailingZip: true,
          // Person flags (new)
          seniorOwner: true,
          deceasedOwner: true,
          cashBuyerOwner: true,
          // Portfolio aggregates (new)
          totalPropertiesOwned: true,
          ownerPortfolioTotalEquity: true,
          ownerPortfolioTotalValue: true,
          ownerPortfolioTotalPurchase: true,
          ownerPortfolioAvgAssessed: true,
          ownerPortfolioAvgPurchase: true,
          ownerPortfolioAvgYearBuilt: true,
          ownerPortfolioJson: true,
          fieldSources: true,
        },
      },
    },
  },
} satisfies Prisma.PropertySelect

type PropertyForBackfill = Prisma.PropertyGetPayload<{ select: typeof PROPERTY_OWNER_SELECT }>
type SellerForBackfill = NonNullable<PropertyForBackfill['sellers'][number]['seller']>

/** Build the per-Seller update for one (property, seller, ordinal) tuple.
 *  Returns the update record + the list of fields that would be filled.
 *  Empty record means seller is already complete for this property's data. */
function buildSellerUpdate(
  property: PropertyForBackfill,
  seller: SellerForBackfill,
  ordinal: 1 | 2,
): { update: Prisma.SellerUpdateInput; fieldsTouched: string[]; fieldSources: Record<string, string> } {
  const update: Record<string, unknown> = {}
  const fieldsTouched: string[] = []
  const fieldSources: Record<string, string> = {
    ...((seller.fieldSources as Record<string, string>) ?? {}),
  }

  const setIfEmpty = (col: keyof SellerForBackfill, value: unknown): void => {
    if (value === null || value === undefined || value === '') return
    if (!isEmpty(seller[col] as unknown)) return
    update[col as string] = value
    fieldsTouched.push(col as string)
    if (fieldSources[col as string] !== 'user') fieldSources[col as string] = 'api'
  }

  const setBoolIfEmpty = (col: keyof SellerForBackfill, value: unknown): void => {
    if (value !== true && value !== false) return  // null/undefined skip
    if (!isEmptyOrFalse(seller[col] as unknown)) return
    update[col as string] = value
    fieldsTouched.push(col as string)
    if (fieldSources[col as string] !== 'user') fieldSources[col as string] = 'api'
  }

  // ── Name parts (Q2 lock) ────────────────────────────────────────────
  // Preference: structured form from Property (PropertyRadar) > split from
  // Seller.name > split from owner1Name (BatchData ownerName variant lives
  // in seller.name already from prior sync-seller pass).
  if (ordinal === 1) {
    if (property.ownerFirstName1 || property.ownerLastName1) {
      setIfEmpty('firstName', property.ownerFirstName1 ?? undefined)
      setIfEmpty('lastName', property.ownerLastName1 ?? undefined)
    } else if (seller.name) {
      const parts = splitName(seller.name)
      setIfEmpty('firstName', parts.firstName)
      setIfEmpty('middleName', parts.middleName)
      setIfEmpty('lastName', parts.lastName)
    }
  } else {
    // ordinal 2 — second owner
    if (property.ownerFirstName2 || property.ownerLastName2) {
      setIfEmpty('firstName', property.ownerFirstName2 ?? undefined)
      setIfEmpty('lastName', property.ownerLastName2 ?? undefined)
    } else if (property.secondOwnerName) {
      const parts = splitName(property.secondOwnerName)
      setIfEmpty('firstName', parts.firstName)
      setIfEmpty('middleName', parts.middleName)
      setIfEmpty('lastName', parts.lastName)
    } else if (seller.name) {
      const parts = splitName(seller.name)
      setIfEmpty('firstName', parts.firstName)
      setIfEmpty('middleName', parts.middleName)
      setIfEmpty('lastName', parts.lastName)
    }
  }

  // ── Skip-trace fallback identity (Q1/Shape A) ───────────────────────
  // Mirror legacy phone/email/mailing into skipTraced* columns. The
  // legacy fields stay populated until Wave 5 cutover.
  if (ordinal === 1) {
    setIfEmpty('skipTracedPhone', seller.phone ?? property.ownerPhone)
    setIfEmpty('skipTracedEmail', seller.email ?? property.ownerEmail)
  } else {
    setIfEmpty('skipTracedPhone', seller.phone ?? property.secondOwnerPhone)
    setIfEmpty('skipTracedEmail', seller.email ?? property.secondOwnerEmail)
  }
  // Mailing comes only from existing Seller — Property doesn't track per-owner mailing.
  setIfEmpty('skipTracedMailingAddress', seller.mailingAddress)
  setIfEmpty('skipTracedMailingCity', seller.mailingCity)
  setIfEmpty('skipTracedMailingState', seller.mailingState)
  setIfEmpty('skipTracedMailingZip', seller.mailingZip)

  // ── Person flags (Q3 lock) — owner-of-record level, ordinal 1 only ──
  if (ordinal === 1) {
    setBoolIfEmpty('seniorOwner', property.seniorOwner)
    setBoolIfEmpty('deceasedOwner', property.deceasedOwner)
    setBoolIfEmpty('cashBuyerOwner', property.cashBuyerOwner)
  }

  // ── Portfolio aggregates — owner-of-record level, ordinal 1 only ────
  if (ordinal === 1) {
    setIfEmpty('ownerPortfolioTotalEquity', property.ownerPortfolioTotalEquity)
    setIfEmpty('ownerPortfolioTotalValue', property.ownerPortfolioTotalValue)
    setIfEmpty('ownerPortfolioTotalPurchase', property.ownerPortfolioTotalPurchase)
    setIfEmpty('ownerPortfolioAvgAssessed', property.ownerPortfolioAvgAssessed)
    setIfEmpty('ownerPortfolioAvgPurchase', property.ownerPortfolioAvgPurchase)
    setIfEmpty('ownerPortfolioAvgYearBuilt', property.ownerPortfolioAvgYearBuilt)
    setIfEmpty('ownerPortfolioJson', property.ownerPortfolioJson)
    // totalPropertiesOwned has @default(0) on the schema so existing rows
    // are 0, not null. Backfill only when current value is 0 AND vendor
    // count is > 0 — matches the spirit of "fill empty."
    if (
      typeof property.ownerPortfolioCount === 'number' &&
      property.ownerPortfolioCount > 0 &&
      seller.totalPropertiesOwned === 0
    ) {
      update.totalPropertiesOwned = property.ownerPortfolioCount
      fieldsTouched.push('totalPropertiesOwned')
      if (fieldSources.totalPropertiesOwned !== 'user') fieldSources.totalPropertiesOwned = 'api'
    }
  }

  return {
    update: update as Prisma.SellerUpdateInput,
    fieldsTouched,
    fieldSources,
  }
}

/** True if the property has any owner-side data worth backfilling. */
function propertyHasOwnerData(p: PropertyForBackfill): {
  hasData: boolean
  populatedFields: string[]
} {
  const populated: string[] = []
  if (p.ownerPhone) populated.push('ownerPhone')
  if (p.ownerEmail) populated.push('ownerEmail')
  if (p.ownerType) populated.push('ownerType')
  if (p.ownershipLengthYears) populated.push('ownershipLengthYears')
  if (p.ownerFirstName1) populated.push('ownerFirstName1')
  if (p.ownerLastName1) populated.push('ownerLastName1')
  if (p.secondOwnerName) populated.push('secondOwnerName')
  if (p.secondOwnerPhone) populated.push('secondOwnerPhone')
  if (p.secondOwnerEmail) populated.push('secondOwnerEmail')
  if (p.ownerFirstName2) populated.push('ownerFirstName2')
  if (p.ownerLastName2) populated.push('ownerLastName2')
  if (p.seniorOwner === true) populated.push('seniorOwner')
  if (p.deceasedOwner === true) populated.push('deceasedOwner')
  if (p.cashBuyerOwner === true) populated.push('cashBuyerOwner')
  if (p.ownerPortfolioCount && p.ownerPortfolioCount > 0) populated.push('ownerPortfolioCount')
  if (p.ownerPortfolioTotalEquity) populated.push('ownerPortfolioTotalEquity')
  if (p.ownerPortfolioJson) populated.push('ownerPortfolioJson')
  return { hasData: populated.length > 0, populatedFields: populated }
}

export async function backfillSellersFromProperty(
  tenantId: string,
  opts: BackfillOpts,
): Promise<SellerBackfillReport> {
  const sampleSize = opts.sampleSize ?? 10
  const report: SellerBackfillReport = {
    scanned: 0,
    wouldUpdate: 0,
    wouldSkipNoLink: 0,
    alreadyComplete: 0,
    fieldsTouched: {},
    samples: [],
    skippedPropertySamples: [],
    errors: [],
  }

  const properties = await db.property.findMany({
    where: {
      tenantId,
      // Cheap pre-filter — only properties that have at least one owner-side
      // field populated. Final check happens in propertyHasOwnerData().
      OR: [
        { ownerPhone: { not: null } },
        { ownerEmail: { not: null } },
        { ownerFirstName1: { not: null } },
        { secondOwnerName: { not: null } },
        { ownerPortfolioCount: { not: null } },
        { seniorOwner: true },
        { deceasedOwner: true },
        { cashBuyerOwner: true },
      ],
    },
    select: PROPERTY_OWNER_SELECT,
    take: opts.limit,
    orderBy: { createdAt: 'asc' },
  })

  for (const property of properties) {
    report.scanned++

    const { hasData, populatedFields } = propertyHasOwnerData(property)
    if (!hasData) continue

    if (property.sellers.length === 0) {
      report.wouldSkipNoLink++
      if (report.skippedPropertySamples.length < sampleSize) {
        report.skippedPropertySamples.push({
          propertyId: property.id,
          propertyAddress: `${property.address}, ${property.city}, ${property.state}`,
          populatedOwnerFields: populatedFields,
        })
      }
      continue
    }

    // Sort: primary first, then by sellerId for stability. Match the order
    // sync-seller.ts uses, so backfill results are consistent with future
    // dual-write runs.
    const sortedLinks = [...property.sellers].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.sellerId.localeCompare(b.sellerId)
    })

    let propertyHadAnUpdate = false
    for (let i = 0; i < Math.min(sortedLinks.length, 2); i++) {
      const seller = sortedLinks[i].seller
      if (!seller) continue
      const ordinal = (i + 1) as 1 | 2

      try {
        const { update, fieldsTouched, fieldSources } = buildSellerUpdate(property, seller, ordinal)
        if (fieldsTouched.length === 0) continue

        propertyHadAnUpdate = true
        for (const f of fieldsTouched) {
          report.fieldsTouched[f] = (report.fieldsTouched[f] ?? 0) + 1
        }

        if (report.samples.length < sampleSize) {
          const sample: Record<string, unknown> = {}
          for (const f of fieldsTouched.slice(0, 5)) sample[f] = (update as Record<string, unknown>)[f]
          report.samples.push({
            propertyId: property.id,
            propertyAddress: `${property.address}, ${property.city}, ${property.state}`,
            sellerId: seller.id,
            sellerNamePreview: (seller.name ?? '').slice(0, 40),
            fieldsToFill: fieldsTouched,
            sample,
          })
        }

        if (!opts.dryRun) {
          await db.seller.update({
            where: { id: seller.id, tenantId },
            data: { ...update, fieldSources },
          })
        }
      } catch (err) {
        report.errors.push({
          propertyId: property.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (propertyHadAnUpdate) {
      report.wouldUpdate++
    } else {
      report.alreadyComplete++
    }
  }

  return report
}

// ─── manualBuyerIds → PropertyBuyerStage ────────────────────────────────

export async function migrateManualBuyerIdsForTenant(
  tenantId: string,
  opts: BackfillOpts,
): Promise<ManualBuyerIdsReport> {
  const sampleSize = opts.sampleSize ?? 10
  const report: ManualBuyerIdsReport = {
    scanned: 0,
    totalIdsConsidered: 0,
    wouldInsert: 0,
    alreadyExists: 0,
    wouldSkipNoBuyer: 0,
    samples: [],
    skippedSamples: [],
    errors: [],
  }

  const properties = await db.property.findMany({
    where: { tenantId },
    select: {
      id: true, address: true, city: true, state: true,
      manualBuyerIds: true,
    },
    take: opts.limit,
    orderBy: { createdAt: 'asc' },
  })

  for (const property of properties) {
    const ids = property.manualBuyerIds as unknown
    if (!Array.isArray(ids) || ids.length === 0) continue

    report.scanned++
    const idsArr = ids.filter((x): x is string => typeof x === 'string' && x.length > 0)

    for (const ghlContactId of idsArr) {
      report.totalIdsConsidered++

      try {
        const buyer = await db.buyer.findFirst({
          where: { tenantId, ghlContactId },
          select: { id: true, name: true },
        })

        if (!buyer) {
          report.wouldSkipNoBuyer++
          if (report.skippedSamples.length < sampleSize) {
            report.skippedSamples.push({
              propertyId: property.id,
              propertyAddress: `${property.address}, ${property.city}, ${property.state}`,
              ghlContactId,
            })
          }
          continue
        }

        // Idempotent — only insert if PropertyBuyerStage doesn't already exist.
        const existing = await db.propertyBuyerStage.findUnique({
          where: { propertyId_buyerId: { propertyId: property.id, buyerId: buyer.id } },
          select: { id: true, source: true },
        })

        if (existing) {
          report.alreadyExists++
          continue
        }

        report.wouldInsert++
        if (report.samples.length < sampleSize) {
          report.samples.push({
            propertyId: property.id,
            propertyAddress: `${property.address}, ${property.city}, ${property.state}`,
            buyerId: buyer.id,
            buyerNamePreview: (buyer.name ?? '').slice(0, 40),
          })
        }

        if (!opts.dryRun) {
          await db.propertyBuyerStage.create({
            data: {
              tenantId,
              propertyId: property.id,
              buyerId: buyer.id,
              stage: 'added',
              source: 'manual',
            },
          })
        }
      } catch (err) {
        report.errors.push({
          propertyId: property.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  return report
}
