import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/dashboard/page.tsx


import { db } from '@/lib/db/client'
import { DashboardClient } from '@/components/ui/dashboard-client'
import { formatDistanceToNow, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns'
import type { UserRole } from '@/types/roles'

interface PageProps {
  params: { tenant: string }
}

export default async function DashboardPage({ params }: PageProps) {
  const session = await requireSession()


  const userId = session.userId
  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  const today = new Date()
  const dayStart = startOfDay(today)
  const dayEnd = endOfDay(today)
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const monthStart = startOfMonth(today)

  // Fetch today's data in parallel
  const [recentCalls, todayTasks, unreadCount, recentProperties, scoreTrendCalls, priorityLeads] = await Promise.all([
    // Recent calls for this user
    db.call.findMany({
      where: {
        tenantId,
        ...(role === 'LEAD_MANAGER' || role === 'ACQUISITION_MANAGER'
          ? { assignedToId: userId }
          : {}),
        gradingStatus: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        assignedTo: { select: { name: true } },
        property: { select: { address: true } },
      },
    }),

    // Today's tasks
    db.task.findMany({
      where: {
        tenantId,
        assignedToId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      take: 10,
    }),

    // Unread inbox count — fetched from GHL live, placeholder here
    Promise.resolve(0),

    // Recent properties
    db.property.findMany({
      where: {
        tenantId,
        ...(role === 'ACQUISITION_MANAGER' || role === 'LEAD_MANAGER'
          ? { assignedToId: userId }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        sellers: { include: { seller: { select: { name: true } } }, take: 1 },
      },
    }),

    // Score trend: graded calls from last 30 days for trend chart
    db.call.findMany({
      where: {
        tenantId,
        gradingStatus: 'COMPLETED',
        score: { not: null },
        calledAt: { gte: subDays(today, 30) },
      },
      select: { score: true, calledAt: true },
      orderBy: { calledAt: 'asc' },
    }),

    // Priority leads: properties with TCP scores, sorted by score DESC
    db.property.findMany({
      where: {
        tenantId,
        status: { notIn: ['DEAD', 'SOLD'] },
        tcpScore: { not: null },
      },
      orderBy: { tcpScore: 'desc' },
      take: 5,
      include: {
        sellers: { include: { seller: { select: { name: true } } }, take: 1 },
        _count: { select: { calls: true } },
      },
    }),
  ])

  // KPI counts — extended with week/month for context
  const [callsToday, callsWeek, callsMonth, avgScore, tasksCompleted, propertiesActive] = await Promise.all([
    db.call.count({
      where: { tenantId, createdAt: { gte: dayStart } },
    }),
    db.call.count({
      where: { tenantId, createdAt: { gte: weekStart } },
    }),
    db.call.count({
      where: { tenantId, createdAt: { gte: monthStart } },
    }),
    db.call.aggregate({
      where: { tenantId, gradingStatus: 'COMPLETED', score: { not: null } },
      _avg: { score: true },
    }),
    db.task.count({
      where: { tenantId, assignedToId: userId, status: 'COMPLETED', completedAt: { gte: dayStart } },
    }),
    db.property.count({
      where: { tenantId, status: { notIn: ['DEAD', 'SOLD'] } },
    }),
  ])

  // Build daily score trend (last 7 days)
  const scoreTrend: Array<{ date: string; avgScore: number; count: number }> = []
  for (let i = 6; i >= 0; i--) {
    const date = subDays(today, i)
    const ds = startOfDay(date)
    const de = endOfDay(date)
    const dayCalls = scoreTrendCalls.filter(
      c => c.calledAt && c.calledAt >= ds && c.calledAt <= de
    )
    const dayAvg = dayCalls.length > 0
      ? Math.round(dayCalls.reduce((sum, c) => sum + (c.score ?? 0), 0) / dayCalls.length)
      : 0
    scoreTrend.push({
      date: date.toLocaleDateString('en-US', { weekday: 'short' }),
      avgScore: dayAvg,
      count: dayCalls.length,
    })
  }

  const dashboardData = {
    userName: session.name,
    role,
    kpis: {
      callsToday,
      callsWeek,
      callsMonth,
      avgScore: Math.round(avgScore._avg.score ?? 0),
      tasksCompleted,
      propertiesActive,
    },
    scoreTrend,
    priorityLeads: priorityLeads.map((p) => ({
      id: p.id,
      address: p.address,
      city: p.city,
      state: p.state,
      status: p.status,
      tcpScore: p.tcpScore,
      sellerName: p.sellers[0]?.seller.name ?? 'Unknown',
      callCount: p._count.calls,
      buySignal: (p.tcpScore ?? 0) > 0.5,
    })),
    recentCalls: recentCalls.map((c) => ({
      id: c.id,
      score: c.score,
      summary: c.aiSummary,
      assignedTo: c.assignedTo?.name ?? 'Unknown',
      property: c.property?.address ?? 'No property',
      ago: formatDistanceToNow(c.createdAt, { addSuffix: true }),
      direction: c.direction,
    })),
    todayTasks: todayTasks.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt?.toISOString() ?? null,
    })),
    recentProperties: recentProperties.map((p) => ({
      id: p.id,
      address: p.address,
      city: p.city,
      state: p.state,
      status: p.status,
      sellerName: p.sellers[0]?.seller.name ?? 'Unknown',
      arv: p.arv?.toString() ?? null,
      askingPrice: p.askingPrice?.toString() ?? null,
    })),
  }

  return <DashboardClient data={dashboardData} tenantSlug={params.tenant} />
}
