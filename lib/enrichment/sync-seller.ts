// lib/enrichment/sync-seller.ts
//
// Bridges vendor property data → linked Seller rows. When a Property is
// enriched (BatchData / PropertyRadar / REAPI / RentCast), any Seller tied
// via PropertySeller can have their contact + ownership fields backfilled
// from the same payload — the owner returned by the vendor IS, almost by
// definition, the seller we'd have on file.
//
// Rules:
//   1. Only backfill empty Seller fields — never overwrite user edits.
//   2. Mark each write as source `api` in Seller.fieldSources so the UI
//      renders the purple "from API" pill and we can audit later.
//   3. Split owner1 vs owner2: first Seller matched to the property gets
//      owner1 data + phones[0] + emails[0]; second gets owner2 + phones[1]
//      + emails[1]. Single-seller properties use owner1 only.

import { db } from '@/lib/db/client'
import {
  type BatchDataPropertyResult,
  type SkipTraceResult,
  skipTraceProperty,
} from '@/lib/batchdata/client'

interface SellerSlice {
  id: string
  name: string | null
  phone: string | null
  secondaryPhone: string | null
  mobilePhone: string | null
  email: string | null
  secondaryEmail: string | null
  mailingAddress: string | null
  mailingCity: string | null
  mailingState: string | null
  mailingZip: string | null
  spouseName: string | null
  spousePhone: string | null
  spouseEmail: string | null
  isDeceased: boolean
  yearsOwned: number | null
  howAcquired: string | null
  ownershipType: string | null
  entityName: string | null
  mortgageBalance: unknown
  monthlyMortgagePayment: unknown
  lenderName: string | null
  interestRate: number | null
  loanType: string | null
  hasSecondMortgage: boolean | null
  secondMortgageBalance: unknown
  hasHoa: boolean | null
  propertyTaxesCurrent: boolean | null
  propertyTaxesOwed: unknown
  hasLiens: boolean | null
  lienAmount: unknown
  lienType: string | null
  isProbate: boolean | null
  isDivorce: boolean | null
  isForeclosure: boolean | null
  isBankruptcy: boolean | null
  isRecentlyInherited: boolean | null
  isVacant: boolean | null
  fieldSources: unknown
}

/**
 * Build a Prisma update object from a vendor payload. Returns `{}` if nothing
 * to write. Mutates `fieldSources` in place (caller should include it in the
 * same update).
 */
