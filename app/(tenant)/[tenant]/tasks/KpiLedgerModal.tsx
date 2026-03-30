'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Search, Loader2, MapPin, X, Check } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import Link from 'next/link'

interface MilestoneEntry {
  id: string; type: string; source: string; notes: string | null
  time: string; propertyId: string; propertyAddress: string; userName: string
}

// Milestone types that come from PropertyMilestone table
const MILESTONE_KEYS = ['lead', 'apts', 'offers', 'contracts', 'pushed', 'dispoOffers', 'dispoContracts']

// Map ledger keys → milestone type for API queries
const KEY_TO_MILESTONE_TYPE: Record<string, string> = {
  lead: 'LEAD', apts: 'APPOINTMENT_SET', offers: 'OFFER_MADE',
  contracts: 'UNDER_CONTRACT', pushed: 'DISPO_PUSHED',
  dispoOffers: 'DISPO_OFFER_RECEIVED', dispoContracts: 'DISPO_CONTRACTED',
}

const TYPE_LABELS: Record<string, string> = {
  calls: 'Calls', convos: 'Conversations', lead: 'Leads',
  apts: 'Appointments Set', offers: 'Offers Made', contracts: 'Contracts',
  pushed: 'Pushed Out', dispoOffers: 'Dispo Offers', dispoContracts: 'Dispo Contracted',
}

// Source colors: purple = API/webhook, blue = AI, green = manual/edited
const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  AUTO_WEBHOOK: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'API' },
  AI: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'AI' },
  MANUAL: { bg: 'bg-green-100', text: 'text-green-700', label: 'Manual' },
}

