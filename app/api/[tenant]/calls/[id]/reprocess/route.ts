// app/api/[tenant]/calls/[id]/reprocess/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { gradeCall } from '@/lib/ai/grading'

export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  await db.call.update({
    where: { id: params.id },
    data: { gradingStatus: 'PENDING' },
  })

  gradeCall(params.id).catch(err => {
    console.error(`[Reprocess] Failed for call ${params.id}:`, err)
  })

  return NextResponse.json({ success: true })
}
