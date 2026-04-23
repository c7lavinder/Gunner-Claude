// app/api/sellers/[sellerId]/skip-trace/route.ts
//
// POST — manually trigger BatchData skip-trace for a seller. Costs ~$0.07
// per call. Only runs when seller is still missing phone OR email, unless
// `?force=1` is passed.
//
// Response:
//   200 { traced: true, fieldsTouched: [...] }   — new data written
//   200 { traced: true, fieldsTouched: [] }      — traced but nothing new
//   200 { traced: false, fieldsTouched: [] }     — skipped (complete, no force)
//   402 { error: "skip-trace unavailable" }      — BatchData returned no match
//   404 { error: "seller not found" }
//
// Gated by `properties.edit` permission — same as the property enrichment
// routes. Skip-trace is a paid API call, so editors only.

import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { skipTraceSeller } from '@/lib/enrichment/sync-seller'

export async function POST(
  request: NextRequest,
  { params }: { params: { sellerId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'properties.edit')) return forbiddenResponse()

  const seller = await db.seller.findUnique({
    where: { id: params.sellerId, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!seller) return NextResponse.json({ error: 'seller not found' }, { status: 404 })

  const force = new URL(request.url).searchParams.get('force') === '1'
  const result = await skipTraceSeller(seller.id, { force })

  if (!result) {
    return NextResponse.json({ error: 'skip-trace unavailable' }, { status: 502 })
  }

  return NextResponse.json({
    traced: result.traced,
    fieldsTouched: result.fieldsTouched,
  })
}
