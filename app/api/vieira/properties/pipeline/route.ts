import { NextRequest, NextResponse } from 'next/server'
import { validateVieiraToken, unauthorized } from '@/lib/vieira-auth'
import { db } from '@/lib/db/client'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export async function GET(req: NextRequest) {
  if (!validateVieiraToken(req)) return unauthorized()

  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') || undefined

    let tenantId: string | undefined
    if (tenantSlug) {
      const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } })
      tenantId = tenant?.id
    }
    const tidFilter = tenantId ? { tenantId } : {}

    // Pull all properties once (per-lane schema — no single status column to group by)
    const allProps = await db.property.findMany({
      where: tidFilter,
      select: {
        ...PROPERTY_LANE_SELECT,
        assignmentFee: true,
        contractPrice: true,
        city: true,
        market: { select: { name: true } },
      },
    })

    // Active = not closed in either lane and not dead in longterm
    const properties = allProps.filter(p => {
      const closed = p.acqStatus === 'CLOSED' || p.dispoStatus === 'CLOSED'
      const dead = p.longtermStatus === 'DEAD'
      return !closed && !dead
    })

    // Build market breakdown
    const marketMap: Record<string, { count: number; value: number }> = {}
    for (const p of properties) {
      const mkt = p.market?.name || p.city || 'Unknown'
      if (!marketMap[mkt]) marketMap[mkt] = { count: 0, value: 0 }
      marketMap[mkt].count++
      marketMap[mkt].value += Number(p.assignmentFee ?? p.contractPrice ?? 0)
    }

    // Pipeline summary — derive primary lane status per property and aggregate
    const stageMap: Record<string, { count: number; assignmentFee: number; contractPrice: number }> = {}
    for (const p of allProps) {
      const stage = effectiveStatus(p)
      if (!stageMap[stage]) stageMap[stage] = { count: 0, assignmentFee: 0, contractPrice: 0 }
      stageMap[stage].count++
      stageMap[stage].assignmentFee += Number(p.assignmentFee ?? 0)
      stageMap[stage].contractPrice += Number(p.contractPrice ?? 0)
    }
    const pipeline = Object.entries(stageMap).map(([stage, agg]) => ({
      stage,
      count: agg.count,
      total_assignment_fee: agg.assignmentFee,
      total_contract_price: agg.contractPrice,
    }))

    // Sort pipeline by logical deal flow order
    const stageOrder = [
      'NEW_LEAD', 'CONTACTED', 'APPOINTMENT_SET', 'APPOINTMENT_COMPLETED',
      'OFFER_MADE', 'UNDER_CONTRACT', 'IN_DISPOSITION', 'DISPO_PUSHED',
      'DISPO_OFFERS', 'DISPO_CONTRACTED', 'DISPO_CLOSED', 'SOLD', 'FOLLOW_UP', 'DEAD',
    ]
    pipeline.sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage))

    const activeCount = properties.length
    const totalPipelineValue = properties.reduce((sum, p) => sum + Number(p.assignmentFee ?? 0), 0)

    return NextResponse.json({
      pipeline,
      markets: Object.entries(marketMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count),
      totals: {
        active_properties: activeCount,
        pipeline_value: totalPipelineValue,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
