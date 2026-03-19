import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/kpis/page.tsx


import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { KpisClient } from '@/components/kpis/kpis-client'
import type { UserRole } from '@/types/roles'
import { hasPermission, DEFAULT_KPIS } from '@/types/roles'
import { startOfWeek, startOfMonth, startOfDay } from 'date-fns'

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
  const [
    callsToday, callsWeek, callsMonth,
    avgScoreToday, avgScoreWeek, avgScoreMonth,
    apptToday, apptWeek, apptMonth,
    contractsMonth,
    propertiesActive, propertiesNew, propertiesSold,
    tasksCompleted, tasksPending,
  ] = await Promise.all([
    db.call.count({ where: { ...callFilter, createdAt: { gte: dayStart } } }),
    db.call.count({ where: { ...callFilter, createdAt: { gte: weekStart } } }),
    db.call.count({ where: { ...callFilter, createdAt: { gte: monthStart } } }),

    db.call.aggregate({ where: { ...callFilter, gradingStatus: 'COMPLETED', createdAt: { gte: dayStart } }, _avg: { score: true } }),
    db.call.aggregate({ where: { ...callFilter, gradingStatus: 'COMPLETED', createdAt: { gte: weekStart } }, _avg: { score: true } }),
    db.call.aggregate({ where: { ...callFilter, gradingStatus: 'COMPLETED', createdAt: { gte: monthStart } }, _avg: { score: true } }),

    db.task.count({ where: { tenantId, ...userFilter, category: { contains: 'ppointment' }, status: 'COMPLETED', completedAt: { gte: dayStart } } }),
    db.task.count({ where: { tenantId, ...userFilter, category: { contains: 'ppointment' }, status: 'COMPLETED', completedAt: { gte: weekStart } } }),
    db.task.count({ where: { tenantId, ...userFilter, category: { contains: 'ppointment' }, status: 'COMPLETED', completedAt: { gte: monthStart } } }),

    db.property.count({ where: { tenantId, status: 'UNDER_CONTRACT', updatedAt: { gte: monthStart } } }),

    db.property.count({ where: { tenantId, status: { notIn: ['SOLD', 'DEAD'] } } }),
    db.property.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    db.property.count({ where: { tenantId, status: 'SOLD', updatedAt: { gte: monthStart } } }),

    db.task.count({ where: { tenantId, assignedToId: userId, status: 'COMPLETED', completedAt: { gte: dayStart } } }),
    db.task.count({ where: { tenantId, assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
  ])

  const metrics = {
    calls: { today: callsToday, week: callsWeek, month: callsMonth },
    avgScore: {
      today: Math.round(avgScoreToday._avg.score ?? 0),
      week: Math.round(avgScoreWeek._avg.score ?? 0),
      month: Math.round(avgScoreMonth._avg.score ?? 0),
    },
    appointments: { today: apptToday, week: apptWeek, month: apptMonth },
    contracts: { month: contractsMonth },
    properties: { active: propertiesActive, newThisMonth: propertiesNew, soldThisMonth: propertiesSold },
    tasks: { completedToday: tasksCompleted, open: tasksPending },
  }

  return <KpisClient metrics={metrics} role={role} userName={session.name} />
}
