// GET + POST + PATCH /api/properties/[propertyId]/outreach
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { titleCase } from '@/lib/format'

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  try {
    const logs = await db.outreachLog.findMany({
      where: { tenantId: ctx.tenantId, propertyId: params.propertyId },
      orderBy: { loggedAt: 'desc' },
      include: { user: { select: { name: true } } },
      take: 50,
    })

    return NextResponse.json({
      logs: logs.map(l => ({
        id: l.id,
        type: l.type,
        channel: l.channel,
        recipientName: l.recipientName,
        recipientContact: l.recipientContact,
        ghlContactId: l.ghlContactId,
        notes: l.notes,
        offerAmount: l.offerAmount,
        offerStatus: l.offerStatus,
        showingDate: l.showingDate?.toISOString() ?? null,
        showingStatus: l.showingStatus,
        source: l.source,
        loggedAt: l.loggedAt.toISOString(),
        loggedByName: l.user.name,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})

// Helper: sync highestOffer + acceptedPrice on property from all offer logs
// Also auto-links the accepted buyer contact to the property
// FIX: tenantId is now REQUIRED (was optional) — every read/write inside is
// scoped to it. Was previously a major leak surface: the helper read+wrote
// Property + OutreachLog by id-only.
async function syncOfferFields(propertyId: string, tenantId: string) {
  // FIX: was leaking — Class 1 — prior code used findMany without tenantId.
  const offers = await db.outreachLog.findMany({
    where: { tenantId, propertyId, type: 'offer', offerAmount: { not: null } },
    select: { offerAmount: true, offerStatus: true, ghlContactId: true, recipientName: true, recipientContact: true },
    orderBy: { loggedAt: 'desc' },
  })
  const highest = offers.length > 0
    ? Math.max(...offers.map(o => Number(o.offerAmount ?? 0)))
    : null
  const accepted = offers.find(o => o.offerStatus === 'Accepted')
  const acceptedAmount = accepted ? Number(accepted.offerAmount) : null

  // FIX: was leaking — Class 1 — prior code used findUnique({ id }) and read
  // tenantId from the row (so the row read could be from another tenant).
  const prop = await db.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { fieldSources: true },
  })
  if (!prop) return // property not in this tenant — silently no-op
  const sources = { ...((prop?.fieldSources as Record<string, string>) ?? {}) }
  if (highest !== null) sources.highestOffer = 'ai'; else delete sources.highestOffer
  if (acceptedAmount !== null) sources.acceptedPrice = 'ai'

  // FIX: was leaking — Class 1 — prior code used update({ id }) (no tenantId).
  await db.property.update({
    where: { id: propertyId, tenantId },
    data: {
      highestOffer: highest,
      ...(acceptedAmount !== null ? { acceptedPrice: acceptedAmount } : {}),
      fieldSources: sources,
    },
  })

  // Auto-link accepted buyer contact to property with "Buyer" role
  if (accepted && accepted.ghlContactId) {
    try {
      // Find or create seller record for this buyer contact
      let seller = await db.seller.findFirst({
        where: { tenantId, ghlContactId: accepted.ghlContactId },
      })
      if (!seller) {
        // Parse phone from recipientContact if it looks like a phone
        const contact = accepted.recipientContact ?? ''
        const isPhone = /^\+?\d[\d\s()-]{6,}$/.test(contact)
        seller = await db.seller.create({
          data: {
            tenantId,
            name: titleCase(accepted.recipientName),
            phone: isPhone ? contact : null,
            email: !isPhone && contact.includes('@') ? contact : null,
            ghlContactId: accepted.ghlContactId,
          },
        })
      }

      // Check if already linked to this property
      // NOTE: warm shape (compound unique propertyId_sellerId without tenantId)
      // but DiD-via-FK — both propertyId and sellerId are tenant-validated above.
      const existing = await db.propertySeller.findUnique({
        where: { propertyId_sellerId: { propertyId, sellerId: seller.id } },
      })
      if (!existing) {
        await db.propertySeller.create({
          data: { propertyId, sellerId: seller.id, isPrimary: false, role: 'Buyer' },
        })
        console.log(`[Outreach] Auto-linked buyer ${accepted.recipientName} to property ${propertyId}`)
      }
    } catch (err) {
      console.error('[Outreach] Failed to auto-link buyer:', err)
    }
  }
}

export const POST = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
  try {
    const body = await req.json()
    const { type, channel, recipientName, recipientContact, ghlContactId, notes, offerAmount, showingDate, source } = body

    const VALID_OFFER_STATUSES = ['Pending', 'Accepted', 'Rejected', 'Countered', 'Expired']
    const VALID_SHOWING_STATUSES = ['Scheduled', 'Showed', 'No-Show', 'Cancelled']

    // PATCH action — update existing log
    if (body.action === 'update' && body.logId) {
      const updateData: Record<string, unknown> = {}
      if (body.notes !== undefined) updateData.notes = body.notes
      if (body.offerAmount !== undefined) updateData.offerAmount = body.offerAmount ? parseFloat(body.offerAmount) : null
      if (body.offerStatus !== undefined) {
        // Normalize case and validate
        const normalized = VALID_OFFER_STATUSES.find(s => s.toLowerCase() === String(body.offerStatus).toLowerCase())
        if (!normalized) return NextResponse.json({ error: `Invalid offer status. Must be: ${VALID_OFFER_STATUSES.join(', ')}` }, { status: 400 })
        updateData.offerStatus = normalized
      }
      if (body.showingDate !== undefined) updateData.showingDate = body.showingDate ? new Date(body.showingDate) : null
      if (body.showingStatus !== undefined) {
        const normalizedShowing = VALID_SHOWING_STATUSES.find(s => s.toLowerCase() === String(body.showingStatus).toLowerCase())
        if (!normalizedShowing) return NextResponse.json({ error: `Invalid showing status. Must be: ${VALID_SHOWING_STATUSES.join(', ')}` }, { status: 400 })
        updateData.showingStatus = normalizedShowing
      }
      if (body.channel !== undefined) updateData.channel = body.channel

      // FIX: was leaking — Class 1 — prior code used update({ where: { id: body.logId } })
      // (no tenantId in WHERE). Now scoped via updateMany with tenantId.
      await db.outreachLog.updateMany({
        where: { id: body.logId, tenantId: ctx.tenantId, propertyId: params.propertyId },
        data: updateData,
      })

      // Sync offer fields on property (highestOffer, acceptedPrice, buyer link)
      await syncOfferFields(params.propertyId, ctx.tenantId)

      return NextResponse.json({ success: true })
    }

    if (!type || !recipientName) {
      return NextResponse.json({ error: 'type and recipientName required' }, { status: 400 })
    }

    const log = await db.outreachLog.create({
      data: {
        tenantId: ctx.tenantId,
        propertyId: params.propertyId,
        userId: ctx.userId,
        type,
        channel: channel ?? (type === 'offer' ? 'offer' : type === 'showing' ? 'in_person' : 'sms'),
        recipientName: titleCase(recipientName),
        recipientContact: recipientContact ?? '',
        ghlContactId: ghlContactId ?? null,
        notes: notes ?? null,
        offerAmount: offerAmount ? parseFloat(offerAmount) : null,
        offerStatus: type === 'offer' ? 'Pending' : null,
        showingDate: showingDate ? new Date(showingDate) : null,
        showingStatus: type === 'showing' ? 'Scheduled' : null,
        source: source ?? 'Manual',
      },
    })

    // Sync offer fields on property (highestOffer, acceptedPrice, buyer link)
    if (type === 'offer') {
      await syncOfferFields(params.propertyId, ctx.tenantId)
    }

    return NextResponse.json({ id: log.id, status: 'success' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
