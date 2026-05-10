// PATCH /api/buyers/[buyerId] — edit buyer details (Session 78 wave).
//
// Two layers of fields:
//   1. Contact info (name, phone, mobilePhone, email, company) — also
//      lives in GHL and round-trips both ways (we'll refactor the GHL
//      write path in a follow-up; for now writes only land in Gunner).
//   2. Buyer-info canonical fields — Gunner is the source of truth.
//      These persist into Buyer.customFields JSON or first-class
//      columns (markets, internalNotes). The sync job no longer
//      overwrites them on subsequent GHL pulls.
//
// Canonical fields: tier, verifiedFunding, purchasedBefore,
// responseSpeed, lastContactDate, internalNotes, buybox, markets,
// secondaryMarket. Plus the legacy buybox-budget min/max numerics
// (kept for back-compat with the older slideover).

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  // ── Contact info (synced with GHL) ───────────────────────────────
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  mobilePhone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  company: z.string().nullable().optional(),

  // ── Canonical buyer-info fields (Gunner source of truth) ─────────
  tier: z.string().nullable().optional(),
  verifiedFunding: z.boolean().optional(),
  // Renamed from hasPurchased to match the user-facing label "Purchased Before".
  purchasedBefore: z.boolean().optional(),
  responseSpeed: z.string().nullable().optional(),
  // ISO date string (YYYY-MM-DD or full ISO).
  lastContactDate: z.string().nullable().optional(),
  // Multi-value buybox (project-type tags). Replaces the older string
  // form; we accept either for back-compat then store an array.
  buybox: z.union([z.array(z.string()), z.string()]).optional(),
  markets: z.array(z.string()).optional(),
  // Singular per the latest spec — stored as a string in customFields.
  secondaryMarket: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),

  // ── Legacy buybox-budget numerics (retained for older callers) ───
  minPurchasePrice: z.number().nullable().optional(),
  maxPurchasePrice: z.number().nullable().optional(),
  minArv: z.number().nullable().optional(),
  maxArv: z.number().nullable().optional(),
  maxRepairBudget: z.number().nullable().optional(),
  pofAmount: z.number().nullable().optional(),
  fundingType: z.string().nullable().optional(),
  // Alias older callers still send.
  maxBuyPrice: z.number().nullable().optional(),
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

    // Merge buyer-info into customFields. These keys are the canonical
    // shape the rest of the app reads from (see app/api/properties/
    // [id]/buyers/route.ts and lib/buyers/sync.ts parseGHLContact).
    const existingCustomFields = (buyer.customFields ?? {}) as Record<string, unknown>
    const updatedCustomFields = { ...existingCustomFields }
    if (d.tier !== undefined) updatedCustomFields.tier = d.tier
    if (d.verifiedFunding !== undefined) updatedCustomFields.verifiedFunding = d.verifiedFunding
    // hasPurchased is the legacy key already used in matchBuyers — keep
    // that key in storage so the matcher doesn't have to change.
    if (d.purchasedBefore !== undefined) updatedCustomFields.hasPurchased = d.purchasedBefore
    if (d.responseSpeed !== undefined) updatedCustomFields.responseSpeed = d.responseSpeed
    if (d.lastContactDate !== undefined) updatedCustomFields.lastContactDate = d.lastContactDate
    if (d.secondaryMarket !== undefined) {
      updatedCustomFields.secondaryMarkets = d.secondaryMarket ? [d.secondaryMarket] : []
    }
    if (d.buybox !== undefined) {
      // Always store as an array internally even if a string was sent.
      updatedCustomFields.buybox = Array.isArray(d.buybox)
        ? d.buybox
        : d.buybox.split(',').map(s => s.trim()).filter(Boolean)
    }

    // Tier tags stay current — section4-buyers fallback path reads
    // tags for tier when customFields.tier is missing on stale rows.
    let nextTags: string[] | undefined
    if (d.tier !== undefined) {
      const existingTags = (Array.isArray(buyer.tags) ? buyer.tags : []) as string[]
      const filtered = existingTags.filter(t => typeof t === 'string' && !t.startsWith('tier:'))
      nextTags = d.tier ? [...filtered, `tier:${d.tier}`] : filtered
    }

    const maxPurchase = d.maxPurchasePrice !== undefined ? d.maxPurchasePrice : d.maxBuyPrice

    const updated = await db.buyer.update({
      where: { id: params.buyerId, tenantId: ctx.tenantId },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.mobilePhone !== undefined && { mobilePhone: d.mobilePhone }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.company !== undefined && { company: d.company }),
        ...(d.markets !== undefined && { primaryMarkets: d.markets }),
        ...(d.notes !== undefined && { internalNotes: d.notes }),
        ...(d.lastContactDate !== undefined && {
          lastCommunicationDate: d.lastContactDate ? new Date(d.lastContactDate) : null,
        }),
        ...(d.minPurchasePrice !== undefined && { minPurchasePrice: d.minPurchasePrice }),
        ...(maxPurchase !== undefined && { maxPurchasePrice: maxPurchase }),
        ...(d.minArv !== undefined && { minArv: d.minArv }),
        ...(d.maxArv !== undefined && { maxArv: d.maxArv }),
        ...(d.maxRepairBudget !== undefined && { maxRepairBudget: d.maxRepairBudget }),
        ...(d.pofAmount !== undefined && { pofAmount: d.pofAmount }),
        ...(d.fundingType !== undefined && { fundingType: d.fundingType }),
        ...(nextTags !== undefined && { tags: nextTags }),
        customFields: JSON.parse(JSON.stringify(updatedCustomFields)),
      },
    })

    return NextResponse.json({ status: 'success', buyer: updated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
