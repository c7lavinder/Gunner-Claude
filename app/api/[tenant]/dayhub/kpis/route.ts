// GET /api/[tenant]/dayhub/kpis
// Returns today's KPI counts vs goals for Day Hub stat cards
// Uses Central time (America/Chicago) for "today" boundaries
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

function getCentralDayBounds(): { dayStart: Date; dayEnd: Date } {
  // Get today's date string in Central time
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
  }).format(new Date()) // e.g. '2026-03-29'

  // Create UTC dates that represent Central midnight boundaries
  // Parse the Central date at noon UTC to avoid DST edge cases,
  // then compute the UTC offset for that moment in Central time
  const noon = new Date(`${parts}T12:00:00Z`)
  const centralNoon = new Date(noon.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = noon.getTime() - centralNoon.getTime()

  // Central midnight = UTC midnight + offset
  const dayStart = new Date(`${parts}T00:00:00Z`)
  dayStart.setTime(dayStart.getTime() + offsetMs)

  const dayEnd = new Date(`${parts}T23:59:59.999Z`)
  dayEnd.setTime(dayEnd.getTime() + offsetMs)

  return { dayStart, dayEnd }
}

export async function GET(
  _req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const { dayStart, dayEnd } = getCentralDayBounds()

    const [callsToday, convosToday, leadsToday, aptsToday, offersToday, contractsToday, pushedToday, dispoOffersToday, dispoContractsToday] = await Promise.all([
      db.call.count({
        where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd } },
      }),
      db.call.count({
        where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd }, gradingStatus: 'COMPLETED' },
      }),
      // Milestones — total entries per type (matches ledger)
      db.propertyMilestone.count({ where: { tenantId, type: 'LEAD', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { tenantId, type: 'APPOINTMENT_SET', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { tenantId, type: 'OFFER_MADE', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { tenantId, type: 'UNDER_CONTRACT', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { tenantId, type: 'DISPO_PUSHED', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { tenantId, type: 'DISPO_OFFER_RECEIVED', createdAt: { gte: dayStart, lte: dayEnd } } }),
      db.propertyMilestone.count({ where: { tenantId, type: 'DISPO_CONTRACTED', createdAt: { gte: dayStart, lte: dayEnd } } }),
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
