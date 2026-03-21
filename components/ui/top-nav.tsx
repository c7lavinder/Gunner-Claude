'use client'
// components/ui/top-nav.tsx
// Design system: 52px sticky top nav, white bg, 0.5px bottom border
// Active link: gunner-red text + 2px red bottom border
// Font: 14px weight 500

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'
import { Bell, Settings, ChevronDown } from 'lucide-react'
import { hasPermission, type UserRole } from '@/types/roles'

export function TopNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = ((session?.user as { role?: string })?.role ?? 'LEAD_MANAGER') as UserRole
  const [showMenu, setShowMenu] = useState(false)

  const base = `/${tenantSlug}`

  const navItems = [
    { href: `${base}/dashboard`, label: 'Dashboard', always: true },
    { href: `${base}/calls`, label: 'Calls', permission: 'calls.view.own' as const },
    { href: `${base}/inbox`, label: 'Inbox', always: true },
    { href: `${base}/tasks`, label: 'Tasks', always: true },
    { href: `${base}/appointments`, label: 'Appointments', always: true },
    { href: `${base}/inventory`, label: 'Inventory', permission: 'inventory.view' as const },
    { href: `${base}/kpis`, label: 'KPIs', permission: 'kpis.view.own' as const },
    { href: `${base}/training`, label: 'Training', permission: 'calls.view.own' as const },
  ]

  const visibleItems = navItems.filter(item =>
    item.always || (item.permission && hasPermission(role, item.permission))
  )

  return (
    <header className="h-[52px] sticky top-0 z-[100] bg-surface-primary border-b" style={{ borderColor: 'var(--border-light)' }}>
      <div className="h-full px-8 max-w-[1400px] mx-auto flex items-center gap-8">
        {/* Logo */}
        <Link href={`${base}/dashboard`} className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-md bg-gunner-red flex items-center justify-center">
            <span className="text-white font-semibold text-[11px]">G</span>
          </div>
          <span className="text-ds-label font-semibold text-txt-primary">Gunner</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 h-full">
          {visibleItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative h-full flex items-center px-3 text-ds-label font-medium transition-colors ${
                  active
                    ? 'text-gunner-red'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-gunner-red rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          <Link
            href={`${base}/settings`}
            className={`p-2 rounded-[10px] transition-colors ${
              pathname.startsWith(`${base}/settings`)
                ? 'bg-surface-secondary text-txt-primary'
                : 'text-txt-muted hover:text-txt-primary hover:bg-surface-secondary'
            }`}
          >
            <Settings size={16} />
          </Link>

          <button className="relative p-2 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
            <Bell size={16} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gunner-red" />
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(v => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-[10px] hover:bg-surface-secondary transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gunner-red-light flex items-center justify-center">
                <span className="text-gunner-red text-ds-fine font-semibold">
                  {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
              <ChevronDown size={12} className="text-txt-muted" />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-11 w-52 bg-surface-primary border rounded-[14px] py-1 shadow-ds-float z-50" style={{ borderColor: 'var(--border-medium)' }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
                    <p className="text-ds-body font-medium text-txt-primary truncate">{session?.user?.name}</p>
                    <p className="text-ds-fine text-txt-muted truncate">{session?.user?.email}</p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full text-left px-4 py-2.5 text-ds-body text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
