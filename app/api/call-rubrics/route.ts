// app/api/call-rubrics/route.ts
import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { z } from 'zod'

const criteriaSchema = z.object({
  category: z.string().min(1),
  maxPoints: z.number().min(1).max(100),
  description: z.string().min(1),
})

const rubricSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string(),
  callType: z.string().nullable().optional(),
  isDefault: z.boolean().default(false),
  criteria: z.array(criteriaSchema).min(1).max(10),
})

export const GET = withTenant(async (_req, ctx) => {
  const rubrics = await db.callRubric.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({ rubrics })
})

export const POST = withTenant(async (req, ctx) => {
  if (!hasPermission(ctx.userRole as UserRole, 'settings.manage')) return forbiddenResponse()

  const body = await req.json()
  const parsed = rubricSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  // If setting as default, unset other defaults for same role
  if (parsed.data.isDefault) {
    await db.callRubric.updateMany({
      where: { tenantId: ctx.tenantId, role: parsed.data.role as any, isDefault: true },
      data: { isDefault: false },
    })
  }

  const rubric = await db.callRubric.create({
    data: {
      tenantId: ctx.tenantId,
      name: parsed.data.name,
      role: parsed.data.role as any,
      callType: parsed.data.callType ?? null,
      isDefault: parsed.data.isDefault,
      criteria: parsed.data.criteria,
    },
  })

  return NextResponse.json({ rubric }, { status: 201 })
})
