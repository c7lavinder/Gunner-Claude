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

    const [callsToday, propertiesActive, tasksCompleted, appointmentsToday] = await Promise.all([
      db.call.count({
        where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd } },
      }),
      db.property.count({
        where: { tenantId, status: { notIn: ['DEAD', 'SOLD'] } },
      }),
      db.task.count({
        where: { tenantId, status: 'COMPLETED', completedAt: { gte: dayStart } },
      }),
      db.propertyMilestone.count({
        where: { tenantId, type: 'APPOINTMENT_SET', createdAt: { gte: dayStart, lte: dayEnd } },
      }),
    ])

    // Count offers and contracts from milestones
    const [offersToday, contractsToday] = await Promise.all([
      db.propertyMilestone.count({
        where: { tenantId, type: 'OFFER_MADE', createdAt: { gte: dayStart, lte: dayEnd } },
      }),
      db.propertyMilestone.count({
        where: { tenantId, type: 'UNDER_CONTRACT', createdAt: { gte: dayStart, lte: dayEnd } },
      }),
    ])

    // Get conversations count from DB (cached from GHL)
    const convosToday = await db.call.count({
      where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd }, gradingStatus: 'COMPLETED' },
    })

    return NextResponse.json({
      calls: { count: callsToday, goal: 340 },
      convos: { count: convosToday, goal: 40 },
      apts: { count: appointmentsToday, goal: 8 },
      offers: { count: offersToday, goal: 2 },
      contracts: { count: contractsToday, goal: 1 },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
