// GET /api/[tenant]/dayhub/kpis
// Returns today's KPI counts. Admins see tenant-wide, others see their own.
// Supports ?asUserId= for admin View As impersonation.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getCentralDayBounds } from '@/lib/dates'
import { resolveEffectiveUser } from '@/lib/auth/view-as'

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const asUserId = new URL(req.url).searchParams.get('asUserId')
    const effective = await resolveEffectiveUser(session, asUserId)
    const { dayStart, dayEnd } = getCentralDayBounds()

    const isAdmin = !effective.isImpersonating && (effective.role === 'OWNER' || effective.role === 'ADMIN')

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
    const goalKey = ROLE_TO_GOAL_KEY[effective.role] ?? 'AM'
    const goals = allGoals[goalKey] ?? {}

    const callWhere = {
      tenantId,
      calledAt: { gte: dayStart, lte: dayEnd },
      ...(isAdmin ? {} : { assignedToId: effective.userId }),
    }
    const milestoneWhere = (type: string) => ({
      tenantId,
      type: type as import('@prisma/client').MilestoneType,
      createdAt: { gte: dayStart, lte: dayEnd },
      ...(isAdmin ? {} : { loggedById: effective.userId }),
    })

    const [callsToday, convosToday, leadsToday, aptsToday, offersToday, contractsToday, sendsToday, dispoOffersToday, dispoContractsToday] = await Promise.all([
      db.call.count({ where: callWhere }),
      db.call.count({ where: { ...callWhere, gradingStatus: 'COMPLETED', durationSeconds: { gte: 45 } } }),
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
      calls: { count: callsToday, goal: goals.calls ?? 0 },
      convos: { count: convosToday, goal: goals.convos ?? 0 },
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
