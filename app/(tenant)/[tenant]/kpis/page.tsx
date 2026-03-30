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

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { config: true },
  })
  const tenantConfig = (tenant?.config ?? {}) as Record<string, unknown>

  // Fetch ALL properties + milestones for client-side aggregation
  const [properties, milestones] = await Promise.all([
    db.property.findMany({
      where: { tenantId },
      select: {
        id: true, address: true, city: true, state: true,
        status: true, leadSource: true, zip: true,
        projectType: true, assignmentFee: true, finalProfit: true,
        createdAt: true,
      },
    }),
    db.propertyMilestone.findMany({
      where: { tenantId },
      select: { propertyId: true, type: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return (
    <KpiDashboard
      tenantSlug={params.tenant}
      properties={properties.map(p => {
        // Derive market from zip code — source of truth
        const zipMarkets = getMarketsForZip(p.zip)
        const market = zipMarkets.length > 0 ? zipMarkets[0] : 'Global'
        return {
          id: p.id, address: p.address, city: p.city, state: p.state,
          status: p.status, leadSource: p.leadSource, zip: p.zip, market,
          projectType: (Array.isArray(p.projectType) ? p.projectType : []) as string[],
          assignmentFee: p.assignmentFee ? Number(p.assignmentFee) : null,
          finalProfit: p.finalProfit ? Number(p.finalProfit) : null,
          createdAt: p.createdAt.toISOString(),
        }
      })}
      milestones={milestones.map(m => ({
        propertyId: m.propertyId,
        type: m.type,
        date: m.createdAt.toISOString(),
      }))}
      initialConfig={{
        sourceTypes: (tenantConfig.sourceTypes ?? {}) as Record<string, string>,
        monthlySpend: (tenantConfig.monthlySpend ?? {}) as Record<string, Record<string, number>>,
        monthlyVolume: (tenantConfig.monthlyVolume ?? {}) as Record<string, Record<string, number>>,
      }}
    />
  )
}
