// POST /api/properties/[propertyId]/dispo-generate
// Generate one of three Section-2 disposition artifacts (description /
// listing / social) using lib/ai/dispo-generators.ts. Body: { kind }.
// Persists into Property.dispoArtifacts and returns the generated text.
//
// PATCH /api/properties/[propertyId]/dispo-generate
// Save manually edited artifact text without regenerating. Body:
// { kind, text }. Used when the rep edits the textarea inline.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import {
  generateDispoArtifact,
  generateTierMessages,
  type DispoArtifactKind,
  BUYER_TIERS,
} from '@/lib/ai/dispo-generators'

const KIND_VALUES = ['description', 'listing', 'social', 'tiers'] as const
const FIELD_KEY: Record<DispoArtifactKind, 'description' | 'listingPost' | 'socialPost'> = {
  description: 'description',
  listing: 'listingPost',
  social: 'socialPost',
}

const generateSchema = z.object({
  kind: z.enum(KIND_VALUES),
})

const patchTextSchema = z.object({
  kind: z.enum(['description', 'listing', 'social']),
  text: z.string(),
})

// Session 77 round 2 — PATCH a single tier message field directly
// (used when the rep edits one of the 5 tier email/SMS bodies inline).
const patchTierSchema = z.object({
  kind: z.literal('tier'),
  tier: z.enum(BUYER_TIERS),
  field: z.enum(['emailSubject', 'emailBody', 'smsBody']),
  text: z.string(),
})

const patchSchema = z.union([patchTextSchema, patchTierSchema])

export const POST = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  // Class-4 gate: confirm property belongs to tenant before delegating.
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  if (parsed.data.kind === 'tiers') {
    const result = await generateTierMessages(params.propertyId, ctx.tenantId, ctx.userId)
    if (result.status === 'error') {
      return NextResponse.json({ error: result.reason ?? 'Generation failed' }, { status: 500 })
    }
    return NextResponse.json({ status: 'success', kind: 'tiers', tiers: result.tiers })
  }

  const result = await generateDispoArtifact(
    params.propertyId,
    ctx.tenantId,
    parsed.data.kind,
    ctx.userId,
  )
  if (result.status === 'error') {
    return NextResponse.json({ error: result.reason ?? 'Generation failed' }, { status: 500 })
  }

  return NextResponse.json({ status: 'success', kind: parsed.data.kind, text: result.text })
})

export const PATCH = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { dispoArtifacts: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const current = (property.dispoArtifacts ?? {}) as Record<string, unknown>

  let updated: Record<string, unknown>
  if (parsed.data.kind === 'tier') {
    // Inline edit to one tier × one field. Merge into tierMessages[tier][field].
    const tiers = (current.tierMessages ?? {}) as Record<string, Record<string, string>>
    const tier = parsed.data.tier
    const field = parsed.data.field
    updated = {
      ...current,
      tierMessages: {
        ...tiers,
        [tier]: { ...(tiers[tier] ?? {}), [field]: parsed.data.text },
      },
    }
  } else {
    const fieldKey = FIELD_KEY[parsed.data.kind]
    updated = { ...current, [fieldKey]: parsed.data.text }
  }

  await db.property.update({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    data: {
      dispoArtifacts: JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ status: 'success' })
})
