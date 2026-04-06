// app/(tenant)/[tenant]/calls/page.tsx
// Calls list — uses cached contactName from DB, no live GHL lookups needed
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
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
    orderBy: { calledAt: 'desc' },
    take: 500,
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      property: {
        select: {
          id: true, address: true, city: true, state: true,
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
        contactName: c.contactName ?? null,
        contactAddress: c.contactAddress ?? null,
        assignedTo: c.assignedTo ? { id: c.assignedTo.id, name: c.assignedTo.name, role: c.assignedTo.role } : null,
        property: c.property ? { id: c.property.id, address: c.property.address, city: c.property.city, state: c.property.state } : null,
      }))}
      tenantSlug={params.tenant}
      canViewAll={canViewAll}
      teamMembers={teamMembers}
    />
  )
}
