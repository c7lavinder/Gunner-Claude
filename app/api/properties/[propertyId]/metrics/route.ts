// GET /api/properties/[propertyId]/metrics
// Returns computed metrics for a property (engagement, financials)
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { computePropertyMetrics } from '@/lib/computed-metrics'

export async function GET(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  try {
    const metrics = await computePropertyMetrics(params.propertyId)
    return NextResponse.json({ metrics })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
