'use client'
// components/inventory/property-detail-client.tsx
// Full property detail page with 7 tabs

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, CheckSquare, User, MapPin, ExternalLink,
  MessageSquare, FileText, ChevronRight, Zap, Pencil, Check,
  DollarSign, Bot, Send, Clock, Plus, Loader2,
  Home, Search as SearchIcon, Users, Activity, Sparkles, Megaphone, X,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { formatPhone, titleCase } from '@/lib/format'
import { STATUS_TO_APP_STAGE, APP_STAGE_LABELS, APP_STAGE_BADGE_COLORS } from '@/types/property'
import type { AppStage } from '@/types/property'

interface PropertyDetail {
  id: string; address: string; city: string; state: string; zip: string; status: string
  arv: string | null; askingPrice: string | null; mao: string | null
  contractPrice: string | null; assignmentFee: string | null
  offerPrice: string | null; repairCost: string | null; wholesalePrice: string | null
  currentOffer: string | null; highestOffer: string | null; acceptedPrice: string | null; finalProfit: string | null
  fieldSources: Record<string, string>
  ghlContactId: string | null; createdAt: string
  beds: number | null; baths: number | null; sqft: number | null
  yearBuilt: number | null; lotSize: string | null
  propertyType: string | null; occupancy: string | null; lockboxCode: string | null
  projectType: string[]; propertyMarkets: string[]
  description: string | null; internalNotes: string | null
  lastOfferDate: string | null; lastContactedDate: string | null
  sellers: Array<{ id: string; name: string; phone: string | null; email: string | null; isPrimary: boolean; role: string; ghlContactId: string | null }>
  assignedTo: { id: string; name: string; role: string } | null
  calls: Array<{
    id: string; score: number | null; gradingStatus: string; direction: string
    callType: string | null; durationSeconds: number | null; calledAt: string | null
    aiSummary: string | null; assignedToName: string | null
  }>
  tasks: Array<{ id: string; title: string; category: string | null; priority: string; status: string; dueAt: string | null }>
  auditLogs: Array<{ id: string; action: string; payload: Record<string, unknown> | null; createdAt: string; userName: string }>
  leadSource: string | null
  ghlStageName: string | null
  milestones: Array<{ type: string; date: string; notes: string | null }>
  teamMembers: Array<{ id: string; name: string }>
  messages: Array<{ id: string; text: string; mentions: Array<{ id: string; name: string }>; userId: string | null; userName: string; createdAt: string }>
}

// Timezone abbreviation for display (e.g. "CST", "EST")
const TZ_ABBR = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''

type TabKey = 'overview' | 'research' | 'buyers' | 'outreach' | 'activity' | 'ai' | 'blast'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: 'overview', label: 'Overview',      icon: Home },
  { key: 'activity', label: 'Activity',      icon: Activity },
  { key: 'research', label: 'Research',      icon: SearchIcon },
  { key: 'buyers',   label: 'Buyers',        icon: Users },
  { key: 'outreach', label: 'Outreach',      icon: Send },
  { key: 'blast',    label: 'Deal Blast',    icon: Megaphone },
]

export function PropertyDetailClient({
  property, tenantSlug, canEdit, canManage, ghlContactId, ghlLocationId, projectTypeOptions,
}: {
  property: PropertyDetail
  tenantSlug: string
  canEdit: boolean
  canManage: boolean
  ghlContactId: string | null
  ghlLocationId?: string
  projectTypeOptions?: string[]
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [sending, setSending] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const appStage = STATUS_TO_APP_STAGE[property.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const dom = Math.floor((Date.now() - new Date(property.createdAt).getTime()) / 86400000)
  const domColor = dom <= 7 ? 'text-green-600' : dom <= 30 ? 'text-amber-500' : 'text-red-600'


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
      {/* Back to inventory */}
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-ds-body font-medium text-gunner-red hover:text-gunner-red-dark transition-colors">
        <ArrowLeft size={14} /> Back to Inventory
      </button>

      {/* Header card */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
        {/* Labels row — same as inventory list */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-[2px] rounded-full ${badgeColor}`}>
            {APP_STAGE_LABELS[appStage]}
          </span>
          {property.ghlStageName && (
            <span className="text-[10px] font-medium px-2 py-[2px] rounded-full bg-blue-50 text-blue-700 border-[0.5px] border-blue-200">
              {property.ghlStageName}
            </span>
          )}
          {property.leadSource && (
            <span className="text-[10px] font-medium px-2 py-[2px] rounded-full bg-purple-50 text-purple-700 border-[0.5px] border-purple-200">
              {property.leadSource}
            </span>
          )}
          {property.propertyMarkets.map(m => (
            <span key={m} className="text-[10px] font-medium px-2 py-[2px] rounded-full bg-emerald-50 text-emerald-700 border-[0.5px] border-emerald-200">
              {m}
            </span>
          ))}
          <span className={`text-ds-fine font-semibold ${domColor}`}>{dom}d</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
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
          </div>
        </div>

        {/* Deal progress — view only, click for milestone details */}
        <DealProgress currentStatus={property.status} milestones={property.milestones} />
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
            <OverviewTab property={property} dom={dom} domColor={domColor} tenantSlug={tenantSlug} runGhlAction={runGhlAction} sending={sending} actionMsg={actionMsg} ghlContactId={ghlContactId} projectTypeOptions={projectTypeOptions} />
          )}
          {activeTab === 'research' && <ResearchTab property={property} />}
          {activeTab === 'buyers' && <BuyersTab property={property} tenantSlug={tenantSlug} />}
          {activeTab === 'outreach' && <OutreachTab property={property} />}
          {activeTab === 'activity' && <ActivityTab property={property} tenantSlug={tenantSlug} runGhlAction={runGhlAction} sending={sending} ghlContactId={ghlContactId} />}
          {activeTab === 'blast' && <DealBlastTab property={property} tenantSlug={tenantSlug} />}
        </div>
      </div>

      {/* Offers are recorded via Outreach tab */}
    </div>
  )
}

// ─── Record Offer Modal ──────────────────────────────────────────────────────

function RecordOfferModal({ propertyId, tenantSlug, onClose }: { propertyId: string; tenantSlug: string; onClose: () => void }) {
  const [offerAmount, setOfferAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  async function submit() {
    if (!offerAmount) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerPrice: offerAmount,
          status: 'OFFER_MADE',
          lastOfferDate: new Date().toISOString(),
        }),
      })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => { onClose(); window.location.reload() }, 1000)
      }
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[14px] border-[0.5px] border-[rgba(0,0,0,0.08)] w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-ds-label font-semibold text-txt-primary mb-4">Record Offer</h3>
        {success ? (
          <p className="text-ds-body text-semantic-green font-medium py-4 text-center">Offer recorded!</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-ds-fine text-txt-muted block mb-1">Offer Amount *</label>
              <input
                type="number" value={offerAmount} onChange={e => setOfferAmount(e.target.value)}
                placeholder="150000"
                className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-ds-fine text-txt-muted block mb-1">Notes</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Offer details..." rows={3}
                className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 text-ds-fine font-medium text-txt-secondary bg-surface-secondary rounded-[8px] py-2 hover:bg-surface-tertiary transition-colors">
                Cancel
              </button>
              <button onClick={submit} disabled={!offerAmount || saving}
                className="flex-1 text-ds-fine font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 rounded-[8px] py-2 transition-colors">
                {saving ? 'Saving...' : 'Record Offer'}
              </button>
            </div>
          </div>
        )}
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

function DealProgress({ currentStatus, milestones }: {
  currentStatus: string
  milestones: Array<{ type: string; date: string; notes: string | null }>
}) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const acqKeys = ACQ_STEPS.map(s => s.key)
  const dispoKeys = DISPO_STEPS.map(s => s.key)
  const acqIdx = acqKeys.indexOf(currentStatus)
  const dispoIdx = dispoKeys.indexOf(currentStatus)

  // Map milestone types to step keys
  const milestoneMap: Record<string, { date: string; notes: string | null }> = {}
  for (const m of milestones) {
    milestoneMap[m.type] = { date: m.date, notes: m.notes }
  }

  // Map step keys to milestone types
  const stepToMilestone: Record<string, string> = {
    NEW_LEAD: 'LEAD', APPOINTMENT_SET: 'APPOINTMENT_SET',
    OFFER_MADE: 'OFFER_MADE', UNDER_CONTRACT: 'UNDER_CONTRACT',
    SOLD: 'CLOSED', IN_DISPOSITION: 'LEAD', DISPO_CONTRACTED: 'UNDER_CONTRACT',
    DISPO_CLOSED: 'CLOSED',
  }

  function ProgressRow({ steps, activeIdx, color }: { steps: typeof ACQ_STEPS; activeIdx: number; color: string }) {
    return (
      <div>
        <div className="flex items-center">
          {steps.map((step, i) => {
            const isHit = activeIdx >= 0 && i <= activeIdx
            const isCurrent = i === activeIdx
            const milestone = milestoneMap[stepToMilestone[step.key] ?? '']
            const isExpanded = expandedStep === step.key
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : step.key)}
                  className="flex flex-col items-center cursor-pointer hover:scale-110 transition-transform"
                  title={`View ${step.label} details`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold transition-colors ${
                    isCurrent ? `${color} text-white ring-2 ring-offset-1 ${color.replace('bg-', 'ring-')}/30` : isHit ? `${color}/20 ${color.replace('bg-', 'text-')}` : 'border border-[rgba(0,0,0,0.1)] text-txt-muted'
                  }`}>
                    {isHit ? <Check size={8} /> : i + 1}
                  </div>
                  <span className={`text-[7px] mt-0.5 ${isCurrent ? `${color.replace('bg-', 'text-')} font-semibold` : isHit ? 'text-txt-primary' : 'text-txt-muted'}`}>{step.label}</span>
                </button>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-px mx-0.5 ${activeIdx >= 0 && i < activeIdx ? `${color}/30` : 'bg-[rgba(0,0,0,0.06)]'}`} />
                )}
              </div>
            )
          })}
        </div>
        {/* Milestone detail popover */}
        {expandedStep && steps.some(s => s.key === expandedStep) && (() => {
          const step = steps.find(s => s.key === expandedStep)!
          const milestone = milestoneMap[stepToMilestone[step.key] ?? '']
          const isHit = activeIdx >= 0 && steps.indexOf(step) <= activeIdx
          return (
            <div className={`mt-2 rounded-[8px] px-3 py-2 border-[0.5px] ${
              isHit ? `${color.replace('bg-', 'bg-')}/5 ${color.replace('bg-', 'border-')}/20` : 'bg-surface-secondary border-[rgba(0,0,0,0.06)]'
            }`}>
              <div className="flex items-center justify-between">
                <p className={`text-[10px] font-semibold ${isHit ? color.replace('bg-', 'text-') : 'text-txt-muted'}`}>{step.label}</p>
                {milestone && <p className="text-[9px] text-txt-muted">{format(new Date(milestone.date), 'MMM d, yyyy')}</p>}
              </div>
              {milestone?.notes && <p className="text-[9px] text-txt-secondary mt-0.5">{milestone.notes}</p>}
              {!milestone && isHit && <p className="text-[9px] text-txt-muted">Reached — no milestone recorded</p>}
              {!isHit && <p className="text-[9px] text-txt-muted">Not yet reached</p>}
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="bg-surface-secondary/50 border-[0.5px] border-[rgba(0,0,0,0.04)] rounded-[8px] px-3 py-2 mt-3 space-y-2">
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

// ─── Inline Edit Components ──────────────────────────────────────────────────

// Source-based color styles: "api"=purple, "ai"=blue, "user"=green, null=gray
function sourceStyles(source: string | null) {
  if (source === 'api') return { bg: 'bg-purple-50 border-[0.5px] border-purple-300', label: 'text-purple-700', value: 'text-purple-800', tag: 'API', tagColor: 'text-purple-400' }
  if (source === 'ai') return { bg: 'bg-blue-50 border-[0.5px] border-blue-300', label: 'text-blue-700', value: 'text-blue-800', tag: 'AI', tagColor: 'text-blue-400' }
  if (source === 'user') return { bg: 'bg-green-50 border-[0.5px] border-green-300', label: 'text-green-700', value: 'text-green-800', tag: 'EDITED', tagColor: 'text-green-400' }
  return { bg: 'bg-surface-secondary', label: 'text-txt-muted', value: 'text-txt-primary', tag: '', tagColor: '' }
}

function InlineEditCard({
  label, value, field, propertyId, source, onSaved,
}: {
  label: string; value: string | null; field: string; propertyId: string
  source?: string | null; onSaved: (field: string, val: string | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setEditValue(value ?? '')
    setEditing(true)
  }

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    if (raw === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      const newVal = raw || null
      const newSource = newVal ? 'user' : ''
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVal, fieldSources: newVal ? { [field]: 'user' } : { [field]: '' } }),
      })
      if (res.ok) { onSaved(field, newVal, newSource) }
      else { console.error('[InlineEdit] Save failed:', field, await res.text()) }
    } catch (e) { console.error('[InlineEdit] Error:', e) }
    setSaving(false)
    setEditing(false)
  }

  const displayValue = value ? `$${Number(value).toLocaleString()}` : null
  const s = sourceStyles(source || null)

  if (editing) {
    return (
      <div className={`${s.bg} rounded-[10px] px-3 py-2.5`}>
        <p className={`text-[9px] font-semibold uppercase tracking-wider ${s.label}`}>{label}</p>
        <input
          autoFocus type="number" value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1 text-ds-card font-semibold text-txt-primary mt-0.5 focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
          disabled={saving} placeholder="0"
        />
      </div>
    )
  }

  return (
    <div onClick={startEdit} className={`${s.bg} rounded-[10px] px-3 py-2.5 cursor-pointer hover:ring-1 hover:ring-gunner-red/20 transition-all group relative`}>
      {s.tag && (
        <span className={`absolute top-1 right-1.5 text-[7px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
      )}
      <p className={`text-[9px] font-semibold uppercase tracking-wider flex items-center justify-between ${s.label}`}>
        {label}
        <Pencil size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </p>
      <p className={`text-ds-card font-semibold mt-0.5 ${displayValue ? s.value : 'text-txt-muted'}`}>
        {displayValue ?? '—'}
      </p>
    </div>
  )
}

function InlineDetailItem({
  label, value, field, propertyId, type = 'text', source, onSaved,
}: {
  label: string; value: string | number | null; field: string; propertyId: string
  type?: 'number' | 'text'; source?: string | null
  onSaved: (field: string, val: string | number | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    const current = value != null ? String(value) : ''
    if (raw === current) { setEditing(false); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      payload[field] = type === 'number' ? (raw ? Number(raw) : null) : (raw || null)
      payload.fieldSources = { [field]: 'user' }
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) onSaved(field, type === 'number' ? (raw ? Number(raw) : null) : (raw || null), 'user')
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  const s = sourceStyles(source ?? null)

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={s.label}>{label}:</span>
        <input
          autoFocus type={type === 'number' ? 'number' : 'text'} value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="w-20 bg-white border-[0.5px] border-gunner-red/30 rounded px-1.5 py-0.5 text-ds-fine font-medium text-txt-primary focus:outline-none"
          disabled={saving}
        />
      </span>
    )
  }

  const display = value != null ? (typeof value === 'number' ? value.toLocaleString() : value) : null

  return (
    <span
      className={`cursor-pointer hover:text-gunner-red transition-colors group inline-flex items-center gap-1 ${source ? `px-1.5 py-0.5 rounded ${s.bg}` : ''}`}
      onClick={() => { setEditValue(value != null ? String(value) : ''); setEditing(true) }}
    >
      <span className={s.label}>{label}:</span>
      <span className={`font-medium group-hover:underline ${display ? s.value : 'text-txt-muted'}`}>{display ?? '—'}</span>
      <Pencil size={7} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />
    </span>
  )
}

function InlineTextArea({
  label, value, field, propertyId, labelColor, bgColor, textColor, source, onSaved,
}: {
  label: string; value: string | null; field: string; propertyId: string
  labelColor?: string; bgColor?: string; textColor?: string; source?: string
  onSaved: (field: string, val: string | null, src?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const sourceTag = source === 'ai' ? 'AI' : source === 'api' ? 'API' : source === 'user' ? 'EDITED' : null
  const tagColor = source === 'ai' ? 'text-blue-400' : source === 'api' ? 'text-purple-400' : source === 'user' ? 'text-green-400' : ''

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    if (raw === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: raw || null, fieldSources: { [field]: raw ? 'user' : '' } }),
      })
      if (res.ok) onSaved(field, raw || null, raw ? 'user' : undefined)
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className={`${bgColor ?? 'bg-surface-secondary'} rounded-[10px] px-4 py-3`}>
        <p className={`text-[9px] font-semibold uppercase tracking-wider mb-1 ${labelColor ?? 'text-txt-muted'}`}>{label}</p>
        <textarea
          autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
          rows={3}
          className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1.5 text-ds-fine text-txt-primary focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
          disabled={saving} placeholder="Click to add..."
        />
      </div>
    )
  }

  return (
    <div
      onClick={() => { setEditValue(value ?? ''); setEditing(true) }}
      className={`${bgColor ?? 'bg-surface-secondary'} rounded-[10px] px-4 py-3 cursor-pointer hover:ring-1 hover:ring-gunner-red/20 transition-all group relative`}
    >
      {sourceTag && (
        <span className={`absolute top-1.5 right-2 text-[7px] font-bold uppercase ${tagColor}`}>{sourceTag}</span>
      )}
      <p className={`text-[9px] font-semibold uppercase tracking-wider mb-1 flex items-center justify-between ${labelColor ?? 'text-txt-muted'}`}>
        {label}
        <Pencil size={8} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity mr-6" />
      </p>
      <p className={`text-ds-fine ${value ? (textColor ?? 'text-txt-secondary') : 'text-txt-muted'}`}>
        {value ?? 'Click to add...'}
      </p>
    </div>
  )
}

