// app/api/users/[userId]/route.ts
// Update user fields (ghlUserId mapping, reportsTo)
// Only OWNER/ADMIN can update other users
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { z } from 'zod'

const updateSchema = z.object({
  ghlUserId: z.string().nullable().optional(),
  reportsTo: z.string().nullable().optional(),
  role: z.enum(['OWNER', 'ADMIN', 'TEAM_LEAD', 'LEAD_MANAGER']).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'settings.manage')) return forbiddenResponse()

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Verify user belongs to same tenant
  const user = await db.user.findFirst({
    where: { id: params.userId, tenantId: session.tenantId },
    select: { id: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Prevent changing OWNER role
  if (parsed.data.role) {
    const targetUser = await db.user.findFirst({
      where: { id: params.userId, tenantId: session.tenantId },
      select: { role: true },
    })
    if (targetUser?.role === 'OWNER') {
      return NextResponse.json({ error: 'Cannot change the owner role' }, { status: 403 })
    }
  }

  const updated = await db.user.update({
    where: { id: params.userId },
    data: {
      ...(parsed.data.ghlUserId !== undefined && { ghlUserId: parsed.data.ghlUserId }),
      ...(parsed.data.reportsTo !== undefined && { reportsTo: parsed.data.reportsTo }),
      ...(parsed.data.role !== undefined && { role: parsed.data.role }),
    },
    select: { id: true, ghlUserId: true, reportsTo: true, role: true },
  })

  return NextResponse.json({ status: 'success', data: updated })
}
