// GET /api/[tenant]/calls/review-count — count of calls needing review (score < 50)
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (req, ctx) => {
  const count = await db.call.count({
    where: {
      tenantId: ctx.tenantId,
      gradingStatus: 'COMPLETED',
      score: { lt: 50 },
    },
  })

  return NextResponse.json({ count })
})
