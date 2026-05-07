// POST /api/properties/[propertyId]/buyers/bulk-add
//
// Bulk-add buyers to a property. Per Session 77 spec:
//   - Phone is the only match key
//   - Phone matches existing GHL contact OR DB Buyer → link (no GHL writes)
//   - No phone match → create GHL contact + Buyer + link
//   - Row with no phone → error
//
// Body: { rows: [{ phone, name?, email?, tier?, markets?, notes? }] }
//
// Returns:
//   {
//     added: number       // total rows successfully linked
//     matched: number     // existing buyers reused (no GHL write)
//     created: number     // new GHL contacts + Buyer rows
//     errors: [{ row: number, reason: string }]
//   }

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { getGHLClient } from '@/lib/ghl/client'

const rowSchema = z.object({
  phone: z.string().min(1),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  tier: z.string().nullable().optional(),     // priority/qualified/jv/unqualified/realtor
  markets: z.array(z.string()).nullable().optional(),
  notes: z.string().nullable().optional(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
})

// Phone normalization — strip all non-digits, drop leading 1.
function normalizePhone(p: string | null | undefined): string {
  if (!p) return ''
  const digits = p.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

interface RowResult {
  row: number
  status: 'matched' | 'created' | 'error'
  reason?: string
  buyerId?: string
}

export const POST = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  // Class-4 gate: confirm property belongs to tenant.
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const rows = parsed.data.rows
  const results: RowResult[] = []
  let matched = 0
  let created = 0
  const errors: Array<{ row: number; reason: string }> = []

  // Step 1 — pre-load existing local Buyers by phone (one query, fewer roundtrips).
  const normalizedPhones = rows.map(r => normalizePhone(r.phone)).filter(Boolean)
  const existingBuyers = normalizedPhones.length > 0
    ? await db.buyer.findMany({
        where: { tenantId: ctx.tenantId, isActive: true, phone: { in: normalizedPhones } },
        select: { id: true, phone: true, ghlContactId: true },
      })
    : []
  const buyerByPhone = new Map<string, { id: string; ghlContactId: string | null }>()
  for (const b of existingBuyers) {
    if (b.phone) buyerByPhone.set(normalizePhone(b.phone), { id: b.id, ghlContactId: b.ghlContactId })
  }

  // Step 2 — fall back to GHL search for rows that don't have a local match.
  // GHL is rate-limited so we batch sequentially. Catch errors per-row so one
  // bad lookup doesn't abort the whole job.
  let ghl: Awaited<ReturnType<typeof getGHLClient>> | null = null
  try {
    ghl = await getGHLClient(ctx.tenantId)
  } catch (err) {
    console.warn('[BulkAdd] GHL client unavailable, will skip GHL search/create:', err instanceof Error ? err.message : err)
  }

  // Step 3 — process each row.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const phone = normalizePhone(row.phone)

    if (!phone) {
      errors.push({ row: i, reason: 'Empty or invalid phone' })
      results.push({ row: i, status: 'error', reason: 'Empty or invalid phone' })
      continue
    }

    try {
      // Local match first
      const local = buyerByPhone.get(phone)
      let buyerId: string

      if (local) {
        buyerId = local.id
        matched++
      } else {
        // GHL match
        let ghlContactId: string | null = null
        if (ghl) {
          try {
            const search = await ghl.searchContacts({ query: phone, limit: 5 })
            const found = (search.contacts ?? []).find(c => normalizePhone(c.phone ?? null) === phone)
            if (found) ghlContactId = found.id
          } catch (err) {
            console.warn(`[BulkAdd] GHL search failed for row ${i}:`, err instanceof Error ? err.message : err)
          }
        }

        // Create GHL contact if no match
        if (!ghlContactId && ghl) {
          try {
            const nameParts = (row.name ?? '').trim().split(/\s+/)
            const firstName = nameParts[0] || `Buyer-${phone.slice(-4)}`
            const lastName = nameParts.slice(1).join(' ') || undefined
            const tags = ['gunner-bulk-add', 'buyer']
            if (row.tier) tags.push(`tier:${row.tier}`)
            const ghlRes = await ghl.createContact({
              firstName,
              lastName,
              phone,
              email: row.email ?? undefined,
              tags,
              source: 'gunner-bulk-add',
            })
            ghlContactId = ghlRes.contact.id
            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 100))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            errors.push({ row: i, reason: `GHL contact create failed: ${msg}` })
            results.push({ row: i, status: 'error', reason: msg })
            continue
          }
        }

        if (!ghlContactId) {
          // No GHL client and no local match — create local-only buyer
          // (rep can sync to GHL later; not ideal but avoids losing data).
        }

        // Create local Buyer row. Buyer doesn't have a top-level `tier`
        // column — tier lives in customFields (GHL field id) and is read
        // back via GHL_FIELD_MAP when matchBuyers re-pulls. Bulk-add
        // stamps the tier into tags so it's discoverable + the rep can
        // edit it via the buyer edit modal which writes to GHL.
        const tagSet = ['gunner-bulk-add']
        if (row.tier) tagSet.push(`tier:${row.tier}`)
        const newBuyer = await db.buyer.create({
          data: {
            tenantId: ctx.tenantId,
            ghlContactId,
            name: (row.name ?? '').trim() || `Buyer ${phone.slice(-4)}`,
            phone,
            email: row.email ?? null,
            primaryMarkets: (row.markets ?? []) as string[],
            tags: tagSet,
            internalNotes: row.notes ?? null,
            isActive: true,
          },
          select: { id: true },
        })
        buyerId = newBuyer.id
        created++
      }

      // Link to property via PropertyBuyerStage upsert. Stage = 'matched'
      // initially — the buyer hasn't received any blast yet. Source =
      // 'manual' to distinguish from auto-matched buyers.
      await db.propertyBuyerStage.upsert({
        where: { propertyId_buyerId: { propertyId: params.propertyId, buyerId } },
        create: {
          tenantId: ctx.tenantId,
          propertyId: params.propertyId,
          buyerId,
          stage: 'matched',
          source: 'manual',
        },
        update: {
          // Don't downgrade an existing stage — only ensure the link exists.
          // No fields change on an existing row.
        },
      })

      results.push({ row: i, status: local ? 'matched' : 'created', buyerId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ row: i, reason: msg })
      results.push({ row: i, status: 'error', reason: msg })
    }
  }

  return NextResponse.json({
    added: results.filter(r => r.status !== 'error').length,
    matched,
    created,
    errors,
    results,
  })
})
