// GET /api/properties/[propertyId]/buyers — match buyers from GHL custom fields
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { CONTACT_FIELDS, TIER_MAP, getMarketsForZip } from '@/lib/config/crm.config'

// GHL custom field ID → field name mapping (from live GHL location)
// These are the actual field IDs from the New Again Houses GHL account
const GHL_FIELD_MAP: Record<string, string> = {
  'Y4ton500NvCkJKtb4YzP': 'buyer_tier',
  'ghOapC4jq1iSzmCzv5up': 'markets',
  'VcdWDP2lXuuV1LwedOhs': 'buybox',
  'RbNnV6OxCiF6ai2krkyy': 'response_speed',
  'IZdG26j5rw0yiU1jvDEo': 'verified_funding',
  'FRyMcgqWes9BuWqo97HF': 'last_contact_date',
  '4qyjtjm5DWVgFgMCHdqQ': 'notes',
  'DOGXpCgOc2jMoWwY4dpc': 'secondary_market',
}

// Parse GHL custom fields into structured buyer data
function parseBuyerFields(contact: {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string
  city?: string
  state?: string
  tags: string[]
  customFields: Array<{ id: string; value: unknown }>
}) {
  const fields = contact.customFields ?? []
  const fieldMap = new Map<string, unknown>()
  for (const f of fields) {
    const fieldName = GHL_FIELD_MAP[f.id]
    if (fieldName) fieldMap.set(fieldName, f.value)
  }

  // Helper to get string value (GHL returns strings or arrays)
  const getStr = (key: string): string => {
    const v = fieldMap.get(key)
    if (!v) return ''
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }

  const getArr = (key: string): string[] => {
    const v = fieldMap.get(key)
    if (!v) return []
    if (Array.isArray(v)) return v.map(String)
    return String(v).split(/[,;|]/).map(m => m.trim()).filter(Boolean)
  }

  const tierRaw = getStr('buyer_tier')
  const tier = TIER_MAP[tierRaw] ?? 'unqualified'

  // Verified funding: GHL returns ["Yes"] as array
  const fundingVal = getStr('verified_funding').toLowerCase()
  const verifiedFunding = fundingVal === 'yes' || fundingVal === 'true' || fundingVal === '1'

  const responseSpeed = getStr('response_speed')
  const buybox = getStr('buybox')
  const buyerNotes = getStr('notes')

  // Secondary market — one-off deal markets
  const secondaryMarkets = getArr('secondary_market')

  // Markets from custom field, fallback to tags, then city
  let markets = getArr('markets')
  if (markets.length === 0 && contact.tags?.length) {
    // Tags often contain market names (e.g. "morristown", "knoxville")
    markets = contact.tags.filter(t => !['buyer', 'flipper', 'rental', 'wholesale'].includes(t.toLowerCase()))
  }
  if (markets.length === 0 && contact.city) {
    markets = [contact.city]
  }

  return {
    id: contact.id,
    name: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
    phone: contact.phone,
    email: contact.email,
    tier,
    markets,
    secondaryMarkets,
    buybox,
    verifiedFunding,
    hasPurchased: false,
    responseSpeed,
    buyerNotes,
    tags: contact.tags ?? [],
  }
}

// Score a buyer against a property (0-100)
function scoreBuyer(buyer: ReturnType<typeof parseBuyerFields>, propertyMarkets: string[], propertyCity: string | null, propertyType?: string | null): number {
  let score = 0

  // Market match targets: property market names + city
  const matchTargets = [...propertyMarkets]
  if (propertyCity) matchTargets.push(propertyCity)

  const matchesMarket = (markets: string[]) => markets.some(m =>
    matchTargets.some(pm =>
      pm.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(pm.toLowerCase())
    )
  )

  // Primary market match: +40
  // If buyer has "Other" in markets, their secondary_market is their real market
  const primaryMarkets = buyer.markets.filter(m => m.toLowerCase() !== 'other')
  if (matchesMarket(primaryMarkets)) {
    score += 40
  }

  // Secondary market match: +20 (one-off deal markets, or "Other" market details)
  if (buyer.secondaryMarkets.length > 0 && matchesMarket(buyer.secondaryMarkets)) {
    score += 20
  }

  // Buybox matches property type or general wholesaling: +20
  if (buyer.buybox) {
    const bbLower = buyer.buybox.toLowerCase()
    if (bbLower.includes('flip') || bbLower.includes('rental') || bbLower.includes('wholesale')) {
      score += 20 // General wholesaling buyer
    }
    if (propertyType) {
      const ptLower = propertyType.toLowerCase()
      if (bbLower.includes(ptLower) || ptLower.includes(bbLower)) score += 20
    }
  }

  // Tier bonus: priority=+15, qualified=+10, jv=+5
  if (buyer.tier === 'priority') score += 15
  else if (buyer.tier === 'qualified') score += 10
  else if (buyer.tier === 'jv') score += 5

  // Verified funding: +10
  if (buyer.verifiedFunding) score += 10

  // Response speed: +5 for same day/fast
  const speed = buyer.responseSpeed?.toLowerCase() ?? ''
  if (speed === 'same day' || speed === 'fast') score += 5

  return Math.min(score, 100)
}

