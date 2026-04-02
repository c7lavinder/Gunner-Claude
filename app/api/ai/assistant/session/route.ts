// GET /api/ai/assistant/session — load today's conversation history
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)

  const [messages, user] = await Promise.all([
    db.assistantMessage.findMany({
      where: { tenantId: session.tenantId, userId: session.userId, sessionDate: today },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, toolCalls: true },
    }),
    db.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    }),
  ])

  return NextResponse.json({ messages, userRole: user?.role })
}
