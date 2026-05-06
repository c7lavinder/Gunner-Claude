// app/(tenant)/[tenant]/inventory/log-jv-deal/page.tsx
//
// Phase 5 of GHL multi-pipeline redesign — JV intake form.
// See docs/plans/ghl-multi-pipeline-bulletproof.md §10.

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/types/roles'
import { LogJvDealForm } from '@/components/inventory/log-jv-deal-form'

export default async function LogJvDealPage({
  params,
}: {
  params: { tenant: string }
}) {
  const session = await requireSession()

  if (!hasPermission(session.role, 'properties.create')) {
    redirect(`/${params.tenant}/inventory`)
  }

  const [partners, teamMembers] = await Promise.all([
    db.partner.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, types: true, company: true },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <LogJvDealForm
      tenantSlug={params.tenant}
      partners={partners.map(p => ({
        id: p.id,
        name: p.name,
        types: Array.isArray(p.types) ? p.types as string[] : [],
        company: p.company,
      }))}
      teamMembers={teamMembers}
      defaultAssignedToId={session.userId}
    />
  )
}
