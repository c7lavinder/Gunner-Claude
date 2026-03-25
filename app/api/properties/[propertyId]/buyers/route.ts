// GET /api/properties/[propertyId]/buyers — match buyers to property
// POST /api/properties/[propertyId]/buyers — trigger re-match
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

// Buyer matching score (0-100)
function scoreBuyer(buyer: {
  markets: string[]
  criteria: Record<string, unknown>
  tags: string[]
  notes: string | null
}, property: {
  city: string
  state: string
  zip: string
}): number {
  let score = 0
  const propMarket = `${property.city}, ${property.state}`.toLowerCase()
  const propCity = property.city.toLowerCase()

  // Primary market match: +40
  const buyerMarkets = (buyer.markets ?? []).map((m: string) => m.toLowerCase())
  if (buyerMarkets.some(m => propMarket.includes(m) || m.includes(propCity))) {
    score += 40
  }

  // Criteria has secondary markets: +20
  const secondaryMarkets = ((buyer.criteria as Record<string, unknown>)?.secondaryMarkets as string[] ?? []).map((m: string) => m.toLowerCase())
  if (secondaryMarkets.some(m => propMarket.includes(m) || m.includes(propCity))) {
    score += 20
  }

  // Tags: cash buyer, verified funding, has purchased
  const tagsLower = (buyer.tags ?? []).map((t: string) => t.toLowerCase())
  if (tagsLower.some(t => t.includes('cash') || t.includes('verified') || t.includes('funding'))) score += 10
  if (tagsLower.some(t => t.includes('purchased') || t.includes('closed'))) score += 5
  if (tagsLower.some(t => t.includes('same day') || t.includes('fast'))) score += 5

  // Buy box match: +20 (if criteria.types overlap property type)
  const buyBoxTypes = ((buyer.criteria as Record<string, unknown>)?.types as string[] ?? []).map((t: string) => t.toLowerCase())
  if (buyBoxTypes.length > 0) score += 20 // base points for having a buy box

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
      select: { city: true, state: true, zip: true },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // Get all active buyers for this tenant
    const buyers = await db.buyer.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    })

    // Score and sort
    const matched = buyers.map(b => {
      const markets = Array.isArray(b.markets) ? b.markets as string[] : []
      const criteria = (b.criteria && typeof b.criteria === 'object') ? b.criteria as Record<string, unknown> : {}
      const tags = Array.isArray(b.tags) ? b.tags as string[] : []

      const matchScore = scoreBuyer({ markets, criteria, tags, notes: b.notes }, property)

      // Determine tier from tags
      let tier: 'priority' | 'qualified' | 'jv' | 'unqualified' = 'unqualified'
      const tagsLower = tags.map(t => t.toLowerCase())
      if (tagsLower.some(t => t.includes('priority'))) tier = 'priority'
      else if (tagsLower.some(t => t.includes('qualified') || t.includes('cash') || t.includes('verified'))) tier = 'qualified'
      else if (tagsLower.some(t => t.includes('jv') || t.includes('partner'))) tier = 'jv'

      return {
        id: b.id,
        name: b.name,
        phone: b.phone,
        email: b.email,
        company: b.company,
        tier,
        markets,
        tags,
        notes: b.notes,
        matchScore,
      }
    })
      .filter(b => b.matchScore > 0)
      .sort((a, b) => {
        // Sort by tier first, then score
        const tierOrder = { priority: 0, qualified: 1, jv: 2, unqualified: 3 }
        const tierDiff = tierOrder[a.tier] - tierOrder[b.tier]
        if (tierDiff !== 0) return tierDiff
        return b.matchScore - a.matchScore
      })

    return NextResponse.json({ buyers: matched, total: matched.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to match buyers'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
