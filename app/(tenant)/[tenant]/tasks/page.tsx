import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/tasks/page.tsx


import { db } from '@/lib/db/client'
import { TasksClient } from '@/components/tasks/tasks-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function TasksPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  const userId = session.userId
  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  const canViewTeam = hasPermission(role, 'tasks.view.team')

  const tasks = await db.task.findMany({
    where: {
      tenantId,
      ...(canViewTeam ? {} : { assignedToId: userId }),
      status: { in: ['PENDING', 'IN_PROGRESS'] },
    },
    orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    include: {
      assignedTo: { select: { id: true, name: true } },
      property: { select: { id: true, address: true, city: true } },
    },
  })

  // Get task categories from role config
  const roleConfig = await db.roleConfig.findUnique({
    where: { tenantId_role: { tenantId, role } },
    select: { taskCategories: true },
  })

  const categories = (roleConfig?.taskCategories as string[]) ?? ['Follow-up', 'Call', 'Research', 'Admin']

  return (
    <TasksClient
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        ghlTaskId: t.ghlTaskId,
        assignedTo: t.assignedTo,
        property: t.property,
      }))}
      categories={categories}
      tenantSlug={params.tenant}
      canCreateForOthers={canViewTeam}
    />
  )
}
