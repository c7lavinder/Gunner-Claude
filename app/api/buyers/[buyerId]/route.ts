// PATCH /api/buyers/[buyerId] — edit buyer details
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  mobilePhone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  tier: z.string().optional(),
  markets: z.array(z.string()).optional(),
  // Session 77 round 2 — buybox-budget fields surfaced in the shared
  // BuyerEditSlideover. Numeric → Decimal columns on Buyer.
  minPurchasePrice: z.number().nullable().optional(),
  maxPurchasePrice: z.number().nullable().optional(),
  minArv: z.number().nullable().optional(),
  maxArv: z.number().nullable().optional(),
  maxRepairBudget: z.number().nullable().optional(),
  pofAmount: z.number().nullable().optional(),
  fundingType: z.string().nullable().optional(),
  // Legacy alias — older callers still send maxBuyPrice; route maps it
  // to maxPurchasePrice for back-compat.
  maxBuyPrice: z.number().nullable().optional(),
  verifiedFunding: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

export const PATCH = withTenant<{ buyerId: string }>(async (req, ctx, params) => {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })

    const buyer = await db.buyer.findFirst({
      where: { id: params.buyerId, tenantId: ctx.tenantId },
    })
    if (!buyer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const d = parsed.data

    // Merge customFields updates (tier + verifiedFunding stay there).
    const existingCustomFields = (buyer.customFields ?? {}) as Record<string, unknown>
    const updatedCustomFields = { ...existingCustomFields }
    if (d.tier !== undefined) updatedCustomFields.tier = d.tier
    if (d.verifiedFunding !== undefined) updatedCustomFields.verifiedFunding = d.verifiedFunding
    // Legacy alias support
    if (d.maxBuyPrice !== undefined && d.maxPurchasePrice === undefined) {
      // Map legacy maxBuyPrice → maxPurchasePrice column
    }
    const maxPurchase = d.maxPurchasePrice !== undefined ? d.maxPurchasePrice : d.maxBuyPrice

    // Update tags so the "tier:realtor"-style entries used by section4-
    // buyers fallback stay current too. Filter out any stale tier:* tags.
    let nextTags: string[] | undefined
    if (d.tier !== undefined) {
      const existingTags = (Array.isArray(buyer.tags) ? buyer.tags : []) as string[]
      const filtered = existingTags.filter(t => typeof t === 'string' && !t.startsWith('tier:'))
      nextTags = [...filtered, `tier:${d.tier}`]
    }

    const updated = await db.buyer.update({
      where: { id: params.buyerId, tenantId: ctx.tenantId },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.mobilePhone !== undefined && { mobilePhone: d.mobilePhone }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.company !== undefined && { company: d.company }),
        ...(d.markets !== undefined && { primaryMarkets: d.markets }),
        ...(d.minPurchasePrice !== undefined && { minPurchasePrice: d.minPurchasePrice }),
        ...(maxPurchase !== undefined && { maxPurchasePrice: maxPurchase }),
        ...(d.minArv !== undefined && { minArv: d.minArv }),
        ...(d.maxArv !== undefined && { maxArv: d.maxArv }),
        ...(d.maxRepairBudget !== undefined && { maxRepairBudget: d.maxRepairBudget }),
        ...(d.pofAmount !== undefined && { pofAmount: d.pofAmount }),
        ...(d.fundingType !== undefined && { fundingType: d.fundingType }),
        ...(d.notes !== undefined && { internalNotes: d.notes }),
        ...(nextTags !== undefined && { tags: nextTags }),
        customFields: JSON.parse(JSON.stringify(updatedCustomFields)),
      },
    })

    return NextResponse.json({ status: 'success', buyer: updated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
