// app/(tenant)/[tenant]/calls/page.tsx
// Calls list — fetches all calls with enriched data for the full calls UI
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { CallsClient } from '@/components/calls/calls-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function CallsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const userId = session.userId
  const tenantId = session.tenantId
  const role = session.role as UserRole

  const canViewAll = hasPermission(role, 'calls.view.all')
  const canViewTeam = hasPermission(role, 'calls.view.team')

  const whereClause = canViewAll
    ? { tenantId }
    : canViewTeam
    ? { tenantId, assignedTo: { OR: [{ id: userId }, { reportsTo: userId }] } }
    : { tenantId, assignedToId: userId }

  const calls = await db.call.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      property: {
        select: {
          id: true, address: true, city: true, state: true,
          sellers: { include: { seller: { select: { name: true } } }, take: 1 },
        },
      },
    },
  })

  // Build team members list for filter dropdown
  const teamMembers = canViewAll
    ? await db.user.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []

  // Resolve contact names from GHL for calls without property-linked names
  const contactNameMap = new Map<string, string>()
  const contactIdsToResolve = [
    ...new Set(
      calls
        .filter(c => c.ghlContactId && !c.property?.sellers[0]?.seller.name)
        .map(c => c.ghlContactId!)
    ),
  ].slice(0, 30) // cap at 30 to avoid rate limits

  if (contactIdsToResolve.length > 0) {
    try {
      const ghl = await getGHLClient(tenantId)
      const results = await Promise.allSettled(
        contactIdsToResolve.map(id => ghl.getContact(id))
      )
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value) {
          const c = res.value
          const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email || null
          if (name) contactNameMap.set(contactIdsToResolve[i], name)
        }
      })
    } catch {
      // GHL not connected or rate limited — continue without names
    }
  }

  return (
    <CallsClient
      calls={calls.map((c) => ({
        id: c.id,
        score: c.score,
        gradingStatus: c.gradingStatus,
        callType: c.callType,
        callOutcome: c.callOutcome,
        callResult: c.callResult,
        direction: c.direction,
        durationSeconds: c.durationSeconds,
        calledAt: c.calledAt?.toISOString() ?? c.createdAt.toISOString(),
        recordingUrl: c.recordingUrl,
        aiSummary: c.aiSummary,
        aiFeedback: c.aiFeedback,
        contactName: c.property?.sellers[0]?.seller.name
          ?? (c.ghlContactId ? contactNameMap.get(c.ghlContactId) ?? null : null),
        assignedTo: c.assignedTo ? { id: c.assignedTo.id, name: c.assignedTo.name, role: c.assignedTo.role } : null,
        property: c.property ? { id: c.property.id, address: c.property.address, city: c.property.city, state: c.property.state } : null,
      }))}
      tenantSlug={params.tenant}
      canViewAll={canViewAll}
      teamMembers={teamMembers}
    />
  )
}
