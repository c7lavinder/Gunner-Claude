// GET/POST /api/[tenant]/dayhub/tasks
// GET: Returns tasks from DB sorted by overdue → today → upcoming
// POST: Completes a GHL task
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { startOfDay, endOfDay, addDays, differenceInDays } from 'date-fns'

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const url = new URL(req.url)
    const category = url.searchParams.get('category') ?? ''
    const assignedTo = url.searchParams.get('assignedTo') ?? ''
    const limit = parseInt(url.searchParams.get('limit') ?? '50')
    const offset = parseInt(url.searchParams.get('offset') ?? '0')

    const today = new Date()
    const dayStart = startOfDay(today)
    const dayEnd = endOfDay(today)

    const where: Record<string, unknown> = {
      tenantId,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
    }

    if (category) where.category = category
    if (assignedTo) where.assignedToId = assignedTo

    const [tasks, totalCount, overdueCount] = await Promise.all([
      db.task.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }],
        take: limit,
        skip: offset,
        include: {
          assignedTo: { select: { id: true, name: true, role: true } },
          property: {
            select: {
              id: true, address: true, city: true, state: true, zip: true,
              sellers: { include: { seller: { select: { name: true } } }, take: 1 },
            },
          },
        },
      }),
      db.task.count({ where }),
      db.task.count({
        where: { ...where, dueAt: { lt: dayStart } },
      }),
    ])

    const mapped = tasks.map(t => {
      const dueAt = t.dueAt ? new Date(t.dueAt) : null
      const daysOverdue = dueAt && dueAt < dayStart ? differenceInDays(dayStart, dueAt) : 0
      const isDueToday = dueAt ? dueAt >= dayStart && dueAt <= dayEnd : false
      const isUpcoming = dueAt ? dueAt > dayEnd : false

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt?.toISOString() ?? null,
        daysOverdue,
        isDueToday,
        isUpcoming,
        contactName: t.property?.sellers[0]?.seller.name ?? null,
        address: t.property
          ? `${t.property.address}, ${t.property.city}, ${t.property.state} ${t.property.zip}`
          : null,
        propertyId: t.property?.id ?? null,
        assignedTo: t.assignedTo ? { id: t.assignedTo.id, name: t.assignedTo.name, role: t.assignedTo.role } : null,
      }
    })

    return NextResponse.json({
      tasks: mapped,
      total: totalCount,
      overdue: overdueCount,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch tasks'
    return NextResponse.json({ tasks: [], total: 0, overdue: 0, error: message }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const body = await req.json()
    const { action, taskId, contactId } = body

    if (action === 'complete' && taskId && contactId) {
      const ghl = await getGHLClient(tenantId)
      await ghl.completeTask(contactId, taskId)

      await db.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: 'task.completed_ghl',
          source: 'USER',
          severity: 'INFO',
          payload: { taskId, contactId },
        },
      })

      return NextResponse.json({ status: 'success' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete task'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
