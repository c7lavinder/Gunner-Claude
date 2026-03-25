'use client'
// components/inventory/property-detail-client.tsx
// Full property detail page with 7 tabs

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, CheckSquare, User, MapPin, ExternalLink,
  MessageSquare, FileText, ChevronRight, Zap, Pencil, Check,
  DollarSign, Bot, Send, Clock, Plus, Loader2,
  Home, Search as SearchIcon, Users, Activity, Sparkles, Megaphone,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { STATUS_TO_APP_STAGE, APP_STAGE_LABELS, APP_STAGE_BADGE_COLORS } from '@/types/property'
import type { AppStage } from '@/types/property'

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

type TabKey = 'overview' | 'research' | 'buyers' | 'outreach' | 'activity' | 'ai' | 'blast'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: 'overview', label: 'Overview',      icon: Home },
  { key: 'research', label: 'Research',      icon: SearchIcon },
  { key: 'buyers',   label: 'Buyers',        icon: Users },
  { key: 'outreach', label: 'Outreach',      icon: Send },
  { key: 'activity', label: 'Activity',      icon: Activity },
  { key: 'ai',       label: 'AI Assistant',  icon: Sparkles },
  { key: 'blast',    label: 'Deal Blast',    icon: Megaphone },
]

export function PropertyDetailClient({
  property, tenantSlug, canEdit, canManage, ghlContactId, ghlLocationId,
}: {
  property: PropertyDetail
  tenantSlug: string
  canEdit: boolean
  canManage: boolean
  ghlContactId: string | null
  ghlLocationId?: string
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [sending, setSending] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const appStage = STATUS_TO_APP_STAGE[property.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const dom = Math.floor((Date.now() - new Date(property.createdAt).getTime()) / 86400000)
  const domColor = dom <= 7 ? 'text-green-600' : dom <= 30 ? 'text-amber-500' : 'text-red-600'
  const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : null

  async function runGhlAction(type: string, payload: Record<string, string>) {
    if (!ghlContactId) return setActionMsg('No GHL contact linked')
    setSending(true)
    try {
      const res = await fetch('/api/ghl/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contactId: ghlContactId, ...payload }),
      })
      setActionMsg(res.ok ? 'Done!' : 'Action failed')
    } catch { setActionMsg('Network error') }
    setSending(false)
    setTimeout(() => setActionMsg(''), 3000)
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* Back */}
      <Link href={`/${tenantSlug}/inventory`} className="inline-flex items-center gap-1.5 text-ds-body text-txt-secondary hover:text-txt-primary transition-colors">
        <ArrowLeft size={14} /> Inventory
      </Link>

      {/* Header card */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full ${badgeColor}`}>
                {APP_STAGE_LABELS[appStage]}
              </span>
              <span className={`text-ds-fine font-medium ${domColor}`}>{dom}d</span>
            </div>
            <h1 className="text-ds-section font-semibold text-txt-primary">{property.address}</h1>
            <p className="text-ds-body text-txt-secondary flex items-center gap-1">
              <MapPin size={11} /> {property.city}, {property.state} {property.zip}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ghlContactId && ghlLocationId && (
              <a
                href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${ghlContactId}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-ds-fine text-txt-muted hover:text-txt-primary bg-surface-secondary px-3 py-1.5 rounded-[10px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors"
              >
                <ExternalLink size={11} /> GHL
              </a>
            )}
            {canEdit && (
              <Link
                href={`/${tenantSlug}/inventory/${property.id}/edit`}
                className="flex items-center gap-1 text-ds-fine text-txt-secondary hover:text-txt-primary bg-surface-secondary px-3 py-1.5 rounded-[10px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors"
              >
                <Pencil size={11} /> Edit
              </Link>
            )}
          </div>
        </div>

        {/* Deal progress */}
        <DealProgress currentStatus={property.status} />

        {/* Quick actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setActiveTab('blast')}
            className="flex items-center gap-1.5 text-ds-fine font-semibold bg-gunner-red hover:bg-gunner-red-dark text-white px-3 py-1.5 rounded-[10px] transition-colors"
          >
            <DollarSign size={11} /> Record Offer
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className="flex items-center gap-1.5 text-ds-fine font-semibold bg-surface-secondary hover:bg-surface-tertiary text-txt-secondary px-3 py-1.5 rounded-[10px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors"
          >
            <Bot size={11} /> Ask AI
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
        <div className="flex border-b border-[rgba(0,0,0,0.06)] overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-ds-fine font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-gunner-red text-gunner-red'
                    : 'border-transparent text-txt-muted hover:text-txt-secondary'
                }`}
              >
                <Icon size={12} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {activeTab === 'overview' && (
            <OverviewTab property={property} fmt={fmt} dom={dom} domColor={domColor} tenantSlug={tenantSlug} runGhlAction={runGhlAction} sending={sending} actionMsg={actionMsg} ghlContactId={ghlContactId} />
          )}
          {activeTab === 'research' && <ResearchTab property={property} />}
          {activeTab === 'buyers' && <BuyersTab property={property} tenantSlug={tenantSlug} />}
          {activeTab === 'outreach' && <OutreachTab />}
          {activeTab === 'activity' && <ActivityTab property={property} tenantSlug={tenantSlug} runGhlAction={runGhlAction} sending={sending} ghlContactId={ghlContactId} />}
          {activeTab === 'ai' && <AITab property={property} tenantSlug={tenantSlug} />}
          {activeTab === 'blast' && <DealBlastTab property={property} tenantSlug={tenantSlug} />}
        </div>
      </div>
    </div>
  )
}

