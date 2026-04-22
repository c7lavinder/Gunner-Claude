// lib/properties.ts
// Property management logic — Gunner is source of truth for properties
// A contact (seller) can be attached to multiple properties
// No duplicate properties — deduped by tenantId + address
// Called from GHL webhook when pipeline stage matches tenant trigger

import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { triggerWorkflows } from '@/lib/workflows/engine'
import { enrichPropertyWithAI } from '@/lib/ai/enrich-property'

interface PropertyTriggerContext {
  ghlPipelineId?: string
  ghlPipelineStage?: string
  opportunitySource?: string
}

export async function createPropertyFromContact(
  tenantId: string,
  ghlContactId: string,
  context: PropertyTriggerContext = {},
): Promise<string | null> {
  try {
    const ghlClient = await getGHLClient(tenantId)
    const contact = await ghlClient.getContact(ghlContactId)

    // Parse and standardize address from contact
    const { standardizeStreet, standardizeCity, standardizeState, standardizeZip } = await import('@/lib/address')
    const rawAddress = contact.address1 ?? ''
    const city = standardizeCity(contact.city ?? '')
    const state = standardizeState(contact.state ?? '')
    const zip = standardizeZip(contact.postalCode ?? '')

    // Detect multi-address patterns: "410 & 114 Ideal Valley Rd", "123/456 Main St"
    const multiAddressMatch = rawAddress.match(/^(\d+)\s*[&\/,]\s*(\d+)\s+(.+)$/)
    if (multiAddressMatch) {
      const [, num1, num2, streetName] = multiAddressMatch
      const addr1 = `${num1} ${streetName}`
      const addr2 = `${num2} ${streetName}`
      console.log(`[Property] Multi-address detected: "${rawAddress}" → "${addr1}" + "${addr2}"`)

      // Create first property with modified address
      const id1 = await createPropertyFromContact(tenantId, ghlContactId, {
        ...context,
        _overrideAddress: standardizeStreet(addr1),
      } as PropertyTriggerContext & { _overrideAddress?: string })

      // Create second property with modified address (same contact)
      const id2 = await createPropertyFromContact(tenantId, ghlContactId, {
        ...context,
        _overrideAddress: standardizeStreet(addr2),
      } as PropertyTriggerContext & { _overrideAddress?: string })

      return id1 // return first property ID
    }

    const address = (context as { _overrideAddress?: string })._overrideAddress ?? standardizeStreet(rawAddress)

    // Deduplicate: check by ghlContactId + address (one contact CAN have multiple properties)
    const existingByContactAndAddress = await db.property.findFirst({
      where: { tenantId, ghlContactId, address: { equals: address, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existingByContactAndAddress) {
      console.log(`[Property] Already exists for GHL contact ${ghlContactId} at ${address} — skipping`)
      return existingByContactAndAddress.id
    }

    // Deduplicate by normalized street address + state
    // Skip city (suburbs vs nearest city mismatch) and zip (often missing)
    // One contact CAN have multiple properties at different addresses
    const normalizedAddress = normalizeStreetAddress(address)
    const normalizedState = state.trim().toUpperCase()

    if (normalizedAddress) {
      const existing = await db.property.findFirst({
        where: {
          tenantId,
          state: { equals: normalizedState, mode: 'insensitive' },
        },
      })

      // Check all properties in this state for a street address match
      // Using DB query + code-level normalize comparison for accuracy
      if (existing) {
        const candidates = await db.property.findMany({
          where: {
            tenantId,
            state: { equals: normalizedState, mode: 'insensitive' },
          },
          select: { id: true, address: true },
        })

        const match = candidates.find(
          (p) => normalizeStreetAddress(p.address) === normalizedAddress
        )

        if (match) {
          console.log(`[Property] Already exists at ${address}, ${state} (matched ${match.address}) — skipping`)
          return match.id
        }
      }
    }

    // Lead source: from opportunity source, or contact source
    const leadSource = context.opportunitySource || contact.source || null

    // Map GHL assigned user → local user
    let assignedToId: string | null = null
    if (contact.assignedTo) {
      const localUser = await db.user.findFirst({
        where: { tenantId, ghlUserId: contact.assignedTo },
        select: { id: true },
      })
      if (localUser) assignedToId = localUser.id
    }

    // Auto-assign market by zip code (check DB first, then config fallback, then Global)
    const marketId = await resolveMarketForZip(tenantId, zip)

    // Map GHL stage → acquisition status + disposition status separately.
    // `status` is acquisition-only; `dispoStatus` is disposition-only. A property
    // created via the dispo trigger sets status=UNDER_CONTRACT (entering dispo
    // implies an acquisition contract already exists) + dispoStatus=<dispo enum>.
    let status = 'NEW_LEAD'
    let dispoStatus: string | null = null
    if (context.ghlPipelineStage) {
      try {
        const { getAppStage } = await import('@/lib/ghl-stage-map')
        const appStage = getAppStage(context.ghlPipelineStage)
        const ACQ_MAP: Record<string, string> = {
          'acquisition.new_lead': 'NEW_LEAD',
          'acquisition.appt_set': 'APPOINTMENT_SET',
          'acquisition.offer_made': 'OFFER_MADE',
          'acquisition.contract': 'UNDER_CONTRACT',
          'acquisition.closed': 'SOLD',
          'longterm.follow_up': 'CONTACTED',
          'longterm.dead': 'DEAD',
        }
        const DISPO_MAP: Record<string, string> = {
          'disposition.new_deal': 'IN_DISPOSITION',
          'disposition.pushed_out': 'DISPO_PUSHED',
          'disposition.offers_received': 'DISPO_OFFERS',
          'disposition.contracted': 'DISPO_CONTRACTED',
          'disposition.closed': 'DISPO_CLOSED',
        }
        if (appStage?.startsWith('disposition')) {
          status = 'UNDER_CONTRACT'
          dispoStatus = DISPO_MAP[appStage] ?? 'IN_DISPOSITION'
        } else {
          status = ACQ_MAP[appStage] ?? 'NEW_LEAD'
        }
      } catch { /* use default */ }
    }

    // Create property — Gunner is source of truth
    const property = await db.property.create({
      data: {
        tenantId,
        ghlContactId,
        ghlPipelineId: context.ghlPipelineId,
        ghlPipelineStage: context.ghlPipelineStage,
        leadSource,
        address: address || '',
        city: city || '',
        state: state || '',
        zip: zip || '',
        status: status as 'NEW_LEAD',
        dispoStatus: dispoStatus as 'IN_DISPOSITION' | null,
        stageEnteredAt: new Date(),
        assignedToId,
        marketId,
      },
    })

    // Create or find the seller and link to property
    let seller = await db.seller.findFirst({
      where: { tenantId, ghlContactId },
    })

    if (!seller) {
      seller = await db.seller.create({
        data: {
          tenantId,
          ghlContactId,
          name: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || 'Unknown seller',
          phone: contact.phone,
          email: contact.email,
        },
      })
    }

    // Link seller to property — one seller can own multiple properties
    await db.propertySeller.create({
      data: {
        propertyId: property.id,
        sellerId: seller.id,
        isPrimary: true,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId,
        action: 'property.created',
        resource: 'property',
        resourceId: property.id,
        source: 'GHL_WEBHOOK',
        severity: 'INFO',
        payload: {
          ghlContactId,
          address,
          leadSource,
          pipelineStage: context.ghlPipelineStage,
        },
      },
    })

    console.log(`[Property] Created ${property.id} at ${address || 'no address'} (source: ${leadSource || 'unknown'}) for contact ${ghlContactId}`)

    // Auto-log LEAD milestone (dedup: skip if one already exists for this property)
    const existingLead = await db.propertyMilestone.findFirst({
      where: { tenantId, propertyId: property.id, type: 'LEAD' },
    }).catch(() => null)
    if (!existingLead) {
      await db.propertyMilestone.create({
        data: {
          tenantId,
          propertyId: property.id,
          type: 'LEAD',
          source: 'AUTO_WEBHOOK',
          loggedById: assignedToId,
        },
      }).catch(() => {}) // non-fatal
    }

    // Trigger property_created workflows
    triggerWorkflows(tenantId, 'property_created', {
      contactId: ghlContactId,
      propertyId: property.id,
    }).catch(err => console.warn('[Property] Workflow trigger failed:', err))

    // Auto-trigger research (non-blocking, server-side)
    if (address && process.env.GOOGLE_PLACES_API_KEY) {
      researchProperty(property.id, address, city, state, zip).catch(err =>
        console.warn('[Property] Auto-research failed:', err instanceof Error ? err.message : err)
      )
    }

    // Auto-enrich from BatchData (non-blocking — backfills beds, baths, sqft, etc.)
    if (address && process.env.BATCHDATA_API_KEY) {
      import('@/lib/batchdata/enrich').then(({ enrichPropertyFromBatchData }) =>
        enrichPropertyFromBatchData(property.id).catch(err =>
          console.warn('[Property] BatchData enrich failed:', err instanceof Error ? err.message : err)
        )
      )
    }

    // AI auto-enrichment (fire-and-forget — estimates ARV, repair, rental, neighborhood)
    enrichPropertyWithAI(property.id).catch(err =>
      console.error('[Property] AI enrich failed:', err instanceof Error ? err.message : err)
    )

    return property.id
  } catch (err) {
    console.error(`[Property] Failed to create from contact ${ghlContactId}:`, err)

    await db.auditLog.create({
      data: {
        tenantId,
        action: 'property.creation.failed',
        resource: 'property',
        source: 'GHL_WEBHOOK',
        severity: 'ERROR',
        payload: { ghlContactId, error: err instanceof Error ? err.message : 'Unknown error' },
      },
    })

    return null
  }
}

// ─── Auto-research using Google Places API ───────────────────────────────────

async function researchProperty(propertyId: string, address: string, city: string, state: string, zip: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return

  const fullAddress = `${address}, ${city}, ${state} ${zip}`

  const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.formattedAddress,places.location,places.types,places.displayName,places.googleMapsUri,places.photos,places.addressComponents',
    },
    body: JSON.stringify({ textQuery: fullAddress, maxResultCount: 1 }),
  })

  if (!searchRes.ok) return

  const data = await searchRes.json()
  const place = data.places?.[0]
  if (!place) return

  const lat = place.location?.latitude ?? null
  const lng = place.location?.longitude ?? null

  const researchData = {
    googlePlaceData: {
      formattedAddress: place.formattedAddress,
      displayName: place.displayName?.text,
      googleMapsUrl: place.googleMapsUri,
      types: place.types,
      addressComponents: place.addressComponents,
      photoCount: place.photos?.length ?? 0,
    },
    coordinates: lat && lng ? { lat, lng } : null,
    streetViewUrl: lat && lng ? `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&key=${apiKey}` : null,
    zillowUrl: `https://www.zillow.com/homes/${encodeURIComponent(fullAddress)}`,
    googleMapsUrl: `https://www.google.com/maps/place/${encodeURIComponent(fullAddress)}`,
    researchedAt: new Date().toISOString(),
  }

  await db.property.update({
    where: { id: propertyId },
    data: { zillowData: researchData as unknown as import('@prisma/client').Prisma.InputJsonValue },
  })

  console.log(`[Property] Auto-researched ${address}: ${place.formattedAddress ?? 'no result'}`)
}

