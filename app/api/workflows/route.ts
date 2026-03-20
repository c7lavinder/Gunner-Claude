// app/api/workflows/route.ts
// Workflow CRUD — list, create, toggle
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
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

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const workflows = await db.workflowDefinition.findMany({
    where: { tenantId: session.tenantId },
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
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'settings.manage')) return forbiddenResponse()

  const body = await request.json()

  // Handle toggle
  if (body.action === 'toggle') {
    const parsed = toggleSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    await db.workflowDefinition.updateMany({
      where: { id: parsed.data.id, tenantId: session.tenantId },
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
      tenantId: session.tenantId,
      name: parsed.data.name,
      triggerEvent: parsed.data.triggerEvent,
      steps: parsed.data.steps as unknown as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ workflow }, { status: 201 })
}
