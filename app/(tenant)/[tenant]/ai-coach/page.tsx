import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/ai-coach/page.tsx


import { AiCoachClient } from '@/components/ai-coach/ai-coach-client'
import { generateInsights } from '@/lib/ai/coach'

export default async function AiCoachPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const insights = await generateInsights(session.tenantId, session.userId)

  return (
    <AiCoachClient
      tenantSlug={params.tenant}
      userName={session.name}
      userRole={session.role}
      insights={insights}
    />
  )
}
