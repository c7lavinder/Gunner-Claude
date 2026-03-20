// app/(tenant)/[tenant]/tasks/page.tsx
// Tasks page — fetches from GHL tasks API, enriches with contact data
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { TasksClient } from '@/components/tasks/tasks-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function TasksPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const userId = session.userId
  const tenantId = session.tenantId
  const role = session.role as UserRole
  const canViewTeam = hasPermission(role, 'tasks.view.team')

  // Get role config for categories
  const roleConfig = await db.roleConfig.findUnique({
    where: { tenantId_role: { tenantId, role } },
    select: { taskCategories: true },
  })
  const categories = (roleConfig?.taskCategories as string[]) ?? ['Follow-up', 'Call', 'Research', 'Admin']

  // Fetch tasks from GHL
  let ghlTasks: Array<{
    id: string; title: string; description: string | null
    category: string | null; status: string; priority: string
    dueAt: string | null; completedAt: string | null; ghlTaskId: string | null
    assignedTo: { id: string; name: string } | null
    property: { id: string; address: string; city: string } | null
    contactName: string | null; contactPhone: string | null; contactAddress: string | null
  }> = []

  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)
    const result = await ghl.searchTasks('incompleted')
    const tasks = result.tasks ?? []

    // Collect unique contactIds for bulk enrichment
    const contactIds = [...new Set(tasks.map(t => t.contactId).filter(Boolean))]

    // Fetch contact details (batch, max 20 to avoid rate limits)
    const contactMap = new Map<string, { name: string; phone: string; address: string }>()
    const batchIds = contactIds.slice(0, 20)
    const contactResults = await Promise.allSettled(
      batchIds.map(id => ghl.getContact(id))
    )
    contactResults.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        const c = result.value
        contactMap.set(batchIds[i], {
          name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email || 'Unknown',
          phone: c.phone ?? '',
          address: c.address1 ?? '',
        })
      }
    })

    ghlTasks = tasks.map(t => {
      const contact = contactMap.get(t.contactId)
      return {
        id: t.id,
        title: t.title || 'Untitled task',
        description: t.body ?? null,
        category: null, // GHL tasks don't have categories
        status: t.completed ? 'COMPLETED' : 'PENDING',
        priority: 'MEDIUM', // GHL doesn't have priority — default to medium
        dueAt: t.dueDate ?? null,
        completedAt: null,
        ghlTaskId: t.id,
        assignedTo: null, // Could be matched via t.assignedTo if GHL userId mapping exists
        property: contact?.address ? { id: '', address: contact.address, city: '' } : null,
        contactName: contact?.name ?? null,
        contactPhone: contact?.phone ?? null,
        contactAddress: contact?.address ?? null,
      }
    })
  } catch (err) {
    console.error('[Tasks] GHL fetch failed:', err instanceof Error ? err.message : err)
    fetchError = true
  }

  // Also fetch any locally-created tasks from our DB
  const localTasks = await db.task.findMany({
    where: {
      tenantId,
      ...(canViewTeam ? {} : { assignedToId: userId }),
      status: { in: ['PENDING', 'IN_PROGRESS'] },
    },
    orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
    include: {
      assignedTo: { select: { id: true, name: true } },
      property: { select: { id: true, address: true, city: true } },
    },
  })

  // Merge: local tasks first (have priority/category), then GHL tasks not already in DB
  const localGhlIds = new Set(localTasks.map(t => t.ghlTaskId).filter(Boolean))
  const deduplicatedGhlTasks = ghlTasks.filter(t => !localGhlIds.has(t.ghlTaskId))

  const allTasks = [
    ...localTasks.map(t => ({
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
    })),
    ...deduplicatedGhlTasks,
  ]

  return (
    <TasksClient
      tasks={allTasks}
      categories={categories}
      tenantSlug={params.tenant}
      canCreateForOthers={canViewTeam}
      fetchError={fetchError}
    />
  )
}
