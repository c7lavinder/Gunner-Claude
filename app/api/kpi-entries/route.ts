// GET + POST + DELETE /api/kpi-entries — KPI ledger entries
// Stored in audit_logs with action 'kpi.entry'
// When type is apts/offers/contracts AND a propertyId is provided,
// also creates a PropertyMilestone record for deal progress tracking.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { Prisma, MilestoneType } from '@prisma/client'

// Maps KPI entry types to PropertyMilestone types
const KPI_TO_MILESTONE: Record<string, MilestoneType> = {
  apts: 'APPOINTMENT_SET',
  offers: 'OFFER_MADE',
  contracts: 'UNDER_CONTRACT',
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = request.nextUrl.searchParams.get('type') // 'calls' | 'convos' | 'apts' | 'offers' | 'contracts'
  const date = request.nextUrl.searchParams.get('date') // 'YYYY-MM-DD'
  if (!type || !date) return NextResponse.json({ error: 'type and date required' }, { status: 400 })

  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59.999`)

  const entries = await db.auditLog.findMany({
    where: {
      tenantId: session.tenantId,
      action: 'kpi.entry',
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, payload: true, createdAt: true, userId: true, user: { select: { name: true } } },
  })

  // Filter by type in payload
  const filtered = entries.filter(e => {
    const p = e.payload as Record<string, unknown> | null
    return p?.type === type
  }).map(e => {
    const p = (e.payload ?? {}) as Record<string, unknown>
    return {
      id: e.id,
      type: p.type as string,
      time: e.createdAt.toISOString(),
      contactName: (p.contactName as string) ?? null,
      propertyId: (p.propertyId as string) ?? null,
      propertyAddress: (p.propertyAddress as string) ?? null,
      notes: (p.notes as string) ?? null,
      source: (p.source as string) ?? 'manual',
      userName: e.user?.name ?? 'Unknown',
    }
  })

  return NextResponse.json({ entries: filtered })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { type, contactName, propertyId, propertyAddress, notes, time } = body as {
    type: string; contactName?: string; propertyId?: string; propertyAddress?: string; notes?: string; time?: string
  }

  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

  const entry = await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'kpi.entry',
      resource: 'kpi',
      source: 'USER',
      severity: 'INFO',
      // Use provided time or now
      ...(time ? { createdAt: new Date(time) } : {}),
      payload: {
        type,
        contactName: contactName ?? null,
        propertyId: propertyId ?? null,
        propertyAddress: propertyAddress ?? null,
        notes: notes ?? null,
        source: 'manual',
      } as unknown as Prisma.InputJsonValue,
    },
    include: { user: { select: { name: true } } },
  })

  // If this KPI type maps to a milestone (apts/offers/contracts) and a propertyId
  // was provided, also create a PropertyMilestone for deal progress tracking.
  const milestoneType = KPI_TO_MILESTONE[type]
  let milestoneCreated = false
  if (milestoneType && propertyId) {
    try {
      // Verify the property exists and belongs to this tenant
      const property = await db.property.findUnique({
        where: { id: propertyId, tenantId: session.tenantId },
        select: { id: true },
      })
      if (property) {
        await db.propertyMilestone.create({
          data: {
            tenantId: session.tenantId,
            propertyId,
            type: milestoneType,
            loggedById: session.userId,
            source: 'MANUAL',
            notes: notes ?? `Logged via KPI entry (${type})`,
          },
        })
        milestoneCreated = true
      }
    } catch (err) {
      // Non-fatal: log but don't fail the KPI entry
      console.error('[KPI Entries] Failed to create PropertyMilestone:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({
    entry: {
      id: entry.id,
      type,
      time: entry.createdAt.toISOString(),
      contactName: contactName ?? null,
      propertyId: propertyId ?? null,
      propertyAddress: propertyAddress ?? null,
      notes: notes ?? null,
      source: 'manual',
      userName: entry.user?.name ?? 'Unknown',
    },
    milestoneCreated,
  })
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.auditLog.deleteMany({
    where: { id, tenantId: session.tenantId, action: 'kpi.entry' },
  })

  return NextResponse.json({ success: true })
}
