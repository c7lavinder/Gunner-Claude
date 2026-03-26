// lib/properties.ts
// Property management logic — Gunner is source of truth for properties
// A contact (seller) can be attached to multiple properties
// No duplicate properties — deduped by tenantId + address
// Called from GHL webhook when pipeline stage matches tenant trigger

import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { triggerWorkflows } from '@/lib/workflows/engine'

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

    // Parse address from contact
    const address = contact.address1 ?? ''
    const city = contact.city ?? ''
    const state = contact.state ?? ''
    const zip = contact.postalCode ?? ''

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

    // Auto-assign market by zip code (check DB first, then config fallback)
    let marketId: string | null = null
    if (zip) {
      const market = await db.market.findFirst({
        where: { tenantId, zipCodes: { has: zip } },
        select: { id: true },
      })
      if (market) {
        marketId = market.id
      } else {
        // Check config and auto-create market if zip is in our network
        try {
          const { getMarketsForZip, MARKETS } = await import('@/lib/config/crm.config')
          const marketNames = getMarketsForZip(zip)
          if (marketNames.length > 0) {
            const name = marketNames[0]
            const zips = [...MARKETS[name].zips] as string[]
            const created = await db.market.create({
              data: { tenantId, name, zipCodes: zips },
            })
            marketId = created.id
          }
        } catch { /* config lookup optional */ }
      }
    }

    // Map GHL stage to app status
    let status: string = 'NEW_LEAD'
    if (context.ghlPipelineStage) {
      try {
        const { getAppStage } = await import('@/lib/ghl-stage-map')
        const appStage = getAppStage(context.ghlPipelineStage)
        const stageToStatus: Record<string, string> = {
          'acquisition.new_lead': 'NEW_LEAD', 'acquisition.appt_set': 'APPOINTMENT_SET',
          'acquisition.offer_made': 'OFFER_MADE', 'acquisition.contract': 'UNDER_CONTRACT',
          'acquisition.closed': 'SOLD', 'disposition.new_deal': 'IN_DISPOSITION',
          'longterm.follow_up': 'CONTACTED', 'longterm.dead': 'DEAD',
        }
        status = stageToStatus[appStage] ?? 'NEW_LEAD'
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

    // Auto-log LEAD milestone
    await db.propertyMilestone.create({
      data: {
        tenantId,
        propertyId: property.id,
        type: 'LEAD',
        source: 'AUTO_WEBHOOK',
      },
    }).catch(() => {}) // non-fatal

    // Trigger property_created workflows
    triggerWorkflows(tenantId, 'property_created', {
      contactId: ghlContactId,
      propertyId: property.id,
    }).catch(err => console.warn('[Property] Workflow trigger failed:', err))

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
