// lib/batchdata/enrich.ts
// Enriches a property with BatchData — called on creation and manual re-research
// Backfills missing fields (beds, baths, etc.) as "ai" source (blue)
// Stores full results in zillowData.batchData for Research tab

import { db } from '@/lib/db/client'
import { lookupProperty } from './client'
import { formatReadableDate } from '@/lib/format'

/** Build a wholesaler-ready description from property details + research data */
function generateDescription(
  prop: { address: string; city: string; state: string; zip: string },
  details: { beds?: number | null; baths?: number | null; sqft?: number | null; yearBuilt?: number | null; lotSize?: string | null; propertyType?: string | null; occupancy?: string | null },
  research: Record<string, unknown>,
): string {
  const parts: string[] = []

  // Opening — property type + address
  const type = details.propertyType ?? (research.propertyType as string | undefined) ?? 'Property'
  parts.push(`${type} located at ${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}.`)

  // Specs line
  const specs: string[] = []
  const bd = details.beds ?? (research.bedrooms as number | undefined)
  const ba = details.baths ?? (research.bathrooms as number | undefined)
  const sf = details.sqft ?? (research.squareFootage as number | undefined)
  const yb = details.yearBuilt ?? (research.yearBuilt as number | undefined)
  if (bd) specs.push(`${bd} bed`)
  if (ba) specs.push(`${ba} bath`)
  if (sf) specs.push(`${sf.toLocaleString()} sqft`)
  if (yb) specs.push(`built ${yb}`)
  if (specs.length > 0) parts.push(specs.join(', ') + '.')

  // Lot
  const lotSf = research.lotSquareFootage as number | undefined
  const lot = details.lotSize ?? (lotSf ? (lotSf >= 43560 ? `${(lotSf / 43560).toFixed(2)} acre` : `${lotSf.toLocaleString()} sqft`) : null)
  if (lot) parts.push(`Lot size: ${lot}.`)

  // Valuation
  const estVal = research.estimatedValue as number | undefined
  const equity = research.equityPercent as number | undefined
  if (estVal) {
    let valLine = `Estimated value $${estVal.toLocaleString()}`
    if (equity != null) valLine += ` with ${Math.round(equity)}% equity`
    parts.push(valLine + '.')
  }

  // Deal signals
  const signals: string[] = []
  if (research.absenteeOwner === true) signals.push('absentee owner')
  if (research.vacant === true) signals.push('vacant')
  if (research.freeAndClear === true) signals.push('free & clear')
  if (research.highEquity === true && !signals.includes('free & clear')) signals.push('high equity')
  if (research.preforeclosure === true) signals.push('pre-foreclosure')
  if (research.taxDefault === true) signals.push('tax default')
  if (signals.length > 0) parts.push(`Deal signals: ${signals.join(', ')}.`)

  // Occupancy
  const occ = details.occupancy
  if (occ && occ !== 'Owner') parts.push(`Occupancy: ${occ}.`)

  // Last sale
  const lastSaleDate = research.lastSaleDate as string | undefined
  const lastSalePrice = research.lastSalePrice as number | undefined
  if (lastSaleDate && lastSalePrice) {
    parts.push(`Last sold ${formatReadableDate(lastSaleDate)} for $${lastSalePrice.toLocaleString()}.`)
  }

  return parts.join(' ')
}

