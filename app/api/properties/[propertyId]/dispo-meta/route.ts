// PATCH /api/properties/[propertyId]/dispo-meta
// Merges narrowly-scoped meta fields into Property.dispoArtifacts JSON.
// Currently used for:
//   - primaryOfferType: which offer type the rep is currently pushing
//     ("Cash" | "Sub-to" | any custom alt type from offerTypes[])
//   - descriptionGeneratedForType: which offer type the description
//     artifact was generated against. Drives the Section 2 stale-nudge
//     when the rep flips the primary after generating.
//
// Lives separately from /dispo-generate because it doesn't run AI — it's
// a tiny merge-into-JSON write that other components (Property Details
// panel, Section 2 artifacts) need on click without going through the
// full property PATCH schema.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'

const bodySchema = z.object({
  primaryOfferType: z.string().nullable().optional(),
  descriptionGeneratedForType: z.string().nullable().optional(),
})

export const PATCH = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { dispoArtifacts: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const current = (property.dispoArtifacts ?? {}) as Record<string, unknown>
  const next = { ...current }
  if (parsed.data.primaryOfferType !== undefined) {
    if (parsed.data.primaryOfferType === null) delete next.primaryOfferType
    else next.primaryOfferType = parsed.data.primaryOfferType
  }
  if (parsed.data.descriptionGeneratedForType !== undefined) {
    if (parsed.data.descriptionGeneratedForType === null) delete next.descriptionGeneratedForType
    else next.descriptionGeneratedForType = parsed.data.descriptionGeneratedForType
  }

  await db.property.update({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    data: {
      dispoArtifacts: JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ status: 'success', dispoArtifacts: next })
})
