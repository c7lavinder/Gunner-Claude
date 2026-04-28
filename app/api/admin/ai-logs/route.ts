// GET /api/admin/ai-logs — fetch AI logs for admin dashboard
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (req, ctx) => {
  // ctx.userRole is set by withTenant — no need for a follow-up user lookup
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('search')
  const scope = url.searchParams.get('scope') // 'chat' | 'background' | 'errors'
  const limit = parseInt(url.searchParams.get('limit') ?? '50')
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  const where: Record<string, unknown> = { tenantId: ctx.tenantId }

  // scope takes precedence and maps to the three tabs
  if (scope === 'chat') {
    where.type = 'assistant_chat'
  } else if (scope === 'background') {
    where.type = { not: 'assistant_chat' }
  } else if (scope === 'errors') {
    where.status = 'error'
  }

  // explicit type/status filters still apply on top
  if (type) where.type = type
  if (status) where.status = status
  if (search) {
    where.OR = [
      { inputSummary: { contains: search, mode: 'insensitive' } },
      { outputSummary: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Fetch user names for display
  const users = await db.user.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true },
  })
  const userNames = new Map(users.map(u => [u.id, u.name]))

  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0))
  const weekAgo = new Date(Date.now() - 7 * 86400000)

  const [logs, total, statsResults] = await Promise.all([
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
    Promise.all([
      // chats today
      db.aiLog.count({ where: { tenantId: ctx.tenantId, type: 'assistant_chat', createdAt: { gte: startOfToday } } }),
      // background work today (everything except assistant_chat)
      db.aiLog.count({ where: { tenantId: ctx.tenantId, type: { not: 'assistant_chat' }, createdAt: { gte: startOfToday } } }),
      // problems today (any type, status=error)
      db.aiLog.count({ where: { tenantId: ctx.tenantId, status: 'error', createdAt: { gte: startOfToday } } }),
      // week error rate (unchanged)
      db.aiLog.count({ where: { tenantId: ctx.tenantId, status: 'error', createdAt: { gte: weekAgo } } }),
      db.aiLog.count({ where: { tenantId: ctx.tenantId, createdAt: { gte: weekAgo } } }),
      // today cost sum (server-side so it's accurate across pagination)
      db.aiLog.aggregate({
        where: { tenantId: ctx.tenantId, createdAt: { gte: startOfToday } },
        _sum: { estimatedCost: true },
      }),
    ]),
  ])

  const [chatsToday, backgroundToday, errorsToday, weekErrors, weekTotal, costAgg] = statsResults
  const todayCost = costAgg._sum.estimatedCost ?? 0

  return NextResponse.json({
    logs: logs.map(l => ({ ...l, userName: l.userId ? userNames.get(l.userId) ?? null : 'System' })),
    total,
    stats: {
      chatsToday,
      backgroundToday,
      errorsToday,
      weekErrorRate: weekTotal > 0 ? Math.round((weekErrors / weekTotal) * 100) : 0,
      weekTotal,
      weekErrors,
      todayCost,
    },
  })
})
