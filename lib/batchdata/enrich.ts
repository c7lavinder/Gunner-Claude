// lib/batchdata/enrich.ts
// Enriches a property with BatchData — called on creation and manual re-research
// Backfills missing fields (beds, baths, etc.) as "ai" source (blue)
// Stores full results in zillowData.batchData for Research tab

import { db } from '@/lib/db/client'
import { lookupProperty } from './client'

export async function enrichPropertyFromBatchData(propertyId: string): Promise<boolean> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: {
      address: true, city: true, state: true, zip: true,
      beds: true, baths: true, sqft: true, yearBuilt: true,
      lotSize: true, propertyType: true,
      fieldSources: true, zillowData: true,
    },
  })
  if (!property || !property.address) return false

  console.log(`[BatchData] Enriching: ${property.address}, ${property.city}, ${property.state} ${property.zip}`)
  const result = await lookupProperty(property.address, property.city, property.state, property.zip)
  if (!result) return false

  // Build update — only backfill empty fields, mark as "ai" (blue)
  const updateData: Record<string, unknown> = {}
  const fieldSources = { ...((property.fieldSources as Record<string, string>) ?? {}) }

  if (property.beds == null && result.bedrooms) {
    updateData.beds = result.bedrooms; fieldSources.beds = 'ai'
  }
  if (property.baths == null && result.bathrooms) {
    updateData.baths = result.bathrooms; fieldSources.baths = 'ai'
  }
  if (property.sqft == null && result.squareFootage) {
    updateData.sqft = result.squareFootage; fieldSources.sqft = 'ai'
  }
  if (property.yearBuilt == null && result.yearBuilt) {
    updateData.yearBuilt = result.yearBuilt; fieldSources.yearBuilt = 'ai'
  }
  if (!property.lotSize && result.lotSquareFootage) {
    const acres = result.lotSquareFootage / 43560
    updateData.lotSize = acres >= 1 ? `${acres.toFixed(2)} ac` : `${result.lotSquareFootage.toLocaleString()} sqft`
    fieldSources.lotSize = 'ai'
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
    fieldSources.propertyType = 'ai'
  }

  // Store full BatchData for Research tab
  const existingResearch = (property.zillowData ?? {}) as Record<string, unknown>
  updateData.zillowData = {
    ...existingResearch,
    batchData: {
      // Valuation
      estimatedValue: result.estimatedValue,
      priceRangeMin: result.priceRangeMin,
      priceRangeMax: result.priceRangeMax,
      confidenceScore: result.confidenceScore,
      equityPercent: result.equityPercent,
      ltv: result.ltv,
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
  updateData.fieldSources = fieldSources

  await db.property.update({ where: { id: propertyId }, data: updateData })

  const backfilled = Object.keys(updateData).filter(k => k !== 'zillowData' && k !== 'fieldSources')
  console.log(`[BatchData] Done: ${property.address}${backfilled.length > 0 ? ` — backfilled ${backfilled.join(', ')}` : ''}`)
  return true
}
