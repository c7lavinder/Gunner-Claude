// app/(tenant)/[tenant]/tasks/page.tsx
// Tasks page — full rewrite: fetches GHL tasks, classifies, scores, enriches
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import type { GHLTaskItem } from '@/lib/ghl/client'
import { Prisma } from '@prisma/client'
import { TasksClient, type EnrichedTask } from '@/components/tasks/tasks-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { startOfDay, differenceInDays, isPast, isToday } from 'date-fns'

// ─── Category classification ───────────────────────────────────────────────

type TaskCategory = 'New Lead' | 'Reschedule' | 'Admin' | 'Follow-Up'

const CATEGORY_KEYWORDS: Array<{ category: TaskCategory; keywords: string[] }> = [
  { category: 'New Lead', keywords: ['new lead', 'speed to lead', 'first call', 'fresh lead'] },
  { category: 'Reschedule', keywords: ['reschedule', 'no show', 'confirm meeting'] },
  { category: 'Admin', keywords: ['admin', 'action required', 'update crm'] },
]

function classifyTask(title: string, body: string): TaskCategory {
  const text = `${title} ${body}`.toLowerCase()
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => text.includes(kw))) return category
  }
  return 'Follow-Up'
}

// ─── Priority scoring ──────────────────────────────────────────────────────

const CATEGORY_SCORES: Record<TaskCategory, { overdue: number; dueToday: number; future: number }> = {
  'New Lead':   { overdue: 1000, dueToday: 900, future: 300 },
  'Reschedule': { overdue: 800,  dueToday: 700, future: 250 },
  'Admin':      { overdue: 600,  dueToday: 500, future: 200 },
  'Follow-Up':  { overdue: 400,  dueToday: 300, future: 150 },
}

function scoreTask(category: TaskCategory, dueDate: string | null): number {
  const scores = CATEGORY_SCORES[category]
  if (!dueDate) return scores.future

  const due = new Date(dueDate)
  const todayStart = startOfDay(new Date())

  if (isToday(due)) return scores.dueToday

  if (isPast(due)) {
    const daysOverdue = differenceInDays(todayStart, startOfDay(due))
    const decay = Math.min(daysOverdue * 5, 50)
    return scores.overdue - decay
  }

  // Future: subtract 10 per day until due
  const daysUntilDue = differenceInDays(startOfDay(due), todayStart)
  return Math.max(scores.future - (daysUntilDue * 10), 0)
}

// ─── Page component ────────────────────────────────────────────────────────

