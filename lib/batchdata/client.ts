// lib/batchdata/client.ts
// BatchData API client — property data enrichment
// Docs: https://developer.batchdata.com/docs/batchdata/batchdata-v1

const BASE_URL = 'https://api.batchdata.com/api/v1'

function getApiKey(): string {
  const key = process.env.BATCHDATA_API_KEY
  if (!key) throw new Error('BATCHDATA_API_KEY not configured')
  return key
}

async function request<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BatchData ${endpoint} failed: ${res.status} ${text}`)
  }

  return res.json()
}

// ─── Property Lookup ───────────────────────────────────────────────────────

export interface BatchDataPropertyResult {
  // Valuation
  estimatedValue?: number
  assessedValue?: number
  assessedLandValue?: number
  assessedImprovementValue?: number
  taxAmount?: number

  // Property details
  bedrooms?: number
  bathrooms?: number
  squareFootage?: number
  lotSquareFootage?: number
  yearBuilt?: number
  stories?: number
  propertyType?: string
  propertyTypeDetail?: string
  constructionType?: string
  heatingType?: string
  coolingType?: string
  pool?: boolean
  garage?: boolean
  garageSpaces?: number

  // Owner info
  ownerName?: string
  ownerType?: string // individual, corporate, trust
  mailingAddress?: string
  mailingCity?: string
  mailingState?: string
  mailingZip?: string
  absenteeOwner?: boolean
  ownershipLength?: number // years

  // Financial
  openLienCount?: number
  lenderName?: string
  loanAmount?: number
  loanType?: string
  loanDate?: string
  loanToValue?: number
  equityPercent?: number

  // History
  lastSaleDate?: string
  lastSalePrice?: number

  // Distress
  preForeclosure?: boolean
  foreclosureDate?: string
  defaultAmount?: number

  // Raw response for storage
  raw?: Record<string, unknown>
}

export async function lookupProperty(
  street: string, city: string, state: string, zip: string,
): Promise<BatchDataPropertyResult | null> {
  try {
    const data = await request<Record<string, unknown>>('/property/lookup/sync', {
      requests: [{
        address: { street, city, state, zip },
      }],
    })

    const results = (data.results as Record<string, unknown>[]) ?? []
    if (results.length === 0) return null

    const r = results[0] as Record<string, unknown>
    const prop = (r.property ?? r) as Record<string, unknown>
    const building = (prop.building ?? prop) as Record<string, unknown>
    const lot = (prop.lot ?? prop) as Record<string, unknown>
    const valuation = (prop.valuation ?? prop) as Record<string, unknown>
    const owner = (prop.owner ?? prop) as Record<string, unknown>
    const mortgage = (prop.mortgage ?? prop) as Record<string, unknown>
    const sale = (prop.lastSale ?? prop.sale ?? prop) as Record<string, unknown>
    const foreclosure = (prop.foreclosure ?? prop.preForeclosure ?? {}) as Record<string, unknown>

    return {
      // Valuation
      estimatedValue: num(valuation.estimatedValue ?? valuation.marketValue),
      assessedValue: num(valuation.assessedValue ?? valuation.totalAssessedValue),
      assessedLandValue: num(valuation.assessedLandValue ?? valuation.landValue),
      assessedImprovementValue: num(valuation.assessedImprovementValue ?? valuation.improvementValue),
      taxAmount: num(valuation.taxAmount ?? valuation.annualTax),

      // Building
      bedrooms: num(building.bedrooms ?? building.beds),
      bathrooms: num(building.bathrooms ?? building.baths ?? building.totalBathrooms),
      squareFootage: num(building.squareFootage ?? building.livingSquareFootage ?? building.totalSquareFootage),
      lotSquareFootage: num(lot.lotSquareFootage ?? lot.lotSize ?? lot.lotSizeSquareFeet),
      yearBuilt: num(building.yearBuilt),
      stories: num(building.stories),
      propertyType: str(prop.propertyType ?? prop.propertyTypeDetail),
      propertyTypeDetail: str(prop.propertyTypeDetail ?? prop.propertySubType),
      constructionType: str(building.constructionType ?? building.exteriorWalls),
      heatingType: str(building.heatingType ?? building.heating),
      coolingType: str(building.coolingType ?? building.cooling),
      pool: toBool(building.pool),
      garage: toBool(building.garage),
      garageSpaces: num(building.garageSpaces ?? building.parkingSpaces),

      // Owner
      ownerName: str(owner.ownerName ?? owner.name ?? owner.owner1FullName),
      ownerType: str(owner.ownerType ?? owner.ownerOccupiedStatus),
      mailingAddress: str(owner.mailingAddress ?? owner.mailAddress),
      mailingCity: str(owner.mailingCity ?? owner.mailCity),
      mailingState: str(owner.mailingState ?? owner.mailState),
      mailingZip: str(owner.mailingZip ?? owner.mailZip),
      absenteeOwner: toBool(owner.absenteeOwner ?? owner.isAbsenteeOwner),
      ownershipLength: num(owner.ownershipLength ?? owner.yearsOwned),

      // Mortgage
      openLienCount: num(mortgage.openLienCount ?? mortgage.lienCount),
      lenderName: str(mortgage.lenderName ?? mortgage.lender),
      loanAmount: num(mortgage.loanAmount ?? mortgage.amount),
      loanType: str(mortgage.loanType ?? mortgage.type),
      loanDate: str(mortgage.loanDate ?? mortgage.originationDate),
      loanToValue: num(mortgage.loanToValue ?? mortgage.ltv),
      equityPercent: num(valuation.equityPercent ?? valuation.equity),

      // History
      lastSaleDate: str(sale.saleDate ?? sale.lastSaleDate ?? sale.recordingDate),
      lastSalePrice: num(sale.salePrice ?? sale.lastSalePrice ?? sale.amount),

      // Distress
      preForeclosure: toBool(foreclosure.preForeclosure ?? foreclosure.isPreForeclosure ?? foreclosure.status),
      foreclosureDate: str(foreclosure.filingDate ?? foreclosure.auctionDate),
      defaultAmount: num(foreclosure.defaultAmount ?? foreclosure.amount),

      raw: r as Record<string, unknown>,
    }
  } catch (err) {
    console.error('[BatchData] Lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  return String(v)
}

function toBool(v: unknown): boolean | undefined {
  if (v == null) return undefined
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase()
  if (s === 'true' || s === 'yes' || s === '1' || s === 'y') return true
  if (s === 'false' || s === 'no' || s === '0' || s === 'n') return false
  return undefined
}
