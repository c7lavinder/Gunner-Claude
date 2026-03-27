// lib/batchdata/client.ts
// BatchData API client — property data enrichment
// Endpoint: POST /property/lookup/all-attributes with { requests: [{ address: {...} }] }

const BASE_URL = 'https://api.batchdata.com/api/v1'

function getApiKey(): string {
  const key = process.env.BATCHDATA_API_KEY
  if (!key) throw new Error('BATCHDATA_API_KEY not configured')
  return key
}

export interface BatchDataPropertyResult {
  // Valuation
  estimatedValue?: number
  assessedValue?: number
  priceRangeMin?: number
  priceRangeMax?: number
  confidenceScore?: number
  equityPercent?: number
  ltv?: number
  apn?: string

  // Building (from listing section)
  bedrooms?: number
  bathrooms?: number
  squareFootage?: number
  lotSquareFootage?: number
  yearBuilt?: number
  propertyType?: string

  // Owner
  ownerName?: string
  ownerMailingAddress?: string
  absenteeOwner?: boolean
  ownerOccupied?: boolean

  // Quick flags
  cashBuyer?: boolean
  freeAndClear?: boolean
  highEquity?: boolean
  taxDefault?: boolean
  preforeclosure?: boolean
  vacant?: boolean
  corporateOwned?: boolean
  trustOwned?: boolean

  // Liens
  totalOpenLienCount?: number

  // Deed history
  lastSaleDate?: string
  lastSalePrice?: number
  lastSaleType?: string

  // Permit summary
  permitCount?: number
  permitTags?: string[]

  // Coordinates
  latitude?: number
  longitude?: number
  county?: string

  // Raw
  raw?: Record<string, unknown>
}

export async function lookupProperty(
  street: string, city: string, state: string, zip: string,
): Promise<BatchDataPropertyResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/property/lookup/all-attributes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{ address: { street, city, state, zip } }],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[BatchData] API error: ${res.status} ${text}`)
      return null
    }

    const data = await res.json()
    const properties = data.results?.properties ?? []
    if (properties.length === 0) {
      console.warn(`[BatchData] No match for ${street}, ${city}, ${state} ${zip}`)
      return null
    }

    const p = properties[0] as Record<string, unknown>
    const address = (p.address ?? {}) as Record<string, unknown>
    const valuation = (p.valuation ?? {}) as Record<string, unknown>
    const owner = (p.owner ?? {}) as Record<string, unknown>
    const listing = (p.listing ?? {}) as Record<string, unknown>
    const quickLists = (p.quickLists ?? {}) as Record<string, unknown>
    const openLien = (p.openLien ?? {}) as Record<string, unknown>
    const permit = (p.permit ?? {}) as Record<string, unknown>
    const deedHistory = (p.deedHistory ?? []) as Array<Record<string, unknown>>
    const ownerProfile = (p.propertyOwnerProfile ?? {}) as Record<string, unknown>
    const ids = (p.ids ?? {}) as Record<string, unknown>

    // Get most recent deed with a sale price > 0
    const lastSale = deedHistory.find(d => (d.salePrice as number) > 0)

    // Owner mailing address
    const ownerMailing = (owner.mailingAddress ?? {}) as Record<string, unknown>
    const mailingStr = ownerMailing.street
      ? `${ownerMailing.street}, ${ownerMailing.city ?? ''} ${ownerMailing.state ?? ''} ${ownerMailing.zip ?? ''}`.trim()
      : undefined

    return {
      // Valuation
      estimatedValue: num(valuation.estimatedValue),
      assessedValue: num(ownerProfile.averageAssessedValue),
      priceRangeMin: num(valuation.priceRangeMin),
      priceRangeMax: num(valuation.priceRangeMax),
      confidenceScore: num(valuation.confidenceScore),
      equityPercent: num(valuation.equityPercent),
      ltv: num(valuation.ltv),
      apn: str(ids.apn),

      // Building
      bedrooms: num(listing.bedroomCount ?? listing.bedrooms),
      bathrooms: num(listing.bathroomCount ?? listing.bathrooms),
      squareFootage: num(listing.squareFootage ?? listing.livingSquareFootage),
      lotSquareFootage: num(listing.lotSizeSquareFeet ?? listing.lotSquareFootage),
      yearBuilt: num(listing.yearBuilt),
      propertyType: str(listing.propertyType ?? p.propertyType),

      // Owner
      ownerName: str(owner.fullName),
      ownerMailingAddress: mailingStr,
      absenteeOwner: quickLists.absenteeOwner === true,
      ownerOccupied: quickLists.ownerOccupied === true,

      // Quick flags
      cashBuyer: quickLists.cashBuyer === true,
      freeAndClear: quickLists.freeAndClear === true,
      highEquity: quickLists.highEquity === true,
      taxDefault: quickLists.taxDefault === true,
      preforeclosure: quickLists.preforeclosure === true,
      vacant: quickLists.vacant === true,
      corporateOwned: quickLists.corporateOwned === true,
      trustOwned: quickLists.trustOwned === true,

      // Liens
      totalOpenLienCount: num(openLien.totalOpenLienCount),

      // Sale history
      lastSaleDate: str(lastSale?.saleDate ?? lastSale?.recordingDate),
      lastSalePrice: num(lastSale?.salePrice),
      lastSaleType: str(lastSale?.documentType),

      // Permits
      permitCount: num(permit.permitCount),
      permitTags: Array.isArray(permit.allTags) ? permit.allTags.map(String) : undefined,

      // Location
      latitude: num(address.latitude),
      longitude: num(address.longitude),
      county: str(address.county),

      raw: p,
    }
  } catch (err) {
    console.error('[BatchData] Lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  return String(v)
}
