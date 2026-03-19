import { getSession, unauthorizedResponse } from '@/lib/auth/session'
// app/api/tasks/[taskId]/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'


import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const tenantId = session.tenantId
  const { taskId } = params

  const task = await db.task.findUnique({
    where: { id: taskId, tenantId },
    select: { id: true, ghlTaskId: true, property: { select: { ghlContactId: true } } },
  })

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  await db.task.update({
    where: { id: taskId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  // Sync completion to GHL
  if (task.ghlTaskId && task.property?.ghlContactId) {
    try {
      const ghl = await getGHLClient(tenantId)
      await ghl.completeTask(task.property.ghlContactId, task.ghlTaskId)
    } catch (err) {
      console.warn('[Tasks] GHL complete sync failed:', err)
    }
  }

  await db.auditLog.create({
    data: {
      tenantId,
      userId: session.userId,
      action: 'task.completed',
      resource: 'task',
      resourceId: taskId,
      source: 'USER',
      severity: 'INFO',
    },
  })

  return NextResponse.json({ success: true })
}
