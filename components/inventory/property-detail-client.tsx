'use client'
// components/inventory/property-detail-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, CheckSquare, User, MapPin,
  MessageSquare, FileText, ChevronRight, Zap, Pencil, Check
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: 'New lead', CONTACTED: 'Contacted', APPOINTMENT_SET: 'Appt set',
  APPOINTMENT_COMPLETED: 'Appt done', OFFER_MADE: 'Offer made',
  UNDER_CONTRACT: 'Under contract', IN_DISPOSITION: 'In disposition',
  SOLD: 'Sold', DEAD: 'Dead',
}

const STATUS_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-semantic-blue-bg text-semantic-blue',
  CONTACTED: 'bg-semantic-amber-bg text-semantic-amber',
  APPOINTMENT_SET: 'bg-semantic-amber-bg text-semantic-amber',
  APPOINTMENT_COMPLETED: 'bg-semantic-green-bg text-semantic-green',
  OFFER_MADE: 'bg-semantic-purple-bg text-semantic-purple',
  UNDER_CONTRACT: 'bg-semantic-green-bg text-semantic-green',
  IN_DISPOSITION: 'bg-semantic-blue-bg text-semantic-blue',
  SOLD: 'bg-semantic-green-bg text-semantic-green',
  DEAD: 'bg-surface-tertiary text-txt-secondary',
}

interface PropertyDetail {
  id: string; address: string; city: string; state: string; zip: string; status: string
  arv: string | null; askingPrice: string | null; mao: string | null
  contractPrice: string | null; assignmentFee: string | null
  ghlContactId: string | null; createdAt: string
  sellers: Array<{ id: string; name: string; phone: string | null; email: string | null; isPrimary: boolean }>
  assignedTo: { id: string; name: string; role: string } | null
  calls: Array<{
    id: string; score: number | null; gradingStatus: string; direction: string
    callType: string | null; durationSeconds: number | null; calledAt: string | null
    aiSummary: string | null; assignedToName: string | null
  }>
  tasks: Array<{ id: string; title: string; category: string | null; priority: string; status: string; dueAt: string | null }>
}

