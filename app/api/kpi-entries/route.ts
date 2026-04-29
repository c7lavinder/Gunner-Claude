// GET + POST + DELETE /api/kpi-entries — KPI ledger entries
// Stored in audit_logs with action 'kpi.entry'
// When type is apts/offers/contracts AND a propertyId is provided,
// also creates a PropertyMilestone record for deal progress tracking.
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { Prisma, MilestoneType } from '@prisma/client'
import { getCentralDayBounds } from '@/lib/dates'

// Maps KPI entry types to PropertyMilestone types
const KPI_TO_MILESTONE: Record<string, MilestoneType> = {
  apts: 'APPOINTMENT_SET',
  offers: 'OFFER_MADE',
  contracts: 'UNDER_CONTRACT',
}

export const GET = withTenant(async (request, ctx) => {
  const type = request.nextUrl.searchParams.get('type') // 'calls' | 'convos' | 'apts' | 'offers' | 'contracts'
  const date = request.nextUrl.searchParams.get('date') // 'YYYY-MM-DD'
  if (!type || !date) return NextResponse.json({ error: 'type and date required' }, { status: 400 })

  const { dayStart, dayEnd } = getCentralDayBounds(date)

  const entries = await db.auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
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
})

export const POST = withTenant(async (request, ctx) => {
  const body = await request.json()
  const { type, contactName, propertyId, propertyAddress, notes, time } = body as {
    type: string; contactName?: string; propertyId?: string; propertyAddress?: string; notes?: string; time?: string
  }

  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

  const entry = await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
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
        where: { id: propertyId, tenantId: ctx.tenantId },
        select: { id: true },
      })
      if (property) {
        await db.propertyMilestone.create({
          data: {
            tenantId: ctx.tenantId,
            propertyId,
            type: milestoneType,
            loggedById: ctx.userId,
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
})

export const DELETE = withTenant(async (request, ctx) => {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.auditLog.deleteMany({
    where: { id, tenantId: ctx.tenantId, action: 'kpi.entry' },
  })

  return NextResponse.json({ success: true })
})
