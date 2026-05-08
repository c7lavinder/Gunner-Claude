'use client'
// components/ui/searchable-select.tsx
// Lightweight searchable dropdown — text input with filterable options
// list. Built for cases where a plain <select> has more than 5-6
// options (buyer tiers, pipeline stages, response speeds, etc.) and
// the rep wants to type to narrow.
//
// State is fully controlled by the parent. The input shows the
// currently-selected value (or the user's search text when typing).
// Clicking outside or pressing Escape closes the popover.

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'

export interface SearchableSelectOption {
  value: string
  label?: string  // defaults to value if absent
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  allowClear,
  disabled,
  className,
}: {
  value: string
  options: Array<string | SearchableSelectOption>
  onChange: (v: string) => void
  placeholder?: string
  allowClear?: boolean
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const normalized = options.map(o => typeof o === 'string'
    ? { value: o, label: o }
    : { value: o.value, label: o.label ?? o.value })

  const selectedOption = normalized.find(o => o.value === value)
  const display = open ? search : (selectedOption?.label ?? '')

  const filtered = search
    ? normalized.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : normalized

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={e => { setSearch(e.target.value); if (!open) setOpen(true) }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setSearch(''); inputRef.current?.blur() }
            if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); pick(filtered[0].value) }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 pr-7 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20 disabled:opacity-50"
        />
        {value && allowClear && !open && (
          <button
            onClick={() => onChange('')}
            disabled={disabled}
            className="absolute right-7 top-1/2 -translate-y-1/2 text-txt-muted hover:text-semantic-red"
            tabIndex={-1}
            type="button"
          >
            <X size={11} />
          </button>
        )}
        <ChevronDown size={11} className={`absolute right-2 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-secondary transition-colors flex items-center justify-between ${
                o.value === value ? 'bg-gunner-red-light text-txt-primary font-semibold' : 'text-txt-secondary'
              }`}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={10} className="text-gunner-red" />}
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] shadow-lg p-2">
          <p className="text-[10px] text-txt-muted italic text-center">No matches</p>
        </div>
      )}
    </div>
  )
}