// ─── Multi-Select Tag Fields ─────────────────────────────────────────────────

const PROJECT_TYPE_OPTIONS = ['Fix and Flip', 'Rental', 'Retail', 'Land', 'New Build', 'Commercial', 'Multi-Family']
const PROPERTY_TYPE_OPTIONS = ['House', 'Land', 'Multi-Family', 'Commercial', 'Condo', 'Townhome', 'Mobile Home', 'Other']

// ─── Grid Detail Cell ──────────────────────────────────────────────────────
// Used inside the property details grid — click to edit in-place

function DetailCell({
  label, value, field, propertyId, type = 'text', source, onSaved, options,
}: {
  label: string; value: string | number | null; field: string; propertyId: string
  type?: 'number' | 'text' | 'select'; source?: string | null; options?: string[]
  onSaved: (field: string, val: string | number | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const s = sourceStyles(source ?? null)

  function startEdit() {
    if (type === 'select') { setDropdownOpen(!dropdownOpen); setSearch(''); return }
    setEditValue(value != null ? String(value) : '')
    setEditing(true)
  }

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    const current = value != null ? String(value) : ''
    if (raw === current) { setEditing(false); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      payload[field] = type === 'number' ? (raw ? Number(raw) : null) : (raw || null)
      payload.fieldSources = { [field]: raw ? 'user' : '' }
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) onSaved(field, type === 'number' ? (raw ? Number(raw) : null) : (raw || null), raw ? 'user' : '')
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  async function selectOption(val: string | null) {
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val, fieldSources: val ? { [field]: 'user' } : { [field]: '' } }),
      })
      if (res.ok) onSaved(field, val, val ? 'user' : '')
    } catch {}
    setSaving(false)
    setDropdownOpen(false)
    setSearch('')
  }

  const display = value != null ? (typeof value === 'number' ? value.toLocaleString() : value) : null
  const filteredOpts = (options ?? []).filter(o => o.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="relative">
      <div
        onClick={startEdit}
        className={`px-3 py-2.5 cursor-pointer hover:bg-[rgba(0,0,0,0.02)] transition-colors group relative ${source ? s.bg : ''}`}
      >
        {source && s.tag && (
          <span className={`absolute top-0.5 right-1.5 text-[6px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
        )}
        <p className={`text-[8px] font-semibold uppercase tracking-wider ${source ? s.label : 'text-txt-muted'}`}>{label}</p>
        {editing ? (
          <input
            autoFocus type={type === 'number' ? 'number' : 'text'} value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded-[4px] px-1.5 py-0.5 text-ds-fine font-semibold text-txt-primary mt-0.5 focus:outline-none"
            disabled={saving}
          />
        ) : (
          <p className={`text-ds-fine font-semibold mt-0.5 flex items-center gap-1 ${display ? (source ? s.value : 'text-txt-primary') : 'text-txt-muted'}`}>
            {display ?? '—'}
            <Pencil size={7} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity shrink-0" />
          </p>
        )}
      </div>

      {/* Select dropdown */}
      {dropdownOpen && type === 'select' && (
        <div className="absolute top-full left-0 z-30 mt-0.5 w-44 bg-white border-[0.5px] border-[rgba(0,0,0,0.12)] rounded-[8px] shadow-lg p-1.5">
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-surface-secondary rounded-[4px] px-2 py-1 text-[10px] placeholder-txt-muted focus:outline-none mb-1" />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {value && (
              <button onClick={() => selectOption(null)} disabled={saving}
                className="w-full text-left text-[10px] text-semantic-red px-2 py-1 rounded hover:bg-surface-secondary transition-colors">Clear</button>
            )}
            {filteredOpts.map(o => (
              <button key={o} onClick={() => selectOption(o)} disabled={saving}
                className={`w-full text-left text-[10px] px-2 py-1 rounded hover:bg-surface-secondary transition-colors ${
                  o === value ? 'text-gunner-red font-semibold bg-gunner-red-light' : 'text-txt-primary'
                }`}>{o}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tag Row (for Market / Project Type multi-select) ───────────────────────

function TagRow({ label, values, options, field, propertyId, allowCustom, onSaved }: {
  label: string; values: string[]; options: string[]; field: string; propertyId: string
  allowCustom?: boolean; onSaved: (field: string, vals: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [localValues, setLocalValues] = useState(values)

  useEffect(() => { setLocalValues(values) }, [values])

  const filtered = options.filter(o =>
    !localValues.includes(o) && o.toLowerCase().includes(search.toLowerCase())
  )
  const showCustom = allowCustom && search.length >= 2 && !options.some(o => o.toLowerCase() === search.toLowerCase()) && !localValues.some(v => v.toLowerCase() === search.toLowerCase())

  async function toggle(val: string) {
    const newVals = localValues.includes(val) ? localValues.filter(v => v !== val) : [...localValues, val]
    setLocalValues(newVals)
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVals }),
      })
      if (res.ok) { onSaved(field, newVals) }
      else { setLocalValues(values) }
    } catch { setLocalValues(values) }
    setSaving(false)
    setSearch('')
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 relative">
      <span className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider shrink-0 w-[70px]">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-h-[20px]">
        {localValues.map(v => (
          <span key={v} className="inline-flex items-center gap-1 bg-gunner-red-light text-gunner-red text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {v}
            <button onClick={() => toggle(v)} className="hover:text-gunner-red-dark transition-colors"><X size={8} /></button>
          </span>
        ))}
        <button onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-0.5 text-[10px] text-txt-muted hover:text-gunner-red px-1.5 py-0.5 rounded-full border border-dashed border-[rgba(0,0,0,0.12)] hover:border-gunner-red/30 transition-all">
          <Plus size={8} /> Add
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-[70px] z-30 mt-0.5 w-52 bg-white border-[0.5px] border-[rgba(0,0,0,0.12)] rounded-[8px] shadow-lg p-1.5">
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder={allowCustom ? 'Search or type custom...' : 'Search...'}
            className="w-full bg-surface-secondary rounded-[4px] px-2 py-1 text-[10px] placeholder-txt-muted focus:outline-none mb-1" />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.map(o => (
              <button key={o} onClick={() => toggle(o)} disabled={saving}
                className="w-full text-left text-[10px] text-txt-primary px-2 py-1 rounded hover:bg-surface-secondary transition-colors">{o}</button>
            ))}
            {showCustom && (
              <button onClick={() => toggle(search)} disabled={saving}
                className="w-full text-left text-[10px] text-gunner-red font-semibold px-2 py-1 rounded hover:bg-surface-secondary transition-colors">
                + Add &ldquo;{search}&rdquo;
              </button>
            )}
            {filtered.length === 0 && !showCustom && (
              <p className="text-[10px] text-txt-muted px-2 py-1">No options</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inline AI Actions ───────────────────────────────────────────────────────

function InlineAI({ propertyId }: { propertyId: string }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([])
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<Record<string, string> | null>(null)
  const [executing, setExecuting] = useState(false)

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      // First try outreach action parsing
      const actionRes = await fetch('/api/ai/outreach-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, propertyId }),
      })
      const actionData = await actionRes.json()
      const action = actionData.action

      if (action && action.type !== 'none') {
        // Outreach action detected — show confirmation
        setPendingAction(action)
        const labels: Record<string, string> = { offer: 'Record Offer', offer_update: 'Update Offer', showing: 'Schedule Showing', send: 'Log Send' }
        setMessages(prev => [...prev, { role: 'assistant', text: `I'll ${labels[action.type] ?? action.type}. Review and confirm below.` }])
      } else {
        // Fall back to regular AI Coach
        const coachRes = await fetch('/api/ai/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, { role: 'user', content: text }].map(m => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: 'text' in m ? m.text : (m as { content: string }).content,
            })),
            propertyId,
          }),
        })
        const coachData = await coachRes.json()
        setMessages(prev => [...prev, { role: 'assistant', text: action?.reply ?? coachData.reply ?? 'No response' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to connect' }])
    }
    setLoading(false)
  }

  async function confirmAction() {
    if (!pendingAction) return
    setExecuting(true)
    try {
      const a = pendingAction
      const payload: Record<string, unknown> = {
        recipientName: a.recipientName ?? 'Unknown',
        recipientContact: '',
        source: 'AI',
        notes: a.notes ?? null,
      }

      if (a.type === 'offer') {
        payload.type = 'offer'
        payload.offerAmount = a.offerAmount
        payload.channel = a.channel ?? 'offer'
      } else if (a.type === 'offer_update') {
        payload.action = 'update'
        payload.offerStatus = a.offerStatus
        payload.offerAmount = a.offerAmount
        // TODO: find logId by recipientName — for now just log new
        payload.type = 'offer'
      } else if (a.type === 'showing') {
        payload.type = 'showing'
        if (a.showingDate) {
          const showDt = new Date(`${a.showingDate}T${a.showingTime || '09:00'}:00`)
          payload.showingDate = showDt.toISOString()
        }
      } else if (a.type === 'send') {
        payload.type = 'send'
        payload.channel = a.channel ?? 'sms'
      }

      await fetch(`/api/properties/${propertyId}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setMessages(prev => [...prev, { role: 'assistant', text: 'Done!' }])
      setPendingAction(null)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to execute' }])
    }
    setExecuting(false)
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
        <Sparkles size={10} className="inline -mt-0.5 text-semantic-purple" /> AI Actions
      </p>

      {/* Chat history */}
      {messages.length > 0 && (
        <div className="space-y-2 mb-2 max-h-[250px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`text-ds-fine px-2.5 py-1.5 rounded-[8px] ${
              m.role === 'user'
                ? 'bg-gunner-red text-white ml-4'
                : 'bg-surface-secondary text-txt-primary mr-4'
            }`}>
              {m.text}
            </div>
          ))}
          {loading && (
            <div className="bg-surface-secondary rounded-[8px] px-2.5 py-1.5 mr-4">
              <Loader2 size={12} className="animate-spin text-txt-muted" />
            </div>
          )}
        </div>
      )}

      {/* Pending action confirmation card */}
      {pendingAction && (
        <div className="bg-purple-50 border-[0.5px] border-purple-300 rounded-[8px] px-3 py-2.5 mb-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">AI</span>
            <span className="text-[10px] font-semibold text-purple-700 uppercase">{pendingAction.type?.replace('_', ' ')}</span>
          </div>
          <div className="space-y-1">
            {pendingAction.recipientName && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">To:</span>
                <input value={pendingAction.recipientName} onChange={e => setPendingAction(p => p ? { ...p, recipientName: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
              </div>
            )}
            {pendingAction.offerAmount && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Amount:</span>
                <input value={pendingAction.offerAmount} onChange={e => setPendingAction(p => p ? { ...p, offerAmount: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" type="number" />
              </div>
            )}
            {pendingAction.offerStatus && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Status:</span>
                <select value={pendingAction.offerStatus} onChange={e => setPendingAction(p => p ? { ...p, offerStatus: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none">
                  {['Pending', 'Accepted', 'Rejected', 'Countered', 'Expired'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {pendingAction.showingDate && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">When:</span>
                <input type="date" value={pendingAction.showingDate} onChange={e => setPendingAction(p => p ? { ...p, showingDate: e.target.value } : p)}
                  className="bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
                <input type="time" value={pendingAction.showingTime ?? '09:00'} onChange={e => setPendingAction(p => p ? { ...p, showingTime: e.target.value } : p)}
                  className="bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
              </div>
            )}
            {pendingAction.channel && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Via:</span>
                <select value={pendingAction.channel} onChange={e => setPendingAction(p => p ? { ...p, channel: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none">
                  {['sms', 'email', 'call', 'offer', 'in_person'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {pendingAction.notes && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Notes:</span>
                <input value={pendingAction.notes} onChange={e => setPendingAction(p => p ? { ...p, notes: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
              </div>
            )}
          </div>
          <div className="flex gap-1.5 pt-1">
            <button onClick={confirmAction} disabled={executing}
              className="flex-1 bg-semantic-purple hover:bg-semantic-purple/90 disabled:opacity-50 text-white text-[10px] font-semibold py-1.5 rounded-[6px] transition-colors">
              {executing ? 'Executing...' : 'Confirm'}
            </button>
            <button onClick={() => setPendingAction(null)}
              className="flex-1 bg-surface-secondary text-txt-secondary text-[10px] font-medium py-1.5 rounded-[6px] hover:bg-surface-tertiary transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Record offer, schedule showing, analyze..."
          className="flex-1 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
        />
        <button onClick={send} disabled={!input.trim() || loading}
          className="bg-semantic-purple hover:bg-semantic-purple/90 disabled:opacity-40 text-white px-3 rounded-[8px] transition-colors">
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Contacts Section ────────────────────────────────────────────────────────

const CONTACT_ROLES = ['Primary Seller', 'Co-Seller', 'Spouse', 'Buyer', 'Buyer Agent', 'Attorney', 'Agent', 'Other']

function ContactsSection({ propertyId, initialSellers }: {
  propertyId: string
  initialSellers: PropertyDetail['sellers']
}) {
  const [sellers, setSellers] = useState(initialSellers)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; phone: string | null; email: string | null }>>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedRole, setSelectedRole] = useState('Primary Seller')

  async function searchContacts(q: string) {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.contacts ?? [])
    } catch { setResults([]) }
    setSearching(false)
  }

  async function addContact(contact: { id: string; name: string; phone: string | null; email: string | null }) {
    setAdding(true)
    try {
      const isPrimary = selectedRole === 'Primary Seller' || sellers.length === 0
      const res = await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ghlContactId: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          role: selectedRole,
          isPrimary,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSellers(prev => [...prev, data.seller])
        setShowSearch(false)
        setQuery('')
        setResults([])
      }
    } catch {}
    setAdding(false)
  }

  async function removeContact(sellerId: string) {
    try {
      const res = await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId }),
      })
      if (res.ok) setSellers(prev => prev.filter(s => s.id !== sellerId))
    } catch {}
  }

  async function updateRole(sellerId: string, role: string) {
    try {
      await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateRole', sellerId, role }),
      })
      setSellers(prev => prev.map(s => s.id === sellerId ? { ...s, role } : s))
    } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
          <Users size={10} className="inline -mt-0.5 text-gunner-red" /> Contacts ({sellers.length})
        </p>
        <button onClick={() => setShowSearch(!showSearch)}
          className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-0.5 transition-colors">
          {showSearch ? <X size={10} /> : <Plus size={10} />}
          {showSearch ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* GHL Contact search */}
      {showSearch && (
        <div className="mb-3 space-y-2">
          <input
            autoFocus value={query} onChange={e => searchContacts(e.target.value)}
            placeholder="Search GHL contacts..."
            className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
          />
          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
            className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-1.5 text-ds-fine text-txt-primary">
            {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {searching && <p className="text-ds-fine text-txt-muted">Searching...</p>}
          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {results.map(c => {
                const alreadyLinked = sellers.some(s => s.ghlContactId === c.id)
                return (
                  <button key={c.id} onClick={() => !alreadyLinked && addContact(c)}
                    disabled={alreadyLinked || adding}
                    className={`w-full text-left px-2.5 py-1.5 rounded-[6px] text-ds-fine transition-colors ${
                      alreadyLinked ? 'bg-surface-tertiary text-txt-muted cursor-not-allowed' : 'bg-surface-secondary hover:bg-surface-tertiary text-txt-primary'
                    }`}>
                    <p className="font-medium">{c.name}{alreadyLinked ? ' (linked)' : ''}</p>
                    <p className="text-txt-muted">{c.phone ?? c.email ?? '—'}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Linked contacts list */}
      {sellers.length === 0 ? (
        <p className="text-ds-fine text-txt-muted">No contacts linked</p>
      ) : (
        <div className="space-y-2">
          {sellers.map(s => (
            <div key={s.id} className="bg-surface-secondary rounded-[8px] px-2.5 py-2 group">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-ds-body text-txt-primary font-medium truncate">{titleCase(s.name)}</p>
                    <select value={s.role} onChange={e => updateRole(s.id, e.target.value)}
                      className="text-[9px] font-medium bg-transparent text-gunner-red cursor-pointer border-none focus:outline-none">
                      {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {s.phone && <p className="text-ds-fine text-txt-secondary">{formatPhone(s.phone)}</p>}
                  {s.email && <p className="text-ds-fine text-txt-secondary truncate">{s.email}</p>}
                </div>
                <button onClick={() => removeContact(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-semantic-red transition-all shrink-0 mt-0.5">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ property, dom, domColor, tenantSlug, runGhlAction, sending, actionMsg, ghlContactId, projectTypeOptions }: {
  property: PropertyDetail; dom: number; domColor: string
  tenantSlug: string; runGhlAction: (type: string, payload: Record<string, string>) => void
  sending: boolean; actionMsg: string; ghlContactId: string | null
  projectTypeOptions?: string[]
}) {
  // Local editable state — updates on save without page reload
  const [vals, setVals] = useState({
    askingPrice: property.askingPrice,
    mao: property.mao,
    currentOffer: property.currentOffer,
    contractPrice: property.contractPrice,
    highestOffer: property.highestOffer,
    acceptedPrice: property.acceptedPrice,
    assignmentFee: property.assignmentFee,
    finalProfit: property.finalProfit,
    beds: property.beds,
    baths: property.baths,
    sqft: property.sqft,
    yearBuilt: property.yearBuilt,
    lotSize: property.lotSize,
    propertyType: property.propertyType,
    projectType: property.projectType,
    propertyMarkets: property.propertyMarkets,
    occupancy: property.occupancy,
    lockboxCode: property.lockboxCode,
    description: property.description,
    internalNotes: property.internalNotes,
  })

  const [sources, setSources] = useState<Record<string, string>>(property.fieldSources ?? {})

  function handleArraySaved(field: string, vals: string[]) {
    setVals(prev => ({ ...prev, [field]: vals }))
  }

  function handleSaved(field: string, val: string | number | null, src?: string) {
    setVals(prev => {
      const next = { ...prev, [field]: val }

      // Auto-calculate assignment fee when accepted price is set and contract price exists
      if (field === 'acceptedPrice' && val && next.contractPrice) {
        const fee = Number(val) - Number(next.contractPrice)
        if (fee > 0) {
          next.assignmentFee = String(fee)
          // Persist to DB
          fetch(`/api/properties/${property.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentFee: String(fee), fieldSources: { assignmentFee: 'ai' } }),
          }).catch(() => {})
          setSources(p => ({ ...p, assignmentFee: 'ai' }))
        }
      }
      // Also recalculate if contract price changes and accepted price exists
      if (field === 'contractPrice' && val && next.acceptedPrice) {
        const fee = Number(next.acceptedPrice) - Number(val)
        if (fee > 0) {
          next.assignmentFee = String(fee)
          fetch(`/api/properties/${property.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentFee: String(fee), fieldSources: { assignmentFee: 'ai' } }),
          }).catch(() => {})
          setSources(p => ({ ...p, assignmentFee: 'ai' }))
        }
      }

      return next
    })
    if (src !== undefined) {
      setSources(prev => {
        const next = { ...prev }
        if (src) next[field] = src; else delete next[field]
        return next
      })
    }
  }

  // Computed: Est. Spread = Accepted (or Contract) - Asking
  const spread = vals.acceptedPrice && vals.contractPrice
    ? Number(vals.acceptedPrice) - Number(vals.contractPrice)
    : null

  return (
    <div className="space-y-5">
      {/* Row 1 — Pricing Intent */}
      <div>
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Pricing Intent</p>
        <div className="grid grid-cols-3 gap-3">
          <InlineEditCard label="ASKING PRICE" value={vals.askingPrice} field="askingPrice" propertyId={property.id} source={sources.askingPrice} onSaved={handleSaved} />
          <InlineEditCard label="MAX ALLOWABLE OFFER" value={vals.mao} field="mao" propertyId={property.id} source={sources.mao} onSaved={handleSaved} />
          <InlineEditCard label="CURRENT OFFER" value={vals.currentOffer} field="currentOffer" propertyId={property.id} source={sources.currentOffer} onSaved={handleSaved} />
        </div>
      </div>

      {/* Row 2 — Deal Outcomes */}
      <div>
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Deal Outcomes</p>
        <div className="grid grid-cols-3 gap-3">
          <InlineEditCard label="CONTRACT PRICE" value={vals.contractPrice} field="contractPrice" propertyId={property.id} source={sources.contractPrice} onSaved={handleSaved} />
          <InlineEditCard label="HIGHEST OFFER" value={vals.highestOffer} field="highestOffer" propertyId={property.id} source={sources.highestOffer} onSaved={handleSaved} />
          <InlineEditCard label="ACCEPTED PRICE" value={vals.acceptedPrice} field="acceptedPrice" propertyId={property.id} source={sources.acceptedPrice} onSaved={handleSaved} />
        </div>
      </div>

      {/* Row 3 — Profit Summary */}
      <div>
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Profit Summary</p>
        <div className="grid grid-cols-3 gap-3">
          {/* Est. Spread — computed, read-only */}
          <div className="bg-surface-secondary rounded-[10px] px-3 py-2.5">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">EST. SPREAD</p>
            <p className={`text-ds-card font-semibold mt-0.5 ${spread != null ? (spread > 0 ? 'text-semantic-green' : 'text-semantic-red') : 'text-txt-muted'}`}>
              {spread != null ? `$${spread.toLocaleString()}` : '—'}
            </p>
          </div>
          <InlineEditCard label="ASSIGNMENT FEE" value={vals.assignmentFee} field="assignmentFee" propertyId={property.id} source={sources.assignmentFee} onSaved={handleSaved} />
          <InlineEditCard label="FINAL PROFIT" value={vals.finalProfit} field="finalProfit" propertyId={property.id} source={sources.finalProfit} onSaved={handleSaved} />
        </div>
      </div>

      {/* Property Details — structured grid */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        {/* Section header with source legend */}
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Property Details</p>
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-bold text-purple-500 bg-purple-50 px-1 py-0.5 rounded">API</span>
            <span className="text-[7px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded">AI</span>
            <span className="text-[7px] font-bold text-green-500 bg-green-50 px-1 py-0.5 rounded">EDITED</span>
          </div>
        </div>

        {/* Row 1: Type + Physical attributes (5 cols) */}
        <div className="grid grid-cols-5 divide-x divide-[rgba(0,0,0,0.04)]">
          <DetailCell label="Type" value={vals.propertyType} field="propertyType" propertyId={property.id} type="select" options={PROPERTY_TYPE_OPTIONS} source={sources.propertyType} onSaved={handleSaved} />
          <DetailCell label="Beds" value={vals.beds} field="beds" propertyId={property.id} type="number" source={sources.beds} onSaved={handleSaved} />
          <DetailCell label="Baths" value={vals.baths} field="baths" propertyId={property.id} type="number" source={sources.baths} onSaved={handleSaved} />
          <DetailCell label="Sqft" value={vals.sqft} field="sqft" propertyId={property.id} type="number" source={sources.sqft} onSaved={handleSaved} />
          <DetailCell label="Year Built" value={vals.yearBuilt} field="yearBuilt" propertyId={property.id} type="number" source={sources.yearBuilt} onSaved={handleSaved} />
        </div>

        {/* Row 2: Lot, Occupancy, Lockbox (3 cols) */}
        <div className="grid grid-cols-3 divide-x divide-[rgba(0,0,0,0.04)] border-t border-[rgba(0,0,0,0.04)]">
          <DetailCell label="Lot Size" value={vals.lotSize} field="lotSize" propertyId={property.id} source={sources.lotSize} onSaved={handleSaved} />
          <DetailCell label="Occupancy" value={vals.occupancy} field="occupancy" propertyId={property.id} type="select" options={['Vacant', 'Owner', 'Renter', 'Squatter', 'Family']} source={sources.occupancy} onSaved={handleSaved} />
          <DetailCell label="Lockbox" value={vals.lockboxCode} field="lockboxCode" propertyId={property.id} source={sources.lockboxCode} onSaved={handleSaved} />
        </div>

        {/* Row 3: Market tags */}
        <div className="border-t border-[rgba(0,0,0,0.04)]">
          <TagRow label="Market" values={vals.propertyMarkets} options={['Nashville', 'Columbia', 'Knoxville', 'Chattanooga']}
            field="propertyMarkets" propertyId={property.id} allowCustom onSaved={handleArraySaved} />
        </div>

        {/* Row 4: Project Type tags */}
        <div className="border-t border-[rgba(0,0,0,0.04)]">
          <TagRow label="Project Type" values={vals.projectType} options={projectTypeOptions ?? PROJECT_TYPE_OPTIONS}
            field="projectType" propertyId={property.id} allowCustom onSaved={handleArraySaved} />
        </div>
      </div>

      {/* Description — click to edit, blue when AI-generated */}
      <InlineTextArea label="Description" value={vals.description} field="description" propertyId={property.id} onSaved={handleSaved}
        {...(sources.description === 'ai' ? { labelColor: 'text-blue-700', bgColor: 'bg-blue-50 border-[0.5px] border-blue-200', textColor: 'text-blue-900' } : {})}
        source={sources.description} />

      {/* Internal notes — click to edit */}
      <InlineTextArea label="Internal Notes" value={vals.internalNotes} field="internalNotes" propertyId={property.id}
        labelColor="text-amber-700" bgColor="bg-amber-50 border-[0.5px] border-amber-200" textColor="text-amber-900" onSaved={handleSaved} />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: seller + assigned + actions */}
        <div className="space-y-4">
          {/* Contacts (linked GHL contacts) */}
          <ContactsSection propertyId={property.id} initialSellers={property.sellers} />

          {/* Assigned */}
          {property.assignedTo && (
            <div>
              <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Assigned To</p>
              <p className="text-ds-body text-txt-primary">{property.assignedTo.name}</p>
              <p className="text-ds-fine text-txt-muted">{property.assignedTo.role.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
          )}

          {/* AI Actions */}
          <InlineAI propertyId={property.id} />
        </div>

        {/* Right: calls + tasks */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calls */}
          <div>
            {(() => {
              // Filter to graded calls with duration > 0
              const gradedCalls = property.calls.filter(c => c.gradingStatus === 'COMPLETED' && (c.durationSeconds ?? 0) > 0)
              return <>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
              <Phone size={10} className="inline -mt-0.5 text-gunner-red" /> Graded Calls ({gradedCalls.length})
            </p>
            {gradedCalls.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">No graded calls yet</p>
            ) : (
              <div className="space-y-1">
                {gradedCalls.map(c => {
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
              </>
            })()}
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
  const [researching, setResearching] = useState(false)
  const [research, setResearch] = useState<Record<string, unknown> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/properties/${property.id}/research`)
      .then(r => r.json())
      .then(d => { if (d.research) setResearch(d.research as Record<string, unknown>); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [property.id])

  async function handleReResearch() {
    setResearching(true); setError('')
    try {
      const res = await fetch(`/api/properties/${property.id}/research`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResearch(data.research)
        // BatchData enrichment runs in background — reload after a few seconds
        setTimeout(async () => {
          const r = await fetch(`/api/properties/${property.id}/research`)
          const d = await r.json()
          if (d.research) setResearch(d.research as Record<string, unknown>)
        }, 5000)
      } else { setError(data.error ?? 'Research failed') }
    } catch { setError('Network error') }
    setResearching(false)
  }

  const googleData = research?.googlePlaceData as Record<string, unknown> | null
  const coords = research?.coordinates as { lat: number; lng: number } | null
  const streetViewUrl = research?.streetViewUrl as string | null
  const researchedAt = research?.researchedAt as string | null
  const bd = (research?.batchData ?? {}) as Record<string, unknown>
  const hasBatchData = bd.enrichedAt != null
  const fullAddr = `${property.address}, ${property.city}, ${property.state} ${property.zip}`

  const fmt$ = (v: unknown) => v != null ? `$${Number(v).toLocaleString()}` : '—'
  const fmtStr = (v: unknown) => v != null && v !== '' ? String(v) : '—'
  const fmtPct = (v: unknown) => v != null ? `${Number(v).toFixed(1)}%` : '—'
  const fmtBool = (v: unknown) => v === true ? 'Yes' : v === false ? 'No' : '—'

  // Research data is stored in zillowData.batchData — editable fields stored separately
  const [editedFields, setEditedFields] = useState<Record<string, string>>({})
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function getResearchSource(key: string): 'api' | 'user' | null {
    if (editedFields[key] !== undefined) return 'user'
    if (bd[key] != null && bd[key] !== '' && bd[key] !== false) return 'api'
    return null
  }

  function getDisplayValue(key: string, formatted: string): string {
    if (editedFields[key] !== undefined) return editedFields[key]
    return formatted
  }

  function startEdit(key: string, currentValue: string) {
    setEditingField(key)
    setEditValue(currentValue === '—' ? '' : currentValue)
  }

  function saveEdit(key: string) {
    setEditedFields(prev => ({ ...prev, [key]: editValue }))
    setEditingField(null)
  }

  // Source-based styling: purple=API, blue=AI, green=user
  function DataCard({ label, value, fieldKey, highlight }: { label: string; value: string; fieldKey?: string; highlight?: boolean }) {
    const source = fieldKey ? getResearchSource(fieldKey) : (highlight ? 'api' : null)
    const displayVal = fieldKey ? getDisplayValue(fieldKey, value) : value
    const isEditing = editingField === fieldKey

    const bgColor = source === 'api' ? 'bg-purple-50 border-[0.5px] border-purple-200'
      : source === 'user' ? 'bg-green-50 border-[0.5px] border-green-200'
      : 'bg-surface-secondary'
    const labelColor = source === 'api' ? 'text-purple-600' : source === 'user' ? 'text-green-600' : 'text-txt-muted'
    const valueColor = source === 'api' ? 'text-purple-800' : source === 'user' ? 'text-green-800' : displayVal !== '—' ? 'text-txt-primary' : 'text-txt-muted'

    if (isEditing && fieldKey) {
      return (
        <div className={`rounded-[8px] px-3 py-2 ${bgColor}`}>
          <p className={`text-[8px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</p>
          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
            onBlur={() => saveEdit(fieldKey)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(fieldKey); if (e.key === 'Escape') setEditingField(null) }}
            className="w-full bg-white border-[0.5px] border-green-300 rounded px-1.5 py-0.5 text-ds-fine font-semibold mt-0.5 focus:outline-none" />
        </div>
      )
    }

    return (
      <div onClick={() => fieldKey && startEdit(fieldKey, displayVal)}
        className={`rounded-[8px] px-3 py-2 ${bgColor} ${fieldKey ? 'cursor-pointer hover:ring-1 hover:ring-gunner-red/20' : ''} transition-all group relative`}>
        {source && (
          <span className={`absolute top-1 right-1.5 text-[7px] font-bold uppercase ${source === 'api' ? 'text-purple-400' : 'text-green-400'}`}>
            {source === 'api' ? 'API' : 'EDITED'}
          </span>
        )}
        <p className={`text-[8px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</p>
        <p className={`text-ds-fine font-semibold mt-0.5 ${valueColor}`}>
          {displayVal}
          {fieldKey && <Pencil size={7} className="inline ml-1 opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ds-label font-semibold text-txt-primary">Property Research</h3>
          <p className="text-ds-fine text-txt-muted">
            {error ? <span className="text-semantic-red">{error}</span>
              : researchedAt ? `Last updated: ${format(new Date(researchedAt), 'MMM d, yyyy h:mm a')}`
              : loaded ? 'Not yet researched' : 'Loading...'}
            {hasBatchData && <span className="ml-2 text-[9px] text-purple-600 font-medium">BatchData enriched</span>}
          </p>
        </div>
        <button onClick={handleReResearch} disabled={researching}
          className="text-ds-fine font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 px-3 py-1.5 rounded-[8px] flex items-center gap-1 transition-colors">
          {researching && <Loader2 size={11} className="animate-spin" />}
          {researching ? 'Researching...' : researchedAt ? 'Re-Research' : 'Research Now'}
        </button>
      </div>

      {/* Street View */}
      {streetViewUrl && (
        <div className="rounded-[10px] overflow-hidden border-[0.5px] border-[rgba(0,0,0,0.08)]">
          <img src={streetViewUrl} alt="Street view" className="w-full h-48 object-cover" />
        </div>
      )}

      {/* Source legend */}
      <div className="flex items-center gap-3">
        <span className="text-[9px] text-txt-muted">Sources:</span>
        <span className="text-[9px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">API</span>
        <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">AI</span>
        <span className="text-[9px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Edited</span>
        <span className="text-[9px] text-txt-muted">Click any field to edit</span>
      </div>

      {/* Valuation */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Valuation</p>
        </div>
        <div className="grid grid-cols-3 gap-3 p-3">
          <DataCard label="Estimated Value" value={fmt$(bd.estimatedValue)} fieldKey="estimatedValue" />
          <DataCard label="Assessed Value" value={fmt$(bd.assessedValue)} fieldKey="assessedValue" />
          <DataCard label="APN" value={fmtStr(bd.apn)} fieldKey="apn" />
        </div>
        <div className="grid grid-cols-3 gap-3 px-3 pb-3">
          <DataCard label="Price Range" value={bd.priceRangeMin != null ? `${fmt$(bd.priceRangeMin)} – ${fmt$(bd.priceRangeMax)}` : '—'} fieldKey="priceRangeMin" />
          <DataCard label="Confidence" value={bd.confidenceScore != null ? `${bd.confidenceScore}%` : '—'} fieldKey="confidenceScore" />
          <DataCard label="As Of" value={bd.enrichedAt ? format(new Date(String(bd.enrichedAt)), 'MMM d, yyyy') : '—'} />
        </div>
      </div>

      {/* Owner Intel */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Owner Intelligence</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
          <DataCard label="Owner" value={fmtStr(bd.ownerName)} fieldKey="ownerName" />
          <DataCard label="Absentee" value={fmtBool(bd.absenteeOwner)} fieldKey="absenteeOwner" highlight={bd.absenteeOwner != null} />
          <DataCard label="Owner Occupied" value={fmtBool(bd.ownerOccupied)} fieldKey="ownerOccupied" />
          <DataCard label="County" value={fmtStr(bd.county)} fieldKey="county" />
        </div>
        {(bd.ownerMailingAddress != null || editedFields.ownerMailingAddress) && (
          <div className="px-3 pb-3">
            <DataCard label="Owner Mailing Address" value={fmtStr(bd.ownerMailingAddress)} fieldKey="ownerMailingAddress" />
          </div>
        )}
      </div>

      {/* Deal Signals — same source color system */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Deal Signals</p>
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-bold text-purple-500 bg-purple-50 px-1 py-0.5 rounded">API</span>
            <span className="text-[7px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded">AI</span>
            <span className="text-[7px] font-bold text-green-500 bg-green-50 px-1 py-0.5 rounded">EDITED</span>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 p-3">
          {[
            { k: 'highEquity', l: 'High Equity' },
            { k: 'freeAndClear', l: 'Free & Clear' },
            { k: 'cashBuyer', l: 'Cash Buyer' },
            { k: 'taxDefault', l: 'Tax Default' },
            { k: 'preforeclosure', l: 'Pre-Foreclosure' },
            { k: 'vacant', l: 'Vacant' },
            { k: 'absenteeOwner', l: 'Absentee Owner' },
            { k: 'corporateOwned', l: 'Corporate' },
            { k: 'trustOwned', l: 'Trust' },
          ].map(flag => {
            // Determine source: user override > API direct > AI derived
            const edited = editedFields[flag.k]
            const apiVal = bd[flag.k]
            const isTrue = edited !== undefined ? edited === 'Yes' || edited === 'true' : apiVal === true
            const isFalse = edited !== undefined ? edited === 'No' || edited === 'false' : apiVal === false

            // Absentee: if API says false but ownerOccupied is true, that's an AI derivation
            // Determine source for coloring
            let source: 'api' | 'ai' | 'user' | null = null
            if (edited !== undefined) source = 'user'
            else if (apiVal === true) source = 'api' // only color when YES from API

            const s = sourceStyles(source)

            // Only show colored card when YES — No/empty stay blank/gray
            const showColored = isTrue && source != null

            return (
              <div key={flag.k}
                onClick={() => startEdit(flag.k, isTrue ? 'Yes' : isFalse ? 'No' : '')}
                className={`rounded-[8px] px-2.5 py-2 cursor-pointer hover:ring-1 hover:ring-gunner-red/20 transition-all group relative ${showColored ? s.bg : 'bg-surface-secondary'}`}
              >
                {showColored && s.tag && (
                  <span className={`absolute top-0.5 right-1 text-[6px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
                )}
                <p className={`text-[8px] font-semibold uppercase tracking-wider ${showColored ? s.label : 'text-txt-muted'}`}>{flag.l}</p>
                {editingField === flag.k ? (
                  <select autoFocus value={editValue}
                    onChange={e => { setEditValue(e.target.value); saveEdit(flag.k) }}
                    onBlur={() => setEditingField(null)}
                    className="w-full bg-white border-[0.5px] border-green-300 rounded px-1 py-0.5 text-ds-fine font-semibold mt-0.5 focus:outline-none">
                    <option value="">—</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                ) : (
                  <p className={`text-ds-fine font-bold mt-0.5 ${isTrue ? (showColored ? s.value : 'text-semantic-green') : 'text-txt-muted'}`}>
                    {isTrue ? '✓ Yes' : '—'}
                    <Pencil size={6} className="inline ml-1 opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Equity & Financial */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Equity & Financial</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
          <DataCard label="Equity" value={fmtPct(bd.equityPercent)} fieldKey="equityPercent" />
          <DataCard label="LTV" value={fmtPct(bd.ltv)} fieldKey="ltv" />
          <DataCard label="Open Liens" value={bd.totalOpenLienCount != null ? String(bd.totalOpenLienCount) : '—'} fieldKey="totalOpenLienCount" />
          <div />
        </div>
      </div>

      {/* Sale History */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Sale History</p>
        </div>
        <div className="grid grid-cols-3 gap-3 p-3">
          <DataCard label="Last Sale Price" value={fmt$(bd.lastSalePrice)} fieldKey="lastSalePrice" />
          <DataCard label="Last Sale Date" value={bd.lastSaleDate ? format(new Date(String(bd.lastSaleDate)), 'MMM d, yyyy') : '—'} fieldKey="lastSaleDate" />
          <DataCard label="Sale Type" value={fmtStr(bd.lastSaleType)} fieldKey="lastSaleType" />
        </div>
      </div>

      {/* Permits */}
      {bd.permitCount != null && Number(bd.permitCount) > 0 && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
          <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Permits ({String(bd.permitCount)})</p>
          </div>
          <div className="flex flex-wrap gap-1.5 p-3">
            {Array.isArray(bd.permitTags) && (bd.permitTags as string[]).map(tag => (
              <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-txt-secondary">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* External links */}
      <div className="flex gap-3">
        <a href={`https://www.zillow.com/homes/${encodeURIComponent(fullAddr)}`} target="_blank" rel="noopener noreferrer"
          className="text-ds-fine font-medium text-semantic-blue hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> Zillow
        </a>
        <a href={`https://www.google.com/maps/place/${encodeURIComponent(fullAddr)}`} target="_blank" rel="noopener noreferrer"
          className="text-ds-fine font-medium text-semantic-blue hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> Google Maps
        </a>
        {coords && (
          <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords.lat},${coords.lng}`} target="_blank" rel="noopener noreferrer"
            className="text-ds-fine font-medium text-semantic-blue hover:underline flex items-center gap-1">
            <ExternalLink size={10} /> Street View
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Buyers Tab ──────────────────────────────────────────────────────────────

function BuyersTab({ property, tenantSlug }: { property: PropertyDetail; tenantSlug: string }) {
  const [buyers, setBuyers] = useState<Array<{
    id: string; name: string; phone: string | null; email: string | null
    company: string | null; tier: string; markets: string[]; tags: string[]
    notes: string | null; matchScore: number; scoreBreakdown?: string
  }>>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [addedBuyers, setAddedBuyers] = useState<typeof buyers>([])
  const [addedLoaded, setAddedLoaded] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [stages, setStages] = useState<Array<{ id: string; name: string }>>([])
  const [formOptions, setFormOptions] = useState<{ tiers: string[]; buybox: string[]; markets: string[]; speeds: string[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [addForm, setAddForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    buyerTier: '', buybox: [] as string[], markets: [] as string[],
    secondaryMarket: '', source: '', stageId: '',
    verifiedFunding: false, hasPurchased: false, responseSpeed: '', notes: '', tags: '',
  })

  const tierColors: Record<string, string> = {
    priority: 'bg-amber-100 text-amber-700',
    qualified: 'bg-green-100 text-green-700',
    jv: 'bg-blue-100 text-blue-700',
    unqualified: 'bg-gray-100 text-gray-500',
    halted: 'bg-red-100 text-red-500',
  }
  const tierEmoji: Record<string, string> = { priority: '👑', qualified: '⭐', jv: '🤝', unqualified: '👤', halted: '⛔' }

  async function loadAddedBuyers() {
    if (addedLoaded) return
    try {
      const res = await fetch(`/api/properties/${property.id}/buyers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getManualBuyers' }),
      })
      const data = await res.json()
      setAddedBuyers(data.buyers ?? [])
      setAddedLoaded(true)
    } catch {}
  }

  // Load added buyers + auto-match on mount
  useEffect(() => {
    loadAddedBuyers()
    if (!fetched && !loading) matchBuyers()
  }, [property.id])

  const [syncMsg, setSyncMsg] = useState('')

  async function runSync() {
    let offset = 0
    let done = false
    while (!done) {
      setSyncMsg(`Syncing buyers from GHL... (${offset} processed)`)
      try {
        const res = await fetch('/api/buyers/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset }),
        })
        const data = await res.json()
        if (!res.ok) { setSyncMsg('Sync failed'); return false }
        offset = data.offset
        done = data.done
        setSyncMsg(data.message)
      } catch { setSyncMsg('Sync failed — network error'); return false }
    }
    return true
  }

  async function matchBuyers() {
    setLoading(true)
    setSyncMsg('')
    try {
      const res = await fetch(`/api/properties/${property.id}/buyers`)
      const data = await res.json()
      if (data.needsSync) {
        // DB empty — run batched sync, then retry match
        const ok = await runSync()
        if (ok) {
          setSyncMsg('Matching buyers...')
          const r2 = await fetch(`/api/properties/${property.id}/buyers`)
          const d2 = await r2.json()
          setBuyers(d2.buyers ?? [])
          setSyncMsg('')
        }
        setFetched(true)
        setLoading(false)
        return
      }
      setBuyers(data.buyers ?? [])
      setSyncMsg('')
      setFetched(true)
    } catch { setBuyers([]) }
    setLoading(false)
  }

  async function openAddForm() {
    setShowAddForm(true)
    if (!formOptions) {
      setLoadingOptions(true)
      try {
        const res = await fetch(`/api/properties/${property.id}/buyers`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getFormOptions' }),
        })
        const data = await res.json()
        setStages(data.stages ?? [])
        setFormOptions(data.options ?? { tiers: [], buybox: [], markets: [], speeds: [] })
        if (data.stages?.length > 0) setAddForm(f => ({ ...f, stageId: data.stages[0].id }))
        if (data.options?.tiers?.length > 0) setAddForm(f => ({ ...f, buyerTier: data.options.tiers[0] }))
      } catch {}
      setLoadingOptions(false)
    }
  }

  async function submitBuyer() {
    if (!addForm.firstName || !addForm.phone || !addForm.stageId || addForm.buybox.length === 0 || addForm.markets.length === 0 || !addForm.source) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/buyers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.buyer) setAddedBuyers(prev => [...prev, data.buyer])
        setShowAddForm(false)
        setAddForm({ firstName: '', lastName: '', phone: '', email: '', buyerTier: '', buybox: [], markets: [], secondaryMarket: '', source: '', stageId: stages[0]?.id ?? '', verifiedFunding: false, hasPurchased: false, responseSpeed: '', notes: '', tags: '' })
        // buyer added
      }
    } catch {}
    setSaving(false)
  }

  function toggleArrayField(field: 'buybox' | 'markets', val: string) {
    setAddForm(f => ({
      ...f,
      [field]: f[field].includes(val) ? f[field].filter(v => v !== val) : [...f[field], val],
    }))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ds-label font-semibold text-txt-primary">Buyers</h3>
          {syncMsg && <p className="text-[10px] text-txt-muted mt-0.5">{syncMsg}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={openAddForm}
            className="text-ds-fine font-medium text-semantic-blue hover:text-semantic-blue/80 flex items-center gap-1 transition-colors">
            <Plus size={11} /> Add
          </button>
          <button onClick={async () => { const ok = await runSync(); if (ok) matchBuyers() }} disabled={loading}
            className="text-ds-fine font-medium text-semantic-purple hover:text-semantic-purple/80 flex items-center gap-1 transition-colors disabled:opacity-50">
            {loading && syncMsg ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />}
            Sync CRM
          </button>
          <button onClick={matchBuyers} disabled={loading}
            className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-1 transition-colors disabled:opacity-50">
            {loading && !syncMsg ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />}
            {fetched ? 'Rematch' : 'Match'}
          </button>
        </div>
      </div>

      {/* Add Buyer Form */}
      {showAddForm && (
        <div className="bg-surface-secondary rounded-[10px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">Add Buyer to GHL</p>
            <button onClick={() => setShowAddForm(false)} className="text-txt-muted hover:text-txt-secondary"><X size={14} /></button>
          </div>

          {/* Required fields */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-txt-muted uppercase block mb-0.5">First Name *</label>
              <input value={addForm.firstName} onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Phone *</label>
              <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(615) 555-1234"
                className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none" />
            </div>
          </div>

          {loadingOptions && <p className="text-ds-fine text-txt-muted">Loading options from GHL...</p>}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Buyer Tier *</label>
              <select value={addForm.buyerTier} onChange={e => setAddForm(f => ({ ...f, buyerTier: e.target.value }))}
                className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine">
                {(formOptions?.tiers ?? []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Pipeline Stage *</label>
              <select value={addForm.stageId} onChange={e => setAddForm(f => ({ ...f, stageId: e.target.value }))}
                className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine">
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Source *</label>
            <input value={addForm.source} onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}
              placeholder="e.g. Referral, Website, Cold Call"
              className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none" />
          </div>

          {/* Buybox — multi-select pills */}
          <div>
            <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Buybox * (select all that apply)</label>
            <div className="flex flex-wrap gap-1.5">
              {(formOptions?.buybox ?? []).map(b => (
                <button key={b} onClick={() => toggleArrayField('buybox', b)}
                  className={`text-[10px] font-medium px-2 py-1 rounded-full transition-colors ${
                    addForm.buybox.includes(b) ? 'bg-gunner-red text-white' : 'bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary hover:bg-surface-tertiary'
                  }`}>{b}</button>
              ))}
            </div>
          </div>

          {/* Markets — multi-select pills */}
          <div>
            <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Market(s) * (select all that apply)</label>
            <div className="flex flex-wrap gap-1.5">
              {(formOptions?.markets ?? []).map(m => (
                <button key={m} onClick={() => toggleArrayField('markets', m)}
                  className={`text-[10px] font-medium px-2 py-1 rounded-full transition-colors ${
                    addForm.markets.includes(m) ? 'bg-gunner-red text-white' : 'bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary hover:bg-surface-tertiary'
                  }`}>{m}</button>
              ))}
            </div>
          </div>

          {/* Optional fields — collapsible */}
          <details className="text-ds-fine">
            <summary className="text-[9px] text-txt-muted uppercase cursor-pointer hover:text-txt-secondary">Optional Fields</summary>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Last Name</label>
                  <input value={addForm.lastName} onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))}
                    className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Email</label>
                  <input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Response Speed</label>
                  <select value={addForm.responseSpeed} onChange={e => setAddForm(f => ({ ...f, responseSpeed: e.target.value }))}
                    className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine">
                    <option value="">—</option>
                    {(formOptions?.speeds ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Secondary Market</label>
                  <input value={addForm.secondaryMarket} onChange={e => setAddForm(f => ({ ...f, secondaryMarket: e.target.value }))}
                    placeholder="e.g. Arkansas"
                    className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-ds-fine text-txt-secondary cursor-pointer">
                  <input type="checkbox" checked={addForm.verifiedFunding} onChange={e => setAddForm(f => ({ ...f, verifiedFunding: e.target.checked }))} className="accent-gunner-red" />
                  Verified Funding
                </label>
                <label className="flex items-center gap-1.5 text-ds-fine text-txt-secondary cursor-pointer">
                  <input type="checkbox" checked={addForm.hasPurchased} onChange={e => setAddForm(f => ({ ...f, hasPurchased: e.target.checked }))} className="accent-gunner-red" />
                  Purchased Before
                </label>
              </div>
              <div>
                <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Tags (comma separated)</label>
                <input value={addForm.tags} onChange={e => setAddForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="flipper, knoxville"
                  className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none" />
              </div>
              <div>
                <label className="text-[9px] text-txt-muted uppercase block mb-0.5">Notes</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none resize-none" />
              </div>
            </div>
          </details>

          <button onClick={submitBuyer}
            disabled={!addForm.firstName || !addForm.phone || !addForm.stageId || addForm.buybox.length === 0 || addForm.markets.length === 0 || !addForm.source || saving}
            className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[8px] transition-colors">
            {saving ? 'Creating in GHL...' : 'Add Buyer'}
          </button>
        </div>
      )}

      {/* Added + Matched side by side */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Added buyers */}
        <div>
          <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">
            Added ({addedBuyers.length})
          </p>
          {addedBuyers.length === 0 ? (
            <div className="bg-surface-secondary rounded-[10px] p-4 text-center">
              <p className="text-ds-fine text-txt-muted">No buyers added yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {addedBuyers.map(b => (
                <BuyerRow key={b.id} buyer={b} tierColors={tierColors} />
              ))}
            </div>
          )}
        </div>

        {/* Matched buyers */}
        <div>
          <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">
            Matched {fetched ? `(${buyers.length})` : ''}
          </p>
          {!fetched && !loading ? (
            <div className="bg-surface-secondary rounded-[10px] p-4 text-center">
              <p className="text-ds-fine text-txt-muted">Click &ldquo;Match from CRM&rdquo; to find buyers</p>
            </div>
          ) : loading ? (
            <div className="py-6 text-center">
              <Loader2 size={14} className="animate-spin text-txt-muted mx-auto" />
              {syncMsg && <p className="text-ds-fine text-txt-muted mt-2">{syncMsg}</p>}
            </div>
          ) : buyers.length === 0 ? (
            <div className="bg-surface-secondary rounded-[10px] p-4 text-center">
              <p className="text-ds-fine text-txt-muted">No matching buyers for this market</p>
            </div>
          ) : (
            <div className="space-y-2">
              {buyers.map(b => (
                <BuyerRow key={b.id} buyer={b} tierColors={tierColors} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BuyerRow({ buyer: b, tierColors }: {
  buyer: { id: string; name: string; phone: string | null; email: string | null; tier: string; markets: string[]; buybox?: string; matchScore: number; scoreBreakdown?: string }
  tierColors: Record<string, string>
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-secondary transition-colors rounded-[6px] group">
      {/* Score */}
      <div className="w-8 text-center shrink-0 relative">
        <span className={`text-ds-fine font-bold ${b.matchScore >= 75 ? 'text-semantic-green' : b.matchScore >= 60 ? 'text-semantic-amber' : 'text-txt-muted'}`}>
          {b.matchScore || '—'}
        </span>
        {b.scoreBreakdown && b.scoreBreakdown !== 'Manually added' && (
          <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block bg-gray-900 text-white text-[9px] px-2.5 py-1.5 rounded-[6px] shadow-lg whitespace-nowrap">
            {b.scoreBreakdown.split(', ').map((part, i) => <div key={i}>{part}</div>)}
          </div>
        )}
      </div>
      {/* Tier badge */}
      <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 capitalize ${tierColors[b.tier] ?? tierColors.unqualified}`}>
        {b.tier}
      </span>
      {/* Name */}
      <span className="text-ds-fine font-medium text-txt-primary truncate min-w-0 flex-1">{titleCase(b.name)}</span>
      {/* Phone */}
      <span className="text-[10px] text-txt-muted shrink-0 hidden sm:block w-28">{b.phone ? formatPhone(b.phone) : ''}</span>
      {/* Markets */}
      <span className="text-[10px] text-txt-muted truncate shrink-0 hidden md:block w-24">{b.markets.join(', ')}</span>
    </div>
  )
}

// ─── Outreach Tab ────────────────────────────────────────────────────────────

function OutreachTab({ property }: { property: PropertyDetail }) {
  const [subTab, setSubTab] = useState<'send' | 'offer' | 'showing'>('send')
  const [logs, setLogs] = useState<Array<{
    id: string; type: string; channel: string; recipientName: string; recipientContact: string
    ghlContactId: string | null; notes: string | null; offerAmount: number | null
    offerStatus: string | null; showingDate: string | null; showingStatus: string | null
    source: string; loggedAt: string; loggedByName: string
  }>>([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formType, setFormType] = useState<'send' | 'offer' | 'showing'>('send')

  // GHL contact search state
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<Array<{ id: string; name: string; phone: string | null; email: string | null }>>([])
  const [contactSearching, setContactSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string; phone: string | null; email: string | null } | null>(null)

  // Form fields
  const [channel, setChannel] = useState('sms')
  const [notes, setNotes] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [showingDate, setShowingDate] = useState('')
  const [showingTime, setShowingTime] = useState('')

  useEffect(() => {
    fetch(`/api/properties/${property.id}/outreach`).then(r => r.json()).then(d => { setLogs(d.logs ?? []); setLoaded(true) }).catch(() => setLoaded(true))
  }, [property.id])

  const filtered = logs.filter(l => l.type === subTab)
  const counts = { send: logs.filter(l => l.type === 'send').length, offer: logs.filter(l => l.type === 'offer').length, showing: logs.filter(l => l.type === 'showing').length }

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
    setChannel('sms')
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
      if (formType === 'send') payload.channel = channel
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

      await fetch(`/api/properties/${property.id}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const res = await fetch(`/api/properties/${property.id}/outreach`)
      const d = await res.json()
      setLogs(d.logs ?? [])
      resetForm()
    } catch {}
    setSaving(false)
  }

  async function refreshLogs() {
    const res = await fetch(`/api/properties/${property.id}/outreach`)
    const d = await res.json()
    setLogs(d.logs ?? [])
  }

  const typeIcons: Record<string, typeof Send> = { send: Send, offer: DollarSign, showing: Clock }
  const typeColors: Record<string, string> = { send: 'text-semantic-purple', offer: 'text-semantic-green', showing: 'text-semantic-blue' }

  return (
    <div className="space-y-4">
      {/* Header with pill filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {(['send', 'offer', 'showing'] as const).map(t => (
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

      {/* New log form */}
      {showForm && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] p-4 space-y-3 shadow-sm">
          {/* Type selector */}
          <div>
            <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Type</label>
            <div className="flex gap-2">
              {(['send', 'offer', 'showing'] as const).map(t => {
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

          {/* Contact search */}
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

          {/* Type-specific fields */}
          {formType === 'send' && (
            <div>
              <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Channel</label>
              <div className="flex gap-2">
                {[{ v: 'sms', l: 'SMS' }, { v: 'email', l: 'Email' }, { v: 'call', l: 'Call' }, { v: 'in_person', l: 'In Person' }].map(o => (
                  <button key={o.v} onClick={() => setChannel(o.v)}
                    className={`px-3 py-1.5 text-[10px] font-medium rounded-[6px] border-[0.5px] transition-all ${
                      channel === o.v ? 'border-gunner-red bg-gunner-red-light text-gunner-red' : 'border-[rgba(0,0,0,0.08)] text-txt-muted hover:text-txt-secondary'
                    }`}>{o.l}</button>
                ))}
              </div>
            </div>
          )}

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

          {/* Notes */}
          <div>
            <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional details..." rows={2}
              className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-ds-fine resize-none placeholder-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20" />
          </div>

          <button onClick={saveLog} disabled={!selectedContact || saving}
            className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2.5 rounded-[8px] transition-colors">
            {saving ? 'Saving...' : `Log ${formType === 'send' ? 'Send' : formType === 'offer' ? 'Offer' : 'Showing'}`}
          </button>
        </div>
      )}

      {/* Log list */}
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

// ─── Outreach Log Card ──────────────────────────────────────────────────────

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
  // Parse ISO (UTC) → local date/time for editing
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
      // Construct Date in local timezone, send as ISO (UTC) so server stores correctly
      const dt = new Date(`${editDate}T${editTime || '09:00'}:00`)
      data.showingDate = dt.toISOString()
    }
    await updateField(data)
    setEditing(false)
  }

  const { icon: TypeIcon, bg: typeBg } = LOG_TYPE_ICONS[l.type] ?? LOG_TYPE_ICONS.send
  const sourceLabel = l.source === 'AI' ? 'AI' : l.source === 'Blast' ? 'Blast' : l.source === 'Auto' ? 'Auto' : 'Manual'
  const sourceColor = l.source === 'AI' ? 'bg-purple-100 text-purple-700' : l.source === 'Blast' ? 'bg-fuchsia-100 text-fuchsia-700' : l.source === 'Auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'

  const CHANNEL_COLORS: Record<string, string> = {
    sms: 'bg-blue-100 text-blue-700', email: 'bg-purple-100 text-purple-700',
    call: 'bg-green-100 text-green-700', in_person: 'bg-amber-100 text-amber-700',
  }
  const CHANNEL_LABELS: Record<string, string> = { sms: 'SMS', email: 'Email', call: 'Call', in_person: 'In Person' }

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] px-3 py-3 group hover:border-[rgba(0,0,0,0.12)] transition-colors">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${typeBg}`}>
          <TypeIcon size={12} className="text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row: name + source */}
          <div className="flex items-center gap-2">
            <p className="text-ds-body font-semibold text-txt-primary">{titleCase(l.recipientName)}</p>
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${sourceColor}`}>{sourceLabel}</span>
          </div>

          {/* Send: colored channel badge */}
          {l.type === 'send' && (
            <div className="mt-1">
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${CHANNEL_COLORS[l.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                {CHANNEL_LABELS[l.channel] ?? l.channel}
              </span>
            </div>
          )}

          {/* Offer: amount */}
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

          {/* Showing: date/time */}
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

          {/* Notes */}
          {editing ? (
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
              className="w-full mt-1.5 bg-surface-secondary border-[0.5px] border-gunner-red/30 rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none resize-none" />
          ) : (
            l.notes && <p className="text-ds-fine text-txt-muted mt-1">{l.notes}</p>
          )}
        </div>

        {/* Right column: status + date + actions */}
        <div className="text-right shrink-0 space-y-1.5 flex flex-col items-end">
          {/* Status dropdown — far right for offers */}
          {l.type === 'offer' && (
            <select value={l.offerStatus ?? 'Pending'} onChange={e => updateField({ offerStatus: e.target.value, offerAmount: l.offerAmount })}
              disabled={saving}
              className={`text-[9px] font-semibold px-2.5 py-1 rounded-full border-none cursor-pointer ${OFFER_STATUS_COLORS[l.offerStatus ?? 'Pending'] ?? OFFER_STATUS_COLORS.Pending}`}>
              {OFFER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* Status dropdown — far right for showings */}
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

// ─── Activity / Messaging Tab ────────────────────────────────────────────────

function ActivityTab({ property }: {
  property: PropertyDetail
  tenantSlug: string
  runGhlAction: (type: string, payload: Record<string, string>) => void
  sending: boolean; ghlContactId: string | null
}) {
  const [messages, setMessages] = useState(property.messages)
  const [input, setInput] = useState('')
  const [mentionSearch, setMentionSearch] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [pendingMentions, setPendingMentions] = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = useState(false)

  const team = property.teamMembers

  // Detect @mention in input
  function handleInput(val: string) {
    setInput(val)
    const atMatch = val.match(/@(\w*)$/)
    if (atMatch) {
      setMentionSearch(atMatch[1])
      setShowMentions(true)
    } else {
      setShowMentions(false)
    }
  }

  function insertMention(member: { id: string; name: string }) {
    const before = input.replace(/@\w*$/, '')
    setInput(`${before}@${member.name} `)
    if (!pendingMentions.some(m => m.id === member.id)) {
      setPendingMentions(prev => [...prev, member])
    }
    setShowMentions(false)
  }

  async function sendMessage() {
    if (!input.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input.trim(), mentions: pendingMentions }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [data.message, ...prev])
        setInput('')
        setPendingMentions([])
      }
    } catch {}
    setSaving(false)
  }

  const filteredTeam = team.filter(m =>
    m.name.toLowerCase().includes(mentionSearch.toLowerCase())
  )

  // Render message text with @mentions highlighted
  function renderText(text: string, mentions: Array<{ name: string }>) {
    if (mentions.length === 0) return text
    const parts: Array<{ type: 'text' | 'mention'; value: string }> = []
    let remaining = text
    for (const m of mentions) {
      const idx = remaining.indexOf(`@${m.name}`)
      if (idx >= 0) {
        if (idx > 0) parts.push({ type: 'text', value: remaining.slice(0, idx) })
        parts.push({ type: 'mention', value: `@${m.name}` })
        remaining = remaining.slice(idx + m.name.length + 1)
      }
    }
    if (remaining) parts.push({ type: 'text', value: remaining })
    if (parts.length === 0) return text
    return (
      <>{parts.map((p, i) => p.type === 'mention'
        ? <span key={i} className="text-semantic-blue font-semibold">{p.value}</span>
        : <span key={i}>{p.value}</span>
      )}</>
    )
  }

  return (
    <div className="space-y-4">
      {/* Message input with @mention */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Type a message... use @ to tag someone"
              rows={2}
              className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
            />
            {/* @mention dropdown */}
            {showMentions && filteredTeam.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-56 bg-white border-[0.5px] border-[rgba(0,0,0,0.12)] rounded-[8px] shadow-lg p-1 z-20">
                {filteredTeam.slice(0, 6).map(m => (
                  <button key={m.id} onClick={() => insertMention(m)}
                    className="w-full text-left px-3 py-1.5 rounded-[6px] hover:bg-surface-secondary text-ds-fine transition-colors">
                    <span className="font-medium text-txt-primary">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={sendMessage} disabled={!input.trim() || saving}
            className="self-end bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white px-4 py-2.5 rounded-[10px] transition-colors shrink-0">
            <Send size={14} />
          </button>
        </div>
        {pendingMentions.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[9px] text-txt-muted">Tagging:</span>
            {pendingMentions.map(m => (
              <span key={m.id} className="text-[9px] font-semibold text-semantic-blue bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                @{m.name}
                <button onClick={() => setPendingMentions(prev => prev.filter(p => p.id !== m.id))} className="hover:text-semantic-red"><X size={7} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages thread */}
      <div className="space-y-0">
        {messages.length === 0 ? (
          <div className="bg-surface-secondary rounded-[12px] p-8 text-center">
            <MessageSquare size={20} className="text-txt-muted mx-auto mb-2 opacity-40" />
            <p className="text-ds-body text-txt-muted">No messages yet</p>
            <p className="text-[10px] text-txt-muted mt-1">Start a conversation — use @ to tag team members</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id} className="flex gap-3 relative py-3">
              {/* Vertical line */}
              {i < messages.length - 1 && (
                <div className="absolute left-[13px] top-[40px] bottom-0 w-px bg-[rgba(0,0,0,0.06)]" />
              )}
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-gunner-red-light flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-gunner-red text-[10px] font-semibold">{m.userName?.[0]?.toUpperCase() ?? '?'}</span>
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-ds-fine font-semibold text-txt-primary">{m.userName}</p>
                  <p className="text-[10px] text-txt-muted">{formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}</p>
                </div>
                <p className="text-ds-fine text-txt-secondary mt-0.5 whitespace-pre-wrap">
                  {renderText(m.text, m.mentions)}
                </p>
              </div>
            </div>
          ))
        )}
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
      const res = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user' as const,
            content: `[Property context: ${property.address}, ${property.city}, ${property.state}. Status: ${property.status}. Asking: ${property.askingPrice ?? 'N/A'}. ARV: ${property.arv ?? 'N/A'}. MAO: ${property.mao ?? 'N/A'}. Contract: ${property.contractPrice ?? 'N/A'}. Assignment Fee: ${property.assignmentFee ?? 'N/A'}.]\n\n${text}`,
          }],
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'ai', text: data.reply ?? 'No response' }])
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
  const tierDefs = [
    { tier: 'priority', label: 'Priority Buyer', emoji: '👑', desc: 'Top-tier, first access' },
    { tier: 'qualified', label: 'Qualified Buyer', emoji: '⭐', desc: 'Verified proof of funds' },
    { tier: 'jv', label: 'JV Partner', emoji: '🤝', desc: 'Co-investment partners' },
    { tier: 'unqualified', label: 'Unqualified', emoji: '👤', desc: 'Not yet verified' },
  ]

  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(['priority', 'qualified']))
  const [generating, setGenerating] = useState(false)
  const [blasts, setBlasts] = useState<Record<string, { emailSubject: string; emailBody: string; smsBody: string }>>({})
  const [expandedTier, setExpandedTier] = useState<string | null>(null)
  const [sendingTier, setSendingTier] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [emailPreview, setEmailPreview] = useState<string | null>(null) // tier being previewed
  const [recipientCounts, setRecipientCounts] = useState<Record<string, number>>({})

  // Update blast content (editable)
  function updateBlast(tier: string, field: 'emailSubject' | 'emailBody' | 'smsBody', value: string) {
    setBlasts(prev => ({
      ...prev,
      [tier]: { ...prev[tier], [field]: value },
    }))
  }

  async function fetchRecipientCounts() {
    try {
      const res = await fetch(`/api/properties/${property.id}/buyers`)
      const data = await res.json()
      const buyers = data.buyers ?? []
      const counts: Record<string, number> = {}
      for (const b of buyers) {
        counts[b.tier] = (counts[b.tier] ?? 0) + 1
      }
      setRecipientCounts(counts)
    } catch {}
  }

  async function sendToTier(tier: string, channel: 'sms' | 'email') {
    const content = blasts[tier]
    if (!content) return
    setSendingTier(`${tier}-${channel}`)
    setSendResult(null)
    try {
      const res = await fetch(`/api/properties/${property.id}/blast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          tier,
          channel,
          message: channel === 'email' ? content.emailBody : content.smsBody,
          subject: content.emailSubject,
        }),
      })
      const data = await res.json()
      setSendResult(res.ok ? `Sent to ${data.sentTo} buyers${data.skipped ? `, ${data.skipped} skipped` : ''}` : 'Send failed')
    } catch { setSendResult('Send failed') }
    setSendingTier(null)
    setTimeout(() => setSendResult(null), 5000)
  }

  function toggleTier(tier: string) {
    setSelectedTiers(prev => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  async function generate() {
    if (selectedTiers.size === 0) return
    setGenerating(true)
    try {
      const [blastRes] = await Promise.all([
        fetch(`/api/properties/${property.id}/blast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generate', tiers: [...selectedTiers] }),
        }),
        fetchRecipientCounts(),
      ])
      const data = await blastRes.json()
      setBlasts(data.blasts ?? {})
      setExpandedTier([...selectedTiers][0])
    } catch {}
    setGenerating(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ds-label font-semibold text-txt-primary">Deal Blast Generator</h3>
          <p className="text-ds-fine text-txt-muted">Generate, preview, and send property blasts to buyers</p>
        </div>
        <button
          onClick={() => {
            import('./PropertyFlyer').then(m => m.downloadPropertyPDF({
              address: property.address, city: property.city, state: property.state, zip: property.zip,
              askingPrice: property.askingPrice, arv: property.arv, contractPrice: property.contractPrice,
              assignmentFee: property.assignmentFee, mao: property.mao,
            }))
          }}
          className="text-ds-fine font-medium text-txt-secondary hover:text-txt-primary bg-surface-secondary px-3 py-1.5 rounded-[8px] border-[0.5px] border-[rgba(0,0,0,0.08)] flex items-center gap-1 transition-colors"
        >
          <FileText size={11} /> PDF Flyer
        </button>
      </div>

      {/* Tier selection */}
      <div>
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Select Buyer Tiers</p>
        <div className="grid grid-cols-2 gap-2">
          {tierDefs.map(t => (
            <label key={t.tier} className={`flex items-start gap-2.5 rounded-[10px] p-3 cursor-pointer transition-colors border-[0.5px] ${
              selectedTiers.has(t.tier) ? 'bg-gunner-red-light border-gunner-red/20' : 'bg-surface-secondary border-[rgba(0,0,0,0.06)] hover:bg-surface-tertiary'
            }`}>
              <input type="checkbox" checked={selectedTiers.has(t.tier)} onChange={() => toggleTier(t.tier)} className="mt-0.5 accent-gunner-red" />
              <div>
                <p className="text-ds-fine font-semibold text-txt-primary">{t.emoji} {t.label}</p>
                <p className="text-[9px] text-txt-muted">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={generate}
        disabled={selectedTiers.size === 0 || generating}
        className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold py-2.5 rounded-[10px] transition-colors flex items-center justify-center gap-2"
      >
        {generating ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : `Generate Blast for ${selectedTiers.size} Tier${selectedTiers.size !== 1 ? 's' : ''}`}
      </button>

      {/* Generated blasts per tier (accordion) — editable */}
      {Object.keys(blasts).length > 0 && (
        <div className="space-y-2">
          {Object.entries(blasts).map(([tier, content]) => {
            const def = tierDefs.find(t => t.tier === tier)
            const isOpen = expandedTier === tier
            const count = recipientCounts[tier] ?? 0
            const isPreviewing = emailPreview === tier
            return (
              <div key={tier} className="border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] overflow-hidden">
                <button onClick={() => setExpandedTier(isOpen ? null : tier)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface-secondary hover:bg-surface-tertiary transition-colors text-left">
                  <ChevronRight size={10} className={`text-txt-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="text-ds-fine font-semibold text-txt-primary">{def?.emoji} {def?.label ?? tier}</span>
                  {count > 0 && <span className="text-[9px] font-medium text-txt-muted bg-surface-tertiary px-1.5 py-0.5 rounded-full">{count} recipients</span>}
                </button>
                {isOpen && (
                  <div className="px-4 py-3 space-y-3">
                    {/* Email section */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[9px] font-semibold text-txt-muted uppercase">Email</p>
                        <button onClick={() => setEmailPreview(isPreviewing ? null : tier)}
                          className="text-[9px] font-medium text-semantic-blue hover:underline">
                          {isPreviewing ? 'Edit' : 'Preview'}
                        </button>
                      </div>

                      {isPreviewing ? (
                        <div className="space-y-1.5">
                          <div className="bg-surface-secondary rounded-[8px] px-3 py-1.5 border-[0.5px] border-[rgba(0,0,0,0.06)]">
                            <p className="text-[9px] text-txt-muted">Subject</p>
                            <p className="text-ds-fine text-txt-primary font-medium">{content.emailSubject}</p>
                          </div>
                          <div
                            className="bg-white rounded-[8px] px-4 py-3 border-[0.5px] border-[rgba(0,0,0,0.06)] text-ds-fine text-txt-primary prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: content.emailBody.replace(/\n/g, '<br/>') }}
                          />
                        </div>
                      ) : (
                        <>
                          <input
                            value={content.emailSubject}
                            onChange={e => updateBlast(tier, 'emailSubject', e.target.value)}
                            className="w-full bg-surface-secondary rounded-[8px] px-3 py-1.5 text-ds-fine text-txt-primary mb-1.5 border-[0.5px] border-[rgba(0,0,0,0.06)] focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                          />
                          <textarea
                            value={content.emailBody}
                            onChange={e => updateBlast(tier, 'emailBody', e.target.value)}
                            rows={6}
                            className="w-full bg-surface-secondary rounded-[8px] px-3 py-2 text-ds-fine text-txt-secondary resize-none border-[0.5px] border-[rgba(0,0,0,0.06)] focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                          />
                        </>
                      )}
                      <button
                        onClick={() => sendToTier(tier, 'email')}
                        disabled={!!sendingTier}
                        className="mt-1.5 w-full bg-semantic-blue hover:bg-semantic-blue/90 disabled:opacity-50 text-white text-ds-fine font-semibold py-2 rounded-[8px] transition-colors"
                      >
                        {sendingTier === `${tier}-email` ? 'Sending...' : `Send Email${count ? ` to ${count} buyers` : ''}`}
                      </button>
                    </div>
                    {/* SMS section */}
                    <div>
                      <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">SMS <span className="text-txt-muted font-normal">({content.smsBody.length}/160)</span></p>
                      <textarea
                        value={content.smsBody}
                        onChange={e => updateBlast(tier, 'smsBody', e.target.value)}
                        rows={2}
                        className="w-full bg-surface-secondary rounded-[8px] px-3 py-2 text-ds-fine text-txt-secondary resize-none border-[0.5px] border-[rgba(0,0,0,0.06)] focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                      />
                      <button
                        onClick={() => sendToTier(tier, 'sms')}
                        disabled={!!sendingTier}
                        className="mt-1.5 w-full bg-semantic-green hover:bg-semantic-green/90 disabled:opacity-50 text-white text-ds-fine font-semibold py-2 rounded-[8px] transition-colors"
                      >
                        {sendingTier === `${tier}-sms` ? 'Sending...' : `Send SMS${count ? ` to ${count} buyers` : ''}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {sendResult && <p className="text-ds-fine text-gunner-red text-center font-medium">{sendResult}</p>}
      <p className="text-[9px] text-txt-muted text-center">Edit content before sending. System learns from your changes.</p>
    </div>
  )
}
