// PATCH /api/properties/[propertyId]/buyer-stage — update buyer pipeline stage
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  buyerId: z.string().min(1),
  stage: z.enum(['matched', 'responded', 'interested']),
})

export async function PATCH(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const { buyerId, stage } = parsed.data

    const record = await db.propertyBuyerStage.upsert({
      where: { propertyId_buyerId: { propertyId: params.propertyId, buyerId } },
      create: {
        tenantId: session.tenantId,
        propertyId: params.propertyId,
        buyerId,
        stage,
      },
      update: { stage },
    })

    return NextResponse.json({ status: 'success', stage: record.stage })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
