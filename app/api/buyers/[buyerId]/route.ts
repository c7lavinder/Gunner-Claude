// PATCH /api/buyers/[buyerId] — edit buyer details
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().nullable().optional(),
  tier: z.string().optional(),
  markets: z.array(z.string()).optional(),
  maxBuyPrice: z.number().nullable().optional(),
  verifiedFunding: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { buyerId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })

    const buyer = await db.buyer.findFirst({
      where: { id: params.buyerId, tenantId: session.tenantId },
    })
    if (!buyer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { name, phone, email, tier, markets, maxBuyPrice, verifiedFunding, notes } = parsed.data

    // Merge criteria updates
    const existingCriteria = (buyer.criteria ?? {}) as Record<string, unknown>
    const updatedCriteria = { ...existingCriteria }
    if (tier !== undefined) updatedCriteria.tier = tier
    if (maxBuyPrice !== undefined) updatedCriteria.maxBuyPrice = maxBuyPrice
    if (verifiedFunding !== undefined) updatedCriteria.verifiedFunding = verifiedFunding

    const updated = await db.buyer.update({
      where: { id: params.buyerId },
      data: {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(markets !== undefined && { markets }),
        ...(notes !== undefined && { notes }),
        criteria: JSON.parse(JSON.stringify(updatedCriteria)),
      },
    })

    return NextResponse.json({ status: 'success', buyer: updated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
