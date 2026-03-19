import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/inventory/[propertyId]/page.tsx


import { db } from '@/lib/db/client'
import { redirect, notFound } from 'next/navigation'
import { PropertyDetailClient } from '@/components/inventory/property-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function PropertyDetailPage({
  params,
}: {
  params: { tenant: string; propertyId: string }
}) {
  const session = await requireSession()
  

  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/dashboard`)

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId },
    include: {
      sellers: {
        include: { seller: true },
        orderBy: { isPrimary: 'desc' },
      },
      assignedTo: { select: { id: true, name: true, role: true } },
      calls: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, score: true, gradingStatus: true, direction: true,
          callType: true, durationSeconds: true, calledAt: true, aiSummary: true,
          assignedTo: { select: { name: true } },
        },
      },
      tasks: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
        take: 10,
      },
    },
  })

  if (!property) notFound()

  return (
    <PropertyDetailClient
      property={{
        id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        status: property.status,
        arv: property.arv?.toString() ?? null,
        askingPrice: property.askingPrice?.toString() ?? null,
        mao: property.mao?.toString() ?? null,
        contractPrice: property.contractPrice?.toString() ?? null,
        assignmentFee: property.assignmentFee?.toString() ?? null,
        ghlContactId: property.ghlContactId,
        createdAt: property.createdAt.toISOString(),
        sellers: property.sellers.map((ps) => ({
          id: ps.seller.id,
          name: ps.seller.name,
          phone: ps.seller.phone,
          email: ps.seller.email,
          isPrimary: ps.isPrimary,
        })),
        assignedTo: property.assignedTo,
        calls: property.calls.map((c) => ({
          id: c.id,
          score: c.score,
          gradingStatus: c.gradingStatus,
          direction: c.direction,
          callType: c.callType,
          durationSeconds: c.durationSeconds,
          calledAt: c.calledAt?.toISOString() ?? null,
          aiSummary: c.aiSummary,
          assignedToName: c.assignedTo?.name ?? null,
        })),
        tasks: property.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          priority: t.priority,
          status: t.status,
          dueAt: t.dueAt?.toISOString() ?? null,
        })),
      }}
      tenantSlug={params.tenant}
      canEdit={hasPermission(role, 'properties.edit')}
      canManage={hasPermission(role, 'inventory.manage')}
      ghlContactId={property.ghlContactId}
    />
  )
}
