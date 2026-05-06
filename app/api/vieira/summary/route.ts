import { NextRequest, NextResponse } from 'next/server'
import { validateVieiraToken, unauthorized } from '@/lib/vieira-auth'
import { db } from '@/lib/db/client'
import { startOfDay, endOfDay } from 'date-fns'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export async function GET(req: NextRequest) {
  if (!validateVieiraToken(req)) return unauthorized()

  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') || undefined
    const tenantWhere = tenantSlug
      ? { tenant: { slug: tenantSlug } }
      : {}

    // Find tenant ID if slug provided
    let tenantId: string | undefined
    if (tenantSlug) {
      const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } })
      tenantId = tenant?.id
    }
    const tidFilter = tenantId ? { tenantId } : {}

    const today = new Date()
    const dayStart = startOfDay(today)
    const dayEnd = endOfDay(today)

    const [
      callsToday,
      callsGradedToday,
      avgScoreToday,
      propertiesActive,
      tasksPending,
      tasksOverdue,
      appointmentsToday,
      offersToday,
      contractsToday,
    ] = await Promise.all([
      db.call.count({ where: { ...tidFilter, calledAt: { gte: dayStart, lte: dayEnd } } }),
      db.call.count({ where: { ...tidFilter, calledAt: { gte: dayStart, lte: dayEnd }, gradingStatus: 'COMPLETED' } }),
      db.call.aggregate({ where: { ...tidFilter, calledAt: { gte: dayStart, lte: dayEnd }, gradingStatus: 'COMPLETED' }, _avg: { score: true } }),
      db.property.count({ where: { ...tidFilter, acqStatus: { not: 'CLOSED' }, dispoStatus: { not: 'CLOSED' }, longtermStatus: { not: 'DEAD' } } }),
      db.task.count({ where: { ...tidFilter, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      db.task.count({ where: { ...tidFilter, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: dayStart } } }),
      db.propertyMilestone.count({ where: { ...tidFilter, type: 'APPOINTMENT_SET', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { ...tidFilter, type: 'OFFER_MADE', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { ...tidFilter, type: 'UNDER_CONTRACT', createdAt: { gte: dayStart, lte: dayEnd } } }),
    ])

    // Top 3 stalled properties (no activity in 7+ days, still active)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const stalled = await db.property.findMany({
      where: {
        ...tidFilter,
        // Exclude closed (either lane), dead (longterm), and brand-new acq leads
        acqStatus: { not: 'CLOSED' },
        dispoStatus: { not: 'CLOSED' },
        longtermStatus: { not: 'DEAD' },
        NOT: { acqStatus: 'NEW_LEAD' },
        updatedAt: { lt: sevenDaysAgo },
      },
      orderBy: { updatedAt: 'asc' },
      take: 3,
      select: {
        id: true, address: true, city: true,
        ...PROPERTY_LANE_SELECT,
        assignmentFee: true, contractPrice: true, updatedAt: true,
      },
    })

    return NextResponse.json({
      timestamp: Date.now(),
      calls: {
        today: callsToday,
        graded: callsGradedToday,
        avg_score: Math.round(avgScoreToday._avg.score ?? 0),
      },
      properties: {
        active: propertiesActive,
      },
      tasks: {
        pending: tasksPending,
        overdue: tasksOverdue,
      },
      milestones_today: {
        appointments: appointmentsToday,
        offers: offersToday,
        contracts: contractsToday,
      },
      stalled_properties: stalled.map(p => ({
        id: p.id,
        address: `${p.address}, ${p.city}`,
        status: effectiveStatus(p),
        assignment_fee: p.assignmentFee,
        days_stale: Math.floor((Date.now() - p.updatedAt.getTime()) / 86400000),
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
