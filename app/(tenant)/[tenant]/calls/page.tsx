import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/calls/page.tsx


import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { CallsClient } from '@/components/calls/calls-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function CallsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  const userId = session.userId
  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  const canViewAll = hasPermission(role, 'calls.view.all')
  const canViewTeam = hasPermission(role, 'calls.view.team')

  // Build where clause based on permissions
  const whereClause = canViewAll
    ? { tenantId }
    : canViewTeam
    ? {
        tenantId,
        assignedTo: {
          OR: [
            { id: userId },
            { reportsTo: userId }, // direct reports
          ],
        },
      }
    : { tenantId, assignedToId: userId }

  const calls = await db.call.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      property: { select: { id: true, address: true, city: true, state: true } },
    },
  })

  return (
    <CallsClient
      calls={calls.map((c) => ({
        id: c.id,
        score: c.score,
        gradingStatus: c.gradingStatus,
        callType: c.callType,
        direction: c.direction,
        durationSeconds: c.durationSeconds,
        calledAt: c.calledAt?.toISOString() ?? c.createdAt.toISOString(),
        aiSummary: c.aiSummary,
        aiFeedback: c.aiFeedback,
        assignedTo: c.assignedTo ? { id: c.assignedTo.id, name: c.assignedTo.name, role: c.assignedTo.role } : null,
        property: c.property ? { id: c.property.id, address: c.property.address, city: c.property.city, state: c.property.state } : null,
      }))}
      tenantSlug={params.tenant}
      canViewAll={canViewAll}
    />
  )
}
