'use client'
// components/disposition/journey/section-3-buyer-match.tsx
// Section 3 of the Disposition Journey: Match Buyers.
// Lifted verbatim from the prior BuyersTab in property-detail-client.tsx.
// Buyer matching kanban (matched / responded / interested), match scores,
// add-buyer flow. Status = In progress when buyers exist; Done is left to
// the rep (not auto — buyers come in over time).

import { useState, useEffect } from 'react'
import {
  Search as SearchIcon, Users, Loader2, Plus, MapPin, X,
  MessageSquare, Pencil, ChevronLeft, ChevronRight, Send,
} from 'lucide-react'
import { useToast } from '@/components/ui/toaster'
import { formatPhone, titleCase } from '@/lib/format'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'

export function Section3BuyerMatch({
  property,
  tenantSlug: _tenantSlug,
}: {
  property: PropertyDetail
  tenantSlug: string
}) {
  const { toast } = useToast()
  type BuyerItem = {
    id: string; name: string; phone: string | null; email: string | null
    company: string | null; tier: string; markets: string[]; tags: string[]
    notes: string | null; matchScore: number; scoreBreakdown?: string
    ghlContactId?: string | null; maxBuyPrice?: number | null; verifiedFunding?: boolean
  }
  type KanbanStage = 'matched' | 'responded' | 'interested'

  const [buyers, setBuyers] = useState<BuyerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [addedBuyers, setAddedBuyers] = useState<BuyerItem[]>([])
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

  const [buyerStages, setBuyerStages] = useState<Record<string, KanbanStage>>({})
  const [buyerIntents, setBuyerIntents] = useState<Record<string, string>>({})
  const [leftTab, setLeftTab] = useState<'matched' | 'added'>('matched')

  const [editTarget, setEditTarget] = useState<BuyerItem | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', tier: '', markets: '', maxBuyPrice: '', verifiedFunding: false, notes: '' })
  const [editSaving, setEditSaving] = useState(false)

  const [smsTarget, setSmsTarget] = useState<{ name: string; phone: string; ghlContactId: string | null } | null>(null)
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSending, setSmsSending] = useState(false)

  const [buyerSearch, setBuyerSearch] = useState('')
  const [activeMarketFilter, setActiveMarketFilter] = useState<string | null>(null)

  const tierColors: Record<string, string> = {
    priority: 'bg-amber-100 text-amber-700',
    qualified: 'bg-green-100 text-green-700',
    jv: 'bg-blue-100 text-blue-700',
    unqualified: 'bg-gray-100 text-gray-500',
    halted: 'bg-red-100 text-red-500',
  }

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

  useEffect(() => {
    loadAddedBuyers()
    if (!fetched && !loading) matchBuyers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const ok = await runSync()
        if (ok) {
          setSyncMsg('Matching buyers...')
          const r2 = await fetch(`/api/properties/${property.id}/buyers`)
          const d2 = await r2.json()
          setBuyers(d2.buyers ?? [])
          if (d2.buyerStages) setBuyerStages(d2.buyerStages)
          if (d2.buyerIntents) setBuyerIntents(d2.buyerIntents)
          setSyncMsg('')
        }
        setFetched(true)
        setLoading(false)
        return
      }
      setBuyers(data.buyers ?? [])
      if (data.buyerStages) setBuyerStages(data.buyerStages)
      if (data.buyerIntents) setBuyerIntents(data.buyerIntents)
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

  const allBuyers: BuyerItem[] = [...addedBuyers, ...buyers.filter(b => !addedBuyers.some(a => a.id === b.id))]

  const uniqueMarkets = [...new Set(allBuyers.flatMap(b => b.markets ?? []))].sort()

  const searchLower = buyerSearch.toLowerCase()
  const filteredAllBuyers = allBuyers.filter(b => {
    const matchesSearch = !buyerSearch ||
      b.name.toLowerCase().includes(searchLower) ||
      (b.phone ?? '').includes(buyerSearch) ||
      (b.markets ?? []).some(m => m.toLowerCase().includes(searchLower))
    const matchesMarket = !activeMarketFilter ||
      (b.markets ?? []).some(m => m.toLowerCase() === activeMarketFilter.toLowerCase())
    return matchesSearch && matchesMarket
  })

  const COLUMNS: { key: KanbanStage; label: string }[] = [
    { key: 'matched', label: 'Matched' },
    { key: 'responded', label: 'Responded' },
    { key: 'interested', label: 'Interested' },
  ]

  function getBuyerStage(buyerId: string): KanbanStage {
    return (buyerStages[buyerId] as KanbanStage) ?? 'matched'
  }

  function buyersInColumn(col: KanbanStage) {
    if (col === 'matched') {
      const inCol = filteredAllBuyers.filter(b => getBuyerStage(b.id) === 'matched')
      if (leftTab === 'added') return inCol.filter(b => addedBuyers.some(a => a.id === b.id))
      return inCol.filter(b => !addedBuyers.some(a => a.id === b.id))
    }
    return filteredAllBuyers.filter(b => getBuyerStage(b.id) === col)
  }

  function moveBuyerStage(buyerId: string, newStage: KanbanStage) {
    setBuyerStages(prev => ({ ...prev, [buyerId]: newStage }))
    fetch(`/api/properties/${property.id}/buyer-stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId, stage: newStage }),
    }).catch(() => {})
  }

  const prevStageMap: Record<KanbanStage, KanbanStage | null> = { matched: null, responded: 'matched', interested: 'responded' }
  const nextStageMap: Record<KanbanStage, KanbanStage | null> = { matched: 'responded', responded: 'interested', interested: null }

  function scoreBadgeColor(score: number): string {
    if (score >= 90) return 'bg-red-100 text-red-700'
    if (score >= 75) return 'bg-amber-100 text-amber-700'
    if (score >= 50) return 'bg-blue-100 text-blue-700'
    return 'bg-gray-100 text-gray-600'
  }

  function openEditModal(b: BuyerItem) {
    setEditTarget(b)
    setEditForm({
      name: b.name ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
      tier: b.tier ?? 'unqualified',
      markets: (b.markets ?? []).join(', '),
      maxBuyPrice: b.maxBuyPrice ? String(b.maxBuyPrice) : '',
      verifiedFunding: b.verifiedFunding ?? false,
      notes: b.notes ?? '',
    })
  }

  async function saveEditBuyer() {
    if (!editTarget) return
    setEditSaving(true)
    try {
      await fetch(`/api/buyers/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          email: editForm.email || null,
          tier: editForm.tier,
          markets: editForm.markets.split(',').map(m => m.trim()).filter(Boolean),
          maxBuyPrice: editForm.maxBuyPrice ? Number(editForm.maxBuyPrice) : null,
          verifiedFunding: editForm.verifiedFunding,
          notes: editForm.notes || null,
        }),
      })
      const updater = (list: BuyerItem[]) => list.map(b => b.id === editTarget.id ? {
        ...b,
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email || null,
        tier: editForm.tier,
        markets: editForm.markets.split(',').map(m => m.trim()).filter(Boolean),
        notes: editForm.notes || null,
      } : b)
      setBuyers(updater)
      setAddedBuyers(updater)
      setEditTarget(null)
    } catch {}
    setEditSaving(false)
  }

  async function sendSms() {
    if (!smsTarget?.phone || !smsMessage.trim()) return
    if (!window.confirm(`Send SMS to ${smsTarget.name ?? smsTarget.phone}?\n\n"${smsMessage.slice(0, 100)}${smsMessage.length > 100 ? '...' : ''}"`)) return
    setSmsSending(true)
    try {
      const res = await fetch('/api/ghl/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'send_sms', contactId: smsTarget.ghlContactId ?? smsTarget.phone, message: smsMessage }),
      })
      if (res.ok) {
        toast(`SMS sent to ${smsTarget.name ?? smsTarget.phone}`, 'success')
        setSmsTarget(null)
        setSmsMessage('')
      } else {
        toast('Failed to send SMS', 'error')
      }
    } catch {
      toast('Failed to send SMS', 'error')
    }
    setSmsSending(false)
  }

  if (property.propertyMarkets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MapPin size={32} className="text-txt-muted mb-3" />
        <h3 className="text-ds-label font-semibold text-txt-primary mb-1">No market assigned</h3>
        <p className="text-ds-fine text-txt-muted mb-4 max-w-xs">Add a market in the Overview tab to match this property with buyers.</p>
        <button
          onClick={() => {
            const tabButton = document.querySelector('[data-tab="overview"]') as HTMLButtonElement | null
            tabButton?.click()
          }}
          className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark transition-colors"
        >
          Go to Overview
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ds-label font-semibold text-txt-primary">Buyers</h3>
          {syncMsg && <p className="text-[10px] text-txt-muted mt-0.5">{syncMsg}</p>}
        </div>
        <div className="flex gap-2">
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

      {showAddForm && (
        <div className="bg-surface-secondary rounded-[10px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">Add Buyer to GHL</p>
            <button onClick={() => setShowAddForm(false)} className="text-txt-muted hover:text-txt-secondary"><X size={14} /></button>
          </div>

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
                    <option value="">---</option>
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

      <div className="space-y-2 mb-4">
        <div className="relative">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            value={buyerSearch}
            onChange={e => setBuyerSearch(e.target.value)}
            placeholder="Search buyers by name, phone, or market..."
            className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] pl-9 pr-4 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
            style={{ borderColor: 'var(--border-medium)' }}
          />
        </div>
        {uniqueMarkets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {uniqueMarkets.map(m => (
              <button key={m} onClick={() => setActiveMarketFilter(activeMarketFilter === m ? null : m)}
                className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                  activeMarketFilter === m ? 'bg-gunner-red text-white' : 'bg-surface-tertiary text-txt-secondary hover:bg-surface-secondary'
                }`}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && !fetched ? (
        <div className="py-10 text-center">
          <Loader2 size={18} className="animate-spin text-txt-muted mx-auto" />
          {syncMsg && <p className="text-ds-fine text-txt-muted mt-2">{syncMsg}</p>}
          <p className="text-ds-fine text-txt-muted mt-1">Loading buyers...</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map(col => {
            const colBuyers = buyersInColumn(col.key)
            return (
              <div key={col.key} className="min-w-[280px] flex-1 rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary/50 p-3">
                <div className="flex items-center justify-between mb-3">
                  {col.key === 'matched' ? (
                    <>
                      <div className="flex items-center gap-1 bg-surface-tertiary rounded-lg p-0.5">
                        <button onClick={() => setLeftTab('matched')}
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${leftTab === 'matched' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'}`}>
                          Matched <span className="text-[9px] font-normal ml-0.5">({allBuyers.filter(b => getBuyerStage(b.id) === 'matched' && !addedBuyers.some(a => a.id === b.id)).length})</span>
                        </button>
                        <button onClick={() => setLeftTab('added')}
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${leftTab === 'added' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'}`}>
                          Added <span className="text-[9px] font-normal ml-0.5">({addedBuyers.filter(b => getBuyerStage(b.id) === 'matched').length})</span>
                        </button>
                      </div>
                      <button onClick={openAddForm}
                        className="text-[10px] font-medium text-semantic-blue hover:text-semantic-blue/80 flex items-center gap-0.5 transition-colors">
                        <Plus size={10} /> Add
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-txt-muted">{col.label}</span>
                      <span className="text-[10px] font-medium bg-surface-tertiary text-txt-muted px-1.5 py-0.5 rounded-full">{colBuyers.length}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-400px)]">
                  {colBuyers.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-[10px] text-txt-muted">
                        {col.key === 'matched' && !fetched ? 'Click Match to find buyers' : 'No buyers yet'}
                      </p>
                      {col.key !== 'matched' && (
                        <p className="text-[9px] text-txt-muted mt-0.5">Move buyers here with arrow buttons</p>
                      )}
                    </div>
                  ) : (
                    colBuyers.map(b => {
                      const currentStage = getBuyerStage(b.id)
                      const prev = prevStageMap[currentStage]
                      const next = nextStageMap[currentStage]
                      const intent = buyerIntents[b.id]
                      const isNotInterested = intent === 'not_interested'
                      const cardClasses = isNotInterested
                        ? 'bg-gray-50 opacity-60 rounded-lg border-[0.5px] border-[rgba(0,0,0,0.08)] shadow-sm p-3 transition-shadow'
                        : col.key === 'interested'
                          ? 'bg-green-50/30 border-l-2 border-green-400 rounded-lg border-r-[0.5px] border-t-[0.5px] border-b-[0.5px] border-r-[rgba(0,0,0,0.08)] border-t-[rgba(0,0,0,0.08)] border-b-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow'
                          : col.key === 'responded' && !intent
                            ? 'bg-amber-50/30 border-l-2 border-amber-400 rounded-lg border-r-[0.5px] border-t-[0.5px] border-b-[0.5px] border-r-[rgba(0,0,0,0.08)] border-t-[rgba(0,0,0,0.08)] border-b-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow'
                            : 'bg-white rounded-lg border-[0.5px] border-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow'
                      return (
                        <div key={b.id} className={cardClasses}>
                          {isNotInterested && (
                            <div className="mb-1">
                              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">Not Interested</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${scoreBadgeColor(b.matchScore)}`}>
                              {b.matchScore}
                            </span>
                            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 capitalize ${tierColors[b.tier] ?? tierColors.unqualified}`}>
                              {b.tier}
                            </span>
                            <span className="text-ds-fine font-semibold text-txt-primary truncate flex-1">{titleCase(b.name)}</span>
                            <span className="text-[9px] text-txt-muted shrink-0 truncate max-w-[70px]">{(b.markets ?? []).slice(0, 2).join(', ')}</span>
                          </div>
                          {b.phone && (
                            <p className="text-[10px] text-txt-muted mb-2 pl-0.5">{formatPhone(b.phone)}</p>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { if (b.phone) setSmsTarget({ name: b.name, phone: b.phone, ghlContactId: b.ghlContactId ?? null }) }}
                              disabled={!b.phone}
                              className="flex items-center gap-1 text-[9px] font-medium text-semantic-blue hover:text-semantic-blue/80 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 px-2 py-1 rounded-md transition-colors"
                              title="Send SMS"
                            >
                              <MessageSquare size={10} /> Text
                            </button>
                            <button
                              onClick={() => openEditModal(b)}
                              className="flex items-center gap-1 text-[9px] font-medium text-txt-muted hover:text-txt-secondary bg-surface-tertiary hover:bg-surface-secondary px-2 py-1 rounded-md transition-colors"
                              title="Edit"
                            >
                              <Pencil size={9} /> Edit
                            </button>
                            <div className="flex-1" />
                            {prev && (
                              <button
                                onClick={() => moveBuyerStage(b.id, prev)}
                                className="text-[10px] font-bold text-txt-muted hover:text-txt-primary bg-surface-tertiary hover:bg-surface-secondary w-6 h-6 rounded flex items-center justify-center transition-colors"
                                title={`Move to ${prev}`}
                              >
                                <ChevronLeft size={14} />
                              </button>
                            )}
                            {next && (
                              <button
                                onClick={() => moveBuyerStage(b.id, next)}
                                className="text-[10px] font-bold text-txt-muted hover:text-txt-primary bg-surface-tertiary hover:bg-surface-secondary w-6 h-6 rounded flex items-center justify-center transition-colors"
                                title={`Move to ${next}`}
                              >
                                <ChevronRight size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEditTarget(null)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right">
            <div className="sticky top-0 bg-white border-b border-[rgba(0,0,0,0.06)] px-5 py-4 flex items-center justify-between">
              <h3 className="text-ds-label font-semibold text-txt-primary">Edit Buyer &mdash; {titleCase(editTarget.name)}</h3>
              <button onClick={() => setEditTarget(null)} className="text-txt-muted hover:text-txt-secondary"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[9px] text-txt-muted uppercase block mb-1">Name</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Phone</label>
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30" />
                </div>
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Email</label>
                  <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30" />
                </div>
              </div>
              <div>
                <label className="text-[9px] text-txt-muted uppercase block mb-1">Tier</label>
                <select value={editForm.tier} onChange={e => setEditForm(f => ({ ...f, tier: e.target.value }))}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none">
                  <option value="priority">Priority</option>
                  <option value="qualified">Qualified</option>
                  <option value="jv">JV Partner</option>
                  <option value="unqualified">Unqualified</option>
                  <option value="halted">Halted</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] text-txt-muted uppercase block mb-1">Markets (comma separated)</label>
                <input value={editForm.markets} onChange={e => setEditForm(f => ({ ...f, markets: e.target.value }))}
                  placeholder="Nashville, Chattanooga"
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30" />
              </div>
              <div>
                <label className="text-[9px] text-txt-muted uppercase block mb-1">Max Buy Price</label>
                <input value={editForm.maxBuyPrice} onChange={e => setEditForm(f => ({ ...f, maxBuyPrice: e.target.value }))}
                  type="number" placeholder="250000"
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30" />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.verifiedFunding}
                    onChange={e => setEditForm(f => ({ ...f, verifiedFunding: e.target.checked }))}
                    className="accent-gunner-red" />
                  <span className="text-ds-fine text-txt-secondary">Verified Funding</span>
                </label>
              </div>
              <div>
                <label className="text-[9px] text-txt-muted uppercase block mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary text-ds-fine font-medium py-2.5 rounded-[8px] hover:bg-surface-secondary transition-colors">
                  Cancel
                </button>
                <button onClick={saveEditBuyer} disabled={editSaving}
                  className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2.5 rounded-[8px] transition-colors">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {smsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setSmsTarget(null); setSmsMessage('') }} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-ds-label font-semibold text-txt-primary">Send SMS</h3>
              <button onClick={() => { setSmsTarget(null); setSmsMessage('') }} className="text-txt-muted hover:text-txt-secondary"><X size={16} /></button>
            </div>
            <div>
              <label className="text-[9px] text-txt-muted uppercase block mb-1">To</label>
              <p className="text-ds-fine text-txt-primary font-medium">
                {titleCase(smsTarget.name)} &mdash; {formatPhone(smsTarget.phone)}
              </p>
            </div>
            <div>
              <label className="text-[9px] text-txt-muted uppercase block mb-1">Message</label>
              <textarea
                value={smsMessage}
                onChange={e => setSmsMessage(e.target.value)}
                rows={4}
                placeholder={`Hi ${smsTarget.name.split(' ')[0]}, I have a deal at ${property.address}...`}
                className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30 resize-none"
              />
              <p className="text-[9px] text-txt-muted mt-1 text-right">{smsMessage.length} chars</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setSmsTarget(null); setSmsMessage('') }}
                className="flex-1 border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary text-ds-fine font-medium py-2 rounded-[8px] hover:bg-surface-secondary transition-colors">
                Cancel
              </button>
              <button onClick={sendSms} disabled={smsSending || !smsMessage.trim()}
                className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[8px] transition-colors flex items-center justify-center gap-1.5">
                {smsSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {smsSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
