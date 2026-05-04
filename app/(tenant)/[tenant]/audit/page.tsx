// app/(tenant)/[tenant]/audit/page.tsx
// Audit page — system event monitor for owner/admin only

import { requireSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { isRoleAtLeast } from '@/types/roles'
import { AuditClient } from '@/components/audit/audit-client'

interface AuditPageProps {
  params: { tenant: string }
}

export default async function AuditPage({ params }: AuditPageProps) {
  const session = await requireSession()

  if (!isRoleAtLeast(session.role, 'ADMIN')) {
    redirect(`/${params.tenant}/day-hub`)
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { name: true },
  })

  return <AuditClient tenantSlug={params.tenant} tenantName={tenant?.name ?? 'Tenant'} />
}
