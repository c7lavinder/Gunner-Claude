// GET + POST /api/properties/[propertyId]/buyers — match + add buyers via GHL
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { CONTACT_FIELDS, TIER_MAP, getMarketsForZip } from '@/lib/config/crm.config'
import { anthropic } from '@/config/anthropic'
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

// Normalize market name for comparison — strip common suffixes, trim, lowercase
function normalizeMarket(m: string): string {
  return m.trim().toLowerCase()
    .replace(/,?\s*(tn|tennessee|tx|texas|fl|florida|ga|georgia|al|alabama|ms|mississippi)$/i, '')
    .trim()
}

// Check if a buyer's markets match the property
function buyerMatchesMarket(
  buyer: { markets: string[]; secondaryMarkets: string[] },
  matchTargets: string[],
): boolean {
  // Combine all buyer markets (primary + secondary) for matching
  const allBuyerMarkets = [...buyer.markets, ...buyer.secondaryMarkets]
    .filter(m => m && normalizeMarket(m) !== 'other') // "Other" is not a real market

  if (allBuyerMarkets.length === 0) return false

  // "Nationwide" matches everything
  if (allBuyerMarkets.some(m => normalizeMarket(m) === 'nationwide')) return true

  const normalizedTargets = matchTargets.map(normalizeMarket).filter(Boolean)
  if (normalizedTargets.length === 0) return false

  // Check if any buyer market matches any property market (substring both ways, normalized)
  return allBuyerMarkets.some(m => {
    const nm = normalizeMarket(m)
    return normalizedTargets.some(pm =>
      pm.includes(nm) || nm.includes(pm)
    )
  })
}

// LLM-powered buyer scoring — batched in groups of 50 to fit response tokens
async function llmScoreBuyers(
  projectTypes: string[],
  buyers: Array<{ id: string; tier: string; buybox: string; verifiedFunding: boolean; hasPurchased: boolean; responseSpeed: string }>,
): Promise<Record<string, { score: number; breakdown: string }>> {
  if (buyers.length === 0) return {}

  const BATCH_SIZE = 50
  const allResults: Record<string, { score: number; breakdown: string }> = {}

  // If no project types and all fields are basic, use deterministic scoring (no LLM needed)
  const useDeterministic = buyers.length > 100 || !process.env.ANTHROPIC_API_KEY

  if (useDeterministic) {
    for (const b of buyers) {
      let score = 0
      let parts: string[] = []

      // Tier
      const tierScores: Record<string, number> = { priority: 15, qualified: 10, jv: 5, unqualified: 0, halted: -25 }
      const tierScore = tierScores[b.tier] ?? 0
      if (tierScore !== 0) { score += tierScore; parts.push(`Tier ${tierScore > 0 ? '+' : ''}${tierScore}`) }

      // Buybox match
      if (projectTypes.length > 0 && b.buybox) {
        const bb = b.buybox.toLowerCase()
        const pt = projectTypes.map(p => p.toLowerCase())
        const matchMap: Record<string, string[]> = {
          flipper: ['flip', 'fix', 'rehab'], rental: ['rental', 'landlord', 'hold', 'buy & hold'],
          builder: ['build', 'new construction', 'develop'], wholesale: ['wholesale'],
          land: ['land', 'lot'], commercial: ['commercial'],
        }
        const matched = pt.some(p => bb.includes(p) || Object.entries(matchMap).some(([k, v]) => p.includes(k) && v.some(alias => bb.includes(alias))))
        if (matched) { score += 20; parts.push('Buybox +20') }
      }

      // Funding
      if (b.verifiedFunding) { score += 5; parts.push('Funding +5') }
      // Purchased
      if (b.hasPurchased) { score += 5; parts.push('Purchased +5') }
      // Speed
      const speedScores: Record<string, number> = { lightning: 5, 'same day': 3, slow: 0, ghost: -5 }
      const speedScore = speedScores[b.responseSpeed?.toLowerCase()] ?? 0
      if (speedScore !== 0) { score += speedScore; parts.push(`Speed ${speedScore > 0 ? '+' : ''}${speedScore}`) }

      allResults[b.id] = {
        score: Math.max(0, Math.min(100, 50 + score)),
        breakdown: `Market +50${parts.length > 0 ? ', ' + parts.join(', ') : ''}`,
      }
    }
    return allResults
  }

  // LLM scoring in batches of 50
  try {
    for (let i = 0; i < buyers.length; i += BATCH_SIZE) {
      const batch = buyers.slice(i, i + BATCH_SIZE)
      const buyerSummaries = batch.map(b =>
        `${b.id}: tier=${b.tier}, buybox=${b.buybox || 'none'}, funding=${b.verifiedFunding}, purchased=${b.hasPurchased}, speed=${b.responseSpeed || 'unknown'}`
      ).join('\n')

      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: `Score these buyers for property types: ${JSON.stringify(projectTypes)}

RULES (max 50 pts added to base 50): Buybox match +20, Tier (Priority+15/Qualified+10/JV+5/Unqualified+0/Halted-25), Purchased+5, Speed (Lightning+5/Same Day+3/Slow+0/Ghost-5), Funding+5.

BUYERS:\n${buyerSummaries}

Return ONLY JSON: {"id": {"score": N, "breakdown": "..."}, ...}. Score is 0-50 (before +50 base). Keep breakdown concise.` }],
      })

      const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const raw = JSON.parse(match[0]) as Record<string, { score: number; breakdown: string } | number>
        for (const [id, val] of Object.entries(raw)) {
          if (typeof val === 'number') {
            allResults[id] = { score: Math.max(0, Math.min(100, 50 + val)), breakdown: 'Market +50' }
          } else {
            allResults[id] = { score: Math.max(0, Math.min(100, 50 + val.score)), breakdown: `Market +50, ${val.breakdown}` }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Buyers] LLM scoring failed, using deterministic fallback:', err)
    return llmScoreBuyers(projectTypes, buyers) // will hit deterministic path since allResults check fails
  }

  // Fill any missing with base 50
  for (const b of buyers) {
    if (!allResults[b.id]) allResults[b.id] = { score: 50, breakdown: 'Market +50' }
  }
  return allResults
}

