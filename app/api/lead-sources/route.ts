// app/api/lead-sources/route.ts
// Lead source cost tracking — GET costs with ROI, POST/PUT costs
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const upsertSchema = z.object({
  source: z.string().min(1),
  cost: z.number().min(0),
  month: z.number().min(1).max(12),
  year: z.number().min(2024),
})

export const GET = withTenant(async (_req, ctx) => {
  const tenantId = ctx.tenantId
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  // Get costs and property counts by lead source
  const [costs, propertiesBySource, soldBySource] = await Promise.all([
    db.leadSourceCost.findMany({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
    db.property.groupBy({
      by: ['leadSource'],
      where: { tenantId, leadSource: { not: null } },
      _count: true,
    }),
    db.property.groupBy({
      by: ['leadSource'],
      where: { tenantId, leadSource: { not: null }, OR: [{ acqStatus: 'CLOSED' }, { dispoStatus: 'CLOSED' }] },
      _count: true,
    }),
  ])

  // Build source summary
  const sources = new Set<string>()
  costs.forEach(c => sources.add(c.source))
  propertiesBySource.forEach(p => { if (p.leadSource) sources.add(p.leadSource) })

  const summary = Array.from(sources).map(source => {
    const monthlyCosts = costs.filter(c => c.source === source)
    const totalSpend = monthlyCosts.reduce((sum, c) => sum + Number(c.cost), 0)
    const currentMonthCost = monthlyCosts.find(c => c.month === currentMonth && c.year === currentYear)
    const leads = propertiesBySource.find(p => p.leadSource === source)?._count ?? 0
    const deals = soldBySource.find(p => p.leadSource === source)?._count ?? 0
    const costPerLead = leads > 0 ? totalSpend / leads : 0

    return {
      source,
      totalSpend,
      currentMonthCost: currentMonthCost ? Number(currentMonthCost.cost) : 0,
      leads,
      deals,
      costPerLead: Math.round(costPerLead),
    }
  }).sort((a, b) => b.leads - a.leads)

  return NextResponse.json({ sources: summary, costs })
})

export const POST = withTenant(async (req, ctx) => {
  const body = await req.json()
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  // Compound unique key tenantId_source_month_year already binds to tenantId,
  // so this upsert is structurally tenant-scoped.
  await db.leadSourceCost.upsert({
    where: {
      tenantId_source_month_year: {
        tenantId: ctx.tenantId,
        source: parsed.data.source,
        month: parsed.data.month,
        year: parsed.data.year,
      },
    },
    create: {
      tenantId: ctx.tenantId,
      source: parsed.data.source,
      cost: parsed.data.cost,
      month: parsed.data.month,
      year: parsed.data.year,
    },
    update: {
      cost: parsed.data.cost,
    },
  })

  return NextResponse.json({ status: 'success' })
})