// ─── Deal Progress ───────────────────────────────────────────────────────────

const ACQ_STEPS = [
  { key: 'NEW_LEAD', label: 'New Lead' }, { key: 'APPOINTMENT_SET', label: 'Appt Set' },
  { key: 'OFFER_MADE', label: 'Offer' }, { key: 'UNDER_CONTRACT', label: 'Contract' },
  { key: 'SOLD', label: 'Closed' },
]
const DISPO_STEPS = [
  { key: 'IN_DISPOSITION', label: 'New Deal' }, { key: 'DISPO_PUSHED', label: 'Pushed Out' },
  { key: 'DISPO_OFFERS', label: 'Offers' }, { key: 'DISPO_CONTRACTED', label: 'Contracted' },
  { key: 'DISPO_CLOSED', label: 'Closed' },
]

function DealProgress({ currentStatus }: { currentStatus: string }) {
  const acqKeys = ACQ_STEPS.map(s => s.key)
  const dispoKeys = DISPO_STEPS.map(s => s.key)
  const acqIdx = acqKeys.indexOf(currentStatus)
  const dispoIdx = dispoKeys.indexOf(currentStatus)

  function ProgressRow({ steps, activeIdx, color }: { steps: typeof ACQ_STEPS; activeIdx: number; color: string }) {
    return (
      <div className="flex items-center">
        {steps.map((step, i) => {
          const isHit = activeIdx >= 0 && i <= activeIdx
          const isCurrent = i === activeIdx
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                  isCurrent ? `${color} text-white` : isHit ? `${color}/20 ${color.replace('bg-', 'text-')}` : 'border border-[rgba(0,0,0,0.1)] text-txt-muted'
                }`}>
                  {isHit ? <Check size={8} /> : i + 1}
                </div>
                <span className={`text-[7px] mt-0.5 ${isCurrent ? `${color.replace('bg-', 'text-')} font-semibold` : isHit ? 'text-txt-primary' : 'text-txt-muted'}`}>{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px mx-0.5 ${activeIdx >= 0 && i < activeIdx ? `${color}/30` : 'bg-[rgba(0,0,0,0.06)]'}`} />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="bg-surface-secondary rounded-[8px] px-3 py-2 mt-3 space-y-2">
      <div>
        <p className="text-[7px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Acquisition</p>
        <ProgressRow steps={ACQ_STEPS} activeIdx={acqIdx} color="bg-gunner-red" />
      </div>
      <div>
        <p className="text-[7px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Disposition</p>
        <ProgressRow steps={DISPO_STEPS} activeIdx={dispoIdx} color="bg-semantic-blue" />
      </div>
    </div>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ property, fmt, dom, domColor, tenantSlug, runGhlAction, sending, actionMsg, ghlContactId }: {
  property: PropertyDetail; fmt: (v: string | null) => string | null; dom: number; domColor: string
  tenantSlug: string; runGhlAction: (type: string, payload: Record<string, string>) => void
  sending: boolean; actionMsg: string; ghlContactId: string | null
}) {
  const [smsText, setSmsText] = useState('')
  const [noteText, setNoteText] = useState('')

  const financials = [
    { label: 'CONTRACT', value: fmt(property.contractPrice), color: 'text-txt-primary' },
    { label: 'ASKING', value: fmt(property.askingPrice), color: 'text-txt-primary' },
    { label: 'ARV', value: fmt(property.arv), color: 'text-semantic-green' },
    { label: 'MAO', value: fmt(property.mao), color: 'text-semantic-amber' },
    { label: 'ASSIGNMENT FEE', value: fmt(property.assignmentFee), color: 'text-semantic-blue' },
    { label: 'DAYS ON MARKET', value: `${dom}`, color: domColor },
  ]

  return (
    <div className="space-y-5">
      {/* Financials grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {financials.map(f => (
          <div key={f.label} className="bg-surface-secondary rounded-[10px] px-3 py-2.5">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">{f.label}</p>
            <p className={`text-ds-card font-semibold mt-0.5 ${f.value ? f.color : 'text-semantic-red'}`}>{f.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: seller + assigned + actions */}
        <div className="space-y-4">
          {/* Seller */}
          {property.sellers.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
                <User size={10} className="inline -mt-0.5 text-gunner-red" /> Seller
              </p>
              {property.sellers.map(s => (
                <div key={s.id} className="space-y-0.5">
                  <p className="text-ds-body text-txt-primary font-medium">{s.name}{s.isPrimary && <span className="text-ds-fine text-txt-muted ml-1">(primary)</span>}</p>
                  {s.phone && <p className="text-ds-fine text-txt-secondary">{s.phone}</p>}
                  {s.email && <p className="text-ds-fine text-txt-secondary">{s.email}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Assigned */}
          {property.assignedTo && (
            <div>
              <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Assigned To</p>
              <p className="text-ds-body text-txt-primary">{property.assignedTo.name}</p>
              <p className="text-ds-fine text-txt-muted">{property.assignedTo.role.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
          )}

          {/* Quick actions */}
          {ghlContactId && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">Quick Actions</p>
              <div className="space-y-1.5">
                <textarea
                  value={smsText} onChange={e => setSmsText(e.target.value)}
                  placeholder="Send SMS..." rows={2}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none resize-none"
                />
                <button
                  onClick={() => { runGhlAction('send_sms', { message: smsText }); setSmsText('') }}
                  disabled={!smsText.trim() || sending}
                  className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold rounded-[8px] py-1.5 transition-colors"
                >
                  {sending ? 'Sending...' : 'Send SMS'}
                </button>
                <textarea
                  value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder="Add note..." rows={2}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none resize-none"
                />
                <button
                  onClick={() => { runGhlAction('add_note', { note: noteText }); setNoteText('') }}
                  disabled={!noteText.trim() || sending}
                  className="w-full bg-surface-tertiary hover:bg-surface-secondary text-txt-secondary text-ds-fine font-semibold rounded-[8px] py-1.5 border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors"
                >
                  Save Note
                </button>
              </div>
              {actionMsg && <p className="text-ds-fine text-gunner-red">{actionMsg}</p>}
            </div>
          )}
        </div>

        {/* Right: calls + tasks */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calls */}
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
              <Phone size={10} className="inline -mt-0.5 text-gunner-red" /> Calls ({property.calls.length})
            </p>
            {property.calls.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">No calls yet</p>
            ) : (
              <div className="space-y-1">
                {property.calls.map(c => {
                  const score = c.score ?? 0
                  const sc = score >= 80 ? 'bg-semantic-green text-white' : score >= 60 ? 'bg-semantic-amber text-white' : 'bg-semantic-red text-white'
                  return (
                    <Link key={c.id} href={`/${tenantSlug}/calls/${c.id}`} className="flex items-center gap-3 p-2 rounded-[8px] hover:bg-surface-secondary transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${c.gradingStatus === 'COMPLETED' ? sc : 'bg-surface-tertiary text-txt-muted'}`}>
                        {c.gradingStatus === 'COMPLETED' ? Math.round(score) : '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ds-fine text-txt-secondary truncate">{c.aiSummary ?? `${c.direction.toLowerCase()} ${c.callType ?? 'call'}`}</p>
                        <p className="text-ds-fine text-txt-muted">{c.assignedToName} · {c.calledAt ? formatDistanceToNow(new Date(c.calledAt), { addSuffix: true }) : '—'}</p>
                      </div>
                      <ChevronRight size={10} className="text-txt-muted shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
              <CheckSquare size={10} className="inline -mt-0.5 text-semantic-blue" /> Tasks ({property.tasks.length})
            </p>
            {property.tasks.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">No open tasks</p>
            ) : (
              <div className="space-y-1">
                {property.tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-[8px]">
                    <div className="w-3 h-3 rounded border border-[rgba(0,0,0,0.14)] shrink-0" />
                    <p className="text-ds-fine text-txt-secondary flex-1 truncate">{t.title}</p>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                      t.priority === 'URGENT' ? 'bg-semantic-red-bg text-semantic-red' :
                      t.priority === 'HIGH' ? 'bg-semantic-amber-bg text-semantic-amber' :
                      'bg-surface-tertiary text-txt-muted'
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

// ─── Research Tab ────────────────────────────────────────────────────────────

function ResearchTab({ property }: { property: PropertyDetail }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ds-label font-semibold text-txt-primary">Property Research</h3>
          <p className="text-ds-fine text-txt-muted">Data not yet synced</p>
        </div>
        <button className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark transition-colors">
          Re-Research
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-surface-secondary rounded-[10px] px-3 py-2.5">
          <p className="text-[9px] font-semibold text-txt-muted uppercase">Zestimate</p>
          <p className="text-ds-card font-semibold text-txt-muted mt-0.5">—</p>
        </div>
        <div className="bg-surface-secondary rounded-[10px] px-3 py-2.5">
          <p className="text-[9px] font-semibold text-txt-muted uppercase">Tax Assessment</p>
          <p className="text-ds-card font-semibold text-txt-muted mt-0.5">—</p>
        </div>
        <div className="bg-surface-secondary rounded-[10px] px-3 py-2.5">
          <p className="text-[9px] font-semibold text-txt-muted uppercase">Annual Tax</p>
          <p className="text-ds-card font-semibold text-txt-muted mt-0.5">—</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">Public Records</p>
        <div className="bg-surface-secondary rounded-[10px] p-4 text-ds-fine text-txt-muted text-center">
          Research data will populate once synced with public records
        </div>
      </div>

      <div className="flex gap-2">
        <a href={`https://www.zillow.com/homes/${encodeURIComponent(property.address + ' ' + property.city + ' ' + property.state + ' ' + property.zip)}`} target="_blank" rel="noopener noreferrer"
          className="text-ds-fine text-semantic-blue hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> Zillow
        </a>
        <a href={`https://www.google.com/maps/place/${encodeURIComponent(property.address + ', ' + property.city + ', ' + property.state + ' ' + property.zip)}`} target="_blank" rel="noopener noreferrer"
          className="text-ds-fine text-semantic-blue hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> Street View
        </a>
      </div>
    </div>
  )
}

// ─── Buyers Tab ──────────────────────────────────────────────────────────────

function BuyersTab({ property, tenantSlug }: { property: PropertyDetail; tenantSlug: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-ds-label font-semibold text-txt-primary">Matched Buyers</h3>
        <div className="flex gap-2">
          <button className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-1 transition-colors">
            <Users size={11} /> Match from CRM
          </button>
          <button className="text-ds-fine font-medium text-txt-secondary hover:text-txt-primary flex items-center gap-1 transition-colors">
            <Plus size={11} /> Add Buyer
          </button>
        </div>
      </div>

      <div className="bg-surface-secondary rounded-[10px] p-8 text-center">
        <Users size={20} className="text-txt-muted mx-auto mb-2" />
        <p className="text-ds-body text-txt-muted">No buyers matched yet</p>
        <p className="text-ds-fine text-txt-muted mt-1">Click &ldquo;Match from CRM&rdquo; to find buyers from your GHL contacts</p>
      </div>
    </div>
  )
}

// ─── Outreach Tab ────────────────────────────────────────────────────────────

function OutreachTab() {
  const [subTab, setSubTab] = useState<'sends' | 'offers' | 'showings'>('sends')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-0 border-b border-[rgba(0,0,0,0.06)]">
          {(['sends', 'offers', 'showings'] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)}
              className={`px-3 py-1.5 text-ds-fine font-medium border-b-2 capitalize transition-colors ${
                subTab === t ? 'border-gunner-red text-gunner-red' : 'border-transparent text-txt-muted hover:text-txt-secondary'
              }`}
            >{t} (0)</button>
          ))}
        </div>
        <button className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-1 transition-colors">
          <Plus size={11} /> Log {subTab === 'sends' ? 'Send' : subTab === 'offers' ? 'Offer' : 'Showing'}
        </button>
      </div>

      <div className="bg-surface-secondary rounded-[10px] p-8 text-center">
        <Send size={20} className="text-txt-muted mx-auto mb-2" />
        <p className="text-ds-body text-txt-muted">No {subTab} logged yet</p>
      </div>
    </div>
  )
}

// ─── Activity Tab ────────────────────────────────────────────────────────────

function ActivityTab({ property, tenantSlug, runGhlAction, sending, ghlContactId }: {
  property: PropertyDetail; tenantSlug: string
  runGhlAction: (type: string, payload: Record<string, string>) => void
  sending: boolean; ghlContactId: string | null
}) {
  const [note, setNote] = useState('')

  return (
    <div className="space-y-4">
      {/* Add note */}
      {ghlContactId && (
        <div className="flex gap-2">
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
          />
          <button
            onClick={() => { runGhlAction('add_note', { note }); setNote('') }}
            disabled={!note.trim() || sending}
            className="bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold px-4 rounded-[8px] transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {/* Timeline */}
      <div>
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-3">Activity Log</p>
        <div className="space-y-3">
          {/* Property created event */}
          <div className="flex gap-3">
            <div className="w-2 h-2 rounded-full bg-semantic-green mt-1.5 shrink-0" />
            <div>
              <p className="text-ds-fine text-txt-primary">Property created</p>
              <p className="text-ds-fine text-txt-muted">{format(new Date(property.createdAt), 'MMM d, yyyy h:mm a')}</p>
            </div>
          </div>
          {/* Calls as activity */}
          {property.calls.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-gunner-red mt-1.5 shrink-0" />
              <div>
                <p className="text-ds-fine text-txt-primary">
                  {c.direction === 'OUTBOUND' ? 'Outbound' : 'Inbound'} call{c.assignedToName ? ` by ${c.assignedToName}` : ''}
                  {c.score ? ` — Score: ${Math.round(c.score)}` : ''}
                </p>
                <p className="text-ds-fine text-txt-muted">{c.calledAt ? format(new Date(c.calledAt), 'MMM d, yyyy h:mm a') : '—'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── AI Assistant Tab ────────────────────────────────────────────────────────

function AITab({ property, tenantSlug }: { property: PropertyDetail; tenantSlug: string }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([])
  const [loading, setLoading] = useState(false)

  const suggestions = [
    'Analyze this deal',
    'Write a seller follow-up script',
    "What's the biggest risk here?",
    'Suggest a counter-offer',
  ]

  async function sendMessage(text: string) {
    if (!text.trim()) return
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/ai-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: `Property: ${property.address}, ${property.city}, ${property.state}. Status: ${property.status}. Asking: ${property.askingPrice ?? 'N/A'}. ARV: ${property.arv ?? 'N/A'}. MAO: ${property.mao ?? 'N/A'}. Contract: ${property.contractPrice ?? 'N/A'}. Assignment Fee: ${property.assignmentFee ?? 'N/A'}.`,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'ai', text: data.reply ?? data.message ?? 'No response' }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Failed to get response' }])
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Suggestions */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button key={s} onClick={() => sendMessage(s)}
              className="text-ds-fine font-medium text-gunner-red bg-gunner-red-light hover:bg-gunner-red/10 px-3 py-1.5 rounded-full transition-colors"
            >{s}</button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-[10px] px-3 py-2 text-ds-fine ${
              m.role === 'user'
                ? 'bg-gunner-red text-white'
                : 'bg-surface-secondary text-txt-primary'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-secondary rounded-[10px] px-3 py-2">
              <Loader2 size={14} className="animate-spin text-txt-muted" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          placeholder="Ask about this property..."
          className="flex-1 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white px-4 rounded-[8px] transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Deal Blast Tab ──────────────────────────────────────────────────────────

function DealBlastTab({ property, tenantSlug }: { property: PropertyDetail; tenantSlug: string }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ds-label font-semibold text-txt-primary">Deal Blast Generator</h3>
          <p className="text-ds-fine text-txt-muted">Send property details to matched buyers via SMS and email</p>
        </div>
        <button className="text-ds-fine font-medium text-txt-secondary hover:text-txt-primary bg-surface-secondary px-3 py-1.5 rounded-[8px] border-[0.5px] border-[rgba(0,0,0,0.08)] flex items-center gap-1 transition-colors">
          <FileText size={11} /> PDF Flyer
        </button>
      </div>

      {/* Tier selection */}
      <div>
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Select Buyer Tiers</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { tier: 'priority', label: 'Priority Buyer', emoji: '👑', desc: 'Top-tier, first access' },
            { tier: 'qualified', label: 'Qualified Buyer', emoji: '⭐', desc: 'Verified proof of funds' },
            { tier: 'jv', label: 'JV Partner', emoji: '🤝', desc: 'Co-investment partners' },
            { tier: 'unqualified', label: 'Unqualified', emoji: '👤', desc: 'Not yet verified' },
          ].map(t => (
            <label key={t.tier} className="flex items-start gap-2.5 bg-surface-secondary rounded-[10px] p-3 cursor-pointer hover:bg-surface-tertiary transition-colors">
              <input type="checkbox" className="mt-0.5 accent-gunner-red" />
              <div>
                <p className="text-ds-fine font-semibold text-txt-primary">{t.emoji} {t.label}</p>
                <p className="text-[9px] text-txt-muted">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button className="w-full bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-body font-semibold py-2.5 rounded-[10px] transition-colors">
        Generate Blast for Selected Tiers
      </button>

      <p className="text-[9px] text-txt-muted text-center">System learns from your edits to improve future blasts</p>
    </div>
  )
}
