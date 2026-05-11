// app/api/properties/route.ts
import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import type { AcqStatus, DispoStatus, LongtermStatus } from '@prisma/client'
import { z } from 'zod'
import { enrichPropertyWithAI } from '@/lib/ai/enrich-property'
import { splitCombinedAddressIfNeeded } from '@/lib/properties'
import { enrichProperty } from '@/lib/enrichment/enrich-property'
import { getGHLClient } from '@/lib/ghl/client'

// Stage → (status, lane). Mirrors lib/ghl/webhooks.ts APP_STAGE_TO_STATUS
// so the inventory list, drag-drop, and intake form all agree on the
// status enum the property lands in.
const STAGE_TO_STATUS_LANE: Record<string, { status: string; lane: 'acq' | 'dispo' | 'longterm' }> = {
  'acquisition.new_lead':        { status: 'NEW_LEAD',         lane: 'acq' },
  'acquisition.appt_set':        { status: 'APPOINTMENT_SET',  lane: 'acq' },
  'acquisition.offer_made':      { status: 'OFFER_MADE',       lane: 'acq' },
  'acquisition.contract':        { status: 'UNDER_CONTRACT',   lane: 'acq' },
  'acquisition.closed':          { status: 'CLOSED',           lane: 'acq' },
  'disposition.new_deal':        { status: 'IN_DISPOSITION',   lane: 'dispo' },
  'disposition.pushed_out':      { status: 'DISPO_PUSHED',     lane: 'dispo' },
  'disposition.offers_received': { status: 'DISPO_OFFERS',     lane: 'dispo' },
  'disposition.contracted':      { status: 'DISPO_CONTRACTED', lane: 'dispo' },
  'disposition.closed':          { status: 'CLOSED',           lane: 'dispo' },
  'longterm.follow_up':          { status: 'FOLLOW_UP',        lane: 'longterm' },
  'longterm.dead':               { status: 'DEAD',             lane: 'longterm' },
}

const contactExisting = z.object({
  mode: z.literal('existing'),
  kind: z.enum(['partner', 'seller']),
  ghlContactId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
})
const contactNew = z.object({
  mode: z.literal('new'),
  kind: z.enum(['partner', 'seller']),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
})

const propertySchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().optional(),
  stage: z.string().min(1),
  leadSource: z.string().nullable().optional(),
  contact: z.union([contactExisting, contactNew]).optional(),
})