export function buildSellerSyncUpdate(
  seller: SellerSlice,
  result: Partial<BatchDataPropertyResult>,
  fieldSources: Record<string, string>,
  opts: { ordinal?: 1 | 2 } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const ordinal = opts.ordinal ?? 1

  const setIfEmpty = <K extends keyof SellerSlice>(col: K, value: unknown): void => {
    if (value == null || value === '' || value === undefined) return
    if (seller[col] != null && seller[col] !== '' && seller[col] !== false) return
    out[col as string] = value
    if (fieldSources[col as string] !== 'user') fieldSources[col as string] = 'api'
  }

  // ── Identity ─────────────────────────────
  const primaryName = ordinal === 1 ? result.ownerName : result.secondOwnerName
  const primaryPhone = ordinal === 1 ? result.ownerPhone : result.secondOwnerPhone
  const primaryEmail = ordinal === 1 ? result.ownerEmail : result.secondOwnerEmail
  setIfEmpty('name', primaryName)
  setIfEmpty('phone', primaryPhone)
  setIfEmpty('email', primaryEmail)

  // Spouse info when single Seller represents the household (ordinal === 1 +
  // result has secondOwnerName). Skip for ordinal 2 (they ARE the spouse).
  if (ordinal === 1) {
    setIfEmpty('spouseName', result.secondOwnerName)
    setIfEmpty('spousePhone', result.secondOwnerPhone)
    setIfEmpty('spouseEmail', result.secondOwnerEmail)
  }

  // ── Mailing address ──────────────────────
  // Vendors vary: BatchData nests owner.mailingAddress under `raw.owner.mailingAddress`,
  // REAPI puts `ownerInfo.mailAddress`, PR passes free-form string, RentCast
  // ships structured object. We pluck from `raw` defensively.
  const raw = result.raw as Record<string, unknown> | undefined
  const ownerBlock = (raw?.owner ?? raw?.ownerInfo ?? {}) as Record<string, unknown>
  const mailing = (ownerBlock.mailingAddress ?? ownerBlock.mailAddress ?? {}) as Record<string, unknown>
  const mailStreet = asString(mailing.street ?? mailing.addressLine1 ?? mailing.address)
  const mailCity = asString(mailing.city)
  const mailState = asString(mailing.state)
  const mailZip = asString(mailing.zip ?? mailing.zipCode)
  setIfEmpty('mailingAddress', mailStreet)
  setIfEmpty('mailingCity', mailCity)
  setIfEmpty('mailingState', mailState)
  setIfEmpty('mailingZip', mailZip)

  // ── Ownership ────────────────────────────
  setIfEmpty('yearsOwned', result.ownershipLength)
  setIfEmpty('ownershipType', normalizeOwnerType(result.ownerType, result.secondOwnerName))
  // entityName only meaningful when owner is corporate/trust
  if (result.corporateOwned === true || result.trustOwned === true || result.ownerType === 'corporate' || result.ownerType === 'trust') {
    setIfEmpty('entityName', result.ownerName)
  }

  // Mortgage / financial
  setIfEmpty('mortgageBalance', result.openMortgageBalance ?? result.mortgageAmount)
  setIfEmpty('monthlyMortgagePayment', result.estimatedMortgagePayment)
  setIfEmpty('lenderName', result.mortgageLender)
  setIfEmpty('interestRate', result.mortgageRate)
  setIfEmpty('loanType', result.mortgageType)
  if (result.secondMortgageAmount != null && result.secondMortgageAmount > 0) {
    setIfEmpty('hasSecondMortgage', true)
    setIfEmpty('secondMortgageBalance', result.secondMortgageAmount)
  }

  // Tax / liens
  if (result.taxDelinquent === true) {
    setIfEmpty('propertyTaxesCurrent', false)
  } else if (result.taxDelinquent === false) {
    setIfEmpty('propertyTaxesCurrent', true)
  }
  setIfEmpty('propertyTaxesOwed', result.taxDelinquentAmount)
  const lienCount = result.totalOpenLienCount
  if (typeof lienCount === 'number' && lienCount > 0) {
    setIfEmpty('hasLiens', true)
    setIfEmpty('lienAmount', result.totalOpenLienAmount)
    setIfEmpty('lienType', Array.isArray(result.lienTypes) ? result.lienTypes[0] : undefined)
  }

  // ── Motivation / legal flags ─────────────
  setIfEmpty('isProbate', result.inProbate)
  setIfEmpty('isDivorce', result.inDivorce)
  setIfEmpty('isBankruptcy', result.inBankruptcy)
  setIfEmpty('isRecentlyInherited', result.inherited)
  if (result.preforeclosure === true || result.bankOwned === true || (typeof result.foreclosureStatus === 'string' && result.foreclosureStatus !== '')) {
    setIfEmpty('isForeclosure', true)
  }
  if (result.vacant === true || result.siteVacant === true) {
    setIfEmpty('isVacant', true)
  }
  if (result.deathTransfer === true) {
    setIfEmpty('isDeceased', true)
  }

  return out
}

/**
 * Look up every Seller linked to the property via PropertySeller and apply
 * `buildSellerSyncUpdate` to each. First linked seller gets owner1 data,
 * second gets owner2, rest are skipped (we can't blindly assign name).
 *
 * Returns the number of sellers updated and the union of fields touched.
 */
