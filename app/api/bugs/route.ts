// POST /api/bugs — any logged-in user submits a bug report
// GET  /api/bugs — admin-only list view with filters
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

// Screenshot cap: ~5MB raw image → ~6.7MB base64 → 7.5MB data URL with
// the `data:image/png;base64,` prefix and slack. Anything larger is almost
// certainly an unintended paste of multi-megapixel raw camera output.
const MAX_SCREENSHOT_BYTES = 7_500_000

const createSchema = z.object({
  description: z.string().min(3).max(5000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  pageUrl: z.string().max(2000).optional().nullable(),
  userAgent: z.string().max(1000).optional().nullable(),
  screenshot: z.string()
    .max(MAX_SCREENSHOT_BYTES, 'Screenshot too large (max ~5MB).')
    .regex(/^data:image\/(png|jpeg|jpg|gif|webp);base64,/, 'Screenshot must be a base64 image data URL.')
    .optional()
    .nullable(),
})

export const POST = withTenant(async (req, ctx) => {
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
      tenantId: ctx.tenantId,
      reporterId: ctx.userId,
      reporterName: ctx.userName || ctx.userEmail || null,
      description: parsed.data.description,
      severity: parsed.data.severity,
      pageUrl: parsed.data.pageUrl ?? null,
      userAgent: parsed.data.userAgent ?? null,
      screenshot: parsed.data.screenshot ?? null,
    },
    select: { id: true, createdAt: true },
  })

  return NextResponse.json({ success: true, bug })
})

export const GET = withTenant(async (req, ctx) => {
  // SIMPLIFY: removed redundant db.user.findUnique role lookup — ctx.userRole is canonical
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const severity = url.searchParams.get('severity')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500)

  const where: Record<string, unknown> = { tenantId: ctx.tenantId }
  if (status) where.status = status
  if (severity) where.severity = severity

  // Explicit select — DO NOT return `screenshot` in the list response.
  // Each screenshot can be up to ~7MB; including them inline turns a 100-row
  // admin view into a >700MB payload. The admin client lazy-loads a single
  // screenshot via GET /api/bugs/[id] when a row is expanded.
  const [rawBugs, screenshotIds, counts] = await Promise.all([
    db.bugReport.findMany({
      where: where as Parameters<typeof db.bugReport.findMany>[0] extends { where?: infer W } ? W : never,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        reporterId: true,
        reporterName: true,
        description: true,
        severity: true,
        pageUrl: true,
        userAgent: true,
        status: true,
        adminNotes: true,
        resolvedAt: true,
        resolvedById: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    // Lightweight existence probe: just return ids that have a non-null
    // screenshot. Postgres can answer this without reading the TEXT column.
    db.bugReport.findMany({
      where: { ...(where as Record<string, unknown>), screenshot: { not: null } } as Parameters<typeof db.bugReport.findMany>[0] extends { where?: infer W } ? W : never,
      select: { id: true },
      take: limit,
    }),
    db.bugReport.groupBy({
      by: ['status'],
      where: { tenantId: ctx.tenantId },
      _count: { _all: true },
    }),
  ])

  const withScreenshot = new Set(screenshotIds.map(b => b.id))
  const bugs = rawBugs.map(b => ({ ...b, hasScreenshot: withScreenshot.has(b.id) }))

  const statusCounts = counts.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all
    return acc
  }, {})

  return NextResponse.json({ bugs, statusCounts })
})
