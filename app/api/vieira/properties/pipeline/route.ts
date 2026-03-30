import { NextRequest, NextResponse } from 'next/server'
import { validateVieiraToken, unauthorized } from '@/lib/vieira-auth'
import { db } from '@/lib/db/client'

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

    // Group by status
    const byStage = await db.property.groupBy({
      by: ['status'],
      where: tidFilter,
      _count: true,
      _sum: { assignmentFee: true, contractPrice: true },
    })

    // Group by market
    const properties = await db.property.findMany({
      where: { ...tidFilter, status: { notIn: ['DEAD', 'SOLD'] } },
      select: {
        status: true,
        assignmentFee: true,
        contractPrice: true,
        city: true,
        market: { select: { name: true } },
      },
    })

    // Build market breakdown
    const marketMap: Record<string, { count: number; value: number }> = {}
    for (const p of properties) {
      const mkt = p.market?.name || p.city || 'Unknown'
      if (!marketMap[mkt]) marketMap[mkt] = { count: 0, value: 0 }
      marketMap[mkt].count++
      marketMap[mkt].value += Number(p.assignmentFee ?? p.contractPrice ?? 0)
    }

    // Pipeline summary
    const pipeline = byStage.map(s => ({
      stage: s.status,
      count: s._count,
      total_assignment_fee: s._sum.assignmentFee ?? 0,
      total_contract_price: s._sum.contractPrice ?? 0,
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
