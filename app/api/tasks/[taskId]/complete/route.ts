// app/api/tasks/[taskId]/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

export const POST = withTenant<{ taskId: string }>(async (req, ctx, params) => {
  const { taskId } = params

  const task = await db.task.findUnique({
    where: { id: taskId, tenantId: ctx.tenantId },
    select: { id: true, ghlTaskId: true, property: { select: { ghlContactId: true } } },
  })

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  await db.task.update({
    where: { id: taskId, tenantId: ctx.tenantId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  // Sync completion to GHL
  if (task.ghlTaskId && task.property?.ghlContactId) {
    try {
      const ghl = await getGHLClient(ctx.tenantId)
      await ghl.completeTask(task.property.ghlContactId, task.ghlTaskId)
    } catch (err) {
      console.warn('[Tasks] GHL complete sync failed:', err)
    }
  }

  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'task.completed',
      resource: 'task',
      resourceId: taskId,
      source: 'USER',
      severity: 'INFO',
    },
  })

  return NextResponse.json({ success: true })
})
