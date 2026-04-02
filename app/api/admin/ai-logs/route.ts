// GET /api/admin/ai-logs — fetch AI logs for admin dashboard
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type') // filter by type
  const status = url.searchParams.get('status') // filter by status
  const search = url.searchParams.get('search') // search input/output
  const limit = parseInt(url.searchParams.get('limit') ?? '50')
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  const where: Record<string, unknown> = { tenantId: session.tenantId }
  if (type) where.type = type
  if (status) where.status = status
  if (search) {
    where.OR = [
      { inputSummary: { contains: search, mode: 'insensitive' } },
      { outputSummary: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [logs, total, stats] = await Promise.all([
    db.aiLog.findMany({
      where: where as Parameters<typeof db.aiLog.findMany>[0] extends { where?: infer W } ? W : never,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true, createdAt: true, userId: true, type: true, pageContext: true,
        inputSummary: true, outputSummary: true, toolsCalled: true,
        status: true, errorMessage: true, tokensIn: true, tokensOut: true,
        estimatedCost: true, durationMs: true, model: true,
      },
    }),
    db.aiLog.count({ where: where as Parameters<typeof db.aiLog.count>[0] extends { where?: infer W } ? W : never }),
    // Stats
    Promise.all([
      db.aiLog.count({ where: { tenantId: session.tenantId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      db.aiLog.count({ where: { tenantId: session.tenantId, status: 'error', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
      db.aiLog.count({ where: { tenantId: session.tenantId, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    ]),
  ])

  const [todayCount, weekErrors, weekTotal] = stats

  return NextResponse.json({
    logs,
    total,
    stats: {
      todayCount,
      weekErrorRate: weekTotal > 0 ? Math.round((weekErrors / weekTotal) * 100) : 0,
      weekTotal,
      weekErrors,
    },
  })
}
