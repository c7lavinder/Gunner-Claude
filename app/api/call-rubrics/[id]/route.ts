// app/api/call-rubrics/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'

export const DELETE = withTenant<{ id: string }>(async (req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'settings.manage')) return forbiddenResponse()

  const rubric = await db.callRubric.findUnique({
    where: { id: params.id, tenantId: ctx.tenantId },
  })

  if (!rubric) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.callRubric.delete({ where: { id: params.id, tenantId: ctx.tenantId } })

  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'call_rubric.deleted',
      resource: 'call_rubric',
      resourceId: params.id,
      source: 'USER',
      severity: 'INFO',
      payload: { name: rubric.name, role: rubric.role },
    },
  })

  return NextResponse.json({ success: true })
})

export const PATCH = withTenant<{ id: string }>(async (req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'settings.manage')) return forbiddenResponse()

  const rubric = await db.callRubric.findUnique({
    where: { id: params.id, tenantId: ctx.tenantId },
  })
  if (!rubric) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

  // If setting as default, clear others for this role
  if (body.isDefault) {
    await db.callRubric.updateMany({
      where: { tenantId: ctx.tenantId, role: rubric.role, isDefault: true, id: { not: params.id } },
      data: { isDefault: false },
    })
  }

  const updated = await db.callRubric.update({
    where: { id: params.id, tenantId: ctx.tenantId },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      ...(body.criteria && { criteria: body.criteria }),
    },
  })

  return NextResponse.json({ rubric: updated })
})
