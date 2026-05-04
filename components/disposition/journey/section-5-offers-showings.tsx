'use client'
// components/disposition/journey/section-5-offers-showings.tsx
// Section 5 of the Disposition Journey: Offers & Showings.
// Lifted from the prior OutreachTab in property-detail-client.tsx —
// "offer" and "showing" sub-tabs only. The "send" sub-tab is dropped per
// plan; that work lives in Section 2 (Generate blast).
//
// Logged offers (amount, status: pending / accepted / countered / rejected),
// scheduled showings (date, status: scheduled / completed / no-show).
// Status = In progress while live offers exist; Done when one is accepted —
// property moves to UNDER_CONTRACT.

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import {
  X, Plus, Send, DollarSign, Clock, User, Loader2, Pencil,
} from 'lucide-react'
import { useToast } from '@/components/ui/toaster'
import { titleCase } from '@/lib/format'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'

const TZ_ABBR = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''

const OFFER_STATUSES = ['Pending', 'Accepted', 'Rejected', 'Countered', 'Expired']
const SHOWING_STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'No Show']
const OFFER_STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-700', Accepted: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700', Countered: 'bg-purple-100 text-purple-700',
  Expired: 'bg-gray-100 text-gray-500',
}
const SHOWING_STATUS_COLORS: Record<string, string> = {
  Scheduled: 'bg-blue-100 text-blue-700', Completed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700', 'No Show': 'bg-amber-100 text-amber-700',
}
const LOG_TYPE_ICONS: Record<string, { icon: typeof Send; bg: string }> = {
  send: { icon: Send, bg: 'bg-purple-500' },
  offer: { icon: DollarSign, bg: 'bg-green-500' },
  showing: { icon: Clock, bg: 'bg-blue-500' },
}

type SubTab = 'offer' | 'showing'

