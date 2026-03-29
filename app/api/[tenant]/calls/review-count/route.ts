// GET /api/[tenant]/calls/review-count — count of calls needing review (score < 50)
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ count: 0 })

    const count = await db.call.count({
      where: {
        tenantId: session.tenantId,
        gradingStatus: 'COMPLETED',
        score: { lt: 50 },
      },
    })

    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