export async function enrichPropertyFromBatchData(propertyId: string): Promise<boolean> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: {
      address: true, city: true, state: true, zip: true,
      beds: true, baths: true, sqft: true, yearBuilt: true,
      lotSize: true, propertyType: true, occupancy: true,
      description: true,
      fieldSources: true, zillowData: true,
    },
  })
  if (!property || !property.address) return false

  console.log(`[BatchData] Enriching: ${property.address}, ${property.city}, ${property.state} ${property.zip}`)
  const result = await lookupProperty(property.address, property.city, property.state, property.zip)
  if (!result) return false

  // Build update — only backfill empty fields, mark as "api" (purple)
  const updateData: Record<string, unknown> = {}
  const fieldSources = { ...((property.fieldSources as Record<string, string>) ?? {}) }

  // Fix any old 'ai' sources that should be 'api' (from before the source rename)
  for (const f of ['beds', 'baths', 'sqft', 'yearBuilt', 'lotSize', 'propertyType']) {
    if (fieldSources[f] === 'ai') fieldSources[f] = 'api'
  }

  if (property.beds == null && result.bedrooms) {
    updateData.beds = result.bedrooms; fieldSources.beds = 'api'
  }
  if (property.baths == null && result.bathrooms) {
    updateData.baths = result.bathrooms; fieldSources.baths = 'api'
  }
  if (property.sqft == null && result.squareFootage) {
    updateData.sqft = result.squareFootage; fieldSources.sqft = 'api'
  }
  if (property.yearBuilt == null && result.yearBuilt) {
    updateData.yearBuilt = result.yearBuilt; fieldSources.yearBuilt = 'api'
  }
  if (!property.lotSize && result.lotSquareFootage) {
    const acres = result.lotSquareFootage / 43560
    updateData.lotSize = acres >= 1 ? `${acres.toFixed(2)} ac` : `${result.lotSquareFootage.toLocaleString()} sqft`
    fieldSources.lotSize = 'api'
  }
  // Auto-derive occupancy from ownerOccupied
  if (!property.occupancy && result.ownerOccupied != null) {
    updateData.occupancy = result.ownerOccupied ? 'Owner' : 'Renter'
    fieldSources.occupancy = 'api'
  }

  if (!property.propertyType && result.propertyType) {
    const typeMap: Record<string, string> = {
      'single family residential': 'House', 'sfr': 'House', 'single family': 'House',
      'multi-family': 'Multi-Family', 'multifamily': 'Multi-Family',
      'condo': 'Condo', 'condominium': 'Condo',
      'townhouse': 'Townhome', 'townhome': 'Townhome',
      'mobile home': 'Mobile Home', 'manufactured': 'Mobile Home',
      'land': 'Land', 'vacant land': 'Land',
      'commercial': 'Commercial',
    }
    updateData.propertyType = typeMap[result.propertyType.toLowerCase()] ?? result.propertyType
    fieldSources.propertyType = 'api'
  }

  // Store full BatchData for Research tab
  const existingResearch = (property.zillowData ?? {}) as Record<string, unknown>
  updateData.zillowData = {
    ...existingResearch,
    batchData: {
      // Valuation
      estimatedValue: result.estimatedValue,
      assessedValue: result.assessedValue,
      priceRangeMin: result.priceRangeMin,
      priceRangeMax: result.priceRangeMax,
      confidenceScore: result.confidenceScore,
      equityPercent: result.equityPercent,
      ltv: result.ltv,
      apn: result.apn,
      // Owner
      ownerName: result.ownerName,
      ownerMailingAddress: result.ownerMailingAddress,
      absenteeOwner: result.absenteeOwner,
      ownerOccupied: result.ownerOccupied,
      // Quick flags
      cashBuyer: result.cashBuyer,
      freeAndClear: result.freeAndClear,
      highEquity: result.highEquity,
      taxDefault: result.taxDefault,
      preforeclosure: result.preforeclosure,
      vacant: result.vacant,
      corporateOwned: result.corporateOwned,
      trustOwned: result.trustOwned,
      // Liens + history
      totalOpenLienCount: result.totalOpenLienCount,
      lastSaleDate: result.lastSaleDate,
      lastSalePrice: result.lastSalePrice,
      lastSaleType: result.lastSaleType,
      // Permits
      permitCount: result.permitCount,
      permitTags: result.permitTags,
      // Building
      bedrooms: result.bedrooms,
      bathrooms: result.bathrooms,
      squareFootage: result.squareFootage,
      lotSquareFootage: result.lotSquareFootage,
      yearBuilt: result.yearBuilt,
      // Location
      latitude: result.latitude,
      longitude: result.longitude,
      county: result.county,
      // Meta
      enrichedAt: new Date().toISOString(),
    },
  }
  // Auto-generate description from research + property details (source: ai = blue)
  if (!property.description) {
    const batchData = (updateData.zillowData as Record<string, unknown>)?.batchData as Record<string, unknown> ?? {}
    const desc = generateDescription(
      { address: property.address, city: property.city ?? '', state: property.state ?? '', zip: property.zip ?? '' },
      {
        beds: (updateData.beds as number | undefined) ?? property.beds,
        baths: (updateData.baths as number | undefined) ?? property.baths,
        sqft: (updateData.sqft as number | undefined) ?? property.sqft,
        yearBuilt: (updateData.yearBuilt as number | undefined) ?? property.yearBuilt,
        lotSize: (updateData.lotSize as string | undefined) ?? property.lotSize,
        propertyType: (updateData.propertyType as string | undefined) ?? property.propertyType,
        occupancy: property.occupancy,
      },
      batchData,
    )
    if (desc.length > 30) {
      updateData.description = desc
      fieldSources.description = 'ai'
    }
  }

  updateData.fieldSources = fieldSources

  await db.property.update({ where: { id: propertyId }, data: updateData })

  const backfilled = Object.keys(updateData).filter(k => k !== 'zillowData' && k !== 'fieldSources')
  console.log(`[BatchData] Done: ${property.address}${backfilled.length > 0 ? ` — backfilled ${backfilled.join(', ')}` : ''}`)
  return true
}
