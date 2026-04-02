// POST /api/[tenant]/calls/[id]/calibration
// Toggle a call's calibration flag — marks it as a good/bad example for AI grading
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const { isCalibration } = await request.json()

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  await db.call.update({
    where: { id: params.id },
    data: { isCalibration: !!isCalibration },
  })

  await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: isCalibration ? 'call.calibration.flagged' : 'call.calibration.unflagged',
      resource: 'call',
      resourceId: params.id,
      source: 'USER',
      severity: 'INFO',
    },
  }).catch(() => {})

  return NextResponse.json({ status: 'success', isCalibration: !!isCalibration })
}
