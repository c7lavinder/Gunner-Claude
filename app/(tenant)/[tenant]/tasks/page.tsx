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
import { isPast, isToday } from 'date-fns'
import { scoreTask as computeScore, getOverdueTier, type OverdueTier } from '@/lib/tasks/scoring'

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

// ─── Page component ────────────────────────────────────────────────────────

export default async function TasksPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const userId = session.userId
  const tenantId = session.tenantId
  const role = session.role as UserRole
  const isAdmin = hasPermission(role, 'tasks.view.team')

  // Get user's GHL mapping + team members with roles for role tab filtering
  const [currentUser, teamMembers] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { ghlUserId: true },
    }),
    db.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, role: true, ghlUserId: true },
      orderBy: { name: 'asc' },
    }),
  ])

  let enrichedTasks: EnrichedTask[] = []
  let completedTodayTasks: EnrichedTask[] = []
  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)

    // Fetch incomplete + completed tasks from GHL in parallel
    const [incompleteResult, completedResult] = await Promise.all([
      ghl.searchTasks('incompleted'),
      ghl.searchTasks('completed'),
    ])
    let tasks: GHLTaskItem[] = incompleteResult.tasks ?? []
    const completedTasks: GHLTaskItem[] = completedResult.tasks ?? []

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
    // Try 3 sources: 1) property.ghlContactId match, 2) seller.ghlContactId match, 3) GHL contact address
    const propertyMap = new Map<string, string>()
    if (contactIds.length > 0) {
      // Source 1: Direct property → contact link
      const directProps = await db.property.findMany({
        where: { tenantId, ghlContactId: { in: contactIds } },
        select: { ghlContactId: true, address: true, city: true, state: true },
      })
      for (const p of directProps) {
        if (p.ghlContactId) {
          const addr = [p.address, p.city, p.state].filter(Boolean).join(', ')
          if (addr) propertyMap.set(p.ghlContactId, addr)
        }
      }

      // Source 2: Seller → property link (sellers have ghlContactId from GHL contact)
      const unmatchedIds = contactIds.filter(id => !propertyMap.has(id))
      if (unmatchedIds.length > 0) {
        const sellerProps = await db.seller.findMany({
          where: { tenantId, ghlContactId: { in: unmatchedIds } },
          select: {
            ghlContactId: true,
            properties: {
              select: { property: { select: { address: true, city: true, state: true } } },
              take: 1,
            },
          },
        })
        for (const s of sellerProps) {
          if (s.ghlContactId && s.properties[0]?.property) {
            const p = s.properties[0].property
            const addr = [p.address, p.city, p.state].filter(Boolean).join(', ')
            if (addr) propertyMap.set(s.ghlContactId, addr)
          }
        }
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
      const resolvedContactName = inlineName || (contact?.name ?? null)
      const resolvedAddress = propertyMap.get(t.contactId) || contact?.address || null
      // Fallback: if no contact name AND no address, use the task title as display name
      const contactName = resolvedContactName
        || (!resolvedAddress ? (t.title || null) : null)

      // Prefer inline assignedToUserDetails, fall back to user map
      const inlineAssigned = t.assignedToUserDetails
        ? `${t.assignedToUserDetails.firstName ?? ''} ${t.assignedToUserDetails.lastName ?? ''}`.trim()
        : null
      const assignedUserId = t.assignedTo ?? null
      const assignedToName = inlineAssigned || (assignedUserId ? ghlUserMap.get(assignedUserId) ?? null : null)

      const category = classifyTask(t.title || '', t.body || '')
      const callStatus = amPmMap.get(t.contactId) ?? { am: false, pm: false }
      const dueDate = t.dueDate ? new Date(t.dueDate) : null
      const taskIsOverdue = dueDate ? isPast(dueDate) && !isToday(dueDate) : false
      const taskIsDueToday = dueDate ? isToday(dueDate) : false
      const score = computeScore({
        id: t.id || t._id || '',
        category,
        dueAt: t.dueDate ?? null,
        createdAt: t.dueDate ?? new Date().toISOString(),
      })
      const overdueTier = getOverdueTier(t.dueDate ?? null)

      return {
        id: t.id || t._id || '',
        title: t.title || 'Untitled task',
        body: t.body ?? null,
        category,
        score,
        overdueTier,
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

    // Enrich today's completed tasks (filter to today in Central time)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const todayCompleted = completedTasks.filter(t => {
      if (!t.dueDate) return false
      const taskDate = new Date(t.dueDate).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      return taskDate === todayStr
    })

    // Filter completed by user permissions
    let filteredCompleted = todayCompleted
    if (!isAdmin && currentUser?.ghlUserId) {
      filteredCompleted = filteredCompleted.filter(t => t.assignedTo === currentUser.ghlUserId)
    }

    completedTodayTasks = filteredCompleted.slice(0, 30).map(t => {
      const contact = contactMap.get(t.contactId)
      const inlineName = t.contactDetails
        ? `${t.contactDetails.firstName ?? ''} ${t.contactDetails.lastName ?? ''}`.trim()
        : null
      const contactName = inlineName || contact?.name || null
      const inlineAssigned = t.assignedToUserDetails
        ? `${t.assignedToUserDetails.firstName ?? ''} ${t.assignedToUserDetails.lastName ?? ''}`.trim()
        : null
      const assignedToName = inlineAssigned || (t.assignedTo ? ghlUserMap.get(t.assignedTo) ?? null : null)
      const category = classifyTask(t.title || '', t.body || '')

      return {
        id: t.id || t._id || '',
        title: t.title || 'Untitled task',
        body: t.body ?? null,
        category,
        score: 0,
        overdueTier: 'green' as OverdueTier,
        dueDate: t.dueDate ?? null,
        isOverdue: false,
        isDueToday: false,
        contactId: t.contactId,
        contactName,
        contactPhone: contact?.phone ?? null,
        contactAddress: propertyMap.get(t.contactId) || contact?.address || null,
        assignedToName,
        amDone: false,
        pmDone: false,
      }
    })
  } catch (err) {
    console.error('[Tasks] GHL fetch failed:', err instanceof Error ? err.message : err)
    fetchError = true
  }

  return (
    <DayHubClient
      tasks={enrichedTasks}
      completedTasks={completedTodayTasks}
      isAdmin={isAdmin}
      tenantSlug={params.tenant}
      fetchError={fetchError}
      teamRoster={teamMembers.map(m => ({ id: m.id, name: m.name, role: m.role, ghlUserId: m.ghlUserId }))}
    />
  )
}
