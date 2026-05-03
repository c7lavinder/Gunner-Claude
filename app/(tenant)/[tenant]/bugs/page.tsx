// app/(tenant)/[tenant]/bugs/page.tsx
// Admin-only page — team-submitted bug reports
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { BugsClient } from './bugs-client'

export default async function BugsPage({ params }: { params: { tenant: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })

  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    redirect(`/${params.tenant}/day-hub`)
  }

  return <BugsClient />
}
