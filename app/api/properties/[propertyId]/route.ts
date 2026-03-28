// app/api/properties/[propertyId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { Prisma, PropertyStatus } from '@prisma/client'
import { z } from 'zod'
import { awardPropertyXP } from '@/lib/gamification/xp'

const updateSchema = z.object({
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
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
  ownerName: z.string().nullable().optional(),
  deedDate: z.string().nullable().optional(),
  taxAssessment: z.string().nullable().optional(),
  annualTax: z.string().nullable().optional(),
  floodZone: z.string().nullable().optional(),
  aiEnrichmentStatus: z.string().nullable().optional(),
  // Deal Blast overrides
  dealBlastAskingOverride: z.string().nullable().optional(),
  dealBlastArvOverride: z.string().nullable().optional(),
  dealBlastContractOverride: z.string().nullable().optional(),
  dealBlastAssignmentFeeOverride: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
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
    repairEstimate, rentalEstimate, neighborhoodSummary, zestimate, ownerName, deedDate,
    taxAssessment, annualTax, floodZone, aiEnrichmentStatus,
    // Deal Blast overrides
    dealBlastAskingOverride, dealBlastArvOverride, dealBlastContractOverride, dealBlastAssignmentFeeOverride,
  } = parsed.data

  try {
    await db.$transaction(async (tx) => {
      // Update property
      await tx.property.update({
        where: { id: params.propertyId, tenantId: session.tenantId },
        data: {
          ...(rawAddress && { address: standardizeStreet(rawAddress) }),
          ...(rawCity && { city: standardizeCity(rawCity) }),
          ...(rawState && { state: standardizeState(rawState) }),
          ...(rawZip !== undefined && { zip: standardizeZip(rawZip ?? '') }),
          ...(status && { status: status as PropertyStatus }),
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
          ...(ownerName !== undefined && { ownerName }),
          ...(deedDate !== undefined && { deedDate: deedDate ? new Date(deedDate) : null }),
          ...(taxAssessment !== undefined && { taxAssessment: taxAssessment ? parseFloat(taxAssessment) : null }),
          ...(annualTax !== undefined && { annualTax: annualTax ? parseFloat(annualTax) : null }),
          ...(floodZone !== undefined && { floodZone }),
          ...(aiEnrichmentStatus !== undefined && { aiEnrichmentStatus }),
          // Deal Blast overrides
          ...(dealBlastAskingOverride !== undefined && { dealBlastAskingOverride: dealBlastAskingOverride ? parseFloat(dealBlastAskingOverride) : null }),
          ...(dealBlastArvOverride !== undefined && { dealBlastArvOverride: dealBlastArvOverride ? parseFloat(dealBlastArvOverride) : null }),
          ...(dealBlastContractOverride !== undefined && { dealBlastContractOverride: dealBlastContractOverride ? parseFloat(dealBlastContractOverride) : null }),
          ...(dealBlastAssignmentFeeOverride !== undefined && { dealBlastAssignmentFeeOverride: dealBlastAssignmentFeeOverride ? parseFloat(dealBlastAssignmentFeeOverride) : null }),
          // Merge field sources (AI vs user tracking) — empty string removes the key
          ...(fieldSources && {
            fieldSources: (() => {
              const merged = { ...((property.fieldSources as Record<string, string>) ?? {}), ...fieldSources }
              for (const k of Object.keys(merged)) { if (!merged[k]) delete merged[k] }
              return merged
            })(),
          }),
        },
      })

      // Update primary seller if name provided
      if (sellerName !== undefined) {
        const existingSeller = await tx.propertySeller.findFirst({
          where: { propertyId: params.propertyId, isPrimary: true },
          include: { seller: true },
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
              tenantId: session.tenantId,
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
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'property.updated',
        resource: 'property',
        resourceId: params.propertyId,
        source: 'USER',
        severity: 'INFO',
        payload: JSON.parse(JSON.stringify(parsed.data)) as Prisma.InputJsonValue,
      },
    })

    // Award XP for status milestones (Under Contract, Sold)
    if (status && (status === 'UNDER_CONTRACT' || status === 'SOLD')) {
      const assignee = property.assignedToId ?? session.userId
      awardPropertyXP(session.tenantId, assignee, params.propertyId, status).catch((err) => {
        console.warn(`[Properties] XP award failed:`, err)
      })
    }

    // Auto-log CLOSED milestone when property status → SOLD
    if (status === 'SOLD') {
      const existingClose = await db.propertyMilestone.findFirst({
        where: { propertyId: params.propertyId, type: 'CLOSED' },
      })
      if (!existingClose) {
        await db.propertyMilestone.create({
          data: {
            tenantId: session.tenantId,
            propertyId: params.propertyId,
            type: 'CLOSED',
            loggedById: session.userId,
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
}
