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
  fips?: string
  subdivision?: string

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
  ownerPhone?: string
  ownerEmail?: string
  absenteeOwner?: boolean
  ownerOccupied?: boolean
  secondOwnerName?: string
  secondOwnerPhone?: string
  secondOwnerEmail?: string

  // Quick flags
  cashBuyer?: boolean
  freeAndClear?: boolean
  highEquity?: boolean
  taxDefault?: boolean
  preforeclosure?: boolean
  vacant?: boolean
  corporateOwned?: boolean
  trustOwned?: boolean
  bankOwned?: boolean

  // Vacancy detail (4 orthogonal flags)
  vacantStatus?: string
  vacantStatusYear?: number
  siteVacant?: boolean
  mailVacant?: boolean

  // Liens
  totalOpenLienCount?: number
  totalOpenLienAmount?: number
  lienTypes?: string[]
  judgmentCount?: number

  // Tax delinquent
  taxDelinquent?: boolean
  taxDelinquentAmount?: number

  // Foreclosure
  foreclosureStatus?: string
  nodDate?: string
  lisPendensDate?: string
  lisPendensAmount?: number
  lisPendensPlaintiff?: string
  foreclosureAuctionDate?: string
  foreclosureOpeningBid?: number

  // Deed history
  lastSaleDate?: string
  lastSalePrice?: number
  lastSaleType?: string
  deedType?: string
  transferCount?: number

  // Permit summary
  permitCount?: number
  permitTags?: string[]

  // Coordinates
  latitude?: number
  longitude?: number
  county?: string

  // Additional building details
  stories?: number
  units?: number
  garageSpaces?: number
  garageType?: string
  pool?: boolean
  hasDeck?: boolean
  hasPorch?: boolean
  hasSolar?: boolean
  hasFireplace?: boolean
  hasSpa?: boolean
  basementFinishedPercent?: number
  foundation?: string
  roofType?: string
  heatingType?: string
  coolingType?: string
  exteriorWalls?: string

  // Tax info
  taxAssessedValue?: number
  taxYear?: number
  annualTaxAmount?: number

  // School district
  schoolDistrict?: string

  // Zoning
  zoning?: string
  zoningDescription?: string
  landUseCode?: string

  // Environmental
  floodZone?: string
  earthquakeZone?: string
  wildfireRisk?: string

  // Additional owner info
  ownerType?: string // individual, corporate, trust
  ownershipLength?: number // years since last deed

  // Mortgage info
  mortgageAmount?: number
  mortgageLender?: string
  mortgageDate?: string
  mortgageType?: string
  mortgageRate?: number
  mortgageAssumable?: boolean

  // Second mortgage / HELOC
  secondMortgageAmount?: number
  secondMortgageLender?: string
  secondMortgageDate?: string

  // Tier 3 — PropertyRadar distress composite + legal flags
  distressScore?: number
  inBankruptcy?: boolean
  inProbate?: boolean
  inDivorce?: boolean
  hasRecentEviction?: boolean
  isRecentFlip?: boolean
  isRecentSale?: boolean
  isListedForSale?: boolean
  isAuction?: boolean

  // Tier 3 — equity detail
  availableEquity?: number
  estimatedEquity?: number
  equityPercentTier3?: number // dedicated column; equityPercent on line 20 is legacy BatchData AVM-derived
  openMortgageBalance?: number
  estimatedMortgagePayment?: number

  // Tier 3 — inheritance / death transfer (REAPI)
  inherited?: boolean
  deathTransfer?: boolean

  // Tier 3 — MLS activity (REAPI)
  mlsActive?: boolean
  mlsPending?: boolean
  mlsSold?: boolean
  mlsCancelled?: boolean
  mlsFailed?: boolean
  mlsStatus?: string
  mlsType?: string
  mlsListingDate?: string
  mlsListingPrice?: number
  mlsSoldPrice?: number
  mlsDaysOnMarket?: number
  mlsPricePerSqft?: number
  mlsKeywords?: string[]
  mlsLastStatusDate?: string

  // Tier 3 — flood detail
  floodZoneType?: string

  // Tier 3 — REAPI demographics / HUD area data
  suggestedRent?: number
  medianIncome?: number
  hudAreaCode?: string
  hudAreaName?: string
  fmrYear?: number
  fmrEfficiency?: number
  fmrOneBedroom?: number
  fmrTwoBedroom?: number
  fmrThreeBedroom?: number
  fmrFourBedroom?: number

  // Tier 3 — schools (REAPI returns array)
  schoolPrimaryName?: string
  schoolPrimaryRating?: number
  schools?: Array<Record<string, unknown>>

  // PropertyRadar subscription extras (structured owner names + MLS history
  // + HOA + appreciation). All optional; trial keys return subset.
  ownerFirstName1?: string
  ownerLastName1?: string
  ownerFirstName2?: string
  ownerLastName2?: string
  pctChangeInValue?: number
  cashSale?: boolean
  investorType?: string
  hoaDues?: number
  hoaPastDue?: boolean
  hoaName?: string
  lastMlsStatus?: string
  lastMlsListPrice?: number
  lastMlsSoldPrice?: number
  ownerMailingVacant?: boolean

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
    const building = (p.building ?? {}) as Record<string, unknown>
    const quickLists = (p.quickLists ?? {}) as Record<string, unknown>
    const openLien = (p.openLien ?? {}) as Record<string, unknown>
    const permit = (p.permit ?? {}) as Record<string, unknown>
    const deedHistory = (p.deedHistory ?? []) as Array<Record<string, unknown>>
    const ownerProfile = (p.propertyOwnerProfile ?? {}) as Record<string, unknown>
    const ids = (p.ids ?? {}) as Record<string, unknown>
    const tax = (p.tax ?? p.assessor ?? {}) as Record<string, unknown>
    const mortgage = (p.mortgage ?? {}) as Record<string, unknown>
    const mortgages = Array.isArray(p.mortgages) ? p.mortgages as Array<Record<string, unknown>> : []
    const latestMortgage = mortgages[0] ?? mortgage
    const secondMortgage = mortgages[1] ?? {}
    const school = (p.school ?? {}) as Record<string, unknown>
    const zoning = (p.zoning ?? {}) as Record<string, unknown>
    const foreclosure = (p.foreclosure ?? p.foreclosureInfo ?? {}) as Record<string, unknown>
    const legal = (p.legal ?? p.legalDescription ?? {}) as Record<string, unknown>
    const environmental = (p.environmental ?? {}) as Record<string, unknown>
    const vacancy = (p.vacancy ?? {}) as Record<string, unknown>
    const phones = Array.isArray(p.phoneNumbers) ? p.phoneNumbers as Array<Record<string, unknown>> : []
    const emails = Array.isArray(p.emails) ? p.emails as Array<Record<string, unknown>> : []
    const openLiens = Array.isArray(p.openLiens)
      ? p.openLiens as Array<Record<string, unknown>>
      : Array.isArray(openLien.liens)
      ? openLien.liens as Array<Record<string, unknown>>
      : []
    const judgments = Array.isArray(p.judgments) ? p.judgments as Array<Record<string, unknown>> : []

    // Get most recent deed with a sale price > 0
    const lastSale = deedHistory.find(d => (d.salePrice as number) > 0)

    // Owner mailing address
    const ownerMailing = (owner.mailingAddress ?? {}) as Record<string, unknown>
    const mailingStr = ownerMailing.street
      ? `${ownerMailing.street}, ${ownerMailing.city ?? ''} ${ownerMailing.state ?? ''} ${ownerMailing.zip ?? ''}`.trim()
      : undefined

    // Skip-trace — BatchData returns arrays of phones/emails when the
    // propertyOwnerProfile add-on is enabled. First non-litigious wins.
    const primaryPhoneObj = phones.find(p => p.phone || p.number)
    const primaryEmailObj = emails.find(e => e.email || e.address)
    const secondaryPhoneObj = phones.find((p, idx) => idx > 0 && (p.phone || p.number))
    const secondaryEmailObj = emails.find((e, idx) => idx > 0 && (e.email || e.address))
    const pickPhone = (o?: Record<string, unknown>): string | undefined =>
      o ? (str(o.phone) ?? str(o.number)) : undefined
    const pickEmail = (o?: Record<string, unknown>): string | undefined =>
      o ? (str(o.email) ?? str(o.address)) : undefined

    // Lien aggregates
    const lienAmountSum =
      num(openLien.totalOpenLienAmount) ??
      (openLiens.length > 0
        ? openLiens.reduce((s, l) => s + (Number(l.amount ?? l.lienAmount ?? 0) || 0), 0)
        : undefined)
    const lienTypeSet = new Set<string>()
    for (const l of openLiens) {
      const t = str(l.lienType ?? l.type)
      if (t) lienTypeSet.add(t)
    }

    // Tax delinquent
    const taxDelinquentFlag = quickLists.taxDefault === true
      ? true
      : typeof tax.taxDelinquentYear === 'number' && tax.taxDelinquentYear > 0
      ? true
      : undefined
    const taxDelinquentAmount = num(tax.taxDelinquentAmount ?? tax.delinquentAmount)

    // Foreclosure block — BatchData returns a rich `foreclosure` object when
    // the property is in distress. Fall back to quickLists signals otherwise.
    const foreclosureStatus = str(foreclosure.status ?? foreclosure.stage)
      ?? (quickLists.bankOwned === true ? 'reo' : undefined)
      ?? (quickLists.preforeclosure === true ? 'preforeclosure' : undefined)

    // Deed type, transfer count
    const deedType = str(lastSale?.documentType ?? lastSale?.deedType)
    const transferCount = deedHistory.length || undefined

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
      fips: str(ids.fips ?? address.fipsCode ?? address.fips),
      subdivision: str(address.subdivision ?? legal.subdivision),

      // Building
      bedrooms: num(listing.bedroomCount ?? listing.bedrooms ?? building.bedroomCount),
      bathrooms: num(listing.bathroomCount ?? listing.bathrooms ?? building.bathroomCount),
      squareFootage: num(listing.squareFootage ?? listing.livingSquareFootage ?? building.totalLivingArea),
      lotSquareFootage: num(listing.lotSizeSquareFeet ?? listing.lotSquareFootage ?? building.lotSquareFootage),
      yearBuilt: num(listing.yearBuilt ?? building.yearBuilt),
      propertyType: str(listing.propertyType ?? p.propertyType),

      // Owner
      ownerName: str(owner.fullName),
      ownerMailingAddress: mailingStr,
      ownerPhone: pickPhone(primaryPhoneObj),
      ownerEmail: pickEmail(primaryEmailObj),
      absenteeOwner: quickLists.absenteeOwner === true,
      ownerOccupied: quickLists.ownerOccupied === true,
      secondOwnerName: str(owner.secondOwnerName ?? owner.coOwnerName),
      secondOwnerPhone: pickPhone(secondaryPhoneObj),
      secondOwnerEmail: pickEmail(secondaryEmailObj),

      // Quick flags
      cashBuyer: quickLists.cashBuyer === true,
      freeAndClear: quickLists.freeAndClear === true,
      highEquity: quickLists.highEquity === true,
      taxDefault: quickLists.taxDefault === true,
      preforeclosure: quickLists.preforeclosure === true,
      vacant: quickLists.vacant === true,
      corporateOwned: quickLists.corporateOwned === true,
      trustOwned: quickLists.trustOwned === true,
      bankOwned: quickLists.bankOwned === true,

      // Vacancy detail
      vacantStatus: str(vacancy.status ?? (quickLists.vacant === true ? 'vacant' : undefined)),
      vacantStatusYear: num(vacancy.year ?? vacancy.vacantSince),
      siteVacant: vacancy.siteVacant === true ? true : undefined,
      mailVacant: vacancy.mailVacant === true ? true : undefined,

      // Liens
      totalOpenLienCount: num(openLien.totalOpenLienCount) ?? (openLiens.length || undefined),
      totalOpenLienAmount: lienAmountSum,
      lienTypes: lienTypeSet.size > 0 ? [...lienTypeSet] : undefined,
      judgmentCount: judgments.length || undefined,

      // Tax delinquent
      taxDelinquent: taxDelinquentFlag,
      taxDelinquentAmount,

      // Foreclosure
      foreclosureStatus,
      nodDate: str(foreclosure.nodDate ?? foreclosure.noticeOfDefaultDate),
      lisPendensDate: str(foreclosure.lisPendensDate),
      lisPendensAmount: num(foreclosure.lisPendensAmount),
      lisPendensPlaintiff: str(foreclosure.lisPendensPlaintiff ?? foreclosure.plaintiff),
      foreclosureAuctionDate: str(foreclosure.auctionDate ?? foreclosure.saleDate),
      foreclosureOpeningBid: num(foreclosure.openingBid ?? foreclosure.minimumBid),

      // Sale history
      lastSaleDate: str(lastSale?.saleDate ?? lastSale?.recordingDate),
      lastSalePrice: num(lastSale?.salePrice),
      lastSaleType: str(lastSale?.documentType),
      deedType,
      transferCount,

      // Permits
      permitCount: num(permit.permitCount),
      permitTags: Array.isArray(permit.allTags) ? permit.allTags.map(String) : undefined,

      // Location
      latitude: num(address.latitude),
      longitude: num(address.longitude),
      county: str(address.county),

      // Additional building
      stories: num(listing.stories ?? listing.numberOfStories ?? building.stories),
      units: num(listing.unitCount ?? listing.units ?? building.unitCount),
      garageSpaces: num(listing.garageSpaces ?? listing.garageCount ?? building.garageSpaces),
      garageType: str(listing.garageType ?? building.garageType),
      pool: listing.pool === true || listing.hasPool === true || listing.poolType != null ? true : undefined,
      hasDeck: listing.hasDeck === true || listing.deck === true ? true : undefined,
      hasPorch: listing.hasPorch === true || listing.porch === true ? true : undefined,
      hasSolar: listing.hasSolar === true || listing.solar === true || quickLists.solar === true ? true : undefined,
      hasFireplace: listing.hasFireplace === true || listing.fireplace === true ? true : undefined,
      hasSpa: listing.hasSpa === true || listing.spa === true ? true : undefined,
      basementFinishedPercent: num(listing.basementFinishedPercent ?? building.basementFinishedPercent),
      foundation: str(listing.foundationType ?? listing.foundation),
      roofType: str(listing.roofType ?? listing.roofMaterial),
      heatingType: str(listing.heatingType ?? listing.heating),
      coolingType: str(listing.coolingType ?? listing.cooling),
      exteriorWalls: str(listing.exteriorWalls ?? listing.construction),

      // Tax
      taxAssessedValue: num(tax.totalAssessedValue ?? tax.assessedValue ?? ownerProfile.averageAssessedValue),
      taxYear: num(tax.assessmentYear ?? tax.taxYear),
      annualTaxAmount: num(tax.annualTaxAmount ?? tax.taxAmount),

      // School
      schoolDistrict: str(address.schoolDistrict ?? school.district),

      // Zoning + land use
      zoning: str(listing.zoning ?? zoning.code),
      zoningDescription: str(listing.zoningDescription ?? zoning.description),
      landUseCode: str(listing.landUseCode ?? zoning.landUseCode ?? legal.landUseCode),

      // Environmental risk
      floodZone: str(environmental.floodZone ?? address.floodZone),
      earthquakeZone: str(environmental.earthquakeZone),
      wildfireRisk: str(environmental.wildfireRisk),

      // Owner type
      ownerType: str(owner.ownerType ?? (quickLists.corporateOwned === true ? 'corporate' : quickLists.trustOwned === true ? 'trust' : 'individual')),
      ownershipLength: lastSale?.saleDate ? Math.floor((Date.now() - new Date(lastSale.saleDate as string).getTime()) / (1000 * 60 * 60 * 24 * 365)) : undefined,

      // Mortgage
      mortgageAmount: num(latestMortgage.amount ?? latestMortgage.loanAmount),
      mortgageLender: str(latestMortgage.lender ?? latestMortgage.lenderName),
      mortgageDate: str(latestMortgage.date ?? latestMortgage.recordingDate),
      mortgageType: str(latestMortgage.loanType ?? latestMortgage.type),
      mortgageRate: num(latestMortgage.interestRate ?? latestMortgage.rate),

      // Second mortgage / HELOC
      secondMortgageAmount: num(secondMortgage.amount ?? secondMortgage.loanAmount),
      secondMortgageLender: str(secondMortgage.lender ?? secondMortgage.lenderName),
      secondMortgageDate: str(secondMortgage.date ?? secondMortgage.recordingDate),

      raw: p,
    }
  } catch (err) {
    console.error('[BatchData] Lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Skip-trace ────────────────────────────────────────────────────────
// Separate endpoint (~$0.07/call) that resolves an owner name + property
// address to phones and emails, with DNC flags and reachability scores.
// We split this out so the base `lookupProperty` stays cheap — skip-trace
// only fires when a Seller is linked and missing contact data.

export interface SkipTracePhone {
  number: string
  type?: string           // "Mobile" | "Land Line"
  carrier?: string
  reachable?: boolean
  dnc?: boolean           // true = Do Not Call
  score?: number          // 0-100 confidence
  lastReportedDate?: string
}

export interface SkipTraceEmail {
  email: string
  tested?: boolean
}

export interface SkipTraceResult {
  name?: { first?: string; middle?: string; last?: string; full?: string }
  phones: SkipTracePhone[]
  emails: SkipTraceEmail[]
  personDnc?: boolean
  isDeceased?: boolean
  hasBankruptcy?: boolean
  hasInvoluntaryLien?: boolean
  isLitigator?: boolean
  mailingAddress?: { street?: string; city?: string; state?: string; zip?: string }
  raw?: Record<string, unknown>
}

/**
 * Run BatchData skip-trace against a single owner + property address.
 * Returns null on API failure or no-match. Name is required to match —
 * BatchData's skip-trace is name-scoped, not purely address-scoped.
 */
export async function skipTraceProperty(
  street: string, city: string, state: string, zip: string,
  name: { first?: string; middle?: string; last?: string; full?: string },
): Promise<SkipTraceResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/property/skip-trace`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          propertyAddress: { street, city, state, zip },
          name,
        }],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[BatchData-SkipTrace] API error: ${res.status} ${text}`)
      return null
    }

    const data = await res.json() as { results?: { persons?: Array<Record<string, unknown>> } }
    const person = data.results?.persons?.[0]
    if (!person) {
      console.warn(`[BatchData-SkipTrace] no match for ${name.full ?? `${name.first} ${name.last}`} @ ${street}`)
      return null
    }

    const phoneNumbers = Array.isArray(person.phoneNumbers) ? person.phoneNumbers as Array<Record<string, unknown>> : []
    const emails = Array.isArray(person.emails) ? person.emails as Array<Record<string, unknown>> : []
    const mailing = (person.mailingAddress ?? {}) as Record<string, unknown>

    return {
      name: (person.name ?? undefined) as SkipTraceResult['name'],
      phones: phoneNumbers.map(p => ({
        number: String(p.number ?? ''),
        type: str(p.type),
        carrier: str(p.carrier),
        reachable: p.reachable === true,
        dnc: p.dnc === true,
        score: num(p.score),
        lastReportedDate: str(p.lastReportedDate),
      })).filter(p => p.number),
      emails: emails.map(e => ({
        email: String(e.email ?? ''),
        tested: e.tested === true,
      })).filter(e => e.email),
      personDnc: person.dnc === true,
      isDeceased: person.death === true,
      hasBankruptcy: person.bankruptcy === true,
      hasInvoluntaryLien: person.involuntaryLien === true,
      isLitigator: person.litigator === true,
      mailingAddress: {
        street: str(mailing.street),
        city: str(mailing.city),
        state: str(mailing.state),
        zip: str(mailing.zip),
      },
      raw: person,
    }
  } catch (err) {
    console.error('[BatchData-SkipTrace] failed:', err instanceof Error ? err.message : err)
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
