// app/(tenant)/[tenant]/ai-coach/page.tsx
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { AiCoachClient } from '@/components/ai-coach/ai-coach-client'
import { generateInsights } from '@/lib/ai/coach'

export default async function AiCoachPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const [insights, recentLogs] = await Promise.all([
    generateInsights(session.tenantId, session.userId),
    db.coachLog.findMany({
      where: { tenantId: session.tenantId, userId: session.userId },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { role: true, message: true },
    }),
  ])

  const history = recentLogs.map(log => ({
    role: log.role as 'user' | 'assistant',
    content: log.message,
  }))

  return (
    <AiCoachClient
      tenantSlug={params.tenant}
      userName={session.name}
      userRole={session.role}
      insights={insights}
      history={history}
    />
  )
}
