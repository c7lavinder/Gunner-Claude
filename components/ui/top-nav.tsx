'use client'
// components/ui/top-nav.tsx
// Design system: 52px sticky top nav, white bg, 0.5px bottom border
// Active link: gunner-red text + 2px red bottom border
// Mobile: hamburger menu → slide-down drawer

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { Bell, Settings, ChevronDown, Menu, X, MessageSquare, Bot, Shield, Bug } from 'lucide-react'
import { hasPermission, isRoleAtLeast, type UserRole } from '@/types/roles'
import { formatDistanceToNow } from 'date-fns'

export function TopNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = ((session?.user as { role?: string })?.role ?? 'LEAD_MANAGER') as UserRole
  const [showMenu, setShowMenu] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isViewingAs, setIsViewingAs] = useState(false)

  // Check if View As is active (hides admin-only nav items)
  useEffect(() => {
    try {
      setIsViewingAs(!!localStorage.getItem('gunner_view_as_user'))
    } catch {}
  }, [])
  const [reviewCount, setReviewCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Array<{
    id: string; text: string; propertyId: string | null; propertyAddress: string
    fromUser: string; createdAt: string
  }>>([])
  const [notifLoaded, setNotifLoaded] = useState(false)

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); setShowNotifications(false) }, [pathname])

  // Fetch review queue count for Training badge
  useEffect(() => {
    fetch(`/${tenantSlug}/api/calls-review-count`).catch(() => null)
    // Lightweight: count calls with score < 50 via calls page data (avoid new endpoint)
    // Use the existing calls page pattern — fetch from the tenant API
    fetch(`/api/${tenantSlug}/calls/review-count`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.count) setReviewCount(d.count) })
      .catch(() => {})
  }, [tenantSlug])

  // Fetch notifications on bell click
  async function loadNotifications() {
    if (notifLoaded) { setShowNotifications(v => !v); return }
    setShowNotifications(true)
    try {
      const res = await fetch('/api/notifications')
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setNotifLoaded(true)
    } catch {}
  }

  const base = `/${tenantSlug}`

  const navItems: Array<{ href: string; label: string; permission?: typeof undefined; always?: boolean; adminOnly?: boolean }> = [
    { href: `${base}/day-hub`, label: 'Day Hub', always: true },
    { href: `${base}/calls`, label: 'Calls', permission: 'calls.view.own' as never },
    { href: `${base}/inventory`, label: 'Inventory', permission: 'inventory.view' as never },
    // v1.1 Wave 3 Phase A — surface Sellers list + Buyers (was hidden from nav).
    { href: `${base}/sellers`, label: 'Sellers', permission: 'properties.view.assigned' as never },
    { href: `${base}/buyers`, label: 'Buyers', adminOnly: true },
    { href: `${base}/contacts`, label: 'Contacts', adminOnly: true },
    { href: `${base}/kpis`, label: 'KPIs', adminOnly: true },
    { href: `${base}/accountability`, label: 'Accountability', adminOnly: true },
  ]

  const visibleItems = navItems.filter(item => {
    if (item.always) return true
    if (item.adminOnly) return !isViewingAs && isRoleAtLeast(role, 'ADMIN')
    if (item.permission) return hasPermission(role, item.permission as never)
    return false
  })

  return (
    <header className="sticky top-0 z-[100] bg-surface-primary border-b" style={{ borderColor: 'var(--border-light)' }}>
      <div className="h-[52px] px-4 md:px-8 max-w-[1400px] mx-auto flex items-center gap-4 md:gap-8">
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="md:hidden p-2 -ml-2 rounded-[10px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-colors"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Logo */}
        <Link href={`${base}/day-hub`} className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-md bg-gunner-red flex items-center justify-center">
            <span className="text-white font-semibold text-[11px]">G</span>
          </div>
          <span className="text-ds-label font-semibold text-txt-primary">Gunner</span>
        </Link>

        {/* Nav links — desktop, centered */}
        <nav className="hidden md:flex items-center justify-center gap-1 h-[52px] flex-1">
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
                {item.label === 'Training' && reviewCount > 0 && (
                  <span className="ml-1 text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{reviewCount}</span>
                )}
                {item.label === 'Contacts' && (
                  <span className="ml-1 text-[8px] font-semibold text-[#7F77DD] bg-purple-100 px-1 py-0.5 rounded">Beta</span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-gunner-red rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 md:gap-3 ml-auto">
          {!isViewingAs && isRoleAtLeast(role, 'ADMIN') && (
            <Link
              href={`${base}/ai-logs`}
              className={`p-2 rounded-[10px] transition-colors ${
                pathname.startsWith(`${base}/ai-logs`)
                  ? 'bg-surface-secondary text-txt-primary'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-surface-secondary'
              }`}
              title="AI Logs"
            >
              <Bot size={16} />
            </Link>
          )}
          {!isViewingAs && isRoleAtLeast(role, 'ADMIN') && (
            <Link
              href={`${base}/audit`}
              className={`p-2 rounded-[10px] transition-colors ${
                pathname.startsWith(`${base}/audit`)
                  ? 'bg-surface-secondary text-txt-primary'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-surface-secondary'
              }`}
              title="Audit"
            >
              <Shield size={16} />
            </Link>
          )}
          {!isViewingAs && isRoleAtLeast(role, 'ADMIN') && (
            <Link
              href={`${base}/bugs`}
              className={`p-2 rounded-[10px] transition-colors ${
                pathname.startsWith(`${base}/bugs`)
                  ? 'bg-surface-secondary text-txt-primary'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-surface-secondary'
              }`}
              title="Bug Reports"
            >
              <Bug size={16} />
            </Link>
          )}
          {!isViewingAs && (
            <Link
              href={`${base}/settings`}
              className={`p-2 rounded-[10px] transition-colors ${
                pathname.startsWith(`${base}/settings`)
                  ? 'bg-surface-secondary text-txt-primary'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-surface-secondary'
              }`}
              title="Settings"
            >
              <Settings size={16} />
            </Link>
          )}

          <div className="relative">
            <button
              onClick={loadNotifications}
              className="relative p-2 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors"
              title="Notifications"
            >
              <Bell size={16} />
              {notifLoaded && notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gunner-red" />
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 top-11 w-80 bg-surface-primary border rounded-[14px] shadow-ds-float z-50 overflow-hidden" style={{ borderColor: 'var(--border-medium)' }}>
                  <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-light)' }}>
                    <p className="text-ds-body font-semibold text-txt-primary">Notifications</p>
                    <span className="text-[10px] text-txt-muted">{notifications.length} mentions</span>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <Bell size={16} className="text-txt-muted mx-auto mb-1.5 opacity-40" />
                        <p className="text-ds-fine text-txt-muted">No mentions yet</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <Link
                          key={n.id}
                          href={`/${tenantSlug}/inventory/${n.propertyId}`}
                          onClick={() => setShowNotifications(false)}
                          className="block px-4 py-3 hover:bg-surface-secondary transition-colors border-b last:border-b-0"
                          style={{ borderColor: 'var(--border-light)' }}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-semantic-blue/10 flex items-center justify-center shrink-0 mt-0.5">
                              <MessageSquare size={10} className="text-semantic-blue" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-ds-fine text-txt-primary font-medium">
                                <span className="text-semantic-blue">{n.fromUser}</span> tagged you
                              </p>
                              <p className="text-[10px] text-txt-muted truncate mt-0.5">{n.text}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-txt-muted">{n.propertyAddress}</span>
                                <span className="text-[9px] text-txt-muted">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

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
              <ChevronDown size={12} className="text-txt-muted hidden sm:block" />
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

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 top-[52px] bg-black/20 z-[90] md:hidden" onClick={() => setMobileOpen(false)} />
          <nav className="md:hidden bg-surface-primary border-b py-2 z-[95] relative" style={{ borderColor: 'var(--border-light)' }}>
            {visibleItems.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-6 py-3 text-ds-label font-medium transition-colors ${
                    active
                      ? 'text-gunner-red bg-gunner-red-light'
                      : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </>
      )}
    </header>
  )
}