export const GET = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
  try {
    const tenantId = ctx.tenantId

    const property = await db.property.findUnique({
      where: { id: params.propertyId, tenantId },
      select: { city: true, state: true, zip: true, propertyType: true, projectType: true, propertyMarkets: true },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // Markets come from the property details page (propertyMarkets field) — NOT zip code lookup
    // Zip/city/state are only fallbacks if propertyMarkets is empty
    const customMarkets = (property.propertyMarkets ?? []) as string[]
    let allPropertyMarkets: string[]
    if (customMarkets.length > 0) {
      // Use the markets set on the property page — this is the source of truth
      allPropertyMarkets = [...customMarkets]
      // Also include city for broader matching
      if (property.city) allPropertyMarkets.push(property.city)
    } else {
      // Fallback: derive from zip code + city + state
      const zipMarkets = property.zip ? getMarketsForZip(property.zip).map(String) : []
      allPropertyMarkets = [...new Set([...zipMarkets, ...(property.city ? [property.city] : []), ...(property.state ? [property.state] : [])])]
    }
    console.log(`[Buyers] Property markets (source: ${customMarkets.length > 0 ? 'property page' : 'zip fallback'}): [${allPropertyMarkets}]`)

    // ── Load buyers from DB (synced from GHL via webhook) ────────────
    let dbBuyers = await db.buyer.findMany({ where: { tenantId, isActive: true } })
    console.log(`[Buyers] Loaded ${dbBuyers.length} buyers from DB`)

    // If DB is empty, tell client to trigger sync first
    if (dbBuyers.length === 0) {
      return NextResponse.json({
        buyers: [], total: 0,
        needsSync: true,
        message: 'Buyer database is empty. Syncing from GHL...',
      })
    }

    const allBuyers = dbBuyers.map(lb => {
      const markets = Array.isArray(lb.primaryMarkets) ? lb.primaryMarkets as string[] : []
      const criteria = (lb.customFields ?? {}) as Record<string, unknown>
      const tags = Array.isArray(lb.tags) ? lb.tags as string[] : []
      return {
        id: lb.id, name: lb.name, phone: lb.phone ?? '', email: lb.email ?? '',
        ghlContactId: lb.ghlContactId ?? null,
        tier: (criteria.tier as string) ?? 'unqualified',
        markets,
        secondaryMarkets: (criteria.secondaryMarkets as string[]) ?? [],
        buybox: (criteria.buybox as string) ?? '',
        verifiedFunding: (criteria.verifiedFunding as boolean) ?? false,
        hasPurchased: (criteria.hasPurchased as boolean) ?? false,
        responseSpeed: (criteria.responseSpeed as string) ?? '',
        maxBuyPrice: (criteria.maxBuyPrice as number) ?? null,
        buyerNotes: lb.internalNotes ?? '',
        tags,
      }
    })

    // Step 1: Market is the BASE filter — no market match = not shown
    const marketMatched = allBuyers.filter(b => buyerMatchesMarket(b, allPropertyMarkets))
    console.log(`[Buyers] Market filter: ${allBuyers.length} total → ${marketMatched.length} in market. Property targets: [${allPropertyMarkets}]`)
    if (marketMatched.length === 0 && allBuyers.length > 0) {
      // Debug: log first 10 buyers' markets for troubleshooting
      const sample = allBuyers.slice(0, 10).map(b => `${b.name}: markets=[${b.markets}] secondary=[${b.secondaryMarkets}]`)
      console.log(`[Buyers] No matches! Normalized targets: [${allPropertyMarkets.map(normalizeMarket)}]`)
      console.log(`[Buyers] Sample buyers:`, sample)
      // Count how many buyers have ANY markets set
      const withMarkets = allBuyers.filter(b => b.markets.length > 0 || b.secondaryMarkets.length > 0).length
      console.log(`[Buyers] Buyers with markets: ${withMarkets}/${allBuyers.length}`)
    }

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

    // Fetch buyer pipeline stages for this property (include responseIntent for UI highlighting)
    const buyerStages = await db.propertyBuyerStage.findMany({
      where: { propertyId: params.propertyId, tenantId },
      select: { id: true, buyerId: true, stage: true, responseIntent: true, matchScore: true },
    })
    const stageMap: Record<string, string> = {}
    const intentMap: Record<string, string> = {}
    for (const bs of buyerStages) {
      stageMap[bs.buyerId] = bs.stage
      if (bs.responseIntent) intentMap[bs.buyerId] = bs.responseIntent
    }

    // v1.1 Wave 4 — fire-and-forget persist matchScore for buyers that
    // ALREADY have a PropertyBuyerStage row (no row creation here — that
    // would write N rows per page load for every in-market buyer, which
    // doesn't scale). Matched buyers without a stage row keep their
    // score in the response only; persistence happens organically when
    // they enter the pipeline (manual add, blast send, etc.).
    const stageByBuyer = new Map(buyerStages.map(bs => [bs.buyerId, bs] as const))
    const now = new Date()
    for (const m of matched) {
      const existing = stageByBuyer.get(m.id)
      if (!existing) continue
      // Only write when the persisted value diverges materially.
      if (
        typeof existing.matchScore === 'number' &&
        Math.abs(existing.matchScore - m.matchScore) < 0.5
      ) continue
      db.propertyBuyerStage.update({
        where: { id: existing.id, tenantId },
        data: { matchScore: m.matchScore, matchScoreUpdatedAt: now },
      }).catch(err => console.warn('[Buyers] matchScore persist failed:', err instanceof Error ? err.message : err))
    }

    return NextResponse.json({ buyers: matched, total: matched.length, buyerStages: stageMap, buyerIntents: intentMap })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to match buyers' }, { status: 500 })
  }
})

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

