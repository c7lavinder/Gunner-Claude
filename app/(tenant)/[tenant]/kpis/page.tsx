import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/kpis/page.tsx — KPI Dashboard (server component)

import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { getMarketsForZip } from '@/lib/config/crm.config'
import { KpiDashboard } from './KpiDashboard'

export default async function KpisPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'kpis.view.own')) redirect(`/${params.tenant}/dashboard`)

  // Fetch ALL properties for client-side aggregation
  const properties = await db.property.findMany({
    where: { tenantId },
    select: {
      id: true,
      status: true,
      leadSource: true,
      zip: true,
      projectType: true,
      assignmentFee: true,
      finalProfit: true,
      createdAt: true,
    },
  })

  return (
    <KpiDashboard
      tenantSlug={params.tenant}
      properties={properties.map(p => {
        // Derive market from zip code — source of truth
        const zipMarkets = getMarketsForZip(p.zip)
        const market = zipMarkets.length > 0 ? zipMarkets[0] : 'Global'
        return {
          id: p.id,
          status: p.status,
          leadSource: p.leadSource,
          zip: p.zip,
          market,
          projectType: (Array.isArray(p.projectType) ? p.projectType : []) as string[],
          assignmentFee: p.assignmentFee ? Number(p.assignmentFee) : null,
          finalProfit: p.finalProfit ? Number(p.finalProfit) : null,
          createdAt: p.createdAt.toISOString(),
        }
      })}
    />
  )
}
