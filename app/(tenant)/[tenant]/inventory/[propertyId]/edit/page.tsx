// app/(tenant)/[tenant]/inventory/[propertyId]/edit/page.tsx
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect, notFound } from 'next/navigation'
import { hasPermission } from '@/types/roles'
import { PropertyForm } from '@/components/inventory/property-form'

export default async function PropertyEditPage({
  params,
}: {
  params: { tenant: string; propertyId: string }
}) {
  const session = await requireSession()

  if (!hasPermission(session.role, 'properties.edit')) {
    redirect(`/${params.tenant}/inventory/${params.propertyId}`)
  }

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    include: {
      sellers: {
        include: { seller: true },
        where: { isPrimary: true },
        take: 1,
      },
    },
  })

  if (!property) notFound()

  // Get all team members for assignment dropdown
  const teamMembers = await db.user.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { config: true },
  })

  return (
    <PropertyForm
      mode="edit"
      tenantSlug={params.tenant}
      teamMembers={teamMembers}
      initialData={{
        id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        status: property.status,
        arv: property.arv?.toString() ?? '',
        askingPrice: property.askingPrice?.toString() ?? '',
        mao: property.mao?.toString() ?? '',
        contractPrice: property.contractPrice?.toString() ?? '',
        assignmentFee: property.assignmentFee?.toString() ?? '',
        assignedToId: property.assignedToId ?? '',
        sellerName: property.sellers[0]?.seller.name ?? '',
        sellerPhone: property.sellers[0]?.seller.phone ?? '',
        sellerEmail: property.sellers[0]?.seller.email ?? '',
      }}
    />
  )
}
