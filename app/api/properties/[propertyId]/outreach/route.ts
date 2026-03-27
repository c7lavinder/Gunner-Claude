// GET + POST + PATCH /api/properties/[propertyId]/outreach
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { titleCase } from '@/lib/format'

export async function GET(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const logs = await db.outreachLog.findMany({
      where: { tenantId: session.tenantId, propertyId: params.propertyId },
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
}

// Helper: sync highestOffer + acceptedPrice on property from all offer logs
async function syncOfferFields(propertyId: string) {
  const offers = await db.outreachLog.findMany({
    where: { propertyId, type: 'offer', offerAmount: { not: null } },
    select: { offerAmount: true, offerStatus: true },
    orderBy: { loggedAt: 'desc' },
  })
  const highest = offers.length > 0
    ? Math.max(...offers.map(o => Number(o.offerAmount ?? 0)))
    : null
  const accepted = offers.find(o => o.offerStatus === 'Accepted')
  const acceptedAmount = accepted ? Number(accepted.offerAmount) : null

  const prop = await db.property.findUnique({
    where: { id: propertyId },
    select: { fieldSources: true },
  })
  const sources = { ...((prop?.fieldSources as Record<string, string>) ?? {}) }
  if (highest !== null) sources.highestOffer = 'ai'; else delete sources.highestOffer
  if (acceptedAmount !== null) sources.acceptedPrice = 'ai'

  await db.property.update({
    where: { id: propertyId },
    data: {
      highestOffer: highest,
      ...(acceptedAmount !== null ? { acceptedPrice: acceptedAmount } : {}),
      fieldSources: sources,
    },
  })
}

export async function POST(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { type, channel, recipientName, recipientContact, ghlContactId, notes, offerAmount, showingDate, source } = body

    // PATCH action — update existing log
    if (body.action === 'update' && body.logId) {
      const updateData: Record<string, unknown> = {}
      if (body.notes !== undefined) updateData.notes = body.notes
      if (body.offerAmount !== undefined) updateData.offerAmount = body.offerAmount ? parseFloat(body.offerAmount) : null
      if (body.offerStatus !== undefined) updateData.offerStatus = body.offerStatus
      if (body.showingDate !== undefined) updateData.showingDate = body.showingDate ? new Date(body.showingDate) : null
      if (body.showingStatus !== undefined) updateData.showingStatus = body.showingStatus
      if (body.channel !== undefined) updateData.channel = body.channel

      await db.outreachLog.update({
        where: { id: body.logId },
        data: updateData,
      })

      // Sync offer fields on property (highestOffer, acceptedPrice)
      await syncOfferFields(params.propertyId)

      return NextResponse.json({ success: true })
    }

    if (!type || !recipientName) {
      return NextResponse.json({ error: 'type and recipientName required' }, { status: 400 })
    }

    const log = await db.outreachLog.create({
      data: {
        tenantId: session.tenantId,
        propertyId: params.propertyId,
        userId: session.userId,
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

    // Sync offer fields on property (highestOffer, acceptedPrice)
    if (type === 'offer') {
      await syncOfferFields(params.propertyId)
    }

    return NextResponse.json({ id: log.id, status: 'success' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
