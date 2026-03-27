// GET + POST /api/properties/[propertyId]/buyers — match + add buyers via GHL
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { CONTACT_FIELDS, TIER_MAP, getMarketsForZip } from '@/lib/config/crm.config'
import { z } from 'zod'

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

// Check if a buyer's markets match the property
function buyerMatchesMarket(
  buyer: ReturnType<typeof parseBuyerFields>,
  matchTargets: string[],
): boolean {
  const check = (markets: string[]) => markets.some(m =>
    matchTargets.some(pm =>
      pm.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(pm.toLowerCase())
    )
  )
  // "Nationwide" matches everything
  const allMarkets = [...buyer.markets, ...buyer.secondaryMarkets]
  if (allMarkets.some(m => m.toLowerCase() === 'nationwide')) return true

  const primaryMarkets = buyer.markets.filter(m => m.toLowerCase() !== 'other')
  if (check(primaryMarkets)) return true
  if (buyer.secondaryMarkets.length > 0 && check(buyer.secondaryMarkets)) return true
  return false
}

// LLM-powered buyer scoring — one call scores all market-matched buyers
async function llmScoreBuyers(
  projectTypes: string[],
  buyers: Array<{ id: string; tier: string; buybox: string; verifiedFunding: boolean; hasPurchased: boolean; responseSpeed: string }>,
): Promise<Record<string, { score: number; breakdown: string }>> {
  if (buyers.length === 0) return {}
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const buyerSummaries = buyers.map(b =>
      `${b.id}: tier=${b.tier}, buybox=${b.buybox || 'none'}, funding=${b.verifiedFunding}, purchased=${b.hasPurchased}, speed=${b.responseSpeed || 'unknown'}`
    ).join('\n')

    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Score these buyers for a property with project types: ${JSON.stringify(projectTypes)}

SCORING RULES (max 50 points, added to a base of 50):

1. BUYBOX MATCH (+20): Does the buyer's buybox match or relate to the property's project types?
   Use real estate knowledge — "Flipper" matches "Fix and Flip", "Landlord" matches "Rental", "Builder" matches "New Construction", etc.
   If no project types set on property, skip this factor.

2. BUYER TIER (+15/+10/+5/0/-25):
   Priority = +15, Qualified = +10, JV = +5, Unqualified = +0, Halted = -25
   Interpret similar terms naturally (e.g. "A" = Priority, "B" = Qualified, "C" = JV, "Cold" = Unqualified)

3. PURCHASED BEFORE (+5): Has the buyer purchased from us before? true = +5

4. RESPONSE SPEED (+5/+3/0/-5):
   Lightning = +5, Same Day = +3, Slow = +0, Ghost = -5
   Interpret similar terms naturally.

5. VERIFIED FUNDING (+5): true = +5

BUYERS:
${buyerSummaries}

Return ONLY a JSON object mapping buyer ID to an object with "score" (0-50, before base 50) and "breakdown" (short string showing the math).
Example: {"abc123": {"score": 35, "breakdown": "Buybox +20, Tier +15, Funding +5"}, "def456": {"score": 10, "breakdown": "Tier +10"}}
Only include factors that contributed points (positive or negative). Keep breakdown concise.`,
      }],
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const raw = JSON.parse(match[0]) as Record<string, { score: number; breakdown: string } | number>
      const result: Record<string, { score: number; breakdown: string }> = {}
      for (const [id, val] of Object.entries(raw)) {
        if (typeof val === 'number') {
          result[id] = { score: Math.max(0, Math.min(100, 50 + val)), breakdown: 'Market +50' }
        } else {
          result[id] = {
            score: Math.max(0, Math.min(100, 50 + val.score)),
            breakdown: `Market +50, ${val.breakdown}`,
          }
        }
      }
      return result
    }
  } catch (err) {
    console.error('[Buyers] LLM scoring failed:', err)
  }
  // Fallback: everyone gets base 50
  return Object.fromEntries(buyers.map(b => [b.id, { score: 50, breakdown: 'Market +50' }]))
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
      select: { city: true, state: true, zip: true, propertyType: true, projectType: true, propertyMarkets: true },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // Determine which markets this property is in
    const propertyMarkets = property.zip
      ? getMarketsForZip(property.zip).map(String)
      : property.city ? [property.city] : []

    // Pull ALL contacts from the Buyer Pipeline — not a broad search
    const ghl = await getGHLClient(tenantId)
    let ghlBuyers: ReturnType<typeof parseBuyerFields>[] = []

    try {
      // Find the Buyer Pipeline
      const pipelines = await ghl.getPipelines()
      const buyerPipeline = pipelines.pipelines?.find(p =>
        p.name.toLowerCase().includes('buyer')
      )

      if (!buyerPipeline) {
        console.warn('[Buyers] No buyer pipeline found')
      } else {
        console.log(`[Buyers] Using pipeline: ${buyerPipeline.name} (${buyerPipeline.id})`)

        // Get ALL contact IDs from the Buyer Pipeline (paginated)
        const contactIds = await ghl.getAllPipelineContacts(buyerPipeline.id)
        console.log(`[Buyers] Found ${contactIds.length} contacts in buyer pipeline`)

        // Fetch each contact's full details (with custom fields)
        // Process in batches of 10 to avoid rate limits
        for (let i = 0; i < contactIds.length; i += 10) {
          const batch = contactIds.slice(i, i + 10)
          const contacts = await Promise.all(
            batch.map(id => ghl.getContact(id).catch(() => null))
          )
          for (const c of contacts) {
            if (!c) continue
            ghlBuyers.push(parseBuyerFields({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              phone: c.phone,
              email: c.email,
              city: c.city,
              state: c.state,
              tags: c.tags ?? [],
              customFields: c.customFields ?? [],
            }))
          }
        }
        console.log(`[Buyers] Parsed ${ghlBuyers.length} buyers with data`)
      }
    } catch (err) {
      console.error('[Buyers] GHL pipeline fetch failed:', err instanceof Error ? err.message : err)
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

    // Step 1: Market is the BASE filter — no market match = not shown
    const customMarkets = (property.propertyMarkets ?? []) as string[]
    const allPropertyMarkets = [...propertyMarkets, ...customMarkets]
    if (property.city) allPropertyMarkets.push(property.city)

    const marketMatched = ghlBuyers.filter(b => buyerMatchesMarket(b, allPropertyMarkets))
    console.log(`[Buyers] Market filter: ${ghlBuyers.length} total → ${marketMatched.length} in market`)

    // Step 2: LLM scores all market-matched buyers (one call)
    const projectTypes = (property.projectType ?? []) as string[]
    const scores = await llmScoreBuyers(
      projectTypes,
      marketMatched.map(b => ({
        id: b.id, tier: b.tier, buybox: b.buybox,
        verifiedFunding: b.verifiedFunding, hasPurchased: b.hasPurchased,
        responseSpeed: b.responseSpeed,
      })),
    )
    console.log(`[Buyers] LLM scored ${Object.keys(scores).length} buyers`)

    // Step 3: Apply scores and sort
    const matched = marketMatched
      .map(b => ({
        ...b,
        matchScore: scores[b.id]?.score ?? 50,
        scoreBreakdown: scores[b.id]?.breakdown ?? 'Market +50',
      }))
      .sort((a, b) => {
        return b.matchScore - a.matchScore
      })

    return NextResponse.json({ buyers: matched, total: matched.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to match buyers' }, { status: 500 })
  }
}

// ─── Reverse map: field name → GHL custom field ID ──────────────────────────
const FIELD_NAME_TO_GHL: Record<string, string> = Object.fromEntries(
  Object.entries(GHL_FIELD_MAP).map(([id, name]) => [name, id])
)

const addBuyerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  phone: z.string().min(1),
  email: z.string().optional(),
  buyerTier: z.string().min(1),
  buybox: z.array(z.string()).min(1),
  markets: z.array(z.string()).min(1),
  secondaryMarket: z.string().optional(),
  source: z.string().min(1),
  stageId: z.string().min(1),
  verifiedFunding: z.boolean().optional(),
  hasPurchased: z.boolean().optional(),
  responseSpeed: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(), // comma-separated
})

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    // If action is 'getFormOptions', return pipeline stages + custom field options from GHL
    if (body.action === 'getStages' || body.action === 'getFormOptions') {
      const ghl = await getGHLClient(session.tenantId)
      const pipelines = await ghl.getPipelines()
      const buyerPipeline = pipelines.pipelines?.find(p => p.name.toLowerCase().includes('buyer'))
      if (!buyerPipeline) return NextResponse.json({ error: 'No buyer pipeline found' }, { status: 404 })

      // Pull unique field values from existing buyers in the pipeline
      const contactIds = await ghl.getAllPipelineContacts(buyerPipeline.id)
      const sampleSize = Math.min(contactIds.length, 50) // sample up to 50 for speed
      const tierValues = new Set<string>()
      const buyboxValues = new Set<string>()
      const marketValues = new Set<string>()
      const speedValues = new Set<string>()

      const sampleIds = contactIds.slice(0, sampleSize)
      for (let i = 0; i < sampleIds.length; i += 10) {
        const batch = sampleIds.slice(i, i + 10)
        const contacts = await Promise.all(batch.map(id => ghl.getContact(id).catch(() => null)))
        for (const c of contacts) {
          if (!c) continue
          for (const cf of (c.customFields ?? [])) {
            const fieldName = GHL_FIELD_MAP[cf.id]
            const vals = Array.isArray(cf.value) ? cf.value.map(String) : cf.value ? [String(cf.value)] : []
            if (fieldName === 'buyer_tier') vals.forEach(v => tierValues.add(v))
            if (fieldName === 'buybox') vals.forEach(v => buyboxValues.add(v))
            if (fieldName === 'markets') vals.forEach(v => marketValues.add(v))
            if (fieldName === 'response_speed') vals.forEach(v => speedValues.add(v))
          }
        }
      }

      return NextResponse.json({
        pipelineId: buyerPipeline.id,
        stages: buyerPipeline.stages.map(s => ({ id: s.id, name: s.name })),
        options: {
          tiers: [...tierValues].sort(),
          buybox: [...buyboxValues].sort(),
          markets: [...marketValues].sort(),
          speeds: [...speedValues].sort(),
        },
      })
    }

    // Create a buyer
    const parsed = addBuyerSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })

    const d = parsed.data
    const ghl = await getGHLClient(session.tenantId)

    // Build custom fields array
    const customFields: Array<{ id: string; value: unknown }> = []
    if (FIELD_NAME_TO_GHL.buyer_tier) customFields.push({ id: FIELD_NAME_TO_GHL.buyer_tier, value: d.buyerTier })
    if (FIELD_NAME_TO_GHL.buybox) customFields.push({ id: FIELD_NAME_TO_GHL.buybox, value: d.buybox })
    if (FIELD_NAME_TO_GHL.markets) customFields.push({ id: FIELD_NAME_TO_GHL.markets, value: d.markets })
    if (d.secondaryMarket && FIELD_NAME_TO_GHL.secondary_market) customFields.push({ id: FIELD_NAME_TO_GHL.secondary_market, value: d.secondaryMarket })
    if (d.verifiedFunding && FIELD_NAME_TO_GHL.verified_funding) customFields.push({ id: FIELD_NAME_TO_GHL.verified_funding, value: ['Yes'] })
    if (d.responseSpeed && FIELD_NAME_TO_GHL.response_speed) customFields.push({ id: FIELD_NAME_TO_GHL.response_speed, value: d.responseSpeed })
    if (d.notes && FIELD_NAME_TO_GHL.notes) customFields.push({ id: FIELD_NAME_TO_GHL.notes, value: d.notes })

    // Parse tags
    const tags = d.tags ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : []

    // Format phone to E.164
    const phoneDigits = d.phone.replace(/\D/g, '')
    const phone = phoneDigits.length === 10 ? `+1${phoneDigits}` : phoneDigits.length === 11 && phoneDigits.startsWith('1') ? `+${phoneDigits}` : d.phone

    // Create contact in GHL
    const contactResult = await ghl.createContact({
      firstName: d.firstName,
      lastName: d.lastName,
      phone,
      email: d.email,
      tags,
      source: d.source,
      customFields,
    })
    const contactId = contactResult.contact.id

    // Find buyer pipeline
    const pipelines = await ghl.getPipelines()
    const buyerPipeline = pipelines.pipelines?.find(p => p.name.toLowerCase().includes('buyer'))
    if (!buyerPipeline) return NextResponse.json({ error: 'No buyer pipeline found' }, { status: 404 })

    // Create opportunity in buyer pipeline
    await ghl.createOpportunity({
      pipelineId: buyerPipeline.id,
      stageId: d.stageId,
      contactId,
      name: `${d.firstName} ${d.lastName ?? ''}`.trim(),
      source: d.source,
    })

    return NextResponse.json({ success: true, contactId })
  } catch (err) {
    console.error('[Buyers] Add buyer failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add buyer' }, { status: 500 })
  }
}
