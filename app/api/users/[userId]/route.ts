// app/api/users/[userId]/route.ts
// Update user fields (ghlUserId mapping, reportsTo)
// Only OWNER/ADMIN can update other users
import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { z } from 'zod'

const updateSchema = z.object({
  ghlUserId: z.string().nullable().optional(),
  reportsTo: z.string().nullable().optional(),
  role: z.enum(['OWNER', 'ADMIN', 'TEAM_LEAD', 'LEAD_MANAGER', 'ACQUISITION_MANAGER', 'DISPOSITION_MANAGER']).optional(),
})

export const PATCH = withTenant<{ userId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'settings.manage')) return forbiddenResponse()

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Verify user belongs to same tenant — also fetches role for OWNER guard.
  // SIMPLIFY: collapsed two findFirst calls into one (was: validate tenant,
  // then re-fetch for role check).
  const user = await db.user.findFirst({
    where: { id: params.userId, tenantId: ctx.tenantId },
    select: { id: true, role: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Prevent changing OWNER role
  if (parsed.data.role && user.role === 'OWNER') {
    return NextResponse.json({ error: 'Cannot change the owner role' }, { status: 403 })
  }

  // FIX: was leaking — Class 1 — prior code used update({ where: { id: params.userId } })
  // (no tenantId in WHERE). Defense-in-depth: scope every write.
  const updated = await db.user.update({
    where: { id: params.userId, tenantId: ctx.tenantId },
    data: {
      ...(parsed.data.ghlUserId !== undefined && { ghlUserId: parsed.data.ghlUserId }),
      ...(parsed.data.reportsTo !== undefined && { reportsTo: parsed.data.reportsTo }),
      ...(parsed.data.role !== undefined && { role: parsed.data.role }),
    },
    select: { id: true, ghlUserId: true, reportsTo: true, role: true },
  })

  return NextResponse.json({ status: 'success', data: updated })
})