export async function syncSellersFromVendorResult(
  propertyId: string,
  result: Partial<BatchDataPropertyResult>,
): Promise<{ updatedCount: number; fieldsTouched: string[] }> {
  // Primary seller first (buildSellerSyncUpdate assigns owner1 to ordinal 1),
  // then any others by sellerId for a stable order. PropertySeller has no
  // createdAt column, so we sort client-side.
  const links = await db.propertySeller.findMany({
    where: { propertyId },
    include: {
      seller: {
        select: {
          id: true, name: true, phone: true, secondaryPhone: true, mobilePhone: true,
          email: true, secondaryEmail: true,
          mailingAddress: true, mailingCity: true, mailingState: true, mailingZip: true,
          spouseName: true, spousePhone: true, spouseEmail: true, isDeceased: true,
          yearsOwned: true, howAcquired: true, ownershipType: true, entityName: true,
          mortgageBalance: true, monthlyMortgagePayment: true, lenderName: true,
          interestRate: true, loanType: true, hasSecondMortgage: true,
          secondMortgageBalance: true, hasHoa: true,
          propertyTaxesCurrent: true, propertyTaxesOwed: true,
          hasLiens: true, lienAmount: true, lienType: true,
          isProbate: true, isDivorce: true, isForeclosure: true, isBankruptcy: true,
          isRecentlyInherited: true, isVacant: true,
          fieldSources: true,
        },
      },
    },
  })

  const sorted = [...links].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    return a.sellerId.localeCompare(b.sellerId)
  })
  const sellers = sorted.map(l => l.seller).filter((s): s is NonNullable<typeof s> => s != null)
  if (sellers.length === 0) {
    return { updatedCount: 0, fieldsTouched: [] }
  }

  const allFieldsTouched = new Set<string>()
  let updatedCount = 0

  for (let i = 0; i < Math.min(sellers.length, 2); i++) {
    const seller = sellers[i] as SellerSlice
    const ordinal = (i + 1) as 1 | 2
    const fieldSources = { ...((seller.fieldSources as Record<string, string>) ?? {}) }
    const update = buildSellerSyncUpdate(seller, result, fieldSources, { ordinal })

    if (Object.keys(update).length === 0) continue

    for (const k of Object.keys(update)) allFieldsTouched.add(k)
    updatedCount++

    await db.seller.update({
      where: { id: seller.id },
      data: { ...update, fieldSources },
    })
  }

  return { updatedCount, fieldsTouched: [...allFieldsTouched] }
}

function asString(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  return String(v)
}

function normalizeOwnerType(
  raw: string | undefined,
  hasSecondOwner: string | undefined,
): string | undefined {
  if (!raw) return hasSecondOwner ? 'joint' : undefined
  const r = raw.toLowerCase()
  if (r.includes('corp') || r.includes('llc')) return 'LLC'
  if (r.includes('trust')) return 'trust'
  if (r.includes('estate')) return 'estate'
  if (r.includes('individual')) return hasSecondOwner ? 'joint' : 'sole'
  return raw
}

// ─── Skip-trace ────────────────────────────────────────────────────────

interface SkipTraceSellerSlice {
  id: string
  tenantId: string
  name: string
  phone: string | null
  secondaryPhone: string | null
  mobilePhone: string | null
  email: string | null
  secondaryEmail: string | null
  doNotContact: boolean
  isDeceased: boolean
  isBankruptcy: boolean | null
  hasLiens: boolean | null
  fieldSources: unknown
}

/**
 * Parse a full name string into first/middle/last components. BatchData
 * requires name-scoped matching, and sellers typically come in as "First Last"
 * or "First Middle Last". Falls back to whole string if parsing fails.
 */
function splitName(full: string): { first?: string; middle?: string; last?: string; full?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { full }
  if (parts.length === 1) return { first: parts[0], full }
  if (parts.length === 2) return { first: parts[0], last: parts[1], full }
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1], full }
}

/**
 * Choose the best phone from a skip-trace result. Priority order:
 *   1. Never return a DNC-flagged number
 *   2. Prefer `reachable: true`
 *   3. Prefer Mobile over Land Line
 *   4. Break ties by score desc
 */
function pickBestPhones(phones: SkipTraceResult['phones']): {
  primary?: string
  secondary?: string
  mobile?: string
} {
  const callable = phones.filter(p => !p.dnc && p.number)
  const sorted = [...callable].sort((a, b) => {
    if ((b.reachable ? 1 : 0) !== (a.reachable ? 1 : 0)) return (b.reachable ? 1 : 0) - (a.reachable ? 1 : 0)
    const aMobile = a.type === 'Mobile' ? 1 : 0
    const bMobile = b.type === 'Mobile' ? 1 : 0
    if (aMobile !== bMobile) return bMobile - aMobile
    return (b.score ?? 0) - (a.score ?? 0)
  })

  const primary = sorted[0]?.number
  const secondary = sorted.find((p, i) => i > 0 && p.number !== primary)?.number
  const mobile = sorted.find(p => p.type === 'Mobile')?.number

  return { primary, secondary, mobile }
}

