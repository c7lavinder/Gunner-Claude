// GET    /api/bugs/[id] — admin fetches one full report (incl. screenshot)
// PATCH  /api/bugs/[id] — admin updates status / notes / severity
// DELETE /api/bugs/[id] — admin removes a bug report
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'wont_fix']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  adminNotes: z.string().max(5000).optional().nullable(),
})

// SIMPLIFY: removed `requireAdmin` helper that did a redundant db.user.findUnique
// for role on every request — ctx.userRole is canonical.
function isAdmin(role: string): boolean {
  return ['OWNER', 'ADMIN'].includes(role)
}

export const GET = withTenant<{ id: string }>(async (_req, ctx, params) => {
  if (!isAdmin(ctx.userRole)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // FIX: was leaking — prior code used `findUnique({ where: { id } })` then
  // compared `bug.tenantId !== admin.tenantId` in JS. The DB query was unscoped;
  // any refactor that dropped the JS guard would expose cross-tenant rows.
  // findFirst with the tenant filter pushes the boundary to the query layer.
  const bug = await db.bugReport.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
  })
  if (!bug) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ bug })
})

export const PATCH = withTenant<{ id: string }>(async (req, ctx, params) => {
  if (!isAdmin(ctx.userRole)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // FIX: same anti-pattern as GET above — was id-only findUnique + JS tenant check.
  const existing = await db.bugReport.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { tenantId: true, status: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data: Record<string, unknown> = { ...parsed.data }

  // Auto-stamp resolved metadata when status flips to resolved/wont_fix
  const isFinal = parsed.data.status === 'resolved' || parsed.data.status === 'wont_fix'
  const wasFinal = existing.status === 'resolved' || existing.status === 'wont_fix'
  if (isFinal && !wasFinal) {
    data.resolvedAt = new Date()
    data.resolvedById = ctx.userId
  } else if (!isFinal && wasFinal && parsed.data.status) {
    data.resolvedAt = null
    data.resolvedById = null
  }

  // FIX: was leaking — prior code used `update({ where: { id } })` without tenant scope
  const bug = await db.bugReport.update({
    where: { id: params.id, tenantId: ctx.tenantId },
    data: data as Parameters<typeof db.bugReport.update>[0]['data'],
  })

  return NextResponse.json({ success: true, bug })
})

export const DELETE = withTenant<{ id: string }>(async (_req, ctx, params) => {
  if (!isAdmin(ctx.userRole)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // FIX: same findUnique-by-id + JS tenant check anti-pattern → findFirst with tenant
  const existing = await db.bugReport.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { tenantId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // FIX: was leaking — prior code used `delete({ where: { id } })` without tenant scope.
  // deleteMany lets us add tenantId without losing the unique-key guarantee.
  await db.bugReport.deleteMany({ where: { id: params.id, tenantId: ctx.tenantId } })
  return NextResponse.json({ success: true })
})