// Resolve (or lazily create) the market for a given zip.
// Tiered lookup: existing tenant markets → config MARKETS → Global catch-all.
// Never silently fails — any exception is logged as an audit row so missing
// market assignments are visible in ops instead of manifesting as "zip set,
// market null" rows on the inventory data-quality tile.
export async function resolveMarketForZip(tenantId: string, zip: string): Promise<string | null> {
  if (!zip) return null

  // Tier 1 — existing tenant markets with this zip
  try {
    const existing = await db.market.findFirst({
      where: { tenantId, zipCodes: { has: zip } },
      select: { id: true },
    })
    if (existing) return existing.id
  } catch (err) {
    console.error(`[Market] findFirst failed for zip ${zip}:`, err)
  }

  // Tier 2 — config/crm.config MARKETS (auto-creates a market record on first hit)
  try {
    const { getMarketsForZip, MARKETS } = await import('@/lib/config/crm.config')
    const names = getMarketsForZip(zip)
    if (names.length > 0) {
      const name = names[0]
      const zips = [...MARKETS[name].zips] as string[]
      const created = await db.market.create({ data: { tenantId, name, zipCodes: zips } })
      return created.id
    }
  } catch (err) {
    console.error(`[Market] Config lookup failed for zip ${zip}:`, err)
  }

  // Tier 3 — Global catch-all. findFirst-or-create with race protection.
  try {
    const global = await db.market.findFirst({
      where: { tenantId, name: 'Global' },
      select: { id: true },
    })
    if (global) return global.id
    try {
      const created = await db.market.create({ data: { tenantId, name: 'Global', zipCodes: [] } })
      return created.id
    } catch (createErr) {
      // Concurrent request already created it — re-read
      const retry = await db.market.findFirst({ where: { tenantId, name: 'Global' }, select: { id: true } })
      if (retry) return retry.id
      console.error(`[Market] Global create + retry failed for zip ${zip}:`, createErr)
    }
  } catch (err) {
    console.error(`[Market] Global resolution failed for zip ${zip}:`, err)
  }

  // Last resort — leave null but audit the gap
  try {
    await db.auditLog.create({
      data: {
        tenantId,
        action: 'market.resolve.failed',
        resource: 'property',
        source: 'SYSTEM',
        severity: 'WARNING',
        payload: { zip },
      },
    })
  } catch { /* audit is best-effort */ }

  return null
}

// Normalize street address for dedup matching
// "1799 Mellow Rd." → "1799 mellow rd"
// "123 N. Main Street" → "123 n main st"
function normalizeStreetAddress(address: string): string {
  if (!address) return ''

  return address
    .toLowerCase()
    .trim()
    .replace(/[.,#]+/g, '')          // remove punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\bsouth\b/g, 's')
    .replace(/\beast\b/g, 'e')
    .replace(/\bwest\b/g, 'w')
}
