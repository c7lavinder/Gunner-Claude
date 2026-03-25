// app/(tenant)/[tenant]/tasks/page.tsx
// Tasks page — full rewrite: fetches GHL tasks, classifies, scores, enriches
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import type { GHLTaskItem } from '@/lib/ghl/client'
import { Prisma } from '@prisma/client'
import { DayHubClient, type EnrichedTask } from './day-hub-client'
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

function scoreTask(category: TaskCategory, dueDate: string | null, amDone: boolean, pmDone: boolean): number {
  const scores = CATEGORY_SCORES[category]

  // Uncalled contacts get a major boost — they need attention first
  const callBoost = (!amDone && !pmDone) ? 200 : (!amDone || !pmDone) ? 100 : 0

  if (!dueDate) return scores.future + callBoost

  const due = new Date(dueDate)
  const todayStart = startOfDay(new Date())

  if (isToday(due)) return scores.dueToday + callBoost

  if (isPast(due)) {
    const daysOverdue = differenceInDays(todayStart, startOfDay(due))
    // More overdue = higher priority (boost by 10 per day, cap at 200)
    const urgency = Math.min(daysOverdue * 10, 200)
    return scores.overdue + urgency + callBoost
  }

  // Future: subtract 10 per day until due
  const daysUntilDue = differenceInDays(startOfDay(due), todayStart)
  return Math.max(scores.future - (daysUntilDue * 10), 0) + callBoost
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

    // Cross-reference contactIds → property addresses from inventory
    // GHL contacts often lack address fields; our Property table is the source of truth
    const properties = contactIds.length > 0
      ? await db.property.findMany({
          where: { tenantId, ghlContactId: { in: contactIds } },
          select: { ghlContactId: true, address: true, city: true, state: true },
        })
      : []
    const propertyMap = new Map<string, string>()
    for (const p of properties) {
      if (p.ghlContactId) {
        const addr = [p.address, p.city, p.state].filter(Boolean).join(', ')
        if (addr) propertyMap.set(p.ghlContactId, addr)
      }
    }

    // AM/PM call tracking via ghlContactId + Central timezone
    // Use Central time for "today" boundaries so AM/PM pills align with user's actual day
    const contactIdList = [...new Set(tasks.map(t => t.contactId).filter(Boolean))]
    const amPmMap = new Map<string, { am: boolean; pm: boolean }>()

    if (contactIdList.length > 0) {
      type AmPmRow = { ghl_contact_id: string; is_am: boolean }
      // called_at is stored as timestamp WITHOUT timezone (Prisma DateTime default)
      // so we must first cast to UTC, then convert to Central for correct hour extraction
      const callRows = await db.$queryRaw<AmPmRow[]>`
        SELECT
          ghl_contact_id,
          EXTRACT(HOUR FROM (called_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')) < 12 AS is_am
        FROM calls
        WHERE
          tenant_id = ${tenantId}
          AND direction = 'OUTBOUND'
          AND ghl_contact_id = ANY(ARRAY[${Prisma.join(contactIdList)}])
          AND (called_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
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
      const callStatus = amPmMap.get(t.contactId) ?? { am: false, pm: false }
      const score = scoreTask(category, t.dueDate, callStatus.am, callStatus.pm)
      const dueDate = t.dueDate ? new Date(t.dueDate) : null
      const taskIsOverdue = dueDate ? isPast(dueDate) && !isToday(dueDate) : false
      const taskIsDueToday = dueDate ? isToday(dueDate) : false

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
        contactAddress: propertyMap.get(t.contactId) || contact?.address || null,
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
    <DayHubClient
      tasks={enrichedTasks}
      isAdmin={isAdmin}
      tenantSlug={params.tenant}
      fetchError={fetchError}
    />
  )
}
