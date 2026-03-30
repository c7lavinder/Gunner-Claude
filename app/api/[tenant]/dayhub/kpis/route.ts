// GET /api/[tenant]/dayhub/kpis
// Returns today's KPI counts vs goals for Day Hub stat cards
// Admins see tenant-wide, others see only their own
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getCentralDayBounds } from '@/lib/dates'

export async function GET(
  _req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const userId = session.userId
    const { dayStart, dayEnd } = getCentralDayBounds()

    // Check if admin — admins see tenant-wide, others see their own
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    const isAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'

    // Scope filters
    const callWhere = {
      tenantId,
      calledAt: { gte: dayStart, lte: dayEnd },
      ...(isAdmin ? {} : { assignedToId: userId }),
    }
    const milestoneWhere = (type: string) => ({
      tenantId,
      type: type as import('@prisma/client').MilestoneType,
      createdAt: { gte: dayStart, lte: dayEnd },
      ...(isAdmin ? {} : { loggedById: userId }),
    })

    const [callsToday, convosToday, leadsToday, aptsToday, offersToday, contractsToday, pushedToday, dispoOffersToday, dispoContractsToday] = await Promise.all([
      db.call.count({ where: callWhere }),
      db.call.count({ where: { ...callWhere, gradingStatus: 'COMPLETED', durationSeconds: { gte: 45 } } }),
      db.propertyMilestone.count({ where: milestoneWhere('LEAD') }),
      db.propertyMilestone.count({ where: milestoneWhere('APPOINTMENT_SET') }),
      db.propertyMilestone.count({ where: milestoneWhere('OFFER_MADE') }),
      db.propertyMilestone.count({ where: milestoneWhere('UNDER_CONTRACT') }),
      db.propertyMilestone.count({ where: milestoneWhere('DISPO_PUSHED') }),
      db.propertyMilestone.count({ where: milestoneWhere('DISPO_OFFER_RECEIVED') }),
      db.propertyMilestone.count({ where: milestoneWhere('DISPO_CONTRACTED') }),
    ])

    return NextResponse.json({
      calls: { count: callsToday, goal: 340 },
      convos: { count: convosToday, goal: 40 },
      lead: { count: leadsToday, goal: 0 },
      apts: { count: aptsToday, goal: 8 },
      offers: { count: offersToday, goal: 2 },
      contracts: { count: contractsToday, goal: 1 },
      pushed: { count: pushedToday, goal: 0 },
      dispoOffers: { count: dispoOffersToday, goal: 0 },
      dispoContracts: { count: dispoContractsToday, goal: 0 },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
