// app/api/[tenant]/properties/[propertyId]/contact-suggestions/route.ts
// GET — fetch pending contact suggestions for a property
// PATCH — bulk approve/edit/skip suggestions

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { withTenant } from '@/lib/api/withTenant'

type Params = { tenant: string; propertyId: string }

export const GET = withTenant<Params>(async (_req, ctx, params) => {
  const suggestions = await db.contactSuggestion.findMany({
    where: {
      tenantId: ctx.tenantId,
      propertyId: params.propertyId,
      status: 'pending',
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ total: suggestions.length, suggestions })
})

interface Decision {
  id: string
  status: 'approved' | 'edited' | 'skipped'
  finalValue?: unknown
}

export const PATCH = withTenant<Params>(async (req, ctx, params) => {
  const body = await req.json()
  const decisions = body.decisions as Decision[]
  if (!Array.isArray(decisions)) {
    return NextResponse.json({ error: 'decisions array required' }, { status: 400 })
  }

  let updated = 0

  for (const decision of decisions) {
    const suggestion = await db.contactSuggestion.findFirst({
      where: { id: decision.id, tenantId: ctx.tenantId, propertyId: params.propertyId },
    })
    if (!suggestion) continue

    const finalValue = decision.status === 'edited' ? decision.finalValue : suggestion.proposedValue

    // Update the suggestion record
    await db.contactSuggestion.update({
      where: { id: decision.id },
      data: {
        status: decision.status,
        finalValue: finalValue as import('@prisma/client').Prisma.InputJsonValue ?? undefined,
        decidedAt: new Date(),
        decidedById: ctx.userId,
      },
    })

    // Write to target record if approved or edited
    if (decision.status === 'approved' || decision.status === 'edited') {
      const fieldData = { [suggestion.fieldName]: finalValue }

      if (suggestion.targetType === 'seller' && suggestion.sellerId) {
        const seller = await db.seller.findFirst({
          where: { id: suggestion.sellerId, tenantId: ctx.tenantId },
          select: { fieldSources: true },
        })
        const sources = { ...((seller?.fieldSources ?? {}) as Record<string, string>), [suggestion.fieldName]: 'ai' }
        await db.seller.update({
          where: { id: suggestion.sellerId },
          data: { ...fieldData, fieldSources: sources },
        })
      } else if (suggestion.targetType === 'buyer' && suggestion.buyerId) {
        const buyer = await db.buyer.findFirst({
          where: { id: suggestion.buyerId, tenantId: ctx.tenantId },
          select: { fieldSources: true },
        })
        const sources = { ...((buyer?.fieldSources ?? {}) as Record<string, string>), [suggestion.fieldName]: 'ai' }
        await db.buyer.update({
          where: { id: suggestion.buyerId },
          data: { ...fieldData, fieldSources: sources },
        })
      } else if (suggestion.targetType === 'property') {
        await db.property.update({
          where: { id: params.propertyId },
          data: fieldData,
        })
      }
    }

    updated++
  }

  return NextResponse.json({ updated })
})
