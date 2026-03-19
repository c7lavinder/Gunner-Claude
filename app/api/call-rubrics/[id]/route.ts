// app/api/call-rubrics/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'settings.manage')) return forbiddenResponse()

  const rubric = await db.callRubric.findUnique({
    where: { id: params.id, tenantId: session.tenantId },
  })

  if (!rubric) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.callRubric.delete({ where: { id: params.id } })

  await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'call_rubric.deleted',
      resource: 'call_rubric',
      resourceId: params.id,
      source: 'USER',
      severity: 'INFO',
      payload: { name: rubric.name, role: rubric.role },
    },
  })

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'settings.manage')) return forbiddenResponse()

  const rubric = await db.callRubric.findUnique({
    where: { id: params.id, tenantId: session.tenantId },
  })
  if (!rubric) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  // If setting as default, clear others for this role
  if (body.isDefault) {
    await db.callRubric.updateMany({
      where: { tenantId: session.tenantId, role: rubric.role, isDefault: true, id: { not: params.id } },
      data: { isDefault: false },
    })
  }

  const updated = await db.callRubric.update({
    where: { id: params.id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      ...(body.criteria && { criteria: body.criteria }),
    },
  })

  return NextResponse.json({ rubric: updated })
}
