// GET /api/[tenant]/dayhub/kpis
// Returns today's KPI counts. Admins see tenant-wide, others see their own.
// Supports ?asUserId= for admin View As impersonation.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getCentralDayBounds } from '@/lib/dates'
import { resolveEffectiveUser } from '@/lib/auth/view-as'
import { getDialKpisToday, type DialScope } from '@/lib/kpis/dial-counts'

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const url = new URL(req.url)
    const asUserId = url.searchParams.get('asUserId')
    const userIdsParam = url.searchParams.get('userIds') // comma-separated, for role tab filtering
    const effective = await resolveEffectiveUser(session, asUserId)
    const { dayStart, dayEnd } = getCentralDayBounds()

    const isAdmin = !effective.isImpersonating && (effective.role === 'OWNER' || effective.role === 'ADMIN')
    // Role tab filter: multiple user IDs
    const roleFilterIds = userIdsParam ? userIdsParam.split(',').filter(Boolean) : null

    // Load goals from tenant config
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true },
    })
    const config = (tenant?.config ?? {}) as Record<string, unknown>
    const allGoals = (config.kpiGoals ?? {}) as Record<string, Record<string, number>>

    // Map effective role to goal key
    const ROLE_TO_GOAL_KEY: Record<string, string> = {
      LEAD_MANAGER: 'LM', ACQUISITION_MANAGER: 'AM', DISPOSITION_MANAGER: 'DISPO',
      TEAM_LEAD: 'AM', ADMIN: 'AM', OWNER: 'AM',
    }

    // Goal computation rules:
    //  - Admin viewing tenant-wide (no asUserId, no role tab) → sum all non-admin users' role goals
    //  - Admin viewing a role tab (userIdsParam) → sum only those users' role goals
    //  - View-as or non-admin → use just that user's role goals (no multiplier)
    let goals: Record<string, number>
    const sumAcrossUsers = isAdmin && (roleFilterIds || !asUserId)
    if (sumAcrossUsers) {
      const usersInScope = await db.user.findMany({
        where: {
          tenantId,
          ...(roleFilterIds
            ? { id: { in: roleFilterIds } }
            : { role: { notIn: ['ADMIN', 'OWNER'] } }),
        },
        select: { role: true },
      })
      const headcountByGoalKey: Record<string, number> = {}
      for (const u of usersInScope) {
        if (!u.role) continue
        const gk = ROLE_TO_GOAL_KEY[u.role] ?? 'AM'
        headcountByGoalKey[gk] = (headcountByGoalKey[gk] ?? 0) + 1
      }
      goals = {}
      for (const [gk, roleGoals] of Object.entries(allGoals)) {
        const headcount = headcountByGoalKey[gk] ?? 0
        if (!headcount) continue
        for (const [metric, value] of Object.entries(roleGoals)) {
          goals[metric] = (goals[metric] ?? 0) + value * headcount
        }
      }
    } else {
      const goalKey = ROLE_TO_GOAL_KEY[effective.role] ?? 'AM'
      goals = allGoals[goalKey] ?? {}
    }

    // Scope: role tab filter > view-as > admin (all) > own
    // Mirrored into a DialScope for the shared dial-count helper
    // (lib/kpis/dial-counts.ts) so this route and the canonical Day Hub
    // page can't drift on date field or aggregation rules.
    const userScope = roleFilterIds
      ? { in: roleFilterIds }
      : isAdmin ? undefined : effective.userId

    const dialScope: DialScope = roleFilterIds
      ? { kind: 'users', tenantId, userIds: roleFilterIds }
      : isAdmin
      ? { kind: 'all', tenantId }
      : { kind: 'user', tenantId, userId: effective.userId }

    const milestoneWhere = (type: string) => ({
      tenantId,
      type: type as import('@prisma/client').MilestoneType,
      createdAt: { gte: dayStart, lte: dayEnd },
      ...(userScope ? { loggedById: userScope } : {}),
    })

    const [dialKpis, leadsToday, aptsToday, offersToday, contractsToday, sendsToday, dispoOffersToday, dispoContractsToday] = await Promise.all([
      getDialKpisToday(dialScope),
      db.propertyMilestone.count({ where: milestoneWhere('LEAD') }),
      db.propertyMilestone.count({ where: milestoneWhere('APPOINTMENT_SET') }),
      db.propertyMilestone.count({ where: milestoneWhere('OFFER_MADE') }),
      db.propertyMilestone.count({ where: milestoneWhere('UNDER_CONTRACT') }),
      // "Sends" = buyers messaged about deals (outreach logs + blast recipients)
      Promise.all([
        db.outreachLog.count({
          where: { tenantId, type: 'send', createdAt: { gte: dayStart, lte: dayEnd }, ...(isAdmin ? {} : { userId: effective.userId }) },
        }),
        db.dealBlastRecipient.count({
          where: { blast: { tenantId, createdAt: { gte: dayStart, lte: dayEnd }, ...(isAdmin ? {} : { createdById: effective.userId }) } },
        }),
      ]).then(([logs, recipients]) => logs + recipients),
      db.propertyMilestone.count({ where: milestoneWhere('DISPO_OFFER_RECEIVED') }),
      db.propertyMilestone.count({ where: milestoneWhere('DISPO_CONTRACTED') }),
    ])

    return NextResponse.json({
      calls: { count: dialKpis.calls, goal: goals.calls ?? 0 },
      convos: { count: dialKpis.convos, goal: goals.convos ?? 0 },
      lead: { count: leadsToday, goal: goals.lead ?? 0 },
      apts: { count: aptsToday, goal: goals.apts ?? 0 },
      offers: { count: offersToday, goal: goals.offers ?? 0 },
      contracts: { count: contractsToday, goal: goals.contracts ?? 0 },
      pushed: { count: sendsToday, goal: goals.pushed ?? 0 },
      dispoOffers: { count: dispoOffersToday, goal: goals.dispoOffers ?? 0 },
      dispoContracts: { count: dispoContractsToday, goal: goals.dispoContracts ?? 0 },
      effectiveRole: effective.role,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
