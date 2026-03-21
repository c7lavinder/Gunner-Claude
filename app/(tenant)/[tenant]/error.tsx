'use client'
// app/(tenant)/[tenant]/error.tsx
// Catches runtime errors in tenant pages

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
    console.error('[TenantError]', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-5">
        <div className="w-14 h-14 rounded-[14px] bg-semantic-red-bg flex items-center justify-center mx-auto">
          <AlertTriangle size={24} className="text-semantic-red" />
        </div>

        <div>
          <h1 className="text-ds-section font-semibold text-txt-primary">Something went wrong</h1>
          <p className="text-ds-body text-txt-secondary mt-2">
            An unexpected error occurred. If this keeps happening, contact support.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-3 text-left text-ds-fine text-semantic-red bg-semantic-red-bg border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] p-3 overflow-auto max-h-32">
              {error.message}
            </pre>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-ds-body font-medium text-txt-secondary bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] px-4 py-2 rounded-[10px] hover:text-txt-primary transition-colors"
          >
            <ArrowLeft size={14} /> Go back
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-ds-body font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark px-4 py-2 rounded-[10px] transition-colors"
          >
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    </div>
  )
}
