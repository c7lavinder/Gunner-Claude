// app/(tenant)/[tenant]/day-hub/page.tsx
// Day Hub — daily task planner with role-based categories
// The screen reps check every morning to plan their day
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { DayHubClient } from './day-hub-client'
import type { UserRole } from '@/types/roles'
import { endOfDay, addDays } from 'date-fns'
import { getCentralDayBounds } from '@/lib/dates'

export default async function DayHubPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId
  const userId = session.userId
  const role = session.role as UserRole
  const today = new Date()
  const { dayStart, dayEnd } = getCentralDayBounds()
  const tomorrowEnd = endOfDay(addDays(today, 1))

  // Load KPI goals from tenant config
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { config: true },
  })
  const config = (tenant?.config ?? {}) as Record<string, unknown>
  const allGoals = (config.kpiGoals ?? {}) as Record<string, Record<string, number>>

  const isAdmin = role === 'ADMIN' || role === 'OWNER'

  // For admin: multiply each role's goals by headcount
  // For non-admin: use their own role's goals
  const ROLE_TO_GOAL_KEY: Record<string, string> = {
    LEAD_MANAGER: 'LM', ACQUISITION_MANAGER: 'AM', DISPOSITION_MANAGER: 'DISPO',
    TEAM_LEAD: 'AM', ADMIN: 'AM', OWNER: 'AM',
  }

  let goals: Record<string, number>
  if (isAdmin) {
    // Count users per role for goal multiplication (exclude admin/owner — they don't have individual KPI targets)
    const roleCounts = await db.user.groupBy({
      by: ['role'],
      where: { tenantId, role: { notIn: ['ADMIN', 'OWNER'] } },
      _count: { _all: true },
    })
    const countByGoalKey: Record<string, number> = {}
    for (const rc of roleCounts) {
      if (!rc.role) continue
      const gk = ROLE_TO_GOAL_KEY[rc.role] ?? 'AM'
      countByGoalKey[gk] = (countByGoalKey[gk] ?? 0) + rc._count._all
    }
    // Merge all role goals, multiplied by headcount
    goals = {}
    for (const [gk, roleGoals] of Object.entries(allGoals)) {
      const headcount = countByGoalKey[gk] ?? 1
      for (const [metric, value] of Object.entries(roleGoals)) {
        goals[metric] = (goals[metric] ?? 0) + value * headcount
      }
    }
  } else {
    const goalKey = ROLE_TO_GOAL_KEY[role] ?? 'AM'
    goals = allGoals[goalKey] ?? {}
  }

  const [todayTasks, tomorrowTasks, overdueTasks, roleConfig, completedToday, xpRecord, milestoneCounts, callCounts, properties] = await Promise.all([
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

    // All 7 milestone type counts for today — scoped to this user (admin sees all)
    (() => {
      const msWhere = (type: string) => ({
        tenantId,
        type: type as import('@prisma/client').MilestoneType,
        createdAt: { gte: dayStart, lte: dayEnd },
        ...(isAdmin ? {} : { loggedById: userId }),
      })
      return Promise.all([
        db.propertyMilestone.groupBy({ by: ['propertyId'], where: msWhere('LEAD') }).then(r => r.length),
        db.propertyMilestone.groupBy({ by: ['propertyId'], where: msWhere('APPOINTMENT_SET') }).then(r => r.length),
        db.propertyMilestone.groupBy({ by: ['propertyId'], where: msWhere('OFFER_MADE') }).then(r => r.length),
        db.propertyMilestone.groupBy({ by: ['propertyId'], where: msWhere('UNDER_CONTRACT') }).then(r => r.length),
        db.propertyMilestone.groupBy({ by: ['propertyId'], where: msWhere('DISPO_PUSHED') }).then(r => r.length),
        db.propertyMilestone.groupBy({ by: ['propertyId'], where: msWhere('DISPO_OFFER_RECEIVED') }).then(r => r.length),
        db.propertyMilestone.groupBy({ by: ['propertyId'], where: msWhere('DISPO_CONTRACTED') }).then(r => r.length),
      ]).then(([lead, aptSet, offer, contract, pushed, dispoOffer, dispoContract]) => ({
        lead, aptSet, offer, contract, pushed, dispoOffer, dispoContract,
      }))
    })(),

    // Calls made today + meaningful convos (>=45s)
    Promise.all([
      db.call.count({ where: { tenantId, assignedToId: userId, createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.call.count({ where: { tenantId, assignedToId: userId, createdAt: { gte: dayStart, lte: dayEnd }, durationSeconds: { gte: 45 } } }),
    ]).then(([calls, convos]) => ({ calls, convos })),

    // Properties for milestone entry dropdown (active only)
    db.property.findMany({
      where: { tenantId, status: { notIn: ['DEAD', 'SOLD'] } },
      select: { id: true, address: true, city: true, state: true },
      orderBy: { address: 'asc' },
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
      userRole={role}
      todayTasks={todayTasks.map(mapTask)}
      tomorrowTasks={tomorrowTasks.map(mapTask)}
      overdueTasks={overdueTasks.map(mapTask)}
      categories={categories}
      completedToday={completedToday}
      xp={xpRecord ? { level: xpRecord.level, weeklyXp: xpRecord.weeklyXp } : null}
      milestones={milestoneCounts}
      calls={callCounts}
      goals={goals}
      properties={properties.map(p => ({ id: p.id, label: `${p.address}, ${p.city} ${p.state}` }))}
    />
  )
}
