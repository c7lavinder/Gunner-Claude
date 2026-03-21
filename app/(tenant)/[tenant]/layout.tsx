import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/layout.tsx
// Main app shell — top nav bar (52px sticky) + content area
// Design system: docs/DESIGN.md

import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ui/top-nav'

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
      <TopNav tenantSlug={params.tenant} />
      <main className="px-8 py-6 max-w-[1400px] mx-auto">
        {children}
      </main>
    </div>
  )
}
