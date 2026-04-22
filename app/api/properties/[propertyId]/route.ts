// app/api/properties/[propertyId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { Prisma, PropertyStatus } from '@prisma/client'
import { z } from 'zod'
import { awardPropertyXP } from '@/lib/gamification/xp'
import type { UserRole } from '@/types/roles'
import { splitCombinedAddressIfNeeded } from '@/lib/properties'

const updateSchema = z.object({
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  market: z.string().nullable().optional(),
  status: z.string().optional(),
  arv: z.string().nullable().optional(),
  askingPrice: z.string().nullable().optional(),
  mao: z.string().nullable().optional(),
  contractPrice: z.string().nullable().optional(),
  assignmentFee: z.string().nullable().optional(),
  offerPrice: z.string().nullable().optional(),
  repairCost: z.string().nullable().optional(),
  wholesalePrice: z.string().nullable().optional(),
  currentOffer: z.string().nullable().optional(),
  highestOffer: z.string().nullable().optional(),
  acceptedPrice: z.string().nullable().optional(),
  finalProfit: z.string().nullable().optional(),
  // Source tracking: { fieldName: "ai" | "user" | "" (clear) }
  fieldSources: z.record(z.string(), z.string()).optional(),
  assignedToId: z.string().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  sellerPhone: z.string().nullable().optional(),
  sellerEmail: z.string().nullable().optional(),
  // Property details
  beds: z.number().nullable().optional(),
  baths: z.number().nullable().optional(),
  sqft: z.number().nullable().optional(),
  yearBuilt: z.number().nullable().optional(),
  lotSize: z.string().nullable().optional(),
  propertyType: z.string().nullable().optional(),
  occupancy: z.string().nullable().optional(),
  projectType: z.array(z.string()).optional(),
  propertyMarkets: z.array(z.string()).optional(),
  lockboxCode: z.string().nullable().optional(),
  // Utilities
  waterType: z.string().nullable().optional(),
  waterNotes: z.string().nullable().optional(),
  sewerType: z.string().nullable().optional(),
  sewerCondition: z.string().nullable().optional(),
  sewerNotes: z.string().nullable().optional(),
  electricType: z.string().nullable().optional(),
  electricNotes: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  // Tracking dates
  lastOfferDate: z.string().nullable().optional(),
  lastContactedDate: z.string().nullable().optional(),
  // AI enrichment fields
  repairEstimate: z.string().nullable().optional(),
  rentalEstimate: z.string().nullable().optional(),
  neighborhoodSummary: z.string().nullable().optional(),
  zestimate: z.string().nullable().optional(),
  deedDate: z.string().nullable().optional(),
  taxAssessment: z.string().nullable().optional(),
  annualTax: z.string().nullable().optional(),
  floodZone: z.string().nullable().optional(),
  aiEnrichmentStatus: z.string().nullable().optional(),
  // Deal Intel
  propertyCondition: z.string().nullable().optional(),
  // Deal Blast overrides
  dealBlastAskingOverride: z.string().nullable().optional(),
  dealBlastArvOverride: z.string().nullable().optional(),
  dealBlastContractOverride: z.string().nullable().optional(),
  dealBlastAssignmentFeeOverride: z.string().nullable().optional(),
  // GHL sync toggle — when true, webhook stage updates skip this property.
  ghlSyncLocked: z.boolean().optional(),
  // Alt offer types (Novation / Subto / Partnership / custom) — Cash stays in
  // askingPrice/mao/contractPrice/etc. columns. offerTypes is the list of alt
  // type names for this property; altPrices is keyed by offer type →
  // { [priceField]: stringValue } where priceField is one of the Cash columns.
  offerTypes: z.array(z.string()).optional(),
  altPrices: z.record(z.string(), z.record(z.string(), z.string().nullable())).optional(),
})

