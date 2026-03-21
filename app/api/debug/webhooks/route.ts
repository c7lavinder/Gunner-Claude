// app/api/debug/webhooks/route.ts
// Temporary debug endpoint — shows recent webhook audit logs
import { NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const logs = await db.auditLog.findMany({
    where: {
      tenantId: session.tenantId,
      action: 'webhook.received',
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { createdAt: true, payload: true },
  })

  return NextResponse.json({
    count: logs.length,
    webhooks: logs.map(l => ({
      time: l.createdAt,
      ...(l.payload as Record<string, unknown>),
    })),
  })
}
