'use client'
// components/inventory/property-detail-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, CheckSquare, User, MapPin,
  MessageSquare, FileText, ChevronRight, Zap, Pencil
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

const STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: 'New lead', CONTACTED: 'Contacted', APPOINTMENT_SET: 'Appt set',
  APPOINTMENT_COMPLETED: 'Appt done', OFFER_MADE: 'Offer made',
  UNDER_CONTRACT: 'Under contract', IN_DISPOSITION: 'In disposition',
  SOLD: 'Sold', DEAD: 'Dead',
}

const STATUS_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  CONTACTED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  APPOINTMENT_SET: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  APPOINTMENT_COMPLETED: 'bg-orange-400/10 text-orange-300 border-orange-400/20',
  OFFER_MADE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  UNDER_CONTRACT: 'bg-green-500/10 text-green-400 border-green-500/20',
  IN_DISPOSITION: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  SOLD: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  DEAD: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
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
  property, tenantSlug, canEdit, canManage, ghlContactId, milestoneHit, milestoneCounts,
}: {
  property: PropertyDetail
  tenantSlug: string
  canEdit: boolean
  canManage: boolean
  ghlContactId: string | null
  milestoneHit?: Record<string, boolean>
  milestoneCounts?: Record<string, number>
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
      <Link href={`/${tenantSlug}/inventory`} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to inventory
      </Link>

      {/* Header */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white">{property.address}</h1>
            <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1">
              <MapPin size={12} /> {property.city}, {property.state} {property.zip}
            </p>
            <p className="text-xs text-gray-600 mt-1">Added {formatDistanceToNow(new Date(property.createdAt), { addSuffix: true })}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm px-3 py-1.5 rounded-full border ${statusColor}`}>
              {STATUS_LABELS[property.status]}
            </span>
            {canEdit && (
              <Link
                href={`/${tenantSlug}/inventory/${property.id}/edit`}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Pencil size={13} /> Edit
              </Link>
            )}
          </div>
        </div>

        {/* Deal progress bar */}
        {milestoneHit && <DealProgressBar milestoneHit={milestoneHit} milestoneCounts={milestoneCounts ?? {}} />}

        {/* Financials */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
          {[
            { label: 'Asking price', value: fmt(property.askingPrice), color: 'text-white' },
            { label: 'ARV', value: fmt(property.arv), color: 'text-green-400' },
            { label: 'MAO', value: fmt(property.mao), color: 'text-orange-400' },
            { label: 'Assignment fee', value: fmt(property.assignmentFee), color: 'text-teal-400' },
          ].map((f) => f.value && (
            <div key={f.label}>
              <p className="text-xs text-gray-500">{f.label}</p>
              <p className={`text-lg font-semibold mt-0.5 ${f.color}`}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: seller + assigned */}
        <div className="space-y-4">
          {/* Seller info */}
          {property.sellers.length > 0 && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
                <User size={14} className="text-orange-500" /> Seller{property.sellers.length > 1 ? 's' : ''}
              </h2>
              {property.sellers.map((s) => (
                <div key={s.id} className="space-y-1">
                  <p className="text-sm text-white font-medium">{s.name}{s.isPrimary && <span className="ml-2 text-xs text-gray-500">(primary)</span>}</p>
                  {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                  {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Assigned to */}
          {property.assignedTo && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-white mb-2">Assigned to</h2>
              <p className="text-sm text-white">{property.assignedTo.name}</p>
              <p className="text-xs text-gray-500">{property.assignedTo.role.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
          )}

          {/* GHL Actions */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
              <Zap size={14} className="text-orange-500" /> Quick actions
            </h2>
            {!ghlContactId ? (
              <p className="text-xs text-gray-500">No GHL contact linked</p>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => { setShowSmsPanel(!showSmsPanel); setShowNotePanel(false) }}
                  className="w-full flex items-center gap-2 text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
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
                      className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
                    />
                    <button
                      onClick={() => runGhlAction('send_sms', { message: smsText })}
                      disabled={!smsText.trim() || sending}
                      className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg py-2 transition-colors"
                    >
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => { setShowNotePanel(!showNotePanel); setShowSmsPanel(false) }}
                  className="w-full flex items-center gap-2 text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
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
                      className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
                    />
                    <button
                      onClick={() => runGhlAction('add_note', { note: noteText })}
                      disabled={!noteText.trim() || sending}
                      className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg py-2 transition-colors"
                    >
                      {sending ? 'Saving…' : 'Save note'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {actionMsg && <p className="text-xs text-orange-400 mt-2">{actionMsg}</p>}
          </div>
        </div>

        {/* Right: calls + tasks */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calls */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
              <Phone size={14} className="text-orange-500" /> Calls ({property.calls.length})
            </h2>
            {property.calls.length === 0 ? (
              <p className="text-xs text-gray-500">No calls yet</p>
            ) : (
              <div className="space-y-1">
                {property.calls.map((c) => {
                  const score = c.score ?? 0
                  const sc = score >= 80 ? 'text-green-400 bg-green-500/10' : score >= 60 ? 'text-yellow-400 bg-yellow-500/10' : 'text-red-400 bg-red-500/10'
                  return (
                    <Link key={c.id} href={`/${tenantSlug}/calls/${c.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${c.gradingStatus === 'COMPLETED' ? sc : 'bg-gray-500/10 text-gray-500'}`}>
                        {c.gradingStatus === 'COMPLETED' ? score : '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300 truncate">{c.aiSummary ?? `${c.direction.toLowerCase()} ${c.callType ?? 'call'}`}</p>
                        <p className="text-xs text-gray-600">{c.assignedToName} · {c.calledAt ? formatDistanceToNow(new Date(c.calledAt), { addSuffix: true }) : '—'}</p>
                      </div>
                      <ChevronRight size={12} className="text-gray-600 shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
              <CheckSquare size={14} className="text-blue-400" /> Open tasks ({property.tasks.length})
            </h2>
            {property.tasks.length === 0 ? (
              <p className="text-xs text-gray-500">No open tasks</p>
            ) : (
              <div className="space-y-1">
                {property.tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl">
                    <div className="w-3 h-3 rounded border border-white/20 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300">{t.title}</p>
                      {t.category && <p className="text-xs text-gray-600">{t.category}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      t.priority === 'URGENT' ? 'bg-red-500/10 text-red-400' :
                      t.priority === 'HIGH' ? 'bg-orange-500/10 text-orange-400' :
                      'bg-gray-500/10 text-gray-400'
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

// ─── Deal Progress Bar ─────────────────────────────────────────────────────

import { Check } from 'lucide-react'

const PROGRESS_STEPS = [
  { key: 'LEAD', label: 'Lead' },
  { key: 'APPOINTMENT_SET', label: 'Appt Set' },
  { key: 'OFFER_MADE', label: 'Offer Made' },
  { key: 'UNDER_CONTRACT', label: 'Contract' },
  { key: 'CLOSED', label: 'Closed' },
]

function DealProgressBar({ milestoneHit, milestoneCounts }: {
  milestoneHit: Record<string, boolean>
  milestoneCounts: Record<string, number>
}) {
  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-2xl px-6 py-5 mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Deal Progress</p>
      <div className="flex items-center">
        {PROGRESS_STEPS.map((step, i) => {
          const hit = milestoneHit[step.key] ?? false
          const nextHit = i < PROGRESS_STEPS.length - 1 ? (milestoneHit[PROGRESS_STEPS[i + 1].key] ?? false) : false
          const count = milestoneCounts[step.key]

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  hit ? 'bg-orange-500 text-white' : 'border-2 border-white/10 text-gray-600'
                }`}>
                  {hit ? <Check size={14} /> : <span className="text-xs">{i + 1}</span>}
                </div>
                <span className={`text-xs mt-1.5 ${hit ? 'text-white' : 'text-gray-500'}`}>{step.label}</span>
                {count && count > 1 && (
                  <span className="text-xs text-gray-500">(×{count})</span>
                )}
              </div>

              {/* Connecting line */}
              {i < PROGRESS_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded ${
                  hit && nextHit ? 'bg-orange-500/60' : 'bg-white/10'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
