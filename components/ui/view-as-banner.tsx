'use client'
// components/ui/view-as-banner.tsx
// Shows a persistent banner at the top when admin is viewing as another user
// Set from Settings > Team, stored in localStorage

import { useState, useEffect } from 'react'
import { Eye, X } from 'lucide-react'

export function ViewAsBanner() {
  const [viewAsUser, setViewAsUser] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('gunner_view_as_user')
      if (stored) setViewAsUser(stored)
    } catch {}

    // Listen for changes from other tabs/pages
    function onStorage(e: StorageEvent) {
      if (e.key === 'gunner_view_as_user') setViewAsUser(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!viewAsUser) return null

  function exit() {
    setViewAsUser(null)
    try {
      localStorage.removeItem('gunner_view_as_user')
      localStorage.removeItem('gunner_view_as_user_id')
    } catch {}
    window.location.reload()
  }

  return (
    <div className="bg-semantic-blue text-white text-[12px] font-medium px-4 py-1.5 flex items-center justify-center gap-2 sticky top-0 z-[200]">
      <Eye size={12} />
      <span>Viewing as: {viewAsUser}</span>
      <button
        onClick={exit}
        className="ml-2 hover:bg-white/20 rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors"
      >
        <X size={10} /> Exit
      </button>
    </div>
  )
}