export const PATCH = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[Properties] Validation failed:', JSON.stringify(parsed.error.issues))
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })
  }

  // Standardize address fields on save
  const { standardizeStreet, standardizeCity, standardizeState, standardizeZip } = await import('@/lib/address')

  const {
    address: rawAddress, city: rawCity, state: rawState, zip: rawZip, status,
    arv, askingPrice, mao, contractPrice, assignmentFee,
    offerPrice, repairCost, wholesalePrice,
    currentOffer, highestOffer, acceptedPrice, finalProfit,
    fieldSources,
    assignedToId, sellerName, sellerPhone, sellerEmail,
    beds, baths, sqft, yearBuilt, lotSize, propertyType, occupancy,
    lockboxCode, projectType, propertyMarkets,
    waterType, waterNotes, sewerType, sewerCondition, sewerNotes, electricType, electricNotes,
    description, internalNotes, lastOfferDate, lastContactedDate,
    // AI enrichment fields
    repairEstimate, rentalEstimate, neighborhoodSummary, zestimate, deedDate,
    taxAssessment, annualTax, floodZone, aiEnrichmentStatus,
    // Deal Intel
    propertyCondition,
    // Deal Blast overrides
    dealBlastAskingOverride, dealBlastArvOverride, dealBlastContractOverride, dealBlastAssignmentFeeOverride,
    market: marketName,
    ghlSyncLocked,
    offerTypes,
    altPrices,
  } = parsed.data

  try {
    // Resolve market name → Market record (find or create)
    let marketId: string | undefined
    if (marketName) {
      const existing = await db.market.findFirst({
        where: { tenantId: ctx.tenantId, name: { equals: marketName, mode: 'insensitive' } },
      })
      if (existing) {
        marketId = existing.id
      } else {
        const created = await db.market.create({
          data: { tenantId: ctx.tenantId, name: marketName },
        })
        marketId = created.id
      }
    }

    await db.$transaction(async (tx) => {
      // If fieldSources is in the patch we MUST read + merge + write atomically
      // or a second concurrent PATCH on the same property can clobber the first
      // writer's keys. Advisory lock keyed on the property id makes concurrent
      // PATCHes for the same row serialize while leaving unrelated properties
      // free to proceed in parallel.
      let mergedFieldSources: Record<string, string> | undefined
      let mergedAltPrices: Record<string, Record<string, string | null>> | undefined
      if (fieldSources || altPrices) {
        // Both fieldSources and altPrices are merge-by-key fields. We read +
        // merge + write under a per-property advisory lock so concurrent PATCHes
        // on the same row serialize. Unrelated properties stay parallel.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.propertyId}))`
        const fresh = await tx.property.findUnique({
          where: { id: params.propertyId, tenantId: ctx.tenantId },
          select: { fieldSources: true, altPrices: true },
        })
        if (fieldSources) {
          const current = (fresh?.fieldSources as Record<string, string>) ?? {}
          const merged: Record<string, string> = { ...current, ...fieldSources }
          for (const k of Object.keys(merged)) { if (!merged[k]) delete merged[k] }
          mergedFieldSources = merged
        }
        if (altPrices) {
          const current = (fresh?.altPrices as Record<string, Record<string, string | null>>) ?? {}
          const merged: Record<string, Record<string, string | null>> = { ...current }
          for (const [type, patch] of Object.entries(altPrices)) {
            const existing = merged[type] ?? {}
            const next: Record<string, string | null> = { ...existing, ...patch }
            // Drop null/empty cells so the blob doesn't grow unbounded
            for (const k of Object.keys(next)) { if (next[k] == null || next[k] === '') delete next[k] }
            if (Object.keys(next).length > 0) merged[type] = next
            else delete merged[type]
          }
          mergedAltPrices = merged
        }
      }

      // Update property
      await tx.property.update({
        where: { id: params.propertyId, tenantId: ctx.tenantId },
        data: {
          ...(marketId && { marketId }),
          ...(rawAddress && { address: standardizeStreet(rawAddress) }),
          ...(rawCity && { city: standardizeCity(rawCity) }),
          ...(rawState && { state: standardizeState(rawState) }),
          ...(rawZip !== undefined && { zip: standardizeZip(rawZip ?? '') }),
          ...(status && status !== property.status && {
            status: status as PropertyStatus,
            stageEnteredAt: new Date(),
          }),
          ...(arv !== undefined && { arv: arv ? parseFloat(arv) : null }),
          ...(askingPrice !== undefined && { askingPrice: askingPrice ? parseFloat(askingPrice) : null }),
          ...(mao !== undefined && { mao: mao ? parseFloat(mao) : null }),
          ...(contractPrice !== undefined && { contractPrice: contractPrice ? parseFloat(contractPrice) : null }),
          ...(assignmentFee !== undefined && { assignmentFee: assignmentFee ? parseFloat(assignmentFee) : null }),
          ...(offerPrice !== undefined && { offerPrice: offerPrice ? parseFloat(offerPrice) : null }),
          ...(repairCost !== undefined && { repairCost: repairCost ? parseFloat(repairCost) : null }),
          ...(wholesalePrice !== undefined && { wholesalePrice: wholesalePrice ? parseFloat(wholesalePrice) : null }),
          ...(currentOffer !== undefined && { currentOffer: currentOffer ? parseFloat(currentOffer) : null }),
          ...(highestOffer !== undefined && { highestOffer: highestOffer ? parseFloat(highestOffer) : null }),
          ...(acceptedPrice !== undefined && { acceptedPrice: acceptedPrice ? parseFloat(acceptedPrice) : null }),
          ...(finalProfit !== undefined && { finalProfit: finalProfit ? parseFloat(finalProfit) : null }),
          ...(assignedToId !== undefined && { assignedToId: assignedToId ?? undefined }),
          ...(beds !== undefined && { beds }),
          ...(baths !== undefined && { baths }),
          ...(sqft !== undefined && { sqft }),
          ...(yearBuilt !== undefined && { yearBuilt }),
          ...(lotSize !== undefined && { lotSize }),
          ...(propertyType !== undefined && { propertyType }),
          ...(occupancy !== undefined && { occupancy }),
          ...(lockboxCode !== undefined && { lockboxCode }),
          ...(waterType !== undefined && { waterType }),
          ...(waterNotes !== undefined && { waterNotes }),
          ...(sewerType !== undefined && { sewerType }),
          ...(sewerCondition !== undefined && { sewerCondition }),
          ...(sewerNotes !== undefined && { sewerNotes }),
          ...(electricType !== undefined && { electricType }),
          ...(electricNotes !== undefined && { electricNotes }),
          ...(projectType !== undefined && { projectType }),
          ...(propertyMarkets !== undefined && { propertyMarkets }),
          ...(description !== undefined && { description }),
          ...(internalNotes !== undefined && { internalNotes }),
          ...(lastOfferDate !== undefined && { lastOfferDate: lastOfferDate ? new Date(lastOfferDate) : null }),
          ...(lastContactedDate !== undefined && { lastContactedDate: lastContactedDate ? new Date(lastContactedDate) : null }),
          // AI enrichment fields
          ...(repairEstimate !== undefined && { repairEstimate: repairEstimate ? parseFloat(repairEstimate) : null }),
          ...(rentalEstimate !== undefined && { rentalEstimate: rentalEstimate ? parseFloat(rentalEstimate) : null }),
          ...(neighborhoodSummary !== undefined && { neighborhoodSummary }),
          ...(zestimate !== undefined && { zestimate: zestimate ? parseFloat(zestimate) : null }),
          ...(deedDate !== undefined && { deedDate: deedDate ? new Date(deedDate) : null }),
          ...(taxAssessment !== undefined && { taxAssessment: taxAssessment ? parseFloat(taxAssessment) : null }),
          ...(annualTax !== undefined && { annualTax: annualTax ? parseFloat(annualTax) : null }),
          ...(floodZone !== undefined && { floodZone }),
          ...(aiEnrichmentStatus !== undefined && { aiEnrichmentStatus }),
          // Deal Intel
          ...(propertyCondition !== undefined && { propertyCondition }),
          // Deal Blast overrides
          ...(dealBlastAskingOverride !== undefined && { dealBlastAskingOverride: dealBlastAskingOverride ? parseFloat(dealBlastAskingOverride) : null }),
          ...(dealBlastArvOverride !== undefined && { dealBlastArvOverride: dealBlastArvOverride ? parseFloat(dealBlastArvOverride) : null }),
          ...(dealBlastContractOverride !== undefined && { dealBlastContractOverride: dealBlastContractOverride ? parseFloat(dealBlastContractOverride) : null }),
          ...(dealBlastAssignmentFeeOverride !== undefined && { dealBlastAssignmentFeeOverride: dealBlastAssignmentFeeOverride ? parseFloat(dealBlastAssignmentFeeOverride) : null }),
          // Merged inside the transaction above under pg_advisory_xact_lock —
          // prevents concurrent-PATCH clobber on { fieldName: "ai" | "user" }.
          ...(mergedFieldSources !== undefined && { fieldSources: mergedFieldSources }),
          ...(ghlSyncLocked !== undefined && { ghlSyncLocked }),
          ...(offerTypes !== undefined && { offerTypes }),
          ...(mergedAltPrices !== undefined && { altPrices: mergedAltPrices as unknown as Prisma.InputJsonValue }),
        },
      })

      // Update primary seller if name provided
      if (sellerName !== undefined) {
        const existingSeller = await tx.propertySeller.findFirst({
          where: { propertyId: params.propertyId, isPrimary: true },
          include: { seller: { select: { id: true, name: true, phone: true, email: true } } },
        })

        if (existingSeller) {
          await tx.seller.update({
            where: { id: existingSeller.sellerId },
            data: {
              name: sellerName || existingSeller.seller.name,
              phone: sellerPhone ?? existingSeller.seller.phone,
              email: sellerEmail ?? existingSeller.seller.email,
            },
          })
        } else if (sellerName) {
          const seller = await tx.seller.create({
            data: {
              tenantId: ctx.tenantId,
              name: sellerName,
              phone: sellerPhone ?? null,
              email: sellerEmail ?? null,
            },
          })
          await tx.propertySeller.create({
            data: { propertyId: params.propertyId, sellerId: seller.id, isPrimary: true },
          })
        }
      }
    })

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'property.updated',
        resource: 'property',
        resourceId: params.propertyId,
        source: 'USER',
        severity: 'INFO',
        payload: JSON.parse(JSON.stringify(parsed.data)) as Prisma.InputJsonValue,
      },
    })

    // If this PATCH set the address to a combined pattern (rare via form, more
    // common via AI extraction / GHL sync), split it here. No-op if the address
    // is single. Skips gracefully if the property has already been deleted.
    if (rawAddress) {
      await splitCombinedAddressIfNeeded(params.propertyId).catch(err => {
        console.error('[Properties PATCH] Split check failed:', err)
      })
    }

    // Award XP for status milestones (Under Contract, Sold)
    if (status && (status === 'UNDER_CONTRACT' || status === 'SOLD')) {
      const assignee = property.assignedToId ?? ctx.userId
      awardPropertyXP(ctx.tenantId, assignee, params.propertyId, status).catch((err) => {
        console.warn(`[Properties] XP award failed:`, err)
      })
    }

    // Auto-log CLOSED milestone when property status → SOLD
    if (status === 'SOLD') {
      const existingClose = await db.propertyMilestone.findFirst({
        where: { propertyId: params.propertyId, tenantId: ctx.tenantId, type: 'CLOSED' },
      })
      if (!existingClose) {
        await db.propertyMilestone.create({
          data: {
            tenantId: ctx.tenantId,
            propertyId: params.propertyId,
            type: 'CLOSED',
            loggedById: ctx.userId,
            source: 'AUTO_WEBHOOK',
          },
        }).catch(() => {})
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Properties] Update error:', err)
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 })
  }
})