export const POST = withTenant(async (request, ctx) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.create')) return forbiddenResponse()

  const body = await request.json()
  const parsed = propertySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const { address: rawAddr, city: rawCity, state: rawState, zip: rawZip, stage, leadSource, contact } = parsed.data

  const stageMap = STAGE_TO_STATUS_LANE[stage]
  if (!stageMap) {
    return NextResponse.json({ error: `Unknown stage: ${stage}` }, { status: 400 })
  }

  const { standardizeStreet, standardizeCity, standardizeState, standardizeZip } = await import('@/lib/address')

  // Step 1 — If the user picked "create new contact", push it to GHL
  // before we open the DB transaction so we have a real ghlContactId.
  // Failures here abort the whole intake (better than leaving an orphan
  // Property with no contact).
  let resolvedContact: { ghlContactId: string; name: string; phone: string | null; email: string | null; kind: 'partner' | 'seller' } | null = null
  if (contact?.mode === 'existing') {
    resolvedContact = {
      ghlContactId: contact.ghlContactId,
      name: contact.name,
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      kind: contact.kind,
    }
  } else if (contact?.mode === 'new') {
    try {
      const ghl = await getGHLClient(ctx.tenantId)
      const parts = contact.name.trim().split(/\s+/)
      const firstName = parts[0] ?? contact.name
      const lastName = parts.slice(1).join(' ') || undefined
      const created = await ghl.createContact({
        firstName,
        lastName,
        phone: contact.phone ?? undefined,
        email: contact.email ?? undefined,
        source: 'Gunner — Add Property',
      })
      resolvedContact = {
        ghlContactId: created.contact.id,
        name: contact.name,
        phone: contact.phone ?? null,
        email: contact.email ?? null,
        kind: contact.kind,
      }
    } catch (err) {
      console.error('[Properties POST] GHL contact create failed:', err)
      return NextResponse.json({ error: 'Could not create GHL contact — try again or pick an existing one' }, { status: 502 })
    }
  }

  try {
    const property = await db.$transaction(async (tx) => {
      const now = new Date()
      // Per-lane field map. Only the lane the user picked gets populated;
      // other lanes stay null until the property progresses.
      const lanePayload: Record<string, unknown> = {}
      if (stageMap.lane === 'acq') {
        lanePayload.acqStatus = stageMap.status as AcqStatus
        lanePayload.acqStageEnteredAt = now
      } else if (stageMap.lane === 'dispo') {
        lanePayload.dispoStatus = stageMap.status as DispoStatus
        lanePayload.dispoStageEnteredAt = now
        lanePayload.dispoPipelineEnteredAt = now
      } else {
        lanePayload.longtermStatus = stageMap.status as LongtermStatus
        lanePayload.longtermStageEnteredAt = now
      }

      const prop = await tx.property.create({
        data: {
          tenantId: ctx.tenantId,
          address: standardizeStreet(rawAddr),
          city: standardizeCity(rawCity),
          state: standardizeState(rawState),
          zip: standardizeZip(rawZip ?? ''),
          leadSource: leadSource ?? null,
          ghlContactId: resolvedContact?.ghlContactId ?? null,
          ...lanePayload,
        },
      })

      // Step 2 — write the contact into the matching Gunner table. The
      // role toggle (partner vs seller) controls which table.
      if (resolvedContact) {
        if (resolvedContact.kind === 'seller') {
          // Reuse existing Seller by ghlContactId if one is already on
          // file — avoids duplicate Seller rows when the same homeowner
          // sells multiple properties.
          const existingSeller = await tx.seller.findFirst({
            where: { tenantId: ctx.tenantId, ghlContactId: resolvedContact.ghlContactId },
            select: { id: true },
          })
          const sellerId = existingSeller?.id ?? (await tx.seller.create({
            data: {
              tenantId: ctx.tenantId,
              name: resolvedContact.name,
              phone: resolvedContact.phone,
              email: resolvedContact.email,
              ghlContactId: resolvedContact.ghlContactId,
            },
          })).id
          await tx.propertySeller.create({
            data: { propertyId: prop.id, sellerId, isPrimary: true },
          })
        } else {
          // Partner — same dedup pattern: reuse the Partner row if this
          // GHL contact is already a partner in the tenant.
          const existingPartner = await tx.partner.findFirst({
            where: { tenantId: ctx.tenantId, ghlContactId: resolvedContact.ghlContactId },
            select: { id: true },
          })
          const partnerId = existingPartner?.id ?? (await tx.partner.create({
            data: {
              tenantId: ctx.tenantId,
              name: resolvedContact.name,
              phone: resolvedContact.phone,
              email: resolvedContact.email,
              ghlContactId: resolvedContact.ghlContactId,
            },
          })).id
          await tx.propertyPartner.create({
            data: {
              propertyId: prop.id,
              partnerId,
              role: leadSource === 'JV' ? 'jv_partner' : 'sourced_to_us',
            },
          })
        }
      }

      return prop
    })

    // Auto-log LEAD milestone (dedup: skip if one already exists)
    const existingLead = await db.propertyMilestone.findFirst({
      where: { tenantId: ctx.tenantId, propertyId: property.id, type: 'LEAD' },
    }).catch(() => null)
    if (!existingLead) {
      await db.propertyMilestone.create({
        data: {
          tenantId: ctx.tenantId,
          propertyId: property.id,
          type: 'LEAD',
          loggedById: ctx.userId,
          source: 'MANUAL',
        },
      }).catch(() => {})
    }

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'property.created',
        resource: 'property',
        resourceId: property.id,
        source: 'USER',
        severity: 'INFO',
        payload: {
          address: standardizeStreet(rawAddr),
          city: standardizeCity(rawCity),
          state: standardizeState(rawState),
          stage,
          leadSource: leadSource ?? null,
          contact: resolvedContact ? { ghlContactId: resolvedContact.ghlContactId, kind: resolvedContact.kind, new: contact?.mode === 'new' } : null,
        },
      },
    })

    // Split combined addresses (e.g. "2716 & 2720 Enterprise Ave") into
    // separate rows if needed. Same behavior as before — non-fatal.
    const splitResult = await splitCombinedAddressIfNeeded(property.id, ctx.tenantId).catch(err => {
      console.error('[Properties POST] Split check failed:', err)
      return { splitInto: null as string[] | null }
    })
    const returnedId = splitResult.splitInto?.[0] ?? property.id

    const enrichIds = splitResult.splitInto ?? [property.id]
    for (const id of enrichIds) {
      enrichProperty(id, ctx.tenantId).catch(err =>
        console.error('[Vendor Enrich] Background error:', err instanceof Error ? err.message : err)
      )
      enrichPropertyWithAI(id, ctx.tenantId).catch(err =>
        console.error('[AI Enrich] Background error:', err instanceof Error ? err.message : err)
      )
    }

    return NextResponse.json({ property: { id: returnedId }, split: splitResult.splitInto }, { status: 201 })
  } catch (err) {
    console.error('[Properties] Create error:', err)
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 })
  }
})