export default async function TasksPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const userId = session.userId
  const tenantId = session.tenantId
  const role = session.role as UserRole
  const isAdmin = hasPermission(role, 'tasks.view.team')

  // Get user's GHL mapping for filtering
  const currentUser = await db.user.findUnique({
    where: { id: userId },
    select: { ghlUserId: true },
  })

  let enrichedTasks: EnrichedTask[] = []
  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)

    // Fetch tasks from GHL
    const result = await ghl.searchTasks('incompleted')
    let tasks: GHLTaskItem[] = result.tasks ?? []

    // Filter: non-admins only see their own tasks
    if (!isAdmin && currentUser?.ghlUserId) {
      tasks = tasks.filter(t => {
        const taskUserId = t.assignedTo
        return taskUserId === currentUser.ghlUserId
      })
    } else if (!isAdmin && !currentUser?.ghlUserId) {
      // User has no GHL mapping and isn't admin — show nothing from GHL
      tasks = []
    }

    // Collect unique contactIds for bulk enrichment (cap at 50)
    const contactIds = [...new Set(tasks.map(t => t.contactId).filter(Boolean))].slice(0, 50)

    // Bulk fetch contacts
    const contactMap = new Map<string, { name: string; phone: string; address: string }>()
    const contactResults = await Promise.allSettled(
      contactIds.map(id => ghl.getContact(id))
    )
    contactResults.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value) {
        const c = res.value
        contactMap.set(contactIds[i], {
          name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email || 'Unknown',
          phone: c.phone ?? '',
          address: [c.address1, c.city, c.state].filter(Boolean).join(', '),
        })
      }
    })

    // AM/PM call tracking via ghlContactId + Central timezone
    const contactIdList = [...new Set(tasks.map(t => t.contactId).filter(Boolean))]
    const amPmMap = new Map<string, { am: boolean; pm: boolean }>()

    if (contactIdList.length > 0) {
      const todayStartUTC = new Date()
      todayStartUTC.setUTCHours(0, 0, 0, 0)

      type AmPmRow = { ghl_contact_id: string; is_am: boolean }
      const callRows = await db.$queryRaw<AmPmRow[]>`
        SELECT
          ghl_contact_id,
          EXTRACT(HOUR FROM (called_at AT TIME ZONE 'America/Chicago')) < 12 AS is_am
        FROM calls
        WHERE
          tenant_id = ${tenantId}
          AND direction = 'OUTBOUND'
          AND ghl_contact_id = ANY(ARRAY[${Prisma.join(contactIdList)}])
          AND called_at >= ${todayStartUTC}
          AND called_at IS NOT NULL
      `

      for (const row of callRows) {
        if (!row.ghl_contact_id) continue
        const existing = amPmMap.get(row.ghl_contact_id) ?? { am: false, pm: false }
        if (row.is_am) existing.am = true
        else existing.pm = true
        amPmMap.set(row.ghl_contact_id, existing)
      }
    }

    // Resolve GHL user names for assignedTo
    let ghlUserMap = new Map<string, string>()
    try {
      const usersResult = await ghl.getLocationUsers()
      for (const u of usersResult.users ?? []) {
        const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
        if (name) ghlUserMap.set(u.id, name)
      }
    } catch {
      // GHL users endpoint may not be available — continue without names
    }

    // Build enriched tasks
    enrichedTasks = tasks.map(t => {
      // Prefer inline contactDetails from GHL response, fall back to bulk-fetched
      const inlineName = t.contactDetails
        ? `${t.contactDetails.firstName ?? ''} ${t.contactDetails.lastName ?? ''}`.trim()
        : null
      const contact = contactMap.get(t.contactId)
      const contactName = inlineName || (contact?.name ?? null)

      // Prefer inline assignedToUserDetails, fall back to user map
      const inlineAssigned = t.assignedToUserDetails
        ? `${t.assignedToUserDetails.firstName ?? ''} ${t.assignedToUserDetails.lastName ?? ''}`.trim()
        : null
      const assignedUserId = t.assignedTo ?? null
      const assignedToName = inlineAssigned || (assignedUserId ? ghlUserMap.get(assignedUserId) ?? null : null)

      const category = classifyTask(t.title || '', t.body || '')
      const score = scoreTask(category, t.dueDate)
      const dueDate = t.dueDate ? new Date(t.dueDate) : null
      const taskIsOverdue = dueDate ? isPast(dueDate) && !isToday(dueDate) : false
      const taskIsDueToday = dueDate ? isToday(dueDate) : false

      const callStatus = amPmMap.get(t.contactId) ?? { am: false, pm: false }

      return {
        id: t.id || t._id || '',
        title: t.title || 'Untitled task',
        body: t.body ?? null,
        category,
        score,
        dueDate: t.dueDate ?? null,
        isOverdue: taskIsOverdue,
        isDueToday: taskIsDueToday,
        contactId: t.contactId,
        contactName,
        contactPhone: contact?.phone ?? null,
        contactAddress: contact?.address ?? null,
        assignedToName,
        amDone: callStatus.am,
        pmDone: callStatus.pm,
      }
    })

    // Sort by score descending
    enrichedTasks.sort((a, b) => b.score - a.score)
  } catch (err) {
    console.error('[Tasks] GHL fetch failed:', err instanceof Error ? err.message : err)
    fetchError = true
  }

  return (
    <TasksClient
      tasks={enrichedTasks}
      isAdmin={isAdmin}
      tenantSlug={params.tenant}
      fetchError={fetchError}
    />
  )
}
