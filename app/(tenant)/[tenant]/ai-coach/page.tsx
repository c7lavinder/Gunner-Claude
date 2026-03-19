import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/ai-coach/page.tsx


import { AiCoachClient } from '@/components/ai-coach/ai-coach-client'

export default async function AiCoachPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  return (
    <AiCoachClient
      tenantSlug={params.tenant}
      userName={session.name}
      userRole={session.role}
    />
  )
}
