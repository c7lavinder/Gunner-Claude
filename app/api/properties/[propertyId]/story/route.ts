// GET  /api/properties/[propertyId]/story — return the stored story + freshness
// POST /api/properties/[propertyId]/story — regenerate the story on demand
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { generatePropertyStory } from '@/lib/ai/generate-property-story'

export async function GET(
  _req: Request,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    select: { story: true, storyUpdatedAt: true, storyVersion: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  return NextResponse.json({
    story: property.story,
    storyUpdatedAt: property.storyUpdatedAt?.toISOString() ?? null,
    storyVersion: property.storyVersion,
  })
}

export async function POST(
  _req: Request,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const result = await generatePropertyStory(params.propertyId)
  if (result.status === 'error') {
    return NextResponse.json({ error: result.reason ?? 'Generation failed' }, { status: 500 })
  }
  if (result.status === 'skipped') {
    return NextResponse.json({ status: 'skipped', reason: result.reason })
  }

  const updated = await db.property.findUnique({
    where: { id: params.propertyId },
    select: { story: true, storyUpdatedAt: true, storyVersion: true },
  })

  return NextResponse.json({
    status: 'success',
    story: updated?.story,
    storyUpdatedAt: updated?.storyUpdatedAt?.toISOString() ?? null,
    storyVersion: updated?.storyVersion,
  })
}