export function PropertyDetailClient({
  property, tenantSlug, canEdit, canManage, ghlContactId,
}: {
  property: PropertyDetail
  tenantSlug: string
  canEdit: boolean
  canManage: boolean
  ghlContactId: string | null
}) {
  const [showSmsPanel, setShowSmsPanel] = useState(false)
  const [showNotePanel, setShowNotePanel] = useState(false)
  const [smsText, setSmsText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [sending, setSending] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : null
  const statusColor = STATUS_COLORS[property.status] ?? STATUS_COLORS.NEW_LEAD
  const primarySeller = property.sellers.find((s) => s.isPrimary) ?? property.sellers[0]

  async function runGhlAction(type: string, payload: Record<string, string>) {
    if (!ghlContactId) return setActionMsg('No GHL contact linked to this property')
    setSending(true)
    try {
      const res = await fetch('/api/ghl/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contactId: ghlContactId, ...payload }),
      })
      if (res.ok) {
        setActionMsg('Done!')
        setSmsText(''); setNoteText('')
        setShowSmsPanel(false); setShowNotePanel(false)
      } else {
        setActionMsg('Action failed — check GHL connection')
      }
    } catch { setActionMsg('Network error') }
    setSending(false)
    setTimeout(() => setActionMsg(''), 3000)
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back */}
      <Link href={`/${tenantSlug}/inventory`} className="inline-flex items-center gap-1.5 text-ds-body text-txt-secondary hover:text-txt-primary transition-colors">
        <ArrowLeft size={14} /> Back to inventory
      </Link>

      {/* Header */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-ds-page font-semibold text-txt-primary">{property.address}</h1>
            <p className="text-ds-body text-txt-secondary mt-0.5 flex items-center gap-1">
              <MapPin size={12} /> {property.city}, {property.state} {property.zip}
            </p>
            <p className="text-ds-fine text-txt-muted mt-1">Added {formatDistanceToNow(new Date(property.createdAt), { addSuffix: true })}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-ds-fine font-medium px-3 py-1.5 rounded-full ${statusColor}`}>
              {STATUS_LABELS[property.status]}
            </span>
            {canEdit && (
              <Link
                href={`/${tenantSlug}/inventory/${property.id}/edit`}
                className="flex items-center gap-1.5 text-ds-body text-txt-secondary hover:text-txt-primary bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] px-3 py-1.5 rounded-[10px] transition-colors"
              >
                <Pencil size={13} /> Edit
              </Link>
            )}
          </div>
        </div>

        {/* Deal progress — acquisition + disposition */}
        <DealProgressBar currentStatus={property.status} />

        {/* Financials */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[rgba(0,0,0,0.08)]">
          {[
            { label: 'Asking price', value: fmt(property.askingPrice), color: 'text-txt-primary' },
            { label: 'ARV', value: fmt(property.arv), color: 'text-semantic-green' },
            { label: 'MAO', value: fmt(property.mao), color: 'text-semantic-amber' },
            { label: 'Assignment fee', value: fmt(property.assignmentFee), color: 'text-semantic-green' },
          ].map((f) => f.value && (
            <div key={f.label}>
              <p className="text-ds-fine text-txt-muted">{f.label}</p>
              <p className={`text-[18px] font-semibold mt-0.5 ${f.color}`}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: seller + assigned */}
        <div className="space-y-4">
          {/* Seller info */}
          {property.sellers.length > 0 && (
            <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
              <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2 mb-3">
                <User size={14} className="text-gunner-red" /> Seller{property.sellers.length > 1 ? 's' : ''}
              </h2>
              {property.sellers.map((s) => (
                <div key={s.id} className="space-y-1">
                  <p className="text-ds-body text-txt-primary font-medium">{s.name}{s.isPrimary && <span className="ml-2 text-ds-fine text-txt-muted">(primary)</span>}</p>
                  {s.phone && <p className="text-ds-fine text-txt-secondary">{s.phone}</p>}
                  {s.email && <p className="text-ds-fine text-txt-secondary">{s.email}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Assigned to */}
          {property.assignedTo && (
            <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
              <h2 className="text-ds-label font-medium text-txt-primary mb-2">Assigned to</h2>
              <p className="text-ds-body text-txt-primary">{property.assignedTo.name}</p>
              <p className="text-ds-fine text-txt-muted">{property.assignedTo.role.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
          )}

          {/* GHL Actions */}
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2 mb-3">
              <Zap size={14} className="text-gunner-red" /> Quick actions
            </h2>
            {!ghlContactId ? (
              <p className="text-ds-fine text-txt-muted">No GHL contact linked</p>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => { setShowSmsPanel(!showSmsPanel); setShowNotePanel(false) }}
                  className="w-full flex items-center gap-2 text-ds-body text-txt-secondary hover:text-txt-primary bg-surface-secondary hover:bg-surface-tertiary rounded-[10px] px-3 py-2 transition-colors"
                >
                  <MessageSquare size={13} /> Send SMS
                </button>
                {showSmsPanel && (
                  <div className="space-y-2">
                    <textarea
                      value={smsText}
                      onChange={(e) => setSmsText(e.target.value)}
                      placeholder="Type your SMS message…"
                      rows={3}
                      className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 resize-none"
                    />
                    <button
                      onClick={() => runGhlAction('send_sms', { message: smsText })}
                      disabled={!smsText.trim() || sending}
                      className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold rounded-[10px] py-2 transition-colors"
                    >
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => { setShowNotePanel(!showNotePanel); setShowSmsPanel(false) }}
                  className="w-full flex items-center gap-2 text-ds-body text-txt-secondary hover:text-txt-primary bg-surface-secondary hover:bg-surface-tertiary rounded-[10px] px-3 py-2 transition-colors"
                >
                  <FileText size={13} /> Add note
                </button>
                {showNotePanel && (
                  <div className="space-y-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note to GHL contact…"
                      rows={3}
                      className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 resize-none"
                    />
                    <button
                      onClick={() => runGhlAction('add_note', { note: noteText })}
                      disabled={!noteText.trim() || sending}
                      className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold rounded-[10px] py-2 transition-colors"
                    >
                      {sending ? 'Saving…' : 'Save note'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {actionMsg && <p className="text-ds-fine text-gunner-red mt-2">{actionMsg}</p>}
          </div>
        </div>

        {/* Right: calls + tasks */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calls */}
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2 mb-3">
              <Phone size={14} className="text-gunner-red" /> Calls ({property.calls.length})
            </h2>
            {property.calls.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">No calls yet</p>
            ) : (
              <div className="space-y-1">
                {property.calls.map((c) => {
                  const score = c.score ?? 0
                  const sc = score >= 90 ? 'text-white bg-semantic-green'
                    : score >= 80 ? 'text-white bg-semantic-amber'
                    : score >= 70 ? 'text-white bg-semantic-blue'
                    : 'text-white bg-semantic-red'
                  return (
                    <Link key={c.id} href={`/${tenantSlug}/calls/${c.id}`} className="flex items-center gap-3 p-2.5 rounded-[10px] hover:bg-surface-secondary transition-colors">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-ds-fine font-semibold shrink-0 ${c.gradingStatus === 'COMPLETED' ? sc : 'bg-surface-tertiary text-txt-muted'}`}>
                        {c.gradingStatus === 'COMPLETED' ? score : '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ds-fine text-txt-secondary truncate">{c.aiSummary ?? `${c.direction.toLowerCase()} ${c.callType ?? 'call'}`}</p>
                        <p className="text-ds-fine text-txt-muted">{c.assignedToName} · {c.calledAt ? formatDistanceToNow(new Date(c.calledAt), { addSuffix: true }) : '—'}</p>
                      </div>
                      <ChevronRight size={12} className="text-txt-muted shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2 mb-3">
              <CheckSquare size={14} className="text-semantic-blue" /> Open tasks ({property.tasks.length})
            </h2>
            {property.tasks.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">No open tasks</p>
            ) : (
              <div className="space-y-1">
                {property.tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-[10px]">
                    <div className="w-3 h-3 rounded border-[0.5px] border-[rgba(0,0,0,0.14)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-ds-fine text-txt-secondary">{t.title}</p>
                      {t.category && <p className="text-ds-fine text-txt-muted">{t.category}</p>}
                    </div>
                    <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      t.priority === 'URGENT' ? 'bg-semantic-red-bg text-semantic-red' :
                      t.priority === 'HIGH' ? 'bg-semantic-amber-bg text-semantic-amber' :
                      'bg-surface-tertiary text-txt-secondary'
                    }`}>{t.priority.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Deal Progress — Acquisition + Disposition (matches inventory pipeline) ──

const ACQ_STEPS = [
  { key: 'NEW_LEAD',        label: 'New Lead' },
  { key: 'APPOINTMENT_SET', label: 'Appt Set' },
  { key: 'OFFER_MADE',      label: 'Offer' },
  { key: 'UNDER_CONTRACT',  label: 'Contract' },
  { key: 'SOLD',            label: 'Closed' },
]

const DISPO_STEPS = [
  { key: 'IN_DISPOSITION',   label: 'New Deal' },
  { key: 'DISPO_PUSHED',     label: 'Pushed Out' },
  { key: 'DISPO_OFFERS',     label: 'Offers' },
  { key: 'DISPO_CONTRACTED', label: 'Contracted' },
  { key: 'DISPO_CLOSED',     label: 'Closed' },
]

function DealProgressBar({ currentStatus }: { currentStatus: string }) {
  // Determine which stage is active in each pipeline
  const acqKeys = ACQ_STEPS.map(s => s.key)
  const dispoKeys = DISPO_STEPS.map(s => s.key)
  const acqIndex = acqKeys.indexOf(currentStatus)
  const dispoIndex = dispoKeys.indexOf(currentStatus)

  return (
    <div className="bg-surface-secondary rounded-[10px] px-4 py-3 mt-4 space-y-2.5">
      {/* Acquisition */}
      <div>
        <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Acquisition</p>
        <div className="flex items-center">
          {ACQ_STEPS.map((step, i) => {
            const isHit = acqIndex >= 0 && i <= acqIndex
            const isCurrent = step.key === currentStatus
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    isCurrent ? 'bg-gunner-red text-white' : isHit ? 'bg-gunner-red/20 text-gunner-red' : 'border border-[rgba(0,0,0,0.1)] text-txt-muted'
                  }`}>
                    {isHit ? <Check size={10} /> : i + 1}
                  </div>
                  <span className={`text-[8px] mt-0.5 ${isCurrent ? 'text-gunner-red font-semibold' : isHit ? 'text-txt-primary' : 'text-txt-muted'}`}>{step.label}</span>
                </div>
                {i < ACQ_STEPS.length - 1 && (
                  <div className={`flex-1 h-[1.5px] mx-1 rounded ${
                    acqIndex >= 0 && i < acqIndex ? 'bg-gunner-red/30' : 'bg-[rgba(0,0,0,0.06)]'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {/* Disposition */}
      <div>
        <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Disposition</p>
        <div className="flex items-center">
          {DISPO_STEPS.map((step, i) => {
            const isHit = dispoIndex >= 0 && i <= dispoIndex
            const isCurrent = step.key === currentStatus
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    isCurrent ? 'bg-semantic-blue text-white' : isHit ? 'bg-semantic-blue/20 text-semantic-blue' : 'border border-[rgba(0,0,0,0.1)] text-txt-muted'
                  }`}>
                    {isHit ? <Check size={10} /> : i + 1}
                  </div>
                  <span className={`text-[8px] mt-0.5 ${isCurrent ? 'text-semantic-blue font-semibold' : isHit ? 'text-txt-primary' : 'text-txt-muted'}`}>{step.label}</span>
                </div>
                {i < DISPO_STEPS.length - 1 && (
                  <div className={`flex-1 h-[1.5px] mx-1 rounded ${
                    dispoIndex >= 0 && i < dispoIndex ? 'bg-semantic-blue/30' : 'bg-[rgba(0,0,0,0.06)]'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
