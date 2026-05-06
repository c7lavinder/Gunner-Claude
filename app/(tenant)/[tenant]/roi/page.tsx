// app/(tenant)/[tenant]/roi/page.tsx
// Lead Source ROI — cost tracking + ROI per channel
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { RoiClient } from './roi-client'

export default async function RoiPage({ params, searchParams }: { params: { tenant: string }; searchParams: { month?: string; year?: string } }) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const now = new Date()
  const currentMonth = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1
  const currentYear = searchParams.year ? parseInt(searchParams.year) : now.getFullYear()

  const [costs, propertiesBySource, soldBySource] = await Promise.all([
    db.leadSourceCost.findMany({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
    db.property.groupBy({
      by: ['leadSource'],
      where: { tenantId, leadSource: { not: null } },
      _count: { _all: true },
    }),
    db.property.groupBy({
      by: ['leadSource'],
      where: {
        tenantId,
        leadSource: { not: null },
        OR: [{ acqStatus: 'CLOSED' }, { dispoStatus: 'CLOSED' }],
      },
      _count: { _all: true },
    }),
  ])

  const sources = new Set<string>()
  costs.forEach(c => sources.add(c.source))
  propertiesBySource.forEach(p => { if (p.leadSource) sources.add(p.leadSource) })

  const summary = Array.from(sources).map(source => {
    const monthlyCosts = costs.filter(c => c.source === source)
    const totalSpend = monthlyCosts.reduce((sum, c) => sum + Number(c.cost), 0)
    const currentCost = monthlyCosts.find(c => c.month === currentMonth && c.year === currentYear)
    const leads = propertiesBySource.find(p => p.leadSource === source)?._count._all ?? 0
    const deals = soldBySource.find(p => p.leadSource === source)?._count._all ?? 0

    return {
      source,
      totalSpend,
      currentMonthCost: currentCost ? Number(currentCost.cost) : 0,
      leads,
      deals,
      costPerLead: leads > 0 ? Math.round(totalSpend / leads) : 0,
    }
  }).sort((a, b) => b.leads - a.leads)

  return <RoiClient tenantSlug={params.tenant} sources={summary} currentMonth={currentMonth} currentYear={currentYear} />
}
