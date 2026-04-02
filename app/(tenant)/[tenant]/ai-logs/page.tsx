// app/(tenant)/[tenant]/ai-logs/page.tsx
// Admin-only page showing all AI interactions for debugging + improvement
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { AiLogsClient } from './ai-logs-client'

export default async function AiLogsPage({ params }: { params: { tenant: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })

  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    redirect(`/${params.tenant}/tasks`)
  }

  return <AiLogsClient tenantSlug={params.tenant} />
}
