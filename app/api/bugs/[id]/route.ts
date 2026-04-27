// GET    /api/bugs/[id] — admin fetches one full report (incl. screenshot)
// PATCH  /api/bugs/[id] — admin updates status / notes / severity
// DELETE /api/bugs/[id] — admin removes a bug report
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'wont_fix']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  adminNotes: z.string().max(5000).optional().nullable(),
})

async function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return null
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) return null
  return session
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  const admin = await requireAdmin(session)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const bug = await db.bugReport.findUnique({ where: { id: params.id } })
  if (!bug || bug.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ bug })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  const admin = await requireAdmin(session)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const existing = await db.bugReport.findUnique({
    where: { id: params.id },
    select: { tenantId: true, status: true },
  })
  if (!existing || existing.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
    data.resolvedById = admin.userId
  } else if (!isFinal && wasFinal && parsed.data.status) {
    data.resolvedAt = null
    data.resolvedById = null
  }

  const bug = await db.bugReport.update({
    where: { id: params.id },
    data: data as Parameters<typeof db.bugReport.update>[0]['data'],
  })

  return NextResponse.json({ success: true, bug })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  const admin = await requireAdmin(session)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const existing = await db.bugReport.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  })
  if (!existing || existing.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.bugReport.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
