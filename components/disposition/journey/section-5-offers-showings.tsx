'use client'
// components/disposition/journey/section-5-offers-showings.tsx
// Section 5 of the Disposition Journey: Activity (Showings + Offers).
//
// Session 78 — both feeds show side-by-side without the tab switch.
// Showings on the left, offers on the right. Each column has its own
// "Log" button so the rep doesn't have to flip tabs to add either type.
// Times render in Central Time so a Nashville-based team always sees
// the same wall-clock no matter where they're traveling.
//
// Status = In progress while live offers exist; Done when one is accepted —
// property moves to UNDER_CONTRACT.

import { useState, useEffect } from 'react'
import {
  X, Plus, DollarSign, Clock, User, Loader2, Pencil, Send,
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/components/ui/toaster'
import { titleCase } from '@/lib/format'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'
import { SendModal } from './send-modal'

const CT_ZONE = 'America/Chicago'
const CT_DATETIME = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
  timeZone: CT_ZONE, timeZoneName: 'short',
})
const CT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric',
  timeZone: CT_ZONE,
})

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

type LogType = 'offer' | 'showing'

interface ActivityLog {
  id: string; type: string; channel: string; recipientName: string; recipientContact: string
  ghlContactId: string | null; buyerId: string | null
  notes: string | null; offerAmount: number | null
  offerStatus: string | null; showingDate: string | null; showingStatus: string | null
  source: string; loggedAt: string; loggedByName: string
}

