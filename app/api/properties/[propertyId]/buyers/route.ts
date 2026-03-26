// GET /api/properties/[propertyId]/buyers — match buyers from GHL custom fields
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { CONTACT_FIELDS, TIER_MAP, getMarketsForZip } from '@/lib/config/crm.config'

// Extract a custom field value from GHL contact by field label
function getCustomField(customFields: Array<{ id: string; value: string }>, label: string): string {
  // GHL custom fields have IDs, not labels — but the value is what we match
  // We search by checking if any field value matches expected patterns
  for (const f of customFields) {
    if (f.id.toLowerCase().includes(label.toLowerCase()) || f.value) {
      // Return the value for now — in production, map field IDs from GHL custom fields API
    }
  }
  return ''
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
  customFields: Array<{ id: string; value: string }>
}) {
  const fields = contact.customFields ?? []
  const fieldMap = new Map<string, string>()
  for (const f of fields) {
    fieldMap.set(f.id, f.value)
  }

  // Find fields by label patterns in field IDs (GHL uses field IDs like "buyer_tier", "buybox" etc.)
  const findField = (pattern: string): string => {
    for (const [id, value] of fieldMap) {
      if (id.toLowerCase().includes(pattern.toLowerCase())) return value
    }
    // Also check tags for tier info
    return ''
  }

  const tierRaw = findField('buyer_tier') || findField('tier')
  const tier = TIER_MAP[tierRaw] ?? 'unqualified'
  const verifiedFunding = findField('verified_funding').toLowerCase() === 'true' || findField('verified_funding') === '1'
  const hasPurchased = findField('has_purchased_before').toLowerCase() === 'true' || findField('has_purchased_before') === '1'
  const responseSpeed = findField('response_speed')
  const buybox = findField('buybox')
  const marketsRaw = findField('markets')
  const secondaryMarket = findField('secondary_market')
  const buyerNotes = findField('buyer_notes')

  // Parse markets — could be comma-separated or array-like
  const markets = marketsRaw
    ? marketsRaw.split(/[,;|]/).map(m => m.trim()).filter(Boolean)
    : contact.city ? [contact.city] : []

  return {
    id: contact.id,
    name: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
    phone: contact.phone,
    email: contact.email,
    tier,
    markets,
    secondaryMarket,
    buybox,
    verifiedFunding,
    hasPurchased,
    responseSpeed,
    buyerNotes,
  }
}

// Score a buyer against a property (0-100)
function scoreBuyer(buyer: ReturnType<typeof parseBuyerFields>, propertyMarkets: string[], propertyType?: string | null): number {
  let score = 0

  // Primary market match: +40
  if (buyer.markets.some(m => propertyMarkets.some(pm => pm.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(pm.toLowerCase())))) {
    score += 40
  }

  // Secondary market match: +20
  if (buyer.secondaryMarket && propertyMarkets.some(pm => pm.toLowerCase().includes(buyer.secondaryMarket.toLowerCase()))) {
    score += 20
  }

  // Buybox matches property type: +20
  if (buyer.buybox && propertyType) {
    const bbLower = buyer.buybox.toLowerCase()
    const ptLower = propertyType.toLowerCase()
    if (bbLower.includes('flip') && ptLower.includes('house')) score += 20
    else if (bbLower.includes('rental') && ptLower.includes('house')) score += 20
    else if (bbLower.includes('land') && ptLower.includes('land')) score += 20
    else if (bbLower.includes(ptLower) || ptLower.includes(bbLower)) score += 20
  }

  // Verified funding: +10
  if (buyer.verifiedFunding) score += 10

  // Has purchased before: +5
  if (buyer.hasPurchased) score += 5

  // Response speed: +5 for fast
  if (buyer.responseSpeed?.toLowerCase() === 'fast') score += 5

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
      // Search for contacts tagged as buyers or with buyer tier set
      const result = await ghl.searchContacts({ query: 'buyer', limit: 100 })
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
      })).filter(b => b.name)
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
        secondaryMarket: '',
        buybox: '',
        verifiedFunding: false,
        hasPurchased: false,
        responseSpeed: '',
        buyerNotes: lb.notes ?? '',
      })
    }

    // Score all buyers
    const matched = ghlBuyers
      .map(b => ({
        ...b,
        matchScore: scoreBuyer(b, propertyMarkets, property.propertyType),
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
