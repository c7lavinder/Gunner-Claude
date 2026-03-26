import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/inventory/page.tsx


import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { InventoryClient } from '@/components/inventory/inventory-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function InventoryPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  const userId = session.userId
  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  if (!hasPermission(role, 'inventory.view')) redirect(`/${params.tenant}/dashboard`)

  const canViewAll = hasPermission(role, 'properties.view.all')

  const properties = await db.property.findMany({
    where: {
      tenantId,
      ...(!canViewAll ? { assignedToId: userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      sellers: {
        include: { seller: { select: { id: true, name: true, phone: true, email: true, ghlContactId: true } } },
        orderBy: { isPrimary: 'desc' },
      },
      assignedTo: { select: { id: true, name: true } },
      market: { select: { name: true } },
      _count: { select: { calls: true, tasks: true } },
    },
  })

  // Status counts for filter chips
  const statusCounts = properties.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {})

  // Get GHL location ID for CRM links
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ghlLocationId: true },
  })

  return (
    <InventoryClient
      properties={properties.map((p) => ({
        id: p.id,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        status: p.status,
        arv: p.arv?.toString() ?? null,
        askingPrice: p.askingPrice?.toString() ?? null,
        mao: p.mao?.toString() ?? null,
        contractPrice: p.contractPrice?.toString() ?? null,
        assignmentFee: p.assignmentFee?.toString() ?? null,
        currentOffer: p.currentOffer?.toString() ?? null,
        highestOffer: p.highestOffer?.toString() ?? null,
        acceptedPrice: p.acceptedPrice?.toString() ?? null,
        finalProfit: p.finalProfit?.toString() ?? null,
        fieldSources: (p.fieldSources ?? {}) as Record<string, string>,
        createdAt: p.createdAt.toISOString(),
        sellerName: p.sellers[0]?.seller.name ?? null,
        sellerPhone: p.sellers[0]?.seller.phone ?? null,
        sellers: p.sellers.map((ps) => ({
          id: ps.seller.id,
          name: ps.seller.name,
          phone: ps.seller.phone,
          email: ps.seller.email,
          isPrimary: ps.isPrimary,
          role: ps.role,
          ghlContactId: ps.seller.ghlContactId,
        })),
        assignedTo: p.assignedTo,
        callCount: p._count.calls,
        taskCount: p._count.tasks,
        ghlContactId: p.ghlContactId,
        leadSource: p.leadSource,
        ghlStageName: p.ghlPipelineStage,
        market: p.market?.name ?? null,
        lastOfferDate: p.lastOfferDate?.toISOString() ?? null,
        lastContactedDate: p.lastContactedDate?.toISOString() ?? null,
      }))}
      statusCounts={statusCounts}
      tenantSlug={params.tenant}
      canManage={hasPermission(role, 'inventory.manage')}
      ghlLocationId={tenant?.ghlLocationId ?? undefined}
    />
  )
}
