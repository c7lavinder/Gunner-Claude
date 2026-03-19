'use client'
// components/ui/top-bar.tsx

import { Bell, Search } from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'

export function TopBar() {
  const { data: session } = useSession()
  const [showMenu, setShowMenu] = useState(false)

  return (
    <header className="h-16 border-b border-white/10 flex items-center px-6 gap-4 bg-[#0f1117] shrink-0">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
          <Search size={14} className="text-gray-500" />
          <input
            placeholder="Search contacts, properties, calls…"
            className="bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none flex-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Notifications */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors">
          <Bell size={16} className="text-gray-400" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-500" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center"
          >
            <span className="text-orange-400 text-sm font-medium">
              {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          </button>

          {showMenu && (
            <div className="absolute right-0 top-10 w-48 bg-[#1a1d27] border border-white/10 rounded-xl py-1 shadow-xl z-50">
              <div className="px-4 py-2 border-b border-white/10">
                <p className="text-xs font-medium text-white truncate">{session?.user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
