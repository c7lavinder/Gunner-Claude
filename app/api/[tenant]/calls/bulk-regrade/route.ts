// app/api/[tenant]/calls/bulk-regrade/route.ts
// Re-grades all completed calls (optionally filtered by callType)
// Used when rubrics are updated and team wants fresh scores
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { gradeCall } from '@/lib/ai/grading'
import { hasPermission, type UserRole } from '@/types/roles'

export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const role = session.role as UserRole
  if (!hasPermission(role, 'calls.view.all')) {
    return NextResponse.json({ error: 'Only admins can bulk re-grade' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { callType?: string }

  const where: Record<string, unknown> = {
    tenantId: session.tenantId,
    gradingStatus: 'COMPLETED',
    transcript: { not: null },
  }
  if (body.callType) where.callType = body.callType

  const calls = await db.call.findMany({
    where,
    select: { id: true },
    orderBy: { calledAt: 'desc' },
    take: 500,
  })

  if (calls.length === 0) {
    return NextResponse.json({ queued: 0, message: 'No calls to re-grade' })
  }

  // Mark all as PENDING
  await db.call.updateMany({
    where: { id: { in: calls.map(c => c.id) } },
    data: { gradingStatus: 'PENDING' },
  })

  // Process sequentially with 500ms spacing to avoid rate limits
  let processed = 0
  const process = async () => {
    for (const call of calls) {
      try {
        await gradeCall(call.id)
        processed++
      } catch (err) {
        console.error(`[Bulk Re-grade] Failed for ${call.id}:`, err instanceof Error ? err.message : err)
      }
      await new Promise(r => setTimeout(r, 500))
    }
    console.log(`[Bulk Re-grade] Done: ${processed}/${calls.length} re-graded`)
  }

  // Fire and forget — don't block the response
  process().catch(() => {})

  await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'calls.bulk_regrade',
      resource: 'call',
      source: 'USER',
      severity: 'INFO',
      payload: { callType: body.callType ?? 'all', count: calls.length },
    },
  })

  return NextResponse.json({ queued: calls.length, message: `${calls.length} calls queued for re-grading` })
}
