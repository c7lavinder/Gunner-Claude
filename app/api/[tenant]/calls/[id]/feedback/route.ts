// app/api/[tenant]/calls/[id]/feedback/route.ts
// Stores call feedback in audit_logs (type: call.feedback) for AI learning loop
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  type: z.string().min(1),
  details: z.string().min(10),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'call.feedback',
      resource: 'call',
      resourceId: params.id,
      source: 'USER',
      severity: 'INFO',
      payload: {
        type: parsed.data.type,
        details: parsed.data.details,
        submittedBy: session.userId,
      },
    },
  })

  return NextResponse.json({ success: true })
}
