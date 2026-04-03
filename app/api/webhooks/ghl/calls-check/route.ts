// GET /api/webhooks/ghl/calls-check
// Quick diagnostic: shows recent calls in DB to verify webhook → call creation pipeline
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

export async function GET() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [totalToday, recentCalls, gradingBreakdown] = await Promise.all([
    db.call.count({ where: { calledAt: { gte: todayStart } } }),
    db.call.findMany({
      where: { calledAt: { gte: todayStart } },
      orderBy: { calledAt: 'desc' },
      take: 15,
      select: {
        id: true, contactName: true, durationSeconds: true, gradingStatus: true,
        callResult: true, direction: true, calledAt: true, recordingUrl: true,
        assignedTo: { select: { name: true } },
      },
    }),
    db.call.groupBy({
      by: ['gradingStatus'],
      where: { calledAt: { gte: todayStart } },
      _count: true,
    }),
  ])

  return NextResponse.json({
    totalCallsToday: totalToday,
    gradingBreakdown: gradingBreakdown.map(g => ({ status: g.gradingStatus, count: g._count })),
    recentCalls: recentCalls.map(c => ({
      contact: c.contactName ?? 'Unknown',
      duration: c.durationSeconds ? `${c.durationSeconds}s` : 'unknown',
      status: c.gradingStatus,
      result: c.callResult,
      direction: c.direction,
      time: c.calledAt?.toISOString(),
      hasRecording: !!c.recordingUrl,
      assignedTo: c.assignedTo?.name ?? 'unassigned',
    })),
  })
}
