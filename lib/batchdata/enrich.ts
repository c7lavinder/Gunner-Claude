// lib/batchdata/enrich.ts
// Enriches a property with BatchData — called on creation and manual re-research
// Backfills missing fields (beds, baths, etc.) as "ai" source
// Stores full BatchData response in zillowData JSON field

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
  if (!result) {
    console.warn(`[BatchData] No results for ${property.address}`)
    return false
  }

  // Build update data — only backfill fields that are currently empty
  const updateData: Record<string, unknown> = {}
  const fieldSources = { ...((property.fieldSources as Record<string, string>) ?? {}) }

  // Backfill missing physical details and mark as "ai" source
  if (property.beds == null && result.bedrooms) {
    updateData.beds = result.bedrooms
    fieldSources.beds = 'ai'
  }
  if (property.baths == null && result.bathrooms) {
    updateData.baths = result.bathrooms
    fieldSources.baths = 'ai'
  }
  if (property.sqft == null && result.squareFootage) {
    updateData.sqft = result.squareFootage
    fieldSources.sqft = 'ai'
  }
  if (property.yearBuilt == null && result.yearBuilt) {
    updateData.yearBuilt = result.yearBuilt
    fieldSources.yearBuilt = 'ai'
  }
  if (!property.lotSize && result.lotSquareFootage) {
    // Convert sqft to acres for display
    const acres = result.lotSquareFootage / 43560
    updateData.lotSize = acres >= 1 ? `${acres.toFixed(2)} ac` : `${result.lotSquareFootage.toLocaleString()} sqft`
    fieldSources.lotSize = 'ai'
  }
  if (!property.propertyType && result.propertyType) {
    // Map BatchData types to our options
    const typeMap: Record<string, string> = {
      'single family residential': 'House', 'sfr': 'House', 'single family': 'House',
      'multi-family': 'Multi-Family', 'multifamily': 'Multi-Family', 'duplex': 'Multi-Family',
      'condo': 'Condo', 'condominium': 'Condo', 'townhouse': 'Townhome', 'townhome': 'Townhome',
      'mobile home': 'Mobile Home', 'manufactured': 'Mobile Home',
      'land': 'Land', 'vacant land': 'Land',
      'commercial': 'Commercial',
    }
    const mapped = typeMap[result.propertyType.toLowerCase()] ?? typeMap[result.propertyTypeDetail?.toLowerCase() ?? ''] ?? result.propertyType
    updateData.propertyType = mapped
    fieldSources.propertyType = 'ai'
  }

  // Store full BatchData response + existing research data
  const existingResearch = (property.zillowData ?? {}) as Record<string, unknown>
  const batchDataSection = {
    estimatedValue: result.estimatedValue,
    assessedValue: result.assessedValue,
    assessedLandValue: result.assessedLandValue,
    assessedImprovementValue: result.assessedImprovementValue,
    // Owner
    ownerName: result.ownerName,
    ownerType: result.ownerType,
    mailingAddress: result.mailingAddress ? `${result.mailingAddress}, ${result.mailingCity ?? ''} ${result.mailingState ?? ''} ${result.mailingZip ?? ''}`.trim() : undefined,
    absenteeOwner: result.absenteeOwner,
    ownershipLength: result.ownershipLength,
    // Building extras
    stories: result.stories,
    constructionType: result.constructionType,
    heatingType: result.heatingType,
    coolingType: result.coolingType,
    pool: result.pool,
    garage: result.garage,
    garageSpaces: result.garageSpaces,
    // Financial
    openLienCount: result.openLienCount,
    lenderName: result.lenderName,
    loanAmount: result.loanAmount,
    loanType: result.loanType,
    loanDate: result.loanDate,
    loanToValue: result.loanToValue,
    equityPercent: result.equityPercent,
    // History
    lastSaleDate: result.lastSaleDate,
    lastSalePrice: result.lastSalePrice,
    // Distress
    preForeclosure: result.preForeclosure,
    foreclosureDate: result.foreclosureDate,
    defaultAmount: result.defaultAmount,
    // Meta
    enrichedAt: new Date().toISOString(),
  }

  // Merge with existing research (Google Places data stays)
  updateData.zillowData = { ...existingResearch, batchData: batchDataSection }
  updateData.fieldSources = fieldSources

  await db.property.update({
    where: { id: propertyId },
    data: updateData,
  })

  const backfilledFields = Object.keys(updateData).filter(k => k !== 'zillowData' && k !== 'fieldSources')
  console.log(`[BatchData] Enriched ${property.address}: ${backfilledFields.length > 0 ? `backfilled ${backfilledFields.join(', ')}` : 'no backfill needed'}`)

  return true
}
