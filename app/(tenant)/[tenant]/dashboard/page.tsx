import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/dashboard/page.tsx


import { db } from '@/lib/db/client'
import { DashboardClient } from '@/components/ui/dashboard-client'
import { formatDistanceToNow, startOfDay, endOfDay } from 'date-fns'
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

  // Fetch today's data in parallel
  const [recentCalls, todayTasks, unreadCount, recentProperties] = await Promise.all([
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
  ])

  // KPI counts
  const [callsToday, avgScore, tasksCompleted, propertiesActive] = await Promise.all([
    db.call.count({
      where: { tenantId, assignedToId: userId, createdAt: { gte: dayStart } },
    }),
    db.call.aggregate({
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED', score: { not: null } },
      _avg: { score: true },
    }),
    db.task.count({
      where: { tenantId, assignedToId: userId, status: 'COMPLETED', completedAt: { gte: dayStart } },
    }),
    db.property.count({
      where: { tenantId, status: { notIn: ['DEAD', 'SOLD'] } },
    }),
  ])

  const dashboardData = {
    userName: session.name,
    role,
    kpis: {
      callsToday,
      avgScore: Math.round(avgScore._avg.score ?? 0),
      tasksCompleted,
      propertiesActive,
    },
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
