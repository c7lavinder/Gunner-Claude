'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Minus, Search, Loader2, Clock, MapPin, X } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import Link from 'next/link'

interface LedgerEntry {
  id: string; type: string; time: string; contactName: string | null
  propertyId: string | null; propertyAddress: string | null
  notes: string | null; source: string; userName: string
}

const TYPE_LABELS: Record<string, string> = {
  calls: 'Calls', convos: 'Conversations', apts: 'Appointments', offers: 'Offers', contracts: 'Contracts',
}

export function KpiLedgerModal({ type, isOpen, onClose, tenantSlug }: {
  type: string | null; isOpen: boolean; onClose: () => void; tenantSlug: string
}) {
  const [date, setDate] = useState(new Date())
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  // Add form
  const [contactName, setContactName] = useState('')
  const [notes, setNotes] = useState('')
  const [propSearch, setPropSearch] = useState('')
  const [propResults, setPropResults] = useState<Array<{ id: string; address: string; city: string; state: string }>>([])
  const [selectedProp, setSelectedProp] = useState<{ id: string; address: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)

  const dateStr = format(date, 'yyyy-MM-dd')

  useEffect(() => {
    if (!isOpen || !type) return
    loadEntries()
  }, [isOpen, type, dateStr])

  async function loadEntries() {
    setLoading(true)
    try {
      const res = await fetch(`/api/kpi-entries?type=${type}&date=${dateStr}`)
      const data = await res.json()
      setEntries(data.entries ?? [])
    } catch {}
    setLoading(false)
  }

  async function searchProperties(q: string) {
    setPropSearch(q)
    if (q.length < 2) { setPropResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/properties/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setPropResults(data.properties ?? [])
    } catch { setPropResults([]) }
    setSearching(false)
  }

  async function addEntry() {
    if (!type) return
    setSaving(true)
    try {
      const res = await fetch('/api/kpi-entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          contactName: contactName || null,
          propertyId: selectedProp?.id ?? null,
          propertyAddress: selectedProp?.address ?? null,
          notes: notes || null,
          time: new Date().toISOString(),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(prev => [data.entry, ...prev])
        setContactName(''); setNotes(''); setSelectedProp(null); setPropSearch(''); setShowAdd(false)
      }
    } catch {}
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    try {
      await fetch('/api/kpi-entries', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {}
  }

  if (!isOpen || !type) return null

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-[440px] w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-ds-label font-semibold text-txt-primary">{TYPE_LABELS[type] ?? type}</h3>
            <button onClick={onClose} className="text-txt-muted hover:text-txt-primary text-lg">&times;</button>
          </div>

          {/* Date navigation */}
          <div className="flex items-center justify-between">
            <button onClick={() => setDate(d => subDays(d, 1))}
              className="w-8 h-8 rounded-full border border-[rgba(0,0,0,0.12)] flex items-center justify-center text-txt-muted hover:text-txt-primary transition-colors">
              <ChevronLeft size={14} />
            </button>
            <p className="text-ds-body font-medium text-txt-primary">{format(date, 'EEEE, MMM d, yyyy')}</p>
            <button onClick={() => setDate(d => addDays(d, 1))}
              className="w-8 h-8 rounded-full border border-[rgba(0,0,0,0.12)] flex items-center justify-center text-txt-muted hover:text-txt-primary transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Section header */}
        <div className="px-6 py-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-wider uppercase text-txt-muted">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
          <button onClick={() => setShowAdd(!showAdd)}
            className="bg-gunner-red text-white rounded-[10px] px-3 py-1.5 text-sm flex items-center gap-1.5 hover:bg-gunner-red-dark transition-colors">
            <Plus size={12} /> Add
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-6 py-3 border-t border-b border-[rgba(0,0,0,0.06)] space-y-2">
            <input value={contactName} onChange={e => setContactName(e.target.value)}
              placeholder="Contact name (optional)"
              className="w-full bg-surface-secondary rounded-[8px] px-3 py-1.5 text-ds-fine placeholder-txt-muted focus:outline-none" />

            {/* Property search */}
            {!selectedProp ? (
              <div>
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                  <input value={propSearch} onChange={e => searchProperties(e.target.value)}
                    placeholder="Link to property (search address)..."
                    className="w-full bg-surface-secondary rounded-[8px] pl-8 pr-3 py-1.5 text-ds-fine placeholder-txt-muted focus:outline-none" />
                </div>
                {searching && <p className="text-[10px] text-txt-muted mt-1">Searching...</p>}
                {propResults.length > 0 && (
                  <div className="mt-1 bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] max-h-28 overflow-y-auto">
                    {propResults.map(p => (
                      <button key={p.id} onClick={() => { setSelectedProp({ id: p.id, address: p.address }); setPropSearch(''); setPropResults([]) }}
                        className="w-full text-left px-3 py-1.5 text-ds-fine hover:bg-surface-secondary transition-colors">
                        <span className="font-medium">{p.address}</span>
                        <span className="text-txt-muted"> · {p.city}, {p.state}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-surface-secondary rounded-[8px] px-3 py-1.5">
                <MapPin size={10} className="text-gunner-red shrink-0" />
                <span className="text-ds-fine font-medium text-txt-primary flex-1">{selectedProp.address}</span>
                <button onClick={() => setSelectedProp(null)} className="text-txt-muted hover:text-semantic-red"><X size={12} /></button>
              </div>
            )}

            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full bg-surface-secondary rounded-[8px] px-3 py-1.5 text-ds-fine placeholder-txt-muted focus:outline-none" />

            <button onClick={addEntry} disabled={saving}
              className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-[10px] transition-colors">
              {saving ? 'Adding...' : 'Add Entry'}
            </button>
          </div>
        )}

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto px-6">
          {loading ? (
            <div className="py-8 text-center"><Loader2 size={14} className="animate-spin text-txt-muted mx-auto" /></div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-ds-fine text-txt-muted">No entries for this day</p>
              <p className="text-[10px] text-txt-muted mt-1">Click Add to record one</p>
            </div>
          ) : (
            entries.map(e => (
              <div key={e.id} className="border-b border-[rgba(0,0,0,0.04)] py-2.5 flex items-center gap-3">
                {/* Time */}
                <span className="text-xs text-txt-muted font-mono w-14 shrink-0">
                  {format(new Date(e.time), 'h:mm a')}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {e.contactName && <p className="text-ds-fine font-medium text-txt-primary truncate">{e.contactName}</p>}
                  {e.propertyAddress && (
                    <Link href={`/${tenantSlug}/inventory/${e.propertyId}`}
                      className="text-[10px] text-semantic-blue hover:underline flex items-center gap-0.5 truncate">
                      <MapPin size={8} /> {e.propertyAddress}
                    </Link>
                  )}
                  {e.notes && <p className="text-[10px] text-txt-muted truncate">{e.notes}</p>}
                  {!e.contactName && !e.propertyAddress && !e.notes && (
                    <p className="text-ds-fine text-txt-muted">Entry by {e.userName}</p>
                  )}
                </div>

                {/* Source badge */}
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">{e.source}</span>

                {/* Delete */}
                <button onClick={() => deleteEntry(e.id)}
                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors">
                  <Minus size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer spacer */}
        <div className="h-3 shrink-0" />
      </div>
    </div>
  )
}
