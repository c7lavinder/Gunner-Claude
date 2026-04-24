// app/api/properties/[propertyId]/re-enrich/route.ts
// POST — re-triggers AI enrichment for a property
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { enrichPropertyWithAI } from '@/lib/ai/enrich-property'
import { enrichProperty } from '@/lib/enrichment/enrich-property'

export async function POST(
  _request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    select: { id: true, aiEnrichmentStatus: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Don't re-enrich if already pending
  if (property.aiEnrichmentStatus === 'pending') {
    return NextResponse.json({ status: 'already_pending' })
  }

  // Fire both enrichment paths in parallel:
  //   1. Multi-vendor orchestrator — BatchData/PR/Google/CourtListener.
  //      User explicitly clicked "re-enrich" so force BD regardless of
  //      cache / PR-no-match skip — they want the full dataset.
  //   2. Claude AI estimates — ARV, repair, rental.
  enrichProperty(property.id, { forceBatchData: true }).catch(err =>
    console.error('[Re-Enrich Vendor] Background error:', err instanceof Error ? err.message : err)
  )
  enrichPropertyWithAI(property.id).catch(err =>
    console.error('[Re-Enrich AI] Background error:', err instanceof Error ? err.message : err)
  )

  return NextResponse.json({ status: 'started' })
}