export const POST = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  try {
    const body = await request.json()

    // Get manually added buyers for this property.
    // v1.1 Wave 3 Phase B — read from PropertyBuyerStage(source='manual') →
    // joined Buyer rows. Replaces the legacy Property.manualBuyerIds[] JSON
    // array path. Property.manualBuyerIds drops in Wave 5 cutover; until then
    // it stays populated as orphan history but is no longer the read source.
    if (body.action === 'getManualBuyers') {
      // DiD-via-FK: validate the parent property's tenant boundary first,
      // then trust the PropertyBuyerStage join.
      const prop = await db.property.findFirst({
        where: { id: params.propertyId, tenantId: ctx.tenantId },
        select: { id: true },
      })
      if (!prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

      const stages = await db.propertyBuyerStage.findMany({
        where: { propertyId: params.propertyId, source: 'manual' },
        select: {
          stage: true, createdAt: true,
          buyer: {
            select: {
              id: true, name: true, phone: true, email: true,
              ghlContactId: true,
              primaryMarkets: true, customFields: true, tags: true,
              internalNotes: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      const buyers = stages.map(s => {
        const b = s.buyer
        const criteria = (b.customFields ?? {}) as Record<string, unknown>
        const tier = (criteria.tier as string) ?? 'unqualified'
        const markets = Array.isArray(b.primaryMarkets) ? b.primaryMarkets as string[] : []
        const tags = Array.isArray(b.tags) ? b.tags as string[] : []
        return {
          id: b.id,
          name: b.name,
          phone: b.phone ?? '',
          email: b.email ?? '',
          tier,
          markets,
          secondaryMarkets: (criteria.secondaryMarkets as string[]) ?? [],
          buybox: (criteria.buybox as string) ?? '',
          verifiedFunding: (criteria.verifiedFunding as boolean) ?? false,
          hasPurchased: (criteria.hasPurchased as boolean) ?? false,
          responseSpeed: (criteria.responseSpeed as string) ?? '',
          buyerNotes: b.internalNotes ?? '',
          tags,
          matchScore: 0,
          scoreBreakdown: 'Manually added',
        }
      })
      return NextResponse.json({ buyers })
    }

    if (body.action === 'getStages' || body.action === 'getFormOptions') {
      const ghl = await getGHLClient(ctx.tenantId)
      const pipelines = await ghl.getPipelines()
      const buyerPipeline = pipelines.pipelines?.find(p => p.name.toLowerCase().includes('buyer'))
      if (!buyerPipeline) return NextResponse.json({ error: 'No buyer pipeline found' }, { status: 404 })

      // Try to get custom field definitions directly from GHL
      let tierValues = new Set<string>()
      let buyboxValues = new Set<string>()
      let marketValues = new Set<string>()
      let speedValues = new Set<string>()

      try {
        const cfRes = await fetch(`https://services.leadconnectorhq.com/locations/${ghl.locationId}/customFields`, {
          headers: { 'Authorization': `Bearer ${ghl.accessToken}`, 'Version': '2021-07-28' },
        })
        if (cfRes.ok) {
          const cfData = await cfRes.json()
          for (const f of (cfData.customFields ?? [])) {
            const opts = (f.options ?? f.picklistOptions ?? []).map((o: { value: string } | string) => typeof o === 'string' ? o : o.value)
            if (f.id === FIELD_NAME_TO_GHL.buyer_tier) opts.forEach((v: string) => tierValues.add(v))
            if (f.id === FIELD_NAME_TO_GHL.buybox) opts.forEach((v: string) => buyboxValues.add(v))
            if (f.id === FIELD_NAME_TO_GHL.markets) opts.forEach((v: string) => marketValues.add(v))
            if (f.id === FIELD_NAME_TO_GHL.response_speed) opts.forEach((v: string) => speedValues.add(v))
          }
        }
      } catch {}

      // Fallback: if custom fields API not available, scan ALL buyer pipeline contacts
      if (tierValues.size === 0 && buyboxValues.size === 0) {
        const allContactIds = await ghl.getAllPipelineContacts(buyerPipeline.id)
        console.log(`[Buyers] Scanning ${allContactIds.length} contacts for field options`)
        for (let i = 0; i < allContactIds.length; i += 10) {
          const batch = allContactIds.slice(i, i + 10)
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
          // Scan ALL contacts — no early stop, options must be complete
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
    const ghl = await getGHLClient(ctx.tenantId)

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

    // v1.1 Wave 3 Phase B — manual-buyer linkage moved from
    // Property.manualBuyerIds[] JSON to PropertyBuyerStage rows with
    // source='manual'. The legacy column stops being written here;
    // it remains populated for historical rows but drops in Wave 5.
    // Note: Buyer row is created/updated below — we order things so the
    // Buyer exists before we insert the join row.

    // Also write to local Buyer DB so they're immediately available for matching
    // FIX: was leaking — Class 1 — prior code used upsert({ where: { id } }) which
    // matches across tenants on the unique id. Now: tenant-scoped findFirst,
    // then conditional create-or-update with id+tenantId in WHERE.
    const tierNorm = TIER_MAP[d.buyerTier] ?? d.buyerTier.toLowerCase()
    const buyerId = `ghl_${contactId}`
    const buyerCustomFields = JSON.parse(JSON.stringify({
      tier: tierNorm, buybox: d.buybox.join(', '),
      secondaryMarkets: d.secondaryMarket ? [d.secondaryMarket] : [],
      verifiedFunding: d.verifiedFunding ?? false,
      hasPurchased: d.hasPurchased ?? false,
      responseSpeed: d.responseSpeed ?? '',
    }))
    const existingBuyer = await db.buyer.findFirst({
      where: { id: buyerId, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (existingBuyer) {
      await db.buyer.update({
        where: { id: buyerId, tenantId: ctx.tenantId },
        data: {
          name: `${d.firstName} ${d.lastName ?? ''}`.trim(),
          phone, email: d.email ?? null,
          primaryMarkets: d.markets,
          customFields: buyerCustomFields,
          tags,
          internalNotes: d.notes ?? null,
          isActive: true,
        },
      }).catch(err => console.error('[Buyers] DB update failed:', err))
    } else {
      await db.buyer.create({
        data: {
          id: buyerId,
          tenantId: ctx.tenantId,
          name: `${d.firstName} ${d.lastName ?? ''}`.trim(),
          phone, email: d.email ?? null,
          ghlContactId: contactId,
          primaryMarkets: d.markets,
          customFields: buyerCustomFields,
          tags,
          internalNotes: d.notes ?? null,
          isActive: true,
        },
      }).catch(err => console.error('[Buyers] DB create failed:', err))
    }

    // v1.1 Wave 3 Phase B — insert PropertyBuyerStage row to link this
    // newly-added Buyer to the Property. source='manual' distinguishes the
    // user-clicked-add path from buybox-matched buyers (source='matched').
    // Idempotent — skip if (propertyId, buyerId) row already exists.
    try {
      const existingStage = await db.propertyBuyerStage.findUnique({
        where: { propertyId_buyerId: { propertyId: params.propertyId, buyerId } },
        select: { id: true },
      })
      if (!existingStage) {
        await db.propertyBuyerStage.create({
          data: {
            tenantId: ctx.tenantId,
            propertyId: params.propertyId,
            buyerId,
            stage: 'added',
            source: 'manual',
          },
        })
      }
    } catch (err) {
      console.error('[Buyers] PropertyBuyerStage insert failed:', err)
    }

    return NextResponse.json({
      success: true,
      contactId,
      buyer: {
        id: buyerId,
        name: `${d.firstName} ${d.lastName ?? ''}`.trim(),
        phone: d.phone,
        email: d.email ?? null,
        tier: tierNorm,
        markets: d.markets,
        buybox: d.buybox.join(', '),
        matchScore: 0,
        scoreBreakdown: 'Manually added',
      },
    })
  } catch (err) {
    console.error('[Buyers] Add buyer failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add buyer' }, { status: 500 })
  }
})
