// GET /api/calls/ledger?type=calls|convos&date=YYYY-MM-DD
// Returns call records for the KPI ledger modal
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getCentralDayBounds } from '@/lib/dates'
import { resolveEffectiveUser } from '@/lib/auth/view-as'

export const GET = withTenant(async (request, ctx) => {
  const type = request.nextUrl.searchParams.get('type') // 'calls' or 'convos'
  const date = request.nextUrl.searchParams.get('date') // 'YYYY-MM-DD'
  const asUserId = request.nextUrl.searchParams.get('asUserId')
  if (!type || !date) return NextResponse.json({ error: 'type and date required' }, { status: 400 })

  const effective = await resolveEffectiveUser(ctx, asUserId)
  const isAdmin = !effective.isImpersonating && (effective.role === 'OWNER' || effective.role === 'ADMIN')
  const { dayStart, dayEnd } = getCentralDayBounds(date)

  try {
    const calls = await db.call.findMany({
      where: {
        tenantId: ctx.tenantId,
        calledAt: { gte: dayStart, lte: dayEnd },
        ...(isAdmin ? {} : { assignedToId: effective.userId }),
        ...(type === 'convos' ? { gradingStatus: 'COMPLETED', durationSeconds: { gte: 45 } } : {}),
      },
      orderBy: { calledAt: 'desc' },
      select: {
        id: true,
        contactName: true,
        contactAddress: true,
        calledAt: true,
        durationSeconds: true,
        score: true,
        gradingStatus: true,
        callType: true,
        assignedTo: { select: { name: true } },
        property: { select: { id: true, address: true } },
      },
    })

    return NextResponse.json({
      entries: calls.map(c => ({
        id: c.id,
        contactName: c.contactName ?? 'Unknown',
        propertyId: c.property?.id ?? null,
        propertyAddress: c.property?.address ?? c.contactAddress ?? null,
        time: c.calledAt?.toISOString() ?? '',
        duration: c.durationSeconds ?? 0,
        score: c.score ?? null,
        status: c.gradingStatus,
        callType: c.callType,
        userName: c.assignedTo?.name ?? 'Unassigned',
      })),
    })
  } catch (err) {
    console.error('[Calls Ledger]', err)
    return NextResponse.json({ entries: [] })
  }
})