export function Section5OffersShowings({
  property,
  tenantSlug,
}: {
  property: PropertyDetail
  tenantSlug: string
}) {
  const { toast } = useToast()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loaded, setLoaded] = useState(false)
  const [formType, setFormType] = useState<LogType | null>(null)
  const [saving, setSaving] = useState(false)

  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<Array<{ id: string; name: string; phone: string | null; email: string | null }>>([])
  const [contactSearching, setContactSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string; phone: string | null; email: string | null } | null>(null)

  const [notes, setNotes] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [showingDate, setShowingDate] = useState('')
  const [showingTime, setShowingTime] = useState('')

  // Send-modal target — set by clicking Send on an activity card. Modal
  // mounts here (not in the card) so the card stays cheap to re-render.
  const [sendTarget, setSendTarget] = useState<{
    id: string; name: string; phone: string | null; email: string | null; tier: string
  } | null>(null)

  useEffect(() => {
    fetch(`/api/properties/${property.id}/outreach`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [property.id])

  const showings = logs.filter(l => l.type === 'showing')
  const offers = logs.filter(l => l.type === 'offer')

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
    setFormType(null)
  }

  async function saveLog() {
    if (!selectedContact || !formType) return
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
          // Date inputs return a YYYY-MM-DD string with no zone. Treat the
          // rep's chosen date+time as Central Time so the saved instant
          // matches what they typed regardless of the device's locale.
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

  return (
    <div className="space-y-3">
      {/* Inline log form — appears above the columns when the rep clicks
          either column's "Log" button. Lives outside the columns so the
          two lists stay aligned regardless of form state. */}
      {formType && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
              New {formType}
            </p>
            <button onClick={resetForm} className="text-txt-muted hover:text-txt-secondary" title="Cancel">
              <X size={14} />
            </button>
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
                <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Date (CT)</label>
                <input type="date" value={showingDate} onChange={e => setShowingDate(e.target.value)}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20" />
              </div>
              <div>
                <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Time (CT)</label>
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
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <ActivityColumn
            label="Showings"
            count={showings.length}
            icon={Clock}
            iconBg="bg-blue-500"
            logs={showings}
            propertyId={property.id}
            tenantSlug={tenantSlug}
            onLogClick={() => setFormType('showing')}
            onSendClick={setSendTarget}
            onUpdated={refreshLogs}
          />
          <ActivityColumn
            label="Offers"
            count={offers.length}
            icon={DollarSign}
            iconBg="bg-green-500"
            logs={offers}
            propertyId={property.id}
            tenantSlug={tenantSlug}
            onLogClick={() => setFormType('offer')}
            onSendClick={setSendTarget}
            onUpdated={refreshLogs}
          />
        </div>
      )}

      {sendTarget && (
        <SendModal
          propertyId={property.id}
          propertyAddress={property.address}
          tenantSlug={tenantSlug}
          buyers={[sendTarget]}
          artifacts={{
            description: (property.dispoArtifacts?.description as string | undefined),
            listingPost: (property.dispoArtifacts?.listingPost as string | undefined),
            socialPost: (property.dispoArtifacts?.socialPost as string | undefined),
          }}
          onClose={() => setSendTarget(null)}
          onSent={() => setSendTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Per-side column ─────────────────────────────────────────────────────────
function ActivityColumn({
  label, count, icon: Icon, iconBg, logs, propertyId, tenantSlug, onLogClick, onSendClick, onUpdated,
}: {
  label: string
  count: number
  icon: typeof Clock
  iconBg: string
  logs: ActivityLog[]
  propertyId: string
  tenantSlug: string
  onLogClick: () => void
  onSendClick: (target: { id: string; name: string; phone: string | null; email: string | null; tier: string }) => void
  onUpdated: () => void
}) {
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary/50 p-3 min-h-[200px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-txt-muted">{label}</span>
          <span className="text-[10px] font-medium bg-surface-tertiary text-txt-muted px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
        <button
          onClick={onLogClick}
          className="text-[9px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors"
        >
          <Plus size={10} /> Log
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white/60 rounded-lg p-6 text-center">
          <Icon size={16} className={`mx-auto mb-1 opacity-40 text-txt-muted`} />
          <p className="text-[10px] text-txt-muted">No {label.toLowerCase()} yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(l => (
            <ActivityCard
              key={l.id}
              log={l}
              propertyId={propertyId}
              tenantSlug={tenantSlug}
              iconBg={iconBg}
              onSendClick={onSendClick}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Single activity card (offer or showing) ────────────────────────────────
function ActivityCard({
  log: l, propertyId, tenantSlug, iconBg, onSendClick, onUpdated,
}: {
  log: ActivityLog
  propertyId: string
  tenantSlug: string
  iconBg: string
  onSendClick: (target: { id: string; name: string; phone: string | null; email: string | null; tier: string }) => void
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editNotes, setEditNotes] = useState(l.notes ?? '')
  const [editAmount, setEditAmount] = useState(l.offerAmount?.toString() ?? '')
  const showingInstant = l.showingDate ? new Date(l.showingDate) : null
  // Pre-populate the date/time inputs in CT so the rep edits in the same
  // wall-clock they originally entered.
  const ctDateParts = showingInstant
    ? new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: CT_ZONE,
      }).formatToParts(showingInstant)
    : []
  const ctTimeParts = showingInstant
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CT_ZONE,
      }).formatToParts(showingInstant)
    : []
  const part = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find(p => p.type === type)?.value ?? ''
  const initialDate = ctDateParts.length
    ? `${part(ctDateParts, 'year')}-${part(ctDateParts, 'month')}-${part(ctDateParts, 'day')}`
    : ''
  const initialTime = ctTimeParts.length
    ? `${part(ctTimeParts, 'hour')}:${part(ctTimeParts, 'minute')}`
    : ''
  const [editDate, setEditDate] = useState(initialDate)
  const [editTime, setEditTime] = useState(initialTime)
  const [saving, setSaving] = useState(false)

  const Icon = l.type === 'offer' ? DollarSign : Clock

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

  const sourceLabel = l.source === 'AI' ? 'AI' : l.source === 'Blast' ? 'Blast' : l.source === 'Auto' ? 'Auto' : 'Manual'
  const sourceColor = l.source === 'AI' ? 'bg-purple-100 text-purple-700' : l.source === 'Blast' ? 'bg-fuchsia-100 text-fuchsia-700' : l.source === 'Auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'

  return (
    <div className="bg-white rounded-lg border-[0.5px] border-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon size={11} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {l.buyerId ? (
              <Link
                href={`/${tenantSlug}/buyers/${l.buyerId}`}
                className="text-ds-fine font-semibold text-txt-primary hover:text-gunner-red hover:underline truncate"
                title="Open buyer page"
              >
                {titleCase(l.recipientName)}
              </Link>
            ) : (
              <span className="text-ds-fine font-semibold text-txt-primary truncate">{titleCase(l.recipientName)}</span>
            )}
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${sourceColor}`}>{sourceLabel}</span>
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
                l.offerAmount && <span className="text-ds-fine font-bold text-semantic-green">${l.offerAmount.toLocaleString()}</span>
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
                showingInstant && (
                  <span className="text-ds-fine font-medium text-semantic-blue flex items-center gap-1">
                    <Clock size={10} /> {CT_DATETIME.format(showingInstant)}
                  </span>
                )
              )}
            </div>
          )}

          {editing ? (
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
              className="w-full mt-1.5 bg-surface-secondary border-[0.5px] border-gunner-red/30 rounded-[6px] px-2.5 py-1.5 text-[10px] focus:outline-none resize-none" />
          ) : (
            l.notes && <p className="text-[10px] text-txt-muted mt-1 line-clamp-2">{l.notes}</p>
          )}

          {/* Status pill + meta + actions, all on one row matching the
              Section 3 buyer card UI (red Send-style action, gray Edit pill). */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {l.type === 'offer' && (
              <select value={l.offerStatus ?? 'Pending'} onChange={e => updateField({ offerStatus: e.target.value, offerAmount: l.offerAmount })}
                disabled={saving}
                className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border-none cursor-pointer ${OFFER_STATUS_COLORS[l.offerStatus ?? 'Pending'] ?? OFFER_STATUS_COLORS.Pending}`}>
                {OFFER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {l.type === 'showing' && (
              <select value={l.showingStatus ?? 'Scheduled'} onChange={e => updateField({ showingStatus: e.target.value })}
                disabled={saving}
                className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border-none cursor-pointer ${SHOWING_STATUS_COLORS[l.showingStatus ?? 'Scheduled'] ?? SHOWING_STATUS_COLORS.Scheduled}`}>
                {SHOWING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <span className="text-[10px] text-txt-muted">{CT_DATE.format(new Date(l.loggedAt))}</span>
            <span className="text-[9px] text-txt-muted truncate">· {l.loggedByName}</span>
            <div className="flex-1" />
            {editing ? (
              <>
                <button onClick={saveEdits} disabled={saving}
                  className="text-[9px] font-semibold text-white bg-semantic-green hover:bg-semantic-green/90 px-2 py-1 rounded-md transition-colors">
                  Save
                </button>
                <button onClick={() => setEditing(false)}
                  className="text-[9px] font-medium text-txt-muted hover:text-txt-secondary px-1 py-1 transition-colors">
                  Cancel
                </button>
              </>
            ) : (
              <>
                {/* Send pill — disabled when buyerId can't be resolved
                    (the SendModal needs a buyer record to address). */}
                <button
                  onClick={() => l.buyerId && onSendClick({
                    id: l.buyerId,
                    name: l.recipientName,
                    phone: l.recipientContact && /\d/.test(l.recipientContact) ? l.recipientContact : null,
                    email: l.recipientContact && l.recipientContact.includes('@') ? l.recipientContact : null,
                    tier: 'qualified',
                  })}
                  disabled={!l.buyerId}
                  title={l.buyerId ? 'Send a follow-up' : 'Buyer not linked — open buyer page to link'}
                  className="flex items-center gap-1 text-[9px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 px-2 py-1 rounded-md transition-colors"
                >
                  <Send size={9} /> Send
                </button>
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-[9px] font-medium text-txt-muted hover:text-txt-secondary bg-surface-tertiary hover:bg-surface-secondary px-2 py-1 rounded-md transition-colors">
                  <Pencil size={9} /> Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
