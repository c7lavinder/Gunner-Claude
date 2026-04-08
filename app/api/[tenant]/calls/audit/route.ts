// app/api/[tenant]/calls/audit/route.ts
// GET /api/[tenant]/calls/audit — find calls that may have been missed by the grading pipeline
// Returns: calls > 45s that are PENDING/FAILED, calls with recording URL but no transcript
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'

export const GET = withTenant(async (req, ctx) => {
  const role = ctx.userRole as UserRole
  if (!hasPermission(role, 'calls.view.all')) {
    return NextResponse.json({ error: 'Only admins can audit calls' }, { status: 403 })
  }

  const tenantId = ctx.tenantId

    // Calls > 45s that are PENDING (never graded)
    const pendingLong = await db.call.findMany({
      where: { tenantId, gradingStatus: 'PENDING', durationSeconds: { gte: 45 } },
      select: { id: true, durationSeconds: true, calledAt: true, contactName: true, recordingUrl: true },
      orderBy: { calledAt: 'desc' },
      take: 50,
    })

    // Calls > 45s that FAILED grading (exclude no-answer calls)
    const failedLong = await db.call.findMany({
      where: { tenantId, gradingStatus: 'FAILED', durationSeconds: { gte: 45 }, callResult: { not: 'no_answer' } },
      select: { id: true, durationSeconds: true, calledAt: true, contactName: true, recordingUrl: true, aiSummary: true },
      orderBy: { calledAt: 'desc' },
      take: 50,
    })

    // Calls with recording URL but no transcript
    const noTranscript = await db.call.findMany({
      where: { tenantId, recordingUrl: { not: null }, transcript: null, durationSeconds: { gte: 45 } },
      select: { id: true, durationSeconds: true, calledAt: true, contactName: true, recordingUrl: true, gradingStatus: true },
      orderBy: { calledAt: 'desc' },
      take: 50,
    })

    // Calls graded COMPLETED with score 0 (suspicious)
    const zeroScore = await db.call.findMany({
      where: { tenantId, gradingStatus: 'COMPLETED', score: 0, durationSeconds: { gte: 45 } },
      select: { id: true, durationSeconds: true, calledAt: true, contactName: true },
      orderBy: { calledAt: 'desc' },
      take: 20,
    })

    // Summary stats
    const [totalCalls, gradedCalls, totalLong] = await Promise.all([
      db.call.count({ where: { tenantId } }),
      db.call.count({ where: { tenantId, gradingStatus: 'COMPLETED' } }),
      db.call.count({ where: { tenantId, durationSeconds: { gte: 45 } } }),
    ])

    const formatCall = (c: { calledAt?: Date | null; [key: string]: unknown }) => ({
      ...c,
      calledAt: c.calledAt instanceof Date ? c.calledAt.toISOString() : c.calledAt ?? null,
    })

  return NextResponse.json({
    summary: {
      totalCalls,
      gradedCalls,
      totalLongCalls: totalLong,
      pendingLongCount: pendingLong.length,
      failedLongCount: failedLong.length,
      noTranscriptCount: noTranscript.length,
      zeroScoreCount: zeroScore.length,
    },
    pendingLong: pendingLong.map(formatCall),
    failedLong: failedLong.map(formatCall),
    noTranscript: noTranscript.map(formatCall),
    zeroScore: zeroScore.map(formatCall),
  })
})
