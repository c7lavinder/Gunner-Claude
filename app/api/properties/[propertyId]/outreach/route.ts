// GET + POST /api/properties/[propertyId]/outreach
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

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
        notes: l.notes,
        loggedAt: l.loggedAt.toISOString(),
        loggedByName: l.user.name,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { type, channel, recipientName, recipientContact, notes } = await req.json()
    if (!type || !channel || !recipientName) {
      return NextResponse.json({ error: 'type, channel, and recipientName required' }, { status: 400 })
    }

    const log = await db.outreachLog.create({
      data: {
        tenantId: session.tenantId,
        propertyId: params.propertyId,
        userId: session.userId,
        type,
        channel,
        recipientName,
        recipientContact: recipientContact ?? '',
        notes: notes ?? null,
      },
    })

    return NextResponse.json({ id: log.id, status: 'success' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