export function KpiLedgerModal({ type, isOpen, onClose, tenantSlug }: {
  type: string | null; isOpen: boolean; onClose: () => void; tenantSlug: string
}) {
  const [date, setDate] = useState(new Date())
  const [entries, setEntries] = useState<MilestoneEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  // Add form
  const [notes, setNotes] = useState('')
  const [propSearch, setPropSearch] = useState('')
  const [propResults, setPropResults] = useState<Array<{ id: string; address: string; city: string; state: string }>>([])
  const [selectedProp, setSelectedProp] = useState<{ id: string; address: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate] = useState('')

  const dateStr = format(date, 'yyyy-MM-dd')
  const isMilestoneType = type ? MILESTONE_KEYS.includes(type) : false

  useEffect(() => {
    if (!isOpen || !type) return
    loadEntries()
  }, [isOpen, type, dateStr])

  async function loadEntries() {
    if (!type) return
    setLoading(true)
    try {
      if (isMilestoneType) {
        // Fetch from milestones API
        const milestoneType = KEY_TO_MILESTONE_TYPE[type]
        const res = await fetch(`/api/milestones?type=${milestoneType}&date=${dateStr}`)
        const data = await res.json()
        setEntries(data.milestones ?? [])
      } else {
        // Calls/convos: fetch from old kpi-entries API
        const res = await fetch(`/api/kpi-entries?type=${type}&date=${dateStr}`)
        const data = await res.json()
        setEntries((data.entries ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          type: e.type as string,
          source: (e.source as string) ?? 'MANUAL',
          notes: e.notes as string | null,
          time: e.time as string,
          propertyId: e.propertyId as string,
          propertyAddress: e.propertyAddress as string,
          userName: e.userName as string,
        })))
      }
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
    if (!type || !selectedProp || !isMilestoneType) return
    setSaving(true)
    try {
      const milestoneType = KEY_TO_MILESTONE_TYPE[type]
      const res = await fetch('/api/milestones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedProp.id,
          type: milestoneType,
          notes: notes || undefined,
          date: dateStr !== format(new Date(), 'yyyy-MM-dd') ? dateStr : undefined,
        }),
      })
      if (res.ok) {
        setNotes(''); setSelectedProp(null); setPropSearch(''); setShowAdd(false)
        loadEntries() // refresh
      }
    } catch {}
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    if (!isMilestoneType) {
      // Old kpi-entries delete
      try {
        await fetch('/api/kpi-entries', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        setEntries(prev => prev.filter(e => e.id !== id))
      } catch {}
      return
    }
    try {
      await fetch('/api/milestones', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {}
  }

  async function saveEdit(id: string) {
    try {
      await fetch('/api/milestones', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          notes: editNotes || undefined,
          date: editDate || undefined,
        }),
      })
      setEditingId(null)
      loadEntries() // refresh to show green source
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
          {isMilestoneType && (
            <button onClick={() => setShowAdd(!showAdd)}
              className="bg-gunner-red text-white rounded-[10px] px-3 py-1.5 text-sm flex items-center gap-1.5 hover:bg-gunner-red-dark transition-colors">
              <Plus size={12} /> Add
            </button>
          )}
        </div>

        {/* Add form */}
        {showAdd && isMilestoneType && (
          <div className="px-6 py-3 border-t border-b border-[rgba(0,0,0,0.06)] space-y-2">
            {/* Property search */}
            {!selectedProp ? (
              <div>
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                  <input value={propSearch} onChange={e => searchProperties(e.target.value)}
                    placeholder="Search property address..."
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

            <button onClick={addEntry} disabled={saving || !selectedProp}
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
              {isMilestoneType && <p className="text-[10px] text-txt-muted mt-1">Click Add to record one</p>}
            </div>
          ) : (
            entries.map(e => {
              const sourceStyle = SOURCE_COLORS[e.source] ?? SOURCE_COLORS.MANUAL
              const isEditing = editingId === e.id

              return (
                <div key={e.id} className="border-b border-[rgba(0,0,0,0.04)] py-2.5">
                  {isEditing ? (
                    /* Edit mode */
                    <div className="space-y-1.5">
                      <input
                        type="date"
                        value={editDate}
                        onChange={ev => setEditDate(ev.target.value)}
                        className="w-full bg-surface-secondary rounded-[8px] px-3 py-1.5 text-ds-fine focus:outline-none"
                      />
                      <input
                        value={editNotes}
                        onChange={ev => setEditNotes(ev.target.value)}
                        placeholder="Notes"
                        className="w-full bg-surface-secondary rounded-[8px] px-3 py-1.5 text-ds-fine placeholder-txt-muted focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(e.id)}
                          className="text-[11px] font-medium text-white bg-gunner-red hover:bg-gunner-red-dark px-3 py-1 rounded-[8px] flex items-center gap-1">
                          <Check size={10} /> Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="text-[11px] text-txt-muted hover:text-txt-primary px-3 py-1">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-center gap-3">
                      {/* Source badge */}
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${sourceStyle.bg} ${sourceStyle.text}`}>
                        {sourceStyle.label}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {e.propertyAddress && (
                          <Link href={`/${tenantSlug}/inventory/${e.propertyId}`}
                            className="text-[11px] text-txt-primary hover:text-gunner-red flex items-center gap-0.5 truncate font-medium">
                            <MapPin size={8} className="shrink-0" /> {e.propertyAddress}
                          </Link>
                        )}
                        {e.notes && <p className="text-[10px] text-txt-muted truncate">{e.notes}</p>}
                        <p className="text-[9px] text-txt-muted">{e.userName} · {format(new Date(e.time), 'h:mm a')}</p>
                      </div>

                      {/* Edit + Delete buttons (milestone types only) */}
                      {isMilestoneType && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => {
                            setEditingId(e.id)
                            setEditNotes(e.notes ?? '')
                            setEditDate(format(new Date(e.time), 'yyyy-MM-dd'))
                          }}
                            className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 w-6 h-6 rounded flex items-center justify-center transition-colors">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteEntry(e.id)}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 w-6 h-6 rounded flex items-center justify-center transition-colors">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer spacer */}
        <div className="h-3 shrink-0" />
      </div>
    </div>
  )
}
