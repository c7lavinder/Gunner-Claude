// app/api/call-rubrics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
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

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const rubrics = await db.callRubric.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({ rubrics })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'settings.manage')) return forbiddenResponse()

  const body = await request.json()
  const parsed = rubricSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  // If setting as default, unset other defaults for same role
  if (parsed.data.isDefault) {
    await db.callRubric.updateMany({
      where: { tenantId: session.tenantId, role: parsed.data.role as any, isDefault: true },
      data: { isDefault: false },
    })
  }

  const rubric = await db.callRubric.create({
    data: {
      tenantId: session.tenantId,
      name: parsed.data.name,
      role: parsed.data.role as any,
      callType: parsed.data.callType ?? null,
      isDefault: parsed.data.isDefault,
      criteria: parsed.data.criteria,
    },
  })

  return NextResponse.json({ rubric }, { status: 201 })
}