export async function GET(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId

    const property = await db.property.findUnique({
      where: { id: params.propertyId, tenantId },
      select: { city: true, state: true, zip: true, propertyType: true },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // Determine which markets this property is in
    const propertyMarkets = property.zip
      ? getMarketsForZip(property.zip).map(String)
      : property.city ? [property.city] : []

    // Search GHL for buyer contacts
    const ghl = await getGHLClient(tenantId)
    let ghlBuyers: ReturnType<typeof parseBuyerFields>[] = []

    try {
      // Search for contacts — get a broad set, then filter by those with buyer fields
      const result = await ghl.searchContacts({ limit: 100 })
      ghlBuyers = (result.contacts ?? []).map(c => parseBuyerFields({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        city: c.city,
        state: c.state,
        tags: c.tags ?? [],
        customFields: c.customFields ?? [],
      })).filter(b => b.name && (b.tier !== 'unqualified' || b.buybox || b.verifiedFunding || b.markets.length > 0))
    } catch (err) {
      console.error('[Buyers] GHL search failed:', err instanceof Error ? err.message : err)
    }

    // Also include local buyers
    const localBuyers = await db.buyer.findMany({
      where: { tenantId, isActive: true },
    })

    // Merge local buyers (dedup by phone/email)
    const seenPhones = new Set(ghlBuyers.map(b => b.phone).filter(Boolean))
    const seenEmails = new Set(ghlBuyers.map(b => b.email?.toLowerCase()).filter(Boolean))

    for (const lb of localBuyers) {
      if (lb.phone && seenPhones.has(lb.phone)) continue
      if (lb.email && seenEmails.has(lb.email.toLowerCase())) continue

      const tags = Array.isArray(lb.tags) ? lb.tags as string[] : []
      const tagsLower = tags.map(t => t.toLowerCase())
      let tier: 'priority' | 'qualified' | 'jv' | 'unqualified' = 'unqualified'
      if (tagsLower.some(t => t.includes('priority') || t === 'a')) tier = 'priority'
      else if (tagsLower.some(t => t.includes('qualified') || t === 'b')) tier = 'qualified'
      else if (tagsLower.some(t => t.includes('jv') || t === 'c')) tier = 'jv'

      const markets = Array.isArray(lb.markets) ? lb.markets as string[] : []

      ghlBuyers.push({
        id: lb.id,
        name: lb.name,
        phone: lb.phone ?? '',
        email: lb.email ?? '',
        tier,
        markets,
        secondaryMarkets: [],
        buybox: '',
        verifiedFunding: false,
        hasPurchased: false,
        responseSpeed: '',
        buyerNotes: lb.notes ?? '',
        tags: Array.isArray(lb.tags) ? lb.tags as string[] : [],
      })
    }

    // Score all buyers
    const matched = ghlBuyers
      .map(b => ({
        ...b,
        matchScore: scoreBuyer(b, propertyMarkets, property.city, property.propertyType),
      }))
      .filter(b => b.matchScore > 0)
      .sort((a, b) => {
        const tierOrder = { priority: 0, qualified: 1, jv: 2, unqualified: 3 }
        const tierDiff = tierOrder[a.tier] - tierOrder[b.tier]
        if (tierDiff !== 0) return tierDiff
        return b.matchScore - a.matchScore
      })

    return NextResponse.json({ buyers: matched, total: matched.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to match buyers' }, { status: 500 })
  }
}
