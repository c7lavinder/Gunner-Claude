'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Search, Loader2, MapPin, X, Check } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import Link from 'next/link'

interface MilestoneEntry {
  id: string; type: string; source: string; notes: string | null
  time: string; propertyId: string; propertyAddress: string; userName: string
  contactName?: string; duration?: number
}

interface TeamMember { id: string; name: string }

// Milestone types that come from PropertyMilestone table
const MILESTONE_KEYS = ['lead', 'apts', 'offers', 'contracts', 'pushed', 'dispoOffers', 'dispoContracts']

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
  call: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'API' },
}

export function KpiLedgerModal({ type, isOpen, onClose, tenantSlug }: {
  type: string | null; isOpen: boolean; onClose: () => void; tenantSlug: string
}) {
  const [date, setDate] = useState(new Date())
  const [entries, setEntries] = useState<MilestoneEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Add form
  const [notes, setNotes] = useState('')
  const [propSearch, setPropSearch] = useState('')
  const [propResults, setPropResults] = useState<Array<{ id: string; address: string; city: string; state: string }>>([])
  const [selectedProp, setSelectedProp] = useState<{ id: string; address: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)

  // Search entries
  const [entrySearch, setEntrySearch] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editUserId, setEditUserId] = useState('')
  const [editPropSearch, setEditPropSearch] = useState('')
  const [editPropResults, setEditPropResults] = useState<Array<{ id: string; address: string; city: string; state: string }>>([])
  const [editSelectedProp, setEditSelectedProp] = useState<{ id: string; address: string } | null>(null)

  const dateStr = format(date, 'yyyy-MM-dd')
  const isMilestoneType = type ? MILESTONE_KEYS.includes(type) : false

  // Load team members once (for edit user dropdown)
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/milestones?members=1')
      .then(r => r.json())
      .then(data => {
        if (data.members) setTeamMembers(data.members)
      })
      .catch(() => {})
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !type) return
    loadEntries()
  }, [isOpen, type, dateStr])

  async function loadEntries() {
    if (!type) return
    setLoading(true)
    try {
      if (isMilestoneType) {
        const milestoneType = KEY_TO_MILESTONE_TYPE[type]
        const res = await fetch(`/api/milestones?type=${milestoneType}&date=${dateStr}`)
        const data = await res.json()
        setEntries(data.milestones ?? [])
      } else if (type === 'calls' || type === 'convos') {
        // Fetch real call records
        const res = await fetch(`/api/calls/ledger?type=${type}&date=${dateStr}`)
        const data = await res.json()
        setEntries((data.entries ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string, type: type,
          source: 'call',
          notes: e.score != null ? `Score: ${e.score} · ${e.callType ?? ''}` : (e.status as string) ?? null,
          time: e.time as string,
          propertyId: (e.propertyId as string) ?? '',
          propertyAddress: (e.propertyAddress as string) ?? '',
          userName: e.userName as string,
          contactName: e.contactName as string,
          duration: e.duration as number,
        })))
      } else {
        const res = await fetch(`/api/kpi-entries?type=${type}&date=${dateStr}`)
        const data = await res.json()
        setEntries((data.entries ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string, type: e.type as string,
          source: (e.source as string) ?? 'MANUAL',
          notes: e.notes as string | null, time: e.time as string,
          propertyId: (e.propertyId as string) ?? '', propertyAddress: (e.propertyAddress as string) ?? '',
          userName: e.userName as string,
        })))
      }
    } catch {}
    setLoading(false)
  }

  async function searchProperties(q: string, mode: 'add' | 'edit') {
    if (mode === 'add') setPropSearch(q)
    else setEditPropSearch(q)
    if (q.length < 2) { if (mode === 'add') setPropResults([]); else setEditPropResults([]); return }
    if (mode === 'add') setSearching(true)
    try {
      const res = await fetch(`/api/properties/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (mode === 'add') setPropResults(data.properties ?? [])
      else setEditPropResults(data.properties ?? [])
    } catch {
      if (mode === 'add') setPropResults([])
      else setEditPropResults([])
    }
    if (mode === 'add') setSearching(false)
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
        loadEntries()
      }
    } catch {}
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    if (!isMilestoneType) {
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
          propertyId: editSelectedProp?.id || undefined,
          loggedById: editUserId || undefined,
        }),
      })
      setEditingId(null)
      loadEntries()
    } catch {}
  }

  function startEdit(e: MilestoneEntry) {
    setEditingId(e.id)
    setEditNotes(e.notes ?? '')
    setEditDate(format(new Date(e.time), 'yyyy-MM-dd'))
    setEditUserId('')
    setEditSelectedProp(null)
    setEditPropSearch('')
    setEditPropResults([])
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  if (!isOpen || !type) return null

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose} onWheel={e => e.stopPropagation()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-[480px] w-full mx-4 h-[640px] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-ds-label font-semibold text-txt-primary">{TYPE_LABELS[type] ?? type}</h3>
            <button onClick={onClose} className="text-txt-muted hover:text-txt-primary text-lg">&times;</button>
          </div>
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
            {!selectedProp ? (
              <div>
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                  <input value={propSearch} onChange={e => searchProperties(e.target.value, 'add')}
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

        {/* Search bar */}
        {entries.length > 0 && (
          <div className="px-6 pb-2">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                value={entrySearch}
                onChange={e => setEntrySearch(e.target.value)}
                placeholder="Search entries..."
                className="w-full bg-surface-secondary rounded-[8px] pl-8 pr-3 py-1.5 text-ds-fine placeholder-txt-muted focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Entries list — flexes to fill remaining space so modal height stays stable when AddEntry/search appear */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          {loading ? (
            <div className="py-8 text-center"><Loader2 size={14} className="animate-spin text-txt-muted mx-auto" /></div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-ds-fine text-txt-muted">No entries for this day</p>
              {isMilestoneType && <p className="text-[10px] text-txt-muted mt-1">Click Add to record one</p>}
            </div>
          ) : (
            (entrySearch
              ? entries.filter(e =>
                  (e.propertyAddress ?? '').toLowerCase().includes(entrySearch.toLowerCase()) ||
                  (e.userName ?? '').toLowerCase().includes(entrySearch.toLowerCase()) ||
                  (e.notes ?? '').toLowerCase().includes(entrySearch.toLowerCase()) ||
                  (e.contactName ?? '').toLowerCase().includes(entrySearch.toLowerCase())
                )
              : entries
            ).map(e => {
              const isCallEntry = e.source === 'call'
              const sourceStyle = SOURCE_COLORS[e.source] ?? SOURCE_COLORS.MANUAL
              const isEditing = editingId === e.id

              return (
                <div key={e.id} className="border-b border-[rgba(0,0,0,0.04)] py-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      {/* Edit: Property */}
                      <div>
                        <label className="text-[9px] font-semibold text-txt-muted uppercase">Property</label>
                        {!editSelectedProp ? (
                          <div>
                            <p className="text-[10px] text-txt-secondary mb-1">Current: {e.propertyAddress}</p>
                            <div className="relative">
                              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt-muted" />
                              <input value={editPropSearch} onChange={ev => searchProperties(ev.target.value, 'edit')}
                                placeholder="Change property..."
                                className="w-full bg-surface-secondary rounded-[8px] pl-7 pr-3 py-1 text-[11px] placeholder-txt-muted focus:outline-none" />
                            </div>
                            {editPropResults.length > 0 && (
                              <div className="mt-1 bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] max-h-24 overflow-y-auto">
                                {editPropResults.map(p => (
                                  <button key={p.id} onClick={() => { setEditSelectedProp({ id: p.id, address: p.address }); setEditPropSearch(''); setEditPropResults([]) }}
                                    className="w-full text-left px-3 py-1 text-[11px] hover:bg-surface-secondary">
                                    {p.address}, {p.city} {p.state}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-green-50 rounded-[8px] px-3 py-1">
                            <MapPin size={9} className="text-green-600 shrink-0" />
                            <span className="text-[11px] font-medium text-green-700 flex-1">{editSelectedProp.address}</span>
                            <button onClick={() => setEditSelectedProp(null)} className="text-green-400 hover:text-red-500"><X size={10} /></button>
                          </div>
                        )}
                      </div>

                      {/* Edit: User */}
                      <div>
                        <label className="text-[9px] font-semibold text-txt-muted uppercase">Assigned To</label>
                        <p className="text-[10px] text-txt-secondary mb-1">Current: {e.userName}</p>
                        <select value={editUserId} onChange={ev => setEditUserId(ev.target.value)}
                          className="w-full bg-surface-secondary rounded-[8px] px-3 py-1 text-[11px] focus:outline-none">
                          <option value="">Keep current</option>
                          {teamMembers.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Edit: Date */}
                      <div>
                        <label className="text-[9px] font-semibold text-txt-muted uppercase">Date</label>
                        <input type="date" value={editDate} onChange={ev => setEditDate(ev.target.value)}
                          className="w-full bg-surface-secondary rounded-[8px] px-3 py-1 text-[11px] focus:outline-none" />
                      </div>

                      {/* Edit: Notes */}
                      <div>
                        <label className="text-[9px] font-semibold text-txt-muted uppercase">Notes</label>
                        <input value={editNotes} onChange={ev => setEditNotes(ev.target.value)}
                          placeholder="Notes"
                          className="w-full bg-surface-secondary rounded-[8px] px-3 py-1 text-[11px] placeholder-txt-muted focus:outline-none" />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveEdit(e.id)}
                          className="text-[11px] font-medium text-white bg-gunner-red hover:bg-gunner-red-dark px-3 py-1.5 rounded-[8px] flex items-center gap-1">
                          <Check size={10} /> Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="text-[11px] text-txt-muted hover:text-txt-primary px-3 py-1.5">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {/* Source badge — always shows API/AI/Manual */}
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${sourceStyle.bg} ${sourceStyle.text}`}>
                        {sourceStyle.label}
                      </span>
                      {/* Duration badge for calls */}
                      {isCallEntry && (e.duration ?? 0) > 0 && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 bg-gray-100 text-gray-500">
                          {Math.floor((e.duration ?? 0) / 60)}m{String((e.duration ?? 0) % 60).padStart(2, '0')}s
                        </span>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {isCallEntry && e.contactName && (
                          <p className="text-[11px] font-medium text-txt-primary truncate">{e.contactName}</p>
                        )}
                        {e.propertyAddress && (
                          <Link href={isCallEntry ? `/${tenantSlug}/calls/${e.id}` : `/${tenantSlug}/inventory/${e.propertyId}`}
                            className={`text-[${isCallEntry ? '10' : '11'}px] ${isCallEntry ? 'text-txt-muted' : 'text-txt-primary hover:text-gunner-red font-medium'} flex items-center gap-0.5 truncate`}>
                            <MapPin size={8} className="shrink-0" /> {e.propertyAddress}
                          </Link>
                        )}
                        {e.notes && <p className="text-[10px] text-txt-muted truncate">{e.notes}</p>}
                        <p className="text-[9px] text-txt-muted">{e.userName} · {format(new Date(e.time), 'h:mm a')}</p>
                      </div>

                      {/* Edit + Delete (milestone types only) */}
                      {isMilestoneType && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => startEdit(e)}
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

        <div className="h-3 shrink-0" />
      </div>
    </div>
  )
}
