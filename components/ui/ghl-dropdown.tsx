// components/ui/ghl-dropdown.tsx
// Reusable dropdown that fetches options from a GHL API endpoint
// Used for pipeline, stage, and other GHL entity selectors (Rule 2 compliance)

'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface GHLDropdownProps {
  endpoint: string
  valueKey: string
  labelKey: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** If provided, filters/transforms the raw API response */
  transformResponse?: (data: Record<string, unknown>) => Array<Record<string, string>>
}

export function GHLDropdown({
  endpoint,
  valueKey,
  labelKey,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  transformResponse,
}: GHLDropdownProps) {
  const [options, setOptions] = useState<Array<Record<string, string>>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const items = transformResponse
          ? transformResponse(data)
          : (data.pipelines ?? data.data ?? data.items ?? [])
        setOptions(items)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load options')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [endpoint, transformResponse])

  if (loading) {
    return (
      <div className="flex items-center gap-2 bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-ds-body text-txt-muted">
        <Loader2 size={14} className="animate-spin" />
        Loading from GHL...
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-[10px] px-4 py-2.5 text-ds-body text-semantic-red">
        Failed to load: {error}
      </div>
    )
  }

  if (options.length === 0) {
    return (
      <div className="bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-ds-body text-txt-muted">
        No options available — connect GHL first
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] disabled:opacity-50 transition-colors"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt[valueKey]} value={opt[valueKey]}>
          {opt[labelKey]}
        </option>
      ))}
    </select>
  )
}
