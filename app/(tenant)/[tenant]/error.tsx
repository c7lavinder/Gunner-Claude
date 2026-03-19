'use client'
// app/(tenant)/[tenant]/error.tsx
// Catches runtime errors in tenant pages — shows friendly error instead of crash

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to console in dev — in production, send to your error tracking
    console.error('[TenantError]', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} className="text-red-400" />
        </div>

        <div>
          <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
          <p className="text-sm text-gray-400 mt-2">
            An unexpected error occurred. If this keeps happening, contact support.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-3 text-left text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-3 overflow-auto max-h-32">
              {error.message}
            </pre>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} /> Go back
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-white bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    </div>
  )
}
