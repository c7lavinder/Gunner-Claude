import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/layout.tsx
// Main app shell — sidebar + top bar for all tenant pages

import { redirect } from 'next/navigation'


import { SidebarNav } from '@/components/ui/sidebar-nav'
import { TopBar } from '@/components/ui/top-bar'

interface TenantLayoutProps {
  children: React.ReactNode
  params: { tenant: string }
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const session = await requireSession()
  

  const tenantSlug = session.tenantSlug
  if (tenantSlug !== params.tenant) redirect(`/${tenantSlug}/dashboard`)

  return (
    <div className="flex h-screen bg-[#0f1117] overflow-hidden">
      <SidebarNav tenantSlug={params.tenant} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
