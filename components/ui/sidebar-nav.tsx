'use client'
// components/ui/sidebar-nav.tsx

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  LayoutDashboard, Phone, Inbox, Calendar, CheckSquare,
  Building2, BarChart3, Bot, Settings, ChevronRight, GraduationCap, Sun, Megaphone
} from 'lucide-react'
import { hasPermission, type UserRole } from '@/types/roles'

interface SidebarNavProps {
  tenantSlug: string
}

export function SidebarNav({ tenantSlug }: SidebarNavProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = ((session?.user as { role?: string })?.role ?? 'LEAD_MANAGER') as UserRole

  const base = `/${tenantSlug}`

  const navItems = [
    { href: `${base}/dashboard`, icon: LayoutDashboard, label: 'Dashboard', always: true },
    { href: `${base}/calls`, icon: Phone, label: 'Call grading', permission: 'calls.view.own' as const },
    { href: `${base}/inbox`, icon: Inbox, label: 'Inbox', always: true },
    { href: `${base}/appointments`, icon: Calendar, label: 'Appointments', always: true },
    { href: `${base}/tasks`, icon: CheckSquare, label: 'Tasks', always: true },
    { href: `${base}/inventory`, icon: Building2, label: 'Inventory', permission: 'inventory.view' as const },
    { href: `${base}/day-hub`, icon: Sun, label: 'Day Hub', always: true },
    { href: `${base}/kpis`, icon: BarChart3, label: 'KPIs', permission: 'kpis.view.own' as const },
    { href: `${base}/buyers`, icon: Megaphone, label: 'Disposition', permission: 'inventory.view' as const },
    { href: `${base}/training`, icon: GraduationCap, label: 'Training', permission: 'calls.view.own' as const },
    { href: `${base}/ai-coach`, icon: Bot, label: 'AI Coach', permission: 'ai.coach' as const },
  ]

  const visibleItems = navItems.filter((item) =>
    item.always || (item.permission && hasPermission(role, item.permission))
  )

  return (
    <div className="w-60 shrink-0 flex flex-col border-r border-white/10 bg-[#0f1117]">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">G</span>
          </div>
          <span className="text-white font-semibold text-sm">Gunner AI</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
                active
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon size={16} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={12} className="text-orange-400/60" />}
            </Link>
          )
        })}
      </nav>

      {/* Settings + user */}
      <div className="border-t border-white/10 p-3 space-y-0.5">
        <Link
          href={`${base}/settings`}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname.startsWith(`${base}/settings`)
              ? 'bg-white/5 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings size={16} />
          Settings
        </Link>

        {/* User chip */}
        <div className="flex items-center gap-2 px-3 py-2.5 mt-1">
          <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
            <span className="text-orange-400 text-xs font-medium">
              {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{session?.user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{role.replace(/_/g, ' ').toLowerCase()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