export function Section5OffersShowings({ property }: { property: PropertyDetail }) {
  const { toast } = useToast()
  const [subTab, setSubTab] = useState<SubTab>('offer')
  const [logs, setLogs] = useState<Array<{
    id: string; type: string; channel: string; recipientName: string; recipientContact: string
    ghlContactId: string | null; notes: string | null; offerAmount: number | null
    offerStatus: string | null; showingDate: string | null; showingStatus: string | null
    source: string; loggedAt: string; loggedByName: string
  }>>([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formType, setFormType] = useState<SubTab>('offer')

  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<Array<{ id: string; name: string; phone: string | null; email: string | null }>>([])
  const [contactSearching, setContactSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string; phone: string | null; email: string | null } | null>(null)

  const [notes, setNotes] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [showingDate, setShowingDate] = useState('')
  const [showingTime, setShowingTime] = useState('')

  useEffect(() => {
    fetch(`/api/properties/${property.id}/outreach`).then(r => r.json()).then(d => { setLogs(d.logs ?? []); setLoaded(true) }).catch(() => setLoaded(true))
  }, [property.id])

  const filtered = logs.filter(l => l.type === subTab)
  const counts = { offer: logs.filter(l => l.type === 'offer').length, showing: logs.filter(l => l.type === 'showing').length }

  async function searchGhlContacts(q: string) {
    setContactQuery(q)
    if (q.length < 2) { setContactResults([]); return }
    setContactSearching(true)
    try {
      const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setContactResults(data.contacts ?? [])
    } catch { setContactResults([]) }
    setContactSearching(false)
  }

  function resetForm() {
    setSelectedContact(null)
    setContactQuery('')
    setContactResults([])
    setNotes('')
    setOfferAmount('')
    setShowingDate('')
    setShowingTime('')
    setShowForm(false)
  }

  async function saveLog() {
    if (!selectedContact) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        type: formType,
        recipientName: selectedContact.name,
        recipientContact: selectedContact.phone ?? selectedContact.email ?? '',
        ghlContactId: selectedContact.id,
        notes: notes || null,
      }
      if (formType === 'offer') {
        payload.channel = 'offer'
        payload.offerAmount = offerAmount || null
      }
      if (formType === 'showing') {
        payload.channel = 'in_person'
        if (showingDate) {
          const dt = new Date(`${showingDate}T${showingTime || '09:00'}:00`)
          payload.showingDate = dt.toISOString()
        }
      }

      const saveRes = await fetch(`/api/properties/${property.id}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!saveRes.ok) { toast('Failed to save', 'error'); setSaving(false); return }
      toast('Logged successfully', 'success')
      const res = await fetch(`/api/properties/${property.id}/outreach`)
      const d = await res.json()
      setLogs(d.logs ?? [])
      resetForm()
    } catch { toast('Failed to save', 'error') }
    setSaving(false)
  }

  async function refreshLogs() {
    const res = await fetch(`/api/properties/${property.id}/outreach`)
    const d = await res.json()
    setLogs(d.logs ?? [])
  }

  const typeIcons: Record<SubTab, typeof Send> = { offer: DollarSign, showing: Clock }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {(['offer', 'showing'] as const).map(t => (
            <button key={t} onClick={() => { setSubTab(t); setShowForm(false) }}
              className={`px-3 py-1 text-[10px] font-semibold rounded-full transition-all capitalize ${
                subTab === t
                  ? 'bg-gunner-red text-white shadow-sm'
                  : 'bg-surface-secondary text-txt-muted hover:text-txt-secondary hover:bg-surface-tertiary'
              }`}>
              {`${t}s`} ({counts[t]})
            </button>
          ))}
        </div>
        <button onClick={() => { setShowForm(!showForm); if (showForm) resetForm() }}
          className={`flex items-center gap-1 text-[10px] font-semibold px-3 py-1.5 rounded-[8px] transition-colors ${
            showForm ? 'bg-surface-secondary text-txt-secondary hover:bg-surface-tertiary' : 'bg-gunner-red text-white hover:bg-gunner-red-dark'
          }`}>
          {showForm ? <X size={10} /> : <Plus size={10} />}
          {showForm ? 'Cancel' : 'Log Activity'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] p-4 space-y-3 shadow-sm">
          <div>
            <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Type</label>
            <div className="flex gap-2">
              {(['offer', 'showing'] as const).map(t => {
                const Icon = typeIcons[t]
                return (
                  <button key={t} onClick={() => setFormType(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold rounded-[8px] border-[0.5px] transition-all capitalize ${
                      formType === t ? 'border-gunner-red bg-gunner-red-light text-gunner-red' : 'border-[rgba(0,0,0,0.08)] bg-surface-secondary text-txt-muted hover:text-txt-secondary'
                    }`}>
                    <Icon size={10} /> {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Contact</label>
            {!selectedContact ? (
              <div>
                <input autoFocus value={contactQuery} onChange={e => { setContactQuery(e.target.value); searchGhlContacts(e.target.value) }}
                  placeholder="Search GHL contacts..."
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-ds-fine placeholder-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20" />
                {contactSearching && <p className="text-[10px] text-txt-muted mt-1.5">Searching...</p>}
                {contactResults.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-1 mt-1.5 bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] p-1">
                    {contactResults.map(c => (
                      <button key={c.id} onClick={() => { setSelectedContact(c); setContactQuery(''); setContactResults([]) }}
                        className="w-full text-left px-3 py-2 rounded-[6px] hover:bg-surface-secondary text-ds-fine transition-colors">
                        <p className="font-medium text-txt-primary">{c.name}</p>
                        <p className="text-txt-muted text-[10px]">{c.phone ?? c.email ?? '—'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-surface-secondary rounded-[8px] px-3 py-2 border-[0.5px] border-[rgba(0,0,0,0.06)]">
                <div className="w-6 h-6 rounded-full bg-gunner-red flex items-center justify-center shrink-0">
                  <User size={10} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-ds-fine font-semibold text-txt-primary">{selectedContact.name}</p>
                  <p className="text-[10px] text-txt-muted">{selectedContact.phone ?? selectedContact.email ?? '—'}</p>
                </div>
                <button onClick={() => setSelectedContact(null)} className="text-txt-muted hover:text-semantic-red transition-colors"><X size={14} /></button>
              </div>
            )}
          </div>

          {formType === 'offer' && (
            <div>
              <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Offer Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-fine text-txt-muted">$</span>
                <input type="number" value={offerAmount} onChange={e => setOfferAmount(e.target.value)}
                  placeholder="150,000"
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] pl-7 pr-3 py-2 text-ds-fine font-semibold placeholder-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20" />
              </div>
            </div>
          )}

          {formType === 'showing' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Date</label>
                <input type="date" value={showingDate} onChange={e => setShowingDate(e.target.value)}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20" />
              </div>
              <div>
                <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Time</label>
                <input type="time" value={showingTime} onChange={e => setShowingTime(e.target.value)}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional details..." rows={2}
              className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-ds-fine resize-none placeholder-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20" />
          </div>

          <button onClick={saveLog} disabled={!selectedContact || saving}
            className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2.5 rounded-[8px] transition-colors">
            {saving ? 'Saving...' : `Log ${formType === 'offer' ? 'Offer' : 'Showing'}`}
          </button>
        </div>
      )}

      {!loaded ? (
        <div className="py-8 text-center"><Loader2 size={16} className="animate-spin text-txt-muted mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-secondary rounded-[12px] p-8 text-center">
          <Send size={20} className="text-txt-muted mx-auto mb-2 opacity-40" />
          <p className="text-ds-body text-txt-muted">No {subTab} activity yet</p>
          <p className="text-[10px] text-txt-muted mt-1">Click &ldquo;Log Activity&rdquo; to record outreach</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(l => (
            <OutreachLogCard key={l.id} log={l} propertyId={property.id} onUpdated={refreshLogs} />
          ))}
        </div>
      )}
    </div>
  )
}

function OutreachLogCard({ log: l, propertyId, onUpdated }: {
  log: {
    id: string; type: string; channel: string; recipientName: string; recipientContact: string
    notes: string | null; offerAmount: number | null; offerStatus: string | null
    showingDate: string | null; showingStatus: string | null; source: string; loggedAt: string; loggedByName: string
  }
  propertyId: string
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editNotes, setEditNotes] = useState(l.notes ?? '')
  const [editAmount, setEditAmount] = useState(l.offerAmount?.toString() ?? '')
  const localShowingDate = l.showingDate ? new Date(l.showingDate) : null
  const [editDate, setEditDate] = useState(localShowingDate ? `${localShowingDate.getFullYear()}-${String(localShowingDate.getMonth() + 1).padStart(2, '0')}-${String(localShowingDate.getDate()).padStart(2, '0')}` : '')
  const [editTime, setEditTime] = useState(localShowingDate ? `${String(localShowingDate.getHours()).padStart(2, '0')}:${String(localShowingDate.getMinutes()).padStart(2, '0')}` : '')
  const [saving, setSaving] = useState(false)

  async function updateField(data: Record<string, unknown>) {
    setSaving(true)
    try {
      await fetch(`/api/properties/${propertyId}/outreach`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', logId: l.id, type: l.type, ...data }),
      })
      onUpdated()
    } catch {}
    setSaving(false)
  }

  async function saveEdits() {
    const data: Record<string, unknown> = { notes: editNotes }
    if (l.type === 'offer') data.offerAmount = editAmount
    if (l.type === 'showing' && editDate) {
      const dt = new Date(`${editDate}T${editTime || '09:00'}:00`)
      data.showingDate = dt.toISOString()
    }
    await updateField(data)
    setEditing(false)
  }

  const { icon: TypeIcon, bg: typeBg } = LOG_TYPE_ICONS[l.type] ?? LOG_TYPE_ICONS.send
  const sourceLabel = l.source === 'AI' ? 'AI' : l.source === 'Blast' ? 'Blast' : l.source === 'Auto' ? 'Auto' : 'Manual'
  const sourceColor = l.source === 'AI' ? 'bg-purple-100 text-purple-700' : l.source === 'Blast' ? 'bg-fuchsia-100 text-fuchsia-700' : l.source === 'Auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] px-3 py-3 group hover:border-[rgba(0,0,0,0.12)] transition-colors">
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${typeBg}`}>
          <TypeIcon size={12} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-ds-body font-semibold text-txt-primary">{titleCase(l.recipientName)}</p>
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${sourceColor}`}>{sourceLabel}</span>
          </div>

          {l.type === 'offer' && (
            <div className="mt-1">
              {editing ? (
                <div className="flex items-center gap-1">
                  <span className="text-ds-fine text-txt-muted">$</span>
                  <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                    className="w-28 bg-surface-secondary border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1 text-ds-fine font-semibold focus:outline-none" />
                </div>
              ) : (
                l.offerAmount && <span className="text-ds-body font-bold text-semantic-green">${l.offerAmount.toLocaleString()}</span>
              )}
            </div>
          )}

          {l.type === 'showing' && (
            <div className="mt-1">
              {editing ? (
                <div className="flex gap-1.5">
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                    className="bg-surface-secondary border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1 text-[10px] focus:outline-none" />
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                    className="bg-surface-secondary border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1 text-[10px] focus:outline-none" />
                </div>
              ) : (
                l.showingDate && (
                  <span className="text-ds-fine font-medium text-semantic-blue flex items-center gap-1">
                    <Clock size={10} /> {format(new Date(l.showingDate), 'EEE, MMM d · h:mm a')} {TZ_ABBR}
                  </span>
                )
              )}
            </div>
          )}

          {editing ? (
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
              className="w-full mt-1.5 bg-surface-secondary border-[0.5px] border-gunner-red/30 rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none resize-none" />
          ) : (
            l.notes && <p className="text-ds-fine text-txt-muted mt-1">{l.notes}</p>
          )}
        </div>

        <div className="text-right shrink-0 space-y-1.5 flex flex-col items-end">
          {l.type === 'offer' && (
            <select value={l.offerStatus ?? 'Pending'} onChange={e => updateField({ offerStatus: e.target.value, offerAmount: l.offerAmount })}
              disabled={saving}
              className={`text-[9px] font-semibold px-2.5 py-1 rounded-full border-none cursor-pointer ${OFFER_STATUS_COLORS[l.offerStatus ?? 'Pending'] ?? OFFER_STATUS_COLORS.Pending}`}>
              {OFFER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {l.type === 'showing' && (
            <select value={l.showingStatus ?? 'Scheduled'} onChange={e => updateField({ showingStatus: e.target.value })}
              disabled={saving}
              className={`text-[9px] font-semibold px-2.5 py-1 rounded-full border-none cursor-pointer ${SHOWING_STATUS_COLORS[l.showingStatus ?? 'Scheduled'] ?? SHOWING_STATUS_COLORS.Scheduled}`}>
              {SHOWING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <p className="text-[10px] text-txt-muted">{format(new Date(l.loggedAt), 'MMM d')}</p>
          <p className="text-[9px] text-txt-muted">{l.loggedByName}</p>
          {editing ? (
            <div className="flex gap-1.5">
              <button onClick={saveEdits} disabled={saving}
                className="text-[9px] font-semibold text-white bg-semantic-green hover:bg-semantic-green/90 px-2 py-0.5 rounded transition-colors">
                Save
              </button>
              <button onClick={() => setEditing(false)}
                className="text-[9px] font-medium text-txt-muted hover:text-txt-secondary transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)}
              className="text-[9px] font-medium text-txt-muted opacity-0 group-hover:opacity-100 hover:text-gunner-red transition-all">
              <Pencil size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
