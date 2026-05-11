'use client'
// components/disposition/journey/section-3-buyer-match.tsx
// Section 3 of the Disposition Journey: Match Buyers.
// Kanban (Matched / Sent / Responded). Per Session 77 spec: this is
// the operational dispatch center — sending happens here (per-card
// or bulk), auto-progression promotes buyers Matched → Sent on send,
// Sent → Responded when a reply lands.
// Status = In progress when any buyer exists on the property.

import { useState, useEffect } from 'react'
import {
  Search as SearchIcon, Loader2, Plus, MapPin, X,
  Pencil, ChevronLeft, ChevronRight, Send, Upload,
} from 'lucide-react'
import { useToast } from '@/components/ui/toaster'
import { formatPhone, titleCase } from '@/lib/format'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'
import { BulkAddModal } from './bulk-add-modal'
import { SendModal } from './send-modal'
import { BuyerModal } from './buyer-modal'

export function Section3BuyerMatch({
  property,
  tenantSlug,
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
  // Session 77 — kanban columns: Matched / Sent / Responded.
  // 'interested' + 'showing_scheduled' values still exist in the DB
  // (they live in Section 4's kanban) but they're not surfaced as
  // columns here. A buyer in 'interested' or 'showing_scheduled'
  // appears in Section 4, not Section 3.
  type KanbanStage = 'matched' | 'sent' | 'responded'

  const [buyers, setBuyers] = useState<BuyerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [addedBuyers, setAddedBuyers] = useState<BuyerItem[]>([])
  const [addedLoaded, setAddedLoaded] = useState(false)
  // Add buyer flow — opens the same BuyerModal in mode='add'. The inline
  // expanding form was replaced as part of disposition rebuild Phase A2.
  const [showAddModal, setShowAddModal] = useState(false)
  const [stages, setStages] = useState<Array<{ id: string; name: string }>>([])
  const [formOptions, setFormOptions] = useState<{ tiers: string[]; buybox: string[]; markets: string[]; speeds: string[] } | null>(null)

  const [buyerStages, setBuyerStages] = useState<Record<string, KanbanStage>>({})
  const [buyerIntents, setBuyerIntents] = useState<Record<string, string>>({})
  // Phase A4 — "ever responded" persistence. Once true, a buyer stays
  // visible in Section 3's Responded column forever, even after
  // Section 4 promotes them to interested / showing_scheduled. Hydrated
  // from the buyer-match API; optimistically set when the rep manually
  // moves a buyer to Responded via the kanban arrows.
  const [everResponded, setEverResponded] = useState<Record<string, boolean>>({})
  const [leftTab, setLeftTab] = useState<'matched' | 'added'>('matched')

  const [editTarget, setEditTarget] = useState<BuyerItem | null>(null)

  // Session 77 — replaced ad-hoc SMS modal with the SendModal which
  // handles artifact pick + channel + recipient list. The free-form
  // single-buyer text path now goes through SendModal's "custom" mode.
  const [sendTargets, setSendTargets] = useState<BuyerItem[] | null>(null)
  const [showBulkAdd, setShowBulkAdd] = useState(false)

  const [buyerSearch, setBuyerSearch] = useState('')

  const tierColors: Record<string, string> = {
    priority: 'bg-amber-100 text-amber-700',
    qualified: 'bg-green-100 text-green-700',
    jv: 'bg-blue-100 text-blue-700',
    realtor: 'bg-fuchsia-100 text-fuchsia-700',
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
          if (d2.everResponded) setEverResponded(d2.everResponded)
          setSyncMsg('')
        }
        setFetched(true)
        setLoading(false)
        return
      }
      setBuyers(data.buyers ?? [])
      if (data.buyerStages) setBuyerStages(data.buyerStages)
      if (data.buyerIntents) setBuyerIntents(data.buyerIntents)
      if (data.everResponded) setEverResponded(data.everResponded)
      setSyncMsg('')
      setFetched(true)
    } catch { setBuyers([]) }
    setLoading(false)
  }

  async function ensureFormOptionsLoaded() {
    if (formOptions && stages.length > 0) return
    try {
      const res = await fetch(`/api/properties/${property.id}/buyers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getFormOptions' }),
      })
      const data = await res.json()
      setStages(data.stages ?? [])
      setFormOptions(data.options ?? { tiers: [], buybox: [], markets: [], speeds: [] })
    } catch { /* modal still works; markets dropdown just won't show GHL picklist */ }
  }

  async function openAddModal() {
    await ensureFormOptionsLoaded()
    setShowAddModal(true)
  }

  const allBuyers: BuyerItem[] = [...addedBuyers, ...buyers.filter(b => !addedBuyers.some(a => a.id === b.id))]

  // Session 77 — search-only filter. Market chips dropped (the property has
  // its own market and buyers were matched against it).
  const searchLower = buyerSearch.toLowerCase()
  const filteredAllBuyers = allBuyers.filter(b => {
    if (!buyerSearch) return true
    return b.name.toLowerCase().includes(searchLower) ||
      (b.phone ?? '').includes(buyerSearch) ||
      (b.markets ?? []).some(m => m.toLowerCase().includes(searchLower))
  })

  const COLUMNS: { key: KanbanStage; label: string }[] = [
    { key: 'matched', label: 'Matched' },
    { key: 'sent', label: 'Sent' },
    { key: 'responded', label: 'Responded' },
  ]

  function getBuyerStage(buyerId: string): KanbanStage {
    return (buyerStages[buyerId] as KanbanStage) ?? 'matched'
  }

  function buyersInColumn(col: KanbanStage) {
    if (col === 'responded') {
      // Phase A4 — responded column is sticky. Once a buyer has ever
      // responded (replied, was manually moved here, or Section 4
      // promoted them to interested/showing_scheduled), they live here
      // forever even though Section 4 simultaneously tracks them.
      return filteredAllBuyers.filter(b => everResponded[b.id] || getBuyerStage(b.id) === 'responded')
    }
    // Matched / Sent columns: exclude any buyer who has ever responded
    // so they don't appear in two columns at once.
    if (col === 'matched') {
      const inCol = filteredAllBuyers.filter(b => !everResponded[b.id] && getBuyerStage(b.id) === 'matched')
      if (leftTab === 'added') return inCol.filter(b => addedBuyers.some(a => a.id === b.id))
      return inCol.filter(b => !addedBuyers.some(a => a.id === b.id))
    }
    return filteredAllBuyers.filter(b => !everResponded[b.id] && getBuyerStage(b.id) === col)
  }

  function moveBuyerStage(buyerId: string, newStage: KanbanStage) {
    setBuyerStages(prev => ({ ...prev, [buyerId]: newStage }))
    // Moving forward into 'responded' flips the sticky flag. Moving back
    // (e.g., to Matched/Sent) does NOT clear the flag — once responded,
    // they stay in the Responded column. The rep can fix this via a
    // full reset, not via the kanban arrows.
    if (newStage === 'responded') {
      setEverResponded(prev => ({ ...prev, [buyerId]: true }))
    }
    fetch(`/api/properties/${property.id}/buyer-stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId, stage: newStage }),
    }).catch(() => {})
  }

  // Session 77 — kanban transitions for the 3 visible columns.
  // 'sent' is normally reached automatically (when a blast is sent
  // through SendModal → /api/properties/[id]/blast → upsert stage='sent').
  // The arrow buttons let the rep manually correct the stage if needed.
  const prevStageMap: Record<KanbanStage, KanbanStage | null> = { matched: null, sent: 'matched', responded: 'sent' }
  const nextStageMap: Record<KanbanStage, KanbanStage | null> = { matched: 'sent', sent: 'responded', responded: null }

  function scoreBadgeColor(score: number): string {
    if (score >= 90) return 'bg-red-100 text-red-700'
    if (score >= 75) return 'bg-amber-100 text-amber-700'
    if (score >= 50) return 'bg-blue-100 text-blue-700'
    return 'bg-gray-100 text-gray-600'
  }

  async function openEditModal(b: BuyerItem) {
    setEditTarget(b)
    ensureFormOptionsLoaded()
  }

  // Buyer edits go through <BuyerModal/>. The modal does its own PATCH;
  // we just merge the result locally so the kanban card updates without
  // a refetch.
  function applyBuyerPatch(patch: Partial<BuyerItem>) {
    if (!editTarget) return
    const updater = (list: BuyerItem[]) => list.map(b =>
      b.id === editTarget.id ? { ...b, ...patch } as BuyerItem : b
    )
    setBuyers(updater)
    setAddedBuyers(updater)
  }

  // Session 77 — replaced bespoke single-buyer SMS by SendModal which
  // covers SMS + email + 4 artifact options + recipient picker. The
  // legacy sendSms() / smsTarget state was removed.

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
          {/* Buyers auto-sync from GHL via webhooks; no manual Sync/Rematch
              buttons. The matched list refreshes whenever this section
              mounts or the property's market changes. */}
          {syncMsg && <p className="text-[10px] text-txt-muted mt-0.5">{syncMsg}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={async () => { await ensureFormOptionsLoaded(); setShowBulkAdd(true) }} disabled={loading}
            className="text-ds-fine font-medium text-semantic-blue hover:text-semantic-blue/80 flex items-center gap-1 transition-colors disabled:opacity-50">
            <Upload size={11} />
            Bulk Add
          </button>
        </div>
      </div>

      {/* Tier roll-up — counts of every buyer tied to this deal, broken
          out by tier, with a "/ N sent" tail showing how many in each tier
          have already been blasted (stage = sent or responded). */}
      <TierSummary buyers={allBuyers} stages={buyerStages} />

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
        {/* Session 77 — market chip-row removed. The property already has
            an assigned market; buyers shown here matched on that market
            (or are nationwide). Clicking 5 chips to filter by market never
            made sense in a per-property view. */}
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
                          Matched <span className="text-[9px] font-normal ml-0.5">({allBuyers.filter(b => !everResponded[b.id] && getBuyerStage(b.id) === 'matched' && !addedBuyers.some(a => a.id === b.id)).length})</span>
                        </button>
                        <button onClick={() => setLeftTab('added')}
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${leftTab === 'added' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'}`}>
                          Added <span className="text-[9px] font-normal ml-0.5">({addedBuyers.filter(b => !everResponded[b.id] && getBuyerStage(b.id) === 'matched').length})</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={openAddModal}
                          className="text-[10px] font-medium text-semantic-blue hover:text-semantic-blue/80 flex items-center gap-0.5 transition-colors">
                          <Plus size={10} /> Add
                        </button>
                        {/* Session 77 — bulk send to every visible matched buyer.
                            Disabled until tier messages have been generated in
                            Section 2 (the Auto-tier mode is the whole point of
                            "Send all"; without per-tier copy there's nothing to send). */}
                        {colBuyers.length > 0 && (() => {
                          const tierMessages = (property.dispoArtifacts?.tierMessages ?? {}) as Record<string, unknown>
                          const hasTierMessages = Object.keys(tierMessages).length > 0
                          return (
                            <button
                              onClick={() => hasTierMessages && setSendTargets(colBuyers)}
                              disabled={!hasTierMessages}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-colors ${
                                hasTierMessages
                                  ? 'text-white bg-gunner-red hover:bg-gunner-red-dark'
                                  : 'text-txt-muted bg-surface-tertiary cursor-not-allowed'
                              }`}
                              title={hasTierMessages
                                ? 'Send to every buyer in the Matched column'
                                : 'Generate Tier Messages in Section 2 first'}
                            >
                              <Send size={9} /> Send all ({colBuyers.length})
                            </button>
                          )
                        })()}
                      </div>
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
                      // Card style by stage: Sent gets a blue accent (in
                      // motion), Responded gets amber (rep needs to look at
                      // it), not-interested replies are dimmed.
                      const cardClasses = isNotInterested
                        ? 'bg-gray-50 opacity-60 rounded-lg border-[0.5px] border-[rgba(0,0,0,0.08)] shadow-sm p-3 transition-shadow'
                        : col.key === 'sent'
                          ? 'bg-blue-50/30 border-l-2 border-blue-400 rounded-lg border-r-[0.5px] border-t-[0.5px] border-b-[0.5px] border-r-[rgba(0,0,0,0.08)] border-t-[rgba(0,0,0,0.08)] border-b-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow'
                          : col.key === 'responded'
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
                            <a
                              href={`/${tenantSlug}/buyers/${b.id}`}
                              className="text-ds-fine font-semibold text-txt-primary truncate flex-1 hover:text-gunner-red hover:underline"
                              title="Open buyer page"
                            >
                              {titleCase(b.name)}
                            </a>
                            <span className="text-[9px] text-txt-muted shrink-0 truncate max-w-[70px]">{(b.markets ?? []).slice(0, 2).join(', ')}</span>
                          </div>
                          {b.phone && (
                            <p className="text-[10px] text-txt-muted mb-2 pl-0.5">{formatPhone(b.phone)}</p>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setSendTargets([b])}
                              disabled={!b.phone && !b.email}
                              className="flex items-center gap-1 text-[9px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 px-2 py-1 rounded-md transition-colors"
                              title="Send artifact (description / listing / social / custom)"
                            >
                              <Send size={10} /> Send
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

      {showAddModal && (
        <BuyerModal
          mode="add"
          propertyId={property.id}
          tenantSlug={tenantSlug}
          marketOptions={formOptions?.markets ?? []}
          defaultStageId={stages[0]?.id}
          onClose={() => setShowAddModal(false)}
          onSaved={(created) => {
            // The API returns a normalized buyer record; promote it onto
            // the kanban as a manually-added buyer so the rep sees their
            // entry immediately without a full refetch.
            const next: BuyerItem = {
              id: created.id ?? '',
              name: created.name,
              phone: created.phone ?? null,
              email: created.email ?? null,
              company: created.company ?? null,
              tier: created.tier,
              markets: created.markets ?? [],
              tags: [],
              notes: created.notes ?? null,
              matchScore: 0,
              scoreBreakdown: 'Manually added',
              verifiedFunding: created.verifiedFunding,
            }
            setAddedBuyers(prev => [...prev, next])
          }}
        />
      )}

      {editTarget && (
        <BuyerModal
          mode="edit"
          buyer={{
            id: editTarget.id,
            name: editTarget.name,
            phone: editTarget.phone,
            email: editTarget.email,
            tier: editTarget.tier,
            markets: editTarget.markets ?? [],
            verifiedFunding: editTarget.verifiedFunding ?? false,
            // Safe defaults for fields the kanban row doesn't carry —
            // the modal fetches the canonical buyer on open and overrides
            // these with the actual persisted values.
            purchasedBefore: false,
            responseSpeed: '',
            buybox: [],
            notes: editTarget.notes ?? null,
          }}
          tenantSlug={tenantSlug}
          marketOptions={formOptions?.markets ?? []}
          onClose={() => setEditTarget(null)}
          onSaved={(next) => {
            applyBuyerPatch({
              name: next.name,
              phone: next.phone ?? null,
              email: next.email ?? null,
              tier: next.tier,
              markets: next.markets,
              verifiedFunding: next.verifiedFunding,
              notes: next.notes ?? null,
            } as Partial<BuyerItem>)
          }}
        />
      )}

      {/* Session 77 — Bulk Add + Send modals */}
      {showBulkAdd && (
        <BulkAddModal
          propertyId={property.id}
          marketOptions={formOptions?.markets ?? []}
          onClose={() => setShowBulkAdd(false)}
          onComplete={() => {
            // Reload to pick up the new buyers + their PropertyBuyerStage rows.
            setAddedLoaded(false)
            setFetched(false)
            loadAddedBuyers()
            matchBuyers()
          }}
        />
      )}
      {sendTargets && (
        <SendModal
          propertyId={property.id}
          propertyAddress={property.address}
          tenantSlug={tenantSlug}
          buyers={sendTargets.map(b => ({
            id: b.id, name: b.name, phone: b.phone, email: b.email, tier: b.tier,
          }))}
          artifacts={{
            description: (property.dispoArtifacts?.description as string | undefined),
            listingPost: (property.dispoArtifacts?.listingPost as string | undefined),
            socialPost: (property.dispoArtifacts?.socialPost as string | undefined),
          }}
          onClose={() => setSendTargets(null)}
          onSent={(sentIds) => {
            // Optimistic stage promote — server-side promote happens in the
            // /blast route. Mirror locally so the buyer card jumps Matched
            // → Sent without waiting for a refetch.
            setBuyerStages(prev => {
              const next = { ...prev }
              for (const id of sentIds) {
                if (!next[id] || next[id] === 'matched') next[id] = 'sent'
              }
              return next
            })
          }}
        />
      )}
    </div>
  )
}

// ─── Tier summary strip ──────────────────────────────────────────────────────
// Five fixed tier buckets shown in tier-badge colors. Each bucket renders
// "<count> / <sent>" so the rep sees both how many buyers in that tier are
// linked to this deal AND how many have actually been blasted.
const TIER_BUCKETS: Array<{ key: string; label: string; bg: string; text: string }> = [
  { key: 'priority',    label: 'Priority',    bg: 'bg-amber-100',   text: 'text-amber-700' },
  { key: 'qualified',   label: 'Qualified',   bg: 'bg-green-100',   text: 'text-green-700' },
  { key: 'unqualified', label: 'Unqualified', bg: 'bg-gray-100',    text: 'text-gray-600' },
  { key: 'realtor',     label: 'Realtors',    bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  { key: 'jv',          label: 'JVs',         bg: 'bg-blue-100',    text: 'text-blue-700' },
]

function TierSummary({
  buyers,
  stages,
}: {
  buyers: Array<{ id: string; tier: string }>
  stages: Record<string, string>
}) {
  const totals: Record<string, { total: number; sent: number }> = {}
  for (const t of TIER_BUCKETS) totals[t.key] = { total: 0, sent: 0 }

  for (const b of buyers) {
    const bucket = totals[b.tier] ?? totals.unqualified
    bucket.total += 1
    const stage = stages[b.id]
    if (stage === 'sent' || stage === 'responded') bucket.sent += 1
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      {TIER_BUCKETS.map(t => {
        const c = totals[t.key]
        return (
          <div
            key={t.key}
            className={`${t.bg} rounded-[10px] px-2.5 py-2 flex flex-col items-start gap-0.5`}
          >
            <span className={`text-[8px] font-bold uppercase tracking-wider ${t.text}`}>
              {t.label}
            </span>
            <span className={`text-[14px] font-bold ${t.text}`}>
              {c.total}
              <span className={`text-[10px] font-medium opacity-70 ml-1`}>/ {c.sent} sent</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
