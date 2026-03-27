// GET /api/notifications — fetch recent @mention notifications for the current user
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch recent property.message audit logs where current user is mentioned
  // Prisma JSON path query on PostgreSQL: payload->'mentions' contains user ID
  const recentMessages = await db.auditLog.findMany({
    where: {
      tenantId: session.tenantId,
      action: 'property.message',
      // Only last 30 days
      createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      payload: true,
      resourceId: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true } },
    },
  })

  // Filter to messages that mention the current user
  const notifications = recentMessages
    .filter(m => {
      const payload = m.payload as Record<string, unknown> | null
      const mentions = (payload?.mentions ?? []) as Array<{ id: string }>
      return mentions.some(mention => mention.id === session.userId)
    })
    .map(m => {
      const payload = m.payload as Record<string, unknown>
      return {
        id: m.id,
        text: (payload.text as string) ?? '',
        propertyId: m.resourceId,
        propertyAddress: (payload.propertyAddress as string) ?? '',
        fromUser: m.user?.name ?? 'Unknown',
        fromUserId: m.userId,
        createdAt: m.createdAt.toISOString(),
      }
    })

  return NextResponse.json({ notifications })
}
