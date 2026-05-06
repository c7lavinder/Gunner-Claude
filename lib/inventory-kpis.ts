// lib/inventory-kpis.ts — Inventory KPI data layer
// Called by /kpis page to get deal pipeline metrics
import { db } from '@/lib/db/client'
import { STATUS_TO_APP_STAGE } from '@/types/property'
import type { AppStage } from '@/types/property'
import { effectiveStatus, isClosedDeal, PROPERTY_LANE_SELECT } from '@/lib/property-status'

interface KPIFilters {
  tenantId: string
  period?: 'this_month' | 'last_month' | 'this_quarter' | 'ytd' | 'all_time'
  market?: string
  leadSource?: string
}

function getPeriodStart(period: string): Date | null {
  const now = new Date()
  switch (period) {
    case 'this_month':
      return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1)
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3
      return new Date(now.getFullYear(), q, 1)
    }
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1)
    default:
      return null
  }
}

export async function getInventoryKPIs(filters: KPIFilters) {
  const { tenantId, period = 'all_time', market, leadSource } = filters
  const periodStart = getPeriodStart(period)

  const where: Record<string, unknown> = { tenantId }
  if (periodStart) where.createdAt = { gte: periodStart }
  if (leadSource) where.leadSource = leadSource

  const properties = await db.property.findMany({
    where,
    select: {
      ...PROPERTY_LANE_SELECT,
      assignmentFee: true,
      contractPrice: true,
      askingPrice: true,
      leadSource: true,
      marketId: true,
      city: true,
      state: true,
      createdAt: true,
    },
  })

  // Stage counts
  const stageCounts: Record<string, number> = {}
  for (const p of properties) {
    const stage = STATUS_TO_APP_STAGE[effectiveStatus(p)] ?? 'acquisition.new_lead'
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1
  }

  const leads = stageCounts['acquisition.new_lead'] ?? 0
  const apptSet = stageCounts['acquisition.appt_set'] ?? 0
  const offersMade = stageCounts['acquisition.offer_made'] ?? 0
  const underContract = stageCounts['acquisition.contract'] ?? 0
  const closed = stageCounts['acquisition.closed'] ?? 0
  const followUp = stageCounts['longterm.follow_up'] ?? 0
  const dead = stageCounts['longterm.dead'] ?? 0

  // Conversion rates (avoid division by zero)
  const safeDiv = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

  // Financials from closed deals
  const closedProps = properties.filter(isClosedDeal)
  const totalRevenue = closedProps.reduce((sum, p) => sum + (p.assignmentFee ? Number(p.assignmentFee) : 0), 0)
  const avgDealSize = closedProps.length > 0 ? totalRevenue / closedProps.length : 0

  // Spread calculation
  const spreads = closedProps
    .filter(p => p.contractPrice && p.askingPrice)
    .map(p => Number(p.contractPrice) - Number(p.askingPrice))
  const avgSpread = spreads.length > 0 ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0

  // Data quality
  const missingSourceCount = properties.filter(p => !p.leadSource).length
  const missingMarketCount = properties.filter(p => !p.marketId).length

  // Breakdowns by lead source
  const sourceMap = new Map<string, { leads: number; apptSet: number; offers: number; contracted: number; closed: number; revenue: number }>()
  for (const p of properties) {
    const src = p.leadSource ?? 'Unknown'
    const existing = sourceMap.get(src) ?? { leads: 0, apptSet: 0, offers: 0, contracted: 0, closed: 0, revenue: 0 }
    const stage = STATUS_TO_APP_STAGE[effectiveStatus(p)]
    if (stage === 'acquisition.new_lead') existing.leads++
    else if (stage === 'acquisition.appt_set') existing.apptSet++
    else if (stage === 'acquisition.offer_made') existing.offers++
    else if (stage === 'acquisition.contract') existing.contracted++
    else if (stage === 'acquisition.closed') {
      existing.closed++
      existing.revenue += p.assignmentFee ? Number(p.assignmentFee) : 0
    }
    sourceMap.set(src, existing)
  }

  return {
    leads, appt_set: apptSet, offers_made: offersMade,
    under_contract: underContract, closed, follow_up: followUp, dead,

    lead_to_appt_rate: safeDiv(apptSet, leads),
    appt_to_offer_rate: safeDiv(offersMade, apptSet),
    offer_to_contract_rate: safeDiv(underContract, offersMade),
    contract_to_close_rate: safeDiv(closed, underContract),

    total_revenue: totalRevenue,
    avg_spread: avgSpread,
    avg_deal_size: avgDealSize,

    missing_source_count: missingSourceCount,
    missing_market_count: missingMarketCount,

    by_lead_source: [...sourceMap.entries()].map(([source, data]) => ({ source, ...data })),
  }
}
