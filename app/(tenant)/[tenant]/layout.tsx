// app/(tenant)/[tenant]/layout.tsx
// Main app shell — top nav bar (52px sticky) + content area + global AI Coach
// Design system: docs/DESIGN.md

import { requireSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ui/top-nav'
import { CoachSidebar } from '@/components/ui/coach-sidebar'
import { ViewAsBanner } from '@/components/ui/view-as-banner'

interface TenantLayoutProps {
  children: React.ReactNode
  params: { tenant: string }
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const session = await requireSession()

  const tenantSlug = session.tenantSlug
  if (tenantSlug !== params.tenant) redirect(`/${tenantSlug}/dashboard`)

  return (
    <div className="min-h-screen bg-surface-primary">
      <ViewAsBanner />
      <TopNav tenantSlug={params.tenant} />
      <main className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px] mx-auto">
        {children}
      </main>
      <CoachSidebar />
    </div>
  )
}
