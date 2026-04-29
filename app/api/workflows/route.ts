// app/api/workflows/route.ts
// Workflow CRUD — list, create, toggle
import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

const stepSchema = z.object({
  type: z.enum(['send_sms', 'create_task', 'update_status', 'notify', 'wait']),
  delay: z.number().optional(),
  action: z.string().optional(),
  content: z.string().optional(),
  condition: z.string().optional(),
})

const createSchema = z.object({
  name: z.string().min(1),
  triggerEvent: z.enum(['property_created', 'stage_changed', 'call_graded', 'task_completed']),
  steps: z.array(stepSchema).min(1),
})

const toggleSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
})

export const GET = withTenant(async (_request, ctx) => {
  const workflows = await db.workflowDefinition.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { executions: true } },
    },
  })

  return NextResponse.json({
    workflows: workflows.map(w => ({
      id: w.id,
      name: w.name,
      triggerEvent: w.triggerEvent,
      steps: w.steps,
      isActive: w.isActive,
      executionCount: w._count.executions,
      createdAt: w.createdAt.toISOString(),
    })),
  })
})

export const POST = withTenant(async (request, ctx) => {
  if (!hasPermission(ctx.userRole as UserRole, 'settings.manage')) return forbiddenResponse()

  const body = await request.json()

  // Handle toggle
  if (body.action === 'toggle') {
    const parsed = toggleSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    // Already DiD-clean: updateMany scoped with tenantId.
    await db.workflowDefinition.updateMany({
      where: { id: parsed.data.id, tenantId: ctx.tenantId },
      data: { isActive: parsed.data.isActive },
    })
    return NextResponse.json({ status: 'success' })
  }

  // Create new workflow
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const workflow = await db.workflowDefinition.create({
    data: {
      tenantId: ctx.tenantId,
      name: parsed.data.name,
      triggerEvent: parsed.data.triggerEvent,
      steps: parsed.data.steps as unknown as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ workflow }, { status: 201 })
})
