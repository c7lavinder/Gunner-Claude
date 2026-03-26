// app/(tenant)/[tenant]/inventory/new/page.tsx
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/types/roles'
import { PropertyForm } from '@/components/inventory/property-form'

export default async function NewPropertyPage({
  params,
}: {
  params: { tenant: string }
}) {
  const session = await requireSession()

  if (!hasPermission(session.role, 'properties.create')) {
    redirect(`/${params.tenant}/inventory`)
  }

  const teamMembers = await db.user.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  return (
    <PropertyForm
      mode="create"
      tenantSlug={params.tenant}
      teamMembers={teamMembers}
      initialData={{
        id: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        status: 'NEW_LEAD',
        arv: '',
        askingPrice: '',
        mao: '',
        contractPrice: '',
        assignmentFee: '',
        offerPrice: '',
        repairCost: '',
        wholesalePrice: '',
        assignedToId: session.userId,
        sellerName: '',
        sellerPhone: '',
        sellerEmail: '',
        beds: '',
        baths: '',
        sqft: '',
        yearBuilt: '',
        lotSize: '',
        propertyType: '',
        occupancy: '',
        description: '',
        internalNotes: '',
      }}
    />
  )
}
