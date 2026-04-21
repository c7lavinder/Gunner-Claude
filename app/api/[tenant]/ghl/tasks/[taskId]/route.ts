// PATCH /api/[tenant]/ghl/tasks/[taskId]
// Body: { contactId, title?, body?, dueDate?, assignedTo?, completed? }
// Updates task fields in GHL via PUT /contacts/{cid}/tasks/{tid}
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'
import type { GHLTaskInput } from '@/lib/ghl/client'

export async function PATCH(
  req: Request,
  { params }: { params: { tenant: string; taskId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { contactId, title, body: taskBody, dueDate, assignedTo, completed } = body
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    // Build patch object — only send fields that were actually supplied
    const patch: Partial<GHLTaskInput> = {}
    if (typeof title === 'string') patch.title = title
    if (typeof taskBody === 'string') patch.body = taskBody
    if (typeof dueDate === 'string') patch.dueDate = dueDate
    if (typeof assignedTo === 'string') patch.assignedTo = assignedTo
    if (typeof completed === 'boolean') patch.completed = completed

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    }

    const ghl = await getGHLClient(session.tenantId)
    const result = await ghl.updateTask(contactId, params.taskId, patch)

    await db.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'ghl.task_updated',
        resource: 'task',
        resourceId: params.taskId,
        source: 'USER',
        severity: 'INFO',
        payload: { contactId, taskId: params.taskId, fields: Object.keys(patch) },
      },
    })

    return NextResponse.json({ status: 'success', task: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update task'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
