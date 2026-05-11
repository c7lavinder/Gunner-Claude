'use client'
// components/ui/searchable-multiselect.tsx
// Multi-select sibling of SearchableSelect. Selected values render as
// removable chips above the search input; the dropdown lets the rep
// toggle options on/off. `allowAddNew` enables on-the-fly value
// creation (used for the Markets field where reps can name new markets
// that aren't in the tenant suggestion list).

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, X, Plus } from 'lucide-react'

export interface SearchableMultiSelectOption {
  value: string
  label?: string
}

export function SearchableMultiSelect({
  values,
  options,
  onChange,
  placeholder,
  allowAddNew,
  disabled,
  className,
}: {
  values: string[]
  options: Array<string | SearchableMultiSelectOption>
  onChange: (next: string[]) => void
  placeholder?: string
  allowAddNew?: boolean
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

  const filtered = search
    ? normalized.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : normalized

  const trimmed = search.trim()
  const exactExists = normalized.some(o => o.label.toLowerCase() === trimmed.toLowerCase())
                  || values.some(v => v.toLowerCase() === trimmed.toLowerCase())
  const canAddNew = !!allowAddNew && trimmed.length > 0 && !exactExists

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

  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter(x => x !== v))
    else onChange([...values, v])
    setSearch('')
    inputRef.current?.focus()
  }

  function addNew() {
    if (!trimmed || exactExists) return
    onChange([...values, trimmed])
    setSearch('')
    inputRef.current?.focus()
  }

  function removeChip(v: string) {
    onChange(values.filter(x => x !== v))
  }

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 text-[10px] font-medium bg-gunner-red text-white px-2 py-0.5 rounded-full"
            >
              {v}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeChip(v)}
                  className="hover:bg-white/20 rounded-full p-0.5"
                  aria-label={`Remove ${v}`}
                >
                  <X size={9} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); if (!open) setOpen(true) }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setSearch('') }
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered.length > 0) toggle(filtered[0].value)
              else if (canAddNew) addNew()
            }
            if (e.key === 'Backspace' && !search && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          placeholder={placeholder ?? 'Search or pick…'}
          disabled={disabled}
          className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 pr-7 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20 disabled:opacity-50"
        />
        <ChevronDown size={11} className={`absolute right-2 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (filtered.length > 0 || canAddNew) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] shadow-lg max-h-44 overflow-y-auto">
          {filtered.map(o => {
            const selected = values.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-secondary transition-colors flex items-center justify-between ${
                  selected ? 'bg-gunner-red-light text-txt-primary font-semibold' : 'text-txt-secondary'
                }`}
              >
                <span>{o.label}</span>
                {selected && <Check size={10} className="text-gunner-red" />}
              </button>
            )
          })}
          {canAddNew && (
            <button
              type="button"
              onClick={addNew}
              className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-secondary transition-colors flex items-center gap-1.5 text-semantic-blue font-medium border-t border-[rgba(0,0,0,0.05)]"
            >
              <Plus size={10} />
              Add &quot;{trimmed}&quot;
            </button>
          )}
        </div>
      )}
      {open && filtered.length === 0 && !canAddNew && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] shadow-lg p-2">
          <p className="text-[10px] text-txt-muted italic text-center">No matches</p>
        </div>
      )}
    </div>
  )
}
