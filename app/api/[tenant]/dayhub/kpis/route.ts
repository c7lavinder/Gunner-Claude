// GET /api/[tenant]/dayhub/kpis
// Returns today's KPI counts vs goals for Day Hub stat cards
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { startOfDay, endOfDay } from 'date-fns'

export async function GET(
  _req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const today = new Date()
    const dayStart = startOfDay(today)
    const dayEnd = endOfDay(today)

    const [callsToday, convosToday, leadsToday, aptsToday, offersToday, contractsToday, pushedToday, dispoOffersToday, dispoContractsToday] = await Promise.all([
      // Calls made today
      db.call.count({
        where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd } },
      }),
      // Conversations (graded calls = meaningful convos)
      db.call.count({
        where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd }, gradingStatus: 'COMPLETED' },
      }),
      // Milestones — unique properties per type
      db.propertyMilestone.groupBy({ by: ['propertyId'], where: { tenantId, type: 'LEAD', createdAt: { gte: dayStart, lte: dayEnd } } }).then(r => r.length),
      db.propertyMilestone.groupBy({ by: ['propertyId'], where: { tenantId, type: 'APPOINTMENT_SET', createdAt: { gte: dayStart, lte: dayEnd } } }).then(r => r.length),
      db.propertyMilestone.groupBy({ by: ['propertyId'], where: { tenantId, type: 'OFFER_MADE', createdAt: { gte: dayStart, lte: dayEnd } } }).then(r => r.length),
      db.propertyMilestone.groupBy({ by: ['propertyId'], where: { tenantId, type: 'UNDER_CONTRACT', createdAt: { gte: dayStart, lte: dayEnd } } }).then(r => r.length),
      db.propertyMilestone.groupBy({ by: ['propertyId'], where: { tenantId, type: 'DISPO_PUSHED', createdAt: { gte: dayStart, lte: dayEnd } } }).then(r => r.length),
      db.propertyMilestone.groupBy({ by: ['propertyId'], where: { tenantId, type: 'DISPO_OFFER_RECEIVED', createdAt: { gte: dayStart, lte: dayEnd } } }).then(r => r.length),
      db.propertyMilestone.groupBy({ by: ['propertyId'], where: { tenantId, type: 'DISPO_CONTRACTED', createdAt: { gte: dayStart, lte: dayEnd } } }).then(r => r.length),
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
