// app/(tenant)/[tenant]/inventory/new/page.tsx
import { requireSession } from '@/lib/auth/session'
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

  return <PropertyForm tenantSlug={params.tenant} />
}
