// GET /api/webhooks/ghl/status
// Shows recent webhook events — visit this URL to see if GHL is sending data
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

export async function GET() {
  const recent = await db.auditLog.findMany({
    where: { action: 'webhook.received' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, payload: true },
  })

  const totalEver = await db.auditLog.count({ where: { action: 'webhook.received' } })
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const totalToday = await db.auditLog.count({ where: { action: 'webhook.received', createdAt: { gte: todayStart } } })

  return NextResponse.json({
    status: totalEver > 0 ? 'RECEIVING WEBHOOKS' : 'NO WEBHOOKS RECEIVED YET',
    totalEver,
    totalToday,
    recentEvents: recent.map(r => ({
      time: r.createdAt.toISOString(),
      data: r.payload,
    })),
  })
}
