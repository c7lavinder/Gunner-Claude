// app/api/[tenant]/contacts/sync-from-ghl/route.ts
// POST — bulk sync GHL pipeline contacts into Seller and Buyer tables

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'
import { getSellerBuyerPipelineIds } from '@/lib/ghl/pipelines'
import { parseGHLContact } from '@/lib/buyers/sync'
import { isRoleAtLeast, type UserRole } from '@/types/roles'

type Params = { tenant: string }

export const POST = withTenant<Params>(async (_req, ctx) => {
  if (!isRoleAtLeast(ctx.userRole as UserRole, 'ADMIN')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { sellerPipelineId, buyerPipelineId } = await getSellerBuyerPipelineIds(ctx.tenantId)

  if (!sellerPipelineId && !buyerPipelineId) {
    return NextResponse.json({
      error: 'No "Sales Process" or "Buyers Pipeline" found in GHL. Check pipeline names.',
    }, { status: 400 })
  }

  const ghl = await getGHLClient(ctx.tenantId)
  const counts = {
    processed: 0,
    sellersCreated: 0,
    sellersUpdated: 0,
    buyersCreated: 0,
    buyersUpdated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  // Process seller pipeline
  if (sellerPipelineId) {
    const opps = await ghl.getAllPipelineOpportunities(sellerPipelineId)
    console.log(`[Sync] Found ${opps.length} seller pipeline opportunities`)

    for (let i = 0; i < opps.length; i += 50) {
      const batch = opps.slice(i, i + 50)
      const results = await Promise.allSettled(
        batch.map(async (opp) => {
          if (!opp.contactId) return 'skipped'
          try {
            const contact = await ghl.getContact(opp.contactId)
            const name = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
            if (!name) return 'skipped'

            const phone = normalizePhone(contact.phone)
            const email = contact.email || null

            const existing = await db.seller.findFirst({
              where: {
                tenantId: ctx.tenantId,
                OR: [
                  { ghlContactId: opp.contactId },
                  ...(phone ? [{ phone }] : []),
                ],
              },
              select: { id: true },
            })

            if (existing) {
              await db.seller.update({
                where: { id: existing.id },
                data: { name, phone, email, ghlContactId: opp.contactId },
              })
              return 'updated'
            }

            await db.seller.create({
              data: {
                tenantId: ctx.tenantId,
                name,
                phone,
                email,
                ghlContactId: opp.contactId,
              },
            })
            return 'created'
          } catch (err) {
            return `error:${opp.contactId}:${err instanceof Error ? err.message : 'unknown'}`
          }
        })
      )

      for (const r of results) {
        counts.processed++
        if (r.status === 'fulfilled') {
          if (r.value === 'created') counts.sellersCreated++
          else if (r.value === 'updated') counts.sellersUpdated++
          else if (r.value === 'skipped') counts.skipped++
          else if (typeof r.value === 'string' && r.value.startsWith('error:')) {
            if (counts.errors.length < 50) counts.errors.push(r.value)
          }
        } else {
          if (counts.errors.length < 50) counts.errors.push(`rejected:${r.reason}`)
        }
      }
    }
  }

  // Process buyer pipeline — parse GHL custom fields (tier, buybox, markets, funding, etc.)
  if (buyerPipelineId) {
    // First: clean up any ghl_ prefixed duplicates from previous bad sync
    const dupes = await db.buyer.findMany({
      where: { tenantId: ctx.tenantId, id: { startsWith: 'ghl_' } },
      select: { id: true, ghlContactId: true },
    })
    if (dupes.length > 0) {
      for (const dupe of dupes) {
        // Only delete if the real record (non ghl_ ID) exists
        if (dupe.ghlContactId) {
          const real = await db.buyer.findFirst({
            where: { tenantId: ctx.tenantId, ghlContactId: dupe.ghlContactId, id: { not: dupe.id } },
            select: { id: true },
          })
          if (real) {
            await db.buyer.delete({ where: { id: dupe.id } }).catch(() => {})
          }
        }
      }
      console.log(`[Sync] Cleaned up ${dupes.length} duplicate ghl_ buyers`)
    }

    const opps = await ghl.getAllPipelineOpportunities(buyerPipelineId)
    console.log(`[Sync] Found ${opps.length} buyer pipeline opportunities`)

    for (let i = 0; i < opps.length; i += 50) {
      const batch = opps.slice(i, i + 50)
      const results = await Promise.allSettled(
        batch.map(async (opp) => {
          if (!opp.contactId) return 'skipped'
          try {
            const contact = await ghl.getContact(opp.contactId)
            const parsed = parseGHLContact({
              id: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              phone: contact.phone,
              email: contact.email,
              city: contact.city,
              state: contact.state,
              tags: contact.tags ?? [],
              customFields: contact.customFields ?? [],
            })
            if (!parsed.name) return 'skipped'

            const existing = await db.buyer.findFirst({
              where: {
                tenantId: ctx.tenantId,
                OR: [
                  { ghlContactId: opp.contactId },
                  ...(parsed.phone ? [{ phone: parsed.phone }] : []),
                ],
              },
              select: { id: true },
            })

            const buyerData = {
              name: parsed.name,
              phone: parsed.phone,
              email: parsed.email,
              ghlContactId: opp.contactId,
              primaryMarkets: parsed.markets,
              customFields: JSON.parse(JSON.stringify(parsed.criteria)),
              tags: parsed.tags,
              internalNotes: parsed.notes,
              isActive: true,
            }

            if (existing) {
              await db.buyer.update({
                where: { id: existing.id },
                data: buyerData,
              })
              return 'updated'
            }

            await db.buyer.create({
              data: { tenantId: ctx.tenantId, ...buyerData },
            })
            return 'created'
          } catch (err) {
            return `error:${opp.contactId}:${err instanceof Error ? err.message : 'unknown'}`
          }
        })
      )

      for (const r of results) {
        counts.processed++
        if (r.status === 'fulfilled') {
          if (r.value === 'created') counts.buyersCreated++
          else if (r.value === 'updated') counts.buyersUpdated++
          else if (r.value === 'skipped') counts.skipped++
          else if (typeof r.value === 'string' && r.value.startsWith('error:')) {
            if (counts.errors.length < 50) counts.errors.push(r.value)
          }
        } else {
          if (counts.errors.length < 50) counts.errors.push(`rejected:${r.reason}`)
        }
      }
    }
  }

  console.log(`[Sync] Complete: ${JSON.stringify({ ...counts, errors: counts.errors.length })}`)
  return NextResponse.json(counts)
})

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return phone
}