/**
 * Run skip-trace for a single seller and merge any new contact info.
 * Only writes fields that are currently empty. Respects DNC flags.
 *
 * Returns the fields that were touched, or null on failure / no-op.
 */
export async function skipTraceSeller(
  sellerId: string,
  opts: { force?: boolean } = {},
): Promise<{ fieldsTouched: string[]; traced: boolean } | null> {
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    select: {
      id: true, tenantId: true, name: true,
      phone: true, secondaryPhone: true, mobilePhone: true,
      email: true, secondaryEmail: true,
      doNotContact: true, isDeceased: true, isBankruptcy: true, hasLiens: true,
      fieldSources: true,
      properties: {
        select: {
          property: {
            select: {
              address: true, city: true, state: true, zip: true,
            },
          },
        },
        take: 1,
      },
    },
  })

  if (!seller) return null
  if (!opts.force && seller.phone && seller.email) {
    // Already have both — don't burn a $0.07 call.
    return { fieldsTouched: [], traced: false }
  }

  const firstProperty = seller.properties[0]?.property
  if (!firstProperty || !firstProperty.address) {
    console.warn(`[SkipTrace] seller ${sellerId} has no linked property — cannot trace`)
    return null
  }

  const name = splitName(seller.name)
  const trace = await skipTraceProperty(
    firstProperty.address, firstProperty.city, firstProperty.state, firstProperty.zip,
    name,
  )
  if (!trace) return { fieldsTouched: [], traced: true }

  const { primary, secondary, mobile } = pickBestPhones(trace.phones)
  const topEmail = trace.emails[0]?.email
  const secondaryEmail = trace.emails[1]?.email

  const fieldSources = { ...((seller.fieldSources as Record<string, string>) ?? {}) }
  const slice = seller as unknown as SkipTraceSellerSlice
  const update: Record<string, unknown> = {}

  const setIfEmpty = <K extends keyof SkipTraceSellerSlice>(col: K, value: unknown): void => {
    if (value == null || value === '' || value === false) return
    if (slice[col] != null && slice[col] !== '' && slice[col] !== false) return
    update[col as string] = value
    if (fieldSources[col as string] !== 'user') fieldSources[col as string] = 'api'
  }

  setIfEmpty('phone', primary)
  setIfEmpty('secondaryPhone', secondary)
  setIfEmpty('mobilePhone', mobile)
  setIfEmpty('email', topEmail)
  setIfEmpty('secondaryEmail', secondaryEmail)

  // Person-level flags: always flip to true when BatchData confirms; never
  // flip false (we don't have authoritative "not deceased" signal).
  if (trace.personDnc === true && seller.doNotContact === false) {
    update.doNotContact = true
    fieldSources.doNotContact = 'api'
  }
  if (trace.isDeceased === true && seller.isDeceased === false) {
    update.isDeceased = true
    fieldSources.isDeceased = 'api'
  }
  if (trace.hasBankruptcy === true && seller.isBankruptcy !== true) {
    update.isBankruptcy = true
    fieldSources.isBankruptcy = 'api'
  }
  if (trace.hasInvoluntaryLien === true && seller.hasLiens !== true) {
    update.hasLiens = true
    fieldSources.hasLiens = 'api'
  }

  if (Object.keys(update).length === 0) {
    return { fieldsTouched: [], traced: true }
  }

  await db.seller.update({
    where: { id: seller.id },
    data: { ...update, fieldSources },
  })

  return { fieldsTouched: Object.keys(update), traced: true }
}

/**
 * Auto-skip-trace every linked Seller on a Property that is missing contact
 * info. Used by the enrichment flow as an opt-in second pass ($0.07/seller).
 */
export async function skipTraceSellersForProperty(
  propertyId: string,
): Promise<{ totalTraced: number; totalFieldsTouched: number; skipped: number }> {
  const links = await db.propertySeller.findMany({
    where: { propertyId },
    select: { sellerId: true },
  })

  let totalTraced = 0
  let totalFieldsTouched = 0
  let skipped = 0

  for (const link of links) {
    const result = await skipTraceSeller(link.sellerId)
    if (!result || !result.traced) {
      skipped++
      continue
    }
    totalTraced++
    totalFieldsTouched += result.fieldsTouched.length
  }

  return { totalTraced, totalFieldsTouched, skipped }
}
