// GET /api/ai/assistant/session — load today's conversation history
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (_req, ctx) => {
  const today = new Date().toISOString().slice(0, 10)

  // SIMPLIFY: removed redundant db.user.findUnique role lookup — ctx.userRole is canonical
  const messages = await db.assistantMessage.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, sessionDate: today },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, toolCalls: true },
  })

  return NextResponse.json({ messages, userRole: ctx.userRole })
})
