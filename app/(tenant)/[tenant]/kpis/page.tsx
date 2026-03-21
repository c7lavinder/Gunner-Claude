import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/kpis/page.tsx


import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { KpisClient } from '@/components/kpis/kpis-client'
import type { UserRole } from '@/types/roles'
import { hasPermission, DEFAULT_KPIS } from '@/types/roles'
import { startOfWeek, startOfMonth, startOfDay, subDays } from 'date-fns'

export default async function KpisPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  const userId = session.userId
  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  const canViewTeam = hasPermission(role, 'kpis.view.team')
  const canViewAll = hasPermission(role, 'kpis.view.all')

  const now = new Date()
  const dayStart = startOfDay(now)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)

  // Determine scope
  const userFilter = canViewAll ? {} : canViewTeam
    ? { assignedTo: { OR: [{ id: userId }, { reportsTo: userId }] } }
    : { assignedToId: userId }

  const callFilter = canViewAll ? { tenantId } : canViewTeam
    ? { tenantId, assignedTo: { OR: [{ id: userId }, { reportsTo: userId }] } }
    : { tenantId, assignedToId: userId }

  // Fetch all metrics in parallel
  // Scoped property IDs for milestone queries
  const propertyScope = canViewAll
    ? { tenantId }
    : canViewTeam
      ? { tenantId, assignedTo: { OR: [{ id: userId }, { reportsTo: userId }] } }
      : { tenantId, assignedToId: userId }

  const scopedPropertyIds = (await db.property.findMany({
    where: propertyScope,
    select: { id: true },
  })).map(p => p.id)

  const milestoneWhere = (type: string, since: Date) => ({
    tenantId,
    type: type as never,
    propertyId: { in: scopedPropertyIds },
    createdAt: { gte: since },
  })

  const [
    callsToday, callsWeek, callsMonth,
    avgScoreToday, avgScoreWeek, avgScoreMonth,
    apptToday, apptWeek, apptMonth,
    offersMonth, contractsMonth, closedMonth,
    propertiesActive, propertiesNew,
    tasksCompleted, tasksPending,
  ] = await Promise.all([
    db.call.count({ where: { ...callFilter, createdAt: { gte: dayStart } } }),
    db.call.count({ where: { ...callFilter, createdAt: { gte: weekStart } } }),
    db.call.count({ where: { ...callFilter, createdAt: { gte: monthStart } } }),

    db.call.aggregate({ where: { ...callFilter, gradingStatus: 'COMPLETED', createdAt: { gte: dayStart } }, _avg: { score: true } }),
    db.call.aggregate({ where: { ...callFilter, gradingStatus: 'COMPLETED', createdAt: { gte: weekStart } }, _avg: { score: true } }),
    db.call.aggregate({ where: { ...callFilter, gradingStatus: 'COMPLETED', createdAt: { gte: monthStart } }, _avg: { score: true } }),

    // Milestones: appointments, offers, contracts, closed
    db.propertyMilestone.count({ where: milestoneWhere('APPOINTMENT_SET', dayStart) }),
    db.propertyMilestone.count({ where: milestoneWhere('APPOINTMENT_SET', weekStart) }),
    db.propertyMilestone.count({ where: milestoneWhere('APPOINTMENT_SET', monthStart) }),

    db.propertyMilestone.count({ where: milestoneWhere('OFFER_MADE', monthStart) }),
    db.propertyMilestone.count({ where: milestoneWhere('UNDER_CONTRACT', monthStart) }),
    db.propertyMilestone.count({ where: milestoneWhere('CLOSED', monthStart) }),

    db.property.count({ where: { tenantId, status: { notIn: ['SOLD', 'DEAD'] } } }),
    db.property.count({ where: { tenantId, createdAt: { gte: monthStart } } }),

    db.task.count({ where: { tenantId, assignedToId: userId, status: 'COMPLETED', completedAt: { gte: dayStart } } }),
    db.task.count({ where: { tenantId, assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
  ])

  // Score distribution + TCP data
  const [allScores, tcpProperties] = await Promise.all([
    db.call.findMany({
      where: { ...callFilter, gradingStatus: 'COMPLETED', score: { not: null } },
      select: { score: true },
    }),
    db.property.findMany({
      where: { tenantId, tcpScore: { not: null }, status: { notIn: ['DEAD', 'SOLD'] } },
      select: { id: true, address: true, tcpScore: true, status: true },
      orderBy: { tcpScore: 'desc' },
      take: 10,
    }),
  ])

  // Build score distribution buckets: 0-19, 20-39, 40-59, 60-79, 80-100
  const distribution = [
    { range: '0-19', count: 0 },
    { range: '20-39', count: 0 },
    { range: '40-59', count: 0 },
    { range: '60-79', count: 0 },
    { range: '80-100', count: 0 },
  ]
  for (const call of allScores) {
    const s = call.score ?? 0
    if (s < 20) distribution[0].count++
    else if (s < 40) distribution[1].count++
    else if (s < 60) distribution[2].count++
    else if (s < 80) distribution[3].count++
    else distribution[4].count++
  }

  const metrics = {
    calls: { today: callsToday, week: callsWeek, month: callsMonth },
    avgScore: {
      today: Math.round(avgScoreToday._avg.score ?? 0),
      week: Math.round(avgScoreWeek._avg.score ?? 0),
      month: Math.round(avgScoreMonth._avg.score ?? 0),
    },
    appointments: { today: apptToday, week: apptWeek, month: apptMonth },
    offers: { month: offersMonth },
    contracts: { month: contractsMonth },
    closed: { month: closedMonth },
    properties: { active: propertiesActive, newThisMonth: propertiesNew },
    tasks: { completedToday: tasksCompleted, open: tasksPending },
    scoreDistribution: distribution,
    tcpLeads: tcpProperties.map(p => ({
      id: p.id,
      address: p.address,
      tcpScore: p.tcpScore ?? 0,
      status: p.status,
    })),
  }

  return <KpisClient metrics={metrics} role={role} userName={session.name} tenantSlug={params.tenant} />
}
