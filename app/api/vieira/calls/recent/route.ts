import { NextRequest, NextResponse } from 'next/server'
import { validateVieiraToken, unauthorized } from '@/lib/vieira-auth'
import { db } from '@/lib/db/client'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export async function GET(req: NextRequest) {
  if (!validateVieiraToken(req)) return unauthorized()

  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10'), 50)
    const tenantSlug = req.nextUrl.searchParams.get('tenant') || undefined

    let tenantId: string | undefined
    if (tenantSlug) {
      const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } })
      tenantId = tenant?.id
    }

    const calls = await db.call.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { calledAt: 'desc' },
      take: limit,
      select: {
        id: true,
        contactName: true,
        contactAddress: true,
        direction: true,
        callType: true,
        callResult: true,
        durationSeconds: true,
        calledAt: true,
        gradingStatus: true,
        score: true,
        aiSummary: true,
        aiFeedback: true,
        aiCoachingTips: true,
        sentiment: true,
        sellerMotivation: true,
        nextBestAction: true,
        callOutcome: true,
        assignedTo: { select: { name: true, role: true } },
        property: { select: { id: true, address: true, city: true, ...PROPERTY_LANE_SELECT } },
      },
    })

    return NextResponse.json({
      calls: calls.map(c => ({
        id: c.id,
        contact: c.contactName,
        address: c.contactAddress || (c.property ? `${c.property.address}, ${c.property.city}` : null),
        direction: c.direction,
        type: c.callType,
        result: c.callResult,
        duration_seconds: c.durationSeconds,
        called_at: c.calledAt?.toISOString(),
        grading: c.gradingStatus,
        score: c.score,
        summary: c.aiSummary,
        feedback: c.aiFeedback,
        coaching: c.aiCoachingTips,
        sentiment: c.sentiment,
        seller_motivation: c.sellerMotivation,
        next_action: c.nextBestAction,
        outcome: c.callOutcome,
        agent: c.assignedTo?.name,
        agent_role: c.assignedTo?.role,
        property_status: c.property ? effectiveStatus(c.property) : null,
      })),
      count: calls.length,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
