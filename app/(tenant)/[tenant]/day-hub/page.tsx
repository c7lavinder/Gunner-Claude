// app/(tenant)/[tenant]/day-hub/page.tsx
// Day Hub — daily task planner with role-based categories
// The screen reps check every morning to plan their day
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { DayHubClient } from './day-hub-client'
import type { UserRole } from '@/types/roles'
import { startOfDay, endOfDay, addDays } from 'date-fns'

export default async function DayHubPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId
  const userId = session.userId
  const role = session.role as UserRole
  const today = new Date()
  const dayStart = startOfDay(today)
  const dayEnd = endOfDay(today)
  const tomorrowEnd = endOfDay(addDays(today, 1))

  const [todayTasks, tomorrowTasks, overdueTasks, roleConfig, completedToday, xpRecord] = await Promise.all([
    // Today's tasks
    db.task.findMany({
      where: {
        tenantId,
        assignedToId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      include: {
        property: { select: { id: true, address: true } },
      },
    }),

    // Tomorrow's tasks (preview)
    db.task.findMany({
      where: {
        tenantId,
        assignedToId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueAt: { gt: dayEnd, lte: tomorrowEnd },
      },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      include: {
        property: { select: { id: true, address: true } },
      },
    }),

    // Overdue tasks
    db.task.findMany({
      where: {
        tenantId,
        assignedToId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueAt: { lt: dayStart },
      },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      include: {
        property: { select: { id: true, address: true } },
      },
    }),

    // Role config for task categories
    db.roleConfig.findUnique({
      where: { tenantId_role: { tenantId, role } },
      select: { taskCategories: true },
    }),

    // Completed today count
    db.task.count({
      where: {
        tenantId,
        assignedToId: userId,
        status: 'COMPLETED',
        completedAt: { gte: dayStart },
      },
    }),

    // XP for motivation
    db.userXp.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { totalXp: true, level: true, weeklyXp: true },
    }),
  ])

  const categories = (roleConfig?.taskCategories as string[]) ?? ['Follow-up', 'Call', 'Research', 'Admin']

  const mapTask = (t: typeof todayTasks[0]) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt?.toISOString() ?? null,
    property: t.property ? { id: t.property.id, address: t.property.address } : null,
  })

  return (
    <DayHubClient
      tenantSlug={params.tenant}
      userName={session.name}
      todayTasks={todayTasks.map(mapTask)}
      tomorrowTasks={tomorrowTasks.map(mapTask)}
      overdueTasks={overdueTasks.map(mapTask)}
      categories={categories}
      completedToday={completedToday}
      xp={xpRecord ? { level: xpRecord.level, weeklyXp: xpRecord.weeklyXp } : null}
    />
  )
}
