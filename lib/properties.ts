// lib/properties.ts
// Property management logic — Gunner is source of truth for properties
// A contact (seller) can be attached to multiple properties
// No duplicate properties — deduped by tenantId + address
// Called from GHL webhook when pipeline stage matches tenant trigger

import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

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

    // Deduplicate by address — same address = same property
    // One contact CAN have multiple properties (different addresses)
    if (address && address !== 'Address pending') {
      const existing = await db.property.findFirst({
        where: {
          tenantId,
          address: { equals: address, mode: 'insensitive' },
          city: { equals: city, mode: 'insensitive' },
          state: { equals: state, mode: 'insensitive' },
        },
      })

      if (existing) {
        console.log(`[Property] Already exists at ${address}, ${city} ${state} — skipping`)
        return existing.id
      }
    }

    // Lead source: from opportunity source, or contact source
    const leadSource = context.opportunitySource || contact.source || null

    // Create property — Gunner is source of truth
    const property = await db.property.create({
      data: {
        tenantId,
        ghlContactId,
        ghlPipelineId: context.ghlPipelineId,
        ghlPipelineStage: context.ghlPipelineStage,
        leadSource,
        address: address || 'Address pending',
        city: city || '',
        state: state || '',
        zip: zip || '',
        status: 'NEW_LEAD',
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
