// POST /api/bugs — any logged-in user submits a bug report
// GET  /api/bugs — admin-only list view with filters
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

const createSchema = z.object({
  description: z.string().min(3).max(5000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  pageUrl: z.string().max(2000).optional().nullable(),
  userAgent: z.string().max(1000).optional().nullable(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const bug = await db.bugReport.create({
    data: {
      tenantId: session.tenantId,
      reporterId: session.userId,
      reporterName: session.name || session.email || null,
      description: parsed.data.description,
      severity: parsed.data.severity,
      pageUrl: parsed.data.pageUrl ?? null,
      userAgent: parsed.data.userAgent ?? null,
    },
    select: { id: true, createdAt: true },
  })

  return NextResponse.json({ success: true, bug })
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const severity = url.searchParams.get('severity')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500)

  const where: Record<string, unknown> = { tenantId: session.tenantId }
  if (status) where.status = status
  if (severity) where.severity = severity

  const [bugs, counts] = await Promise.all([
    db.bugReport.findMany({
      where: where as Parameters<typeof db.bugReport.findMany>[0] extends { where?: infer W } ? W : never,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    db.bugReport.groupBy({
      by: ['status'],
      where: { tenantId: session.tenantId },
      _count: { _all: true },
    }),
  ])

  const statusCounts = counts.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all
    return acc
  }, {})

  return NextResponse.json({ bugs, statusCounts })
}
