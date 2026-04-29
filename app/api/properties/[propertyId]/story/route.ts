// GET  /api/properties/[propertyId]/story — return the stored story + freshness
// POST /api/properties/[propertyId]/story — regenerate the story on demand
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { generatePropertyStory } from '@/lib/ai/generate-property-story'

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { story: true, storyUpdatedAt: true, storyVersion: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  return NextResponse.json({
    story: property.story,
    storyUpdatedAt: property.storyUpdatedAt?.toISOString() ?? null,
    storyVersion: property.storyVersion,
  })
})

export const POST = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  // Class 4 gate: validate property belongs to this tenant before delegating
  // to generatePropertyStory (which does an internal id-only findUnique).
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const result = await generatePropertyStory(params.propertyId, ctx.tenantId)
  if (result.status === 'error') {
    return NextResponse.json({ error: result.reason ?? 'Generation failed' }, { status: 500 })
  }
  if (result.status === 'skipped') {
    return NextResponse.json({ status: 'skipped', reason: result.reason })
  }

  // FIX: was leaking — Class 1 (variant 4: id-only findUnique on read-back).
  // Prior code used findUnique({ id }) for the post-generation read, which
  // could (in theory) leak another tenant's row if propertyIds collided.
  // Defense-in-depth: scope the read.
  const updated = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { story: true, storyUpdatedAt: true, storyVersion: true },
  })

  return NextResponse.json({
    status: 'success',
    story: updated?.story,
    storyUpdatedAt: updated?.storyUpdatedAt?.toISOString() ?? null,
    storyVersion: updated?.storyVersion,
  })
})
