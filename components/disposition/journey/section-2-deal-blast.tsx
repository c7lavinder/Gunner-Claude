'use client'
// components/disposition/journey/section-2-deal-blast.tsx
// Section 2 of the Disposition Journey: Generate Deal Blast.
// Lifted verbatim from the prior DealBlastTab in property-detail-client.tsx.
// Tier selector (Priority / Qualified / JV / Unqualified), email + SMS body
// generation, send buttons. Status = Done when at least one blast has been
// sent.

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { FileText, Pencil, X, Loader2, ChevronRight } from 'lucide-react'
import { formatPhone } from '@/lib/format'
import {
  InlineTextArea,
  type PropertyDetail,
} from '@/components/inventory/property-detail-client'

export function Section2DealBlast({
  property,
  tenantSlug,
}: {
  property: PropertyDetail
  tenantSlug: string
}) {
  const tierDefs = [
    { tier: 'priority', label: 'Priority Buyer', emoji: '👑', desc: 'Top-tier, first access' },
    { tier: 'qualified', label: 'Qualified Buyer', emoji: '⭐', desc: 'Verified proof of funds' },
    { tier: 'jv', label: 'JV Partner', emoji: '🤝', desc: 'Co-investment partners' },
    { tier: 'unqualified', label: 'Unqualified', emoji: '👤', desc: 'Not yet verified' },
  ]

  interface BuyerItem { id: string; name: string; phone: string | null; email: string | null; tier: string; ghlContactId: string | null; markets: string[] }

  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(['priority', 'qualified']))
  const [generating, setGenerating] = useState(false)
  const [blasts, setBlasts] = useState<Record<string, { emailSubject: string; emailBody: string; smsBody: string }>>({})
  const [expandedTier, setExpandedTier] = useState<string | null>(null)
  const [sendingTier, setSendingTier] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [emailPreview, setEmailPreview] = useState<string | null>(null)
  const [recipientCounts, setRecipientCounts] = useState<Record<string, number>>({})
  const [blastHistory, setBlastHistory] = useState<Array<{ id: string; channel: string; status: string; sentAt: string | null; recipientCount: number }>>([])
  const [allBuyers, setAllBuyers] = useState<BuyerItem[]>([])
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<Set<string>>(new Set())
  const [showRecipients, setShowRecipients] = useState(false)
  const [sendChannel, setSendChannel] = useState<'sms' | 'email'>('sms')
  const [teamMembers, setTeamMembers] = useState<Array<{name: string; phone: string}>>([])
  const [selectedFrom, setSelectedFrom] = useState<{name: string; phone: string} | null>(null)
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false)

  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string | null>>({
    dealBlastAskingOverride: property.dealBlastAskingOverride,
    dealBlastArvOverride: property.dealBlastArvOverride,
    dealBlastContractOverride: property.dealBlastContractOverride,
    dealBlastAssignmentFeeOverride: property.dealBlastAssignmentFeeOverride,
  })
  const [savingOverride, setSavingOverride] = useState(false)

  const [description, setDescription] = useState<string | null>(property.description)
  const [internalNotes, setInternalNotes] = useState<string | null>(property.internalNotes)
  const [descriptionSource, setDescriptionSource] = useState<string | undefined>(property.fieldSources?.description)

  function handleBlastFieldSaved(field: string, val: string | number | null, src?: string) {
    if (field === 'description') {
      setDescription(val as string | null)
      if (src !== undefined) setDescriptionSource(src || undefined)
    } else if (field === 'internalNotes') {
      setInternalNotes(val as string | null)
    }
  }

  async function saveDealOverride(overrideKey: string, value: string) {
    setSavingOverride(true)
    try {
      const numericValue = value ? parseFloat(value.replace(/[^0-9.]/g, '')) : null
      await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [overrideKey]: numericValue ? numericValue.toString() : null }),
      })
      setOverrides(prev => ({ ...prev, [overrideKey]: numericValue ? numericValue.toString() : null }))
    } catch {
      // revert on error
    }
    setSavingOverride(false)
    setEditingField(null)
  }

  useEffect(() => {
    fetchBuyers()
    fetchBlastHistory()
    fetchTeamMembers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateBlast(tier: string, field: 'emailSubject' | 'emailBody' | 'smsBody', value: string) {
    setBlasts(prev => ({
      ...prev,
      [tier]: { ...prev[tier], [field]: value },
    }))
  }

  async function fetchBuyers() {
    try {
      const res = await fetch(`/api/properties/${property.id}/buyers`)
      const data = await res.json()
      const buyers: BuyerItem[] = (data.buyers ?? []).map((b: Record<string, unknown>) => ({
        id: b.id as string, name: b.name as string, phone: b.phone as string | null,
        email: b.email as string | null, tier: b.tier as string,
        ghlContactId: b.ghlContactId as string | null,
        markets: (b.markets ?? []) as string[],
      }))
      setAllBuyers(buyers)
      setSelectedBuyerIds(new Set(buyers.map(b => b.id)))
      const counts: Record<string, number> = {}
      for (const b of buyers) { counts[b.tier] = (counts[b.tier] ?? 0) + 1 }
      setRecipientCounts(counts)
    } catch {}
  }

  async function fetchTeamMembers() {
    try {
      const res = await fetch(`/api/${tenantSlug}/dayhub/team-numbers`)
      if (res.ok) {
        const data = await res.json()
        const members: Array<{name: string; phone: string}> = data.numbers ?? []
        setTeamMembers(members)
        if (members.length > 0 && !selectedFrom) {
          setSelectedFrom(members[0])
        }
      }
    } catch { /* silently fail */ }
  }

  function toggleBuyer(id: string) {
    setSelectedBuyerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAllBuyers() { setSelectedBuyerIds(new Set(filteredBuyers.map(b => b.id))) }
  function deselectAllBuyers() { setSelectedBuyerIds(new Set()) }

  const filteredBuyers = allBuyers.filter(b => selectedTiers.has(b.tier))

  async function fetchBlastHistory() {
    try {
      const res = await fetch(`/api/properties/${property.id}/blast`)
      if (res.ok) {
        const data = await res.json()
        setBlastHistory(data.history ?? [])
      }
    } catch {}
  }

  async function sendToTier(tier: string, channel: 'sms' | 'email') {
    const content = blasts[tier]
    if (!content) return
    const buyerCount = selectedBuyerIds.size > 0 ? selectedBuyerIds.size : recipientCounts[tier] ?? 0
    if (!window.confirm(`Send ${channel.toUpperCase()} blast to ${buyerCount} ${tier} buyers?\n\nThis will send real messages to real people.`)) return
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
          buyerIds: [...selectedBuyerIds],
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSendResult(`Sent to ${data.sentTo} buyers${data.skipped ? `, ${data.skipped} skipped` : ''}`)
        fetchBlastHistory()
      } else {
        setSendResult('Send failed')
      }
    } catch { setSendResult('Send failed') }
    setSendingTier(null)
    setTimeout(() => setSendResult(null), 8000)
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
        fetchBuyers(),
      ])
      const data = await blastRes.json()
      setBlasts(data.blasts ?? {})
      setExpandedTier([...selectedTiers][0])
    } catch {}
    setGenerating(false)
  }

  const fmt = (v: string | null | undefined) => {
    if (v == null || v === '') return '—'
    const n = Number(v)
    return isNaN(n) ? '—' : `$${n.toLocaleString()}`
  }
  const totalRecipients = Object.values(recipientCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Deal Blast</p>
          <p className="text-[8px] text-txt-muted italic">Generate, preview, and send property blasts to buyers</p>
        </div>
        <button
          onClick={() => {
            import('@/components/inventory/PropertyFlyer').then(m => m.downloadPropertyPDF({
              address: property.address, city: property.city, state: property.state, zip: property.zip,
              askingPrice: property.askingPrice, arv: property.arv, contractPrice: property.contractPrice,
              assignmentFee: property.assignmentFee, mao: property.mao,
              beds: property.beds, baths: property.baths, sqft: property.sqft, yearBuilt: property.yearBuilt,
              description,
            }))
          }}
          className="text-ds-fine font-medium text-txt-secondary hover:text-txt-primary bg-surface-secondary px-3 py-1.5 rounded-[8px] border-[0.5px] border-[rgba(0,0,0,0.08)] flex items-center gap-1 transition-colors"
        >
          <FileText size={11} /> PDF Flyer
        </button>
      </div>

      <InlineTextArea
        label="Internal Notes"
        value={internalNotes}
        field="internalNotes"
        propertyId={property.id}
        labelColor="text-amber-700"
        bgColor="bg-amber-50 border-[0.5px] border-amber-200"
        textColor="text-amber-900"
        onSaved={handleBlastFieldSaved}
      />

      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Deal Summary</p>
          <p className="text-[8px] text-txt-muted italic">Click a value to set a blast override</p>
        </div>
        <div className="p-3">
        <div className="grid grid-cols-4 gap-3">
          {([
            { key: 'askingPrice', overrideKey: 'dealBlastAskingOverride', label: 'Asking', value: property.askingPrice, color: 'text-txt-primary' },
            { key: 'arv', overrideKey: 'dealBlastArvOverride', label: 'ARV', value: property.arv, color: 'text-semantic-green' },
            { key: 'contractPrice', overrideKey: 'dealBlastContractOverride', label: 'Contract', value: property.contractPrice, color: 'text-txt-primary' },
            { key: 'assignmentFee', overrideKey: 'dealBlastAssignmentFeeOverride', label: 'Assignment Fee',
              value: property.assignmentFee ?? (property.acceptedPrice && property.contractPrice ? String(Number(property.acceptedPrice) - Number(property.contractPrice)) : null),
              color: 'text-semantic-amber' },
          ] as const).map(field => {
            const source = property.fieldSources?.[field.key]
            const overrideValue = overrides[field.overrideKey]
            const displayValue = overrideValue ?? field.value
            const hasOverride = overrideValue !== null && overrideValue !== undefined
            const isEditing = editingField === field.overrideKey
            const cardClass = hasOverride
              ? 'bg-amber-50 border-[0.5px] border-amber-300'
              : source === 'api' ? 'bg-purple-50 border-[0.5px] border-purple-300'
              : source === 'ai' ? 'bg-blue-50 border-[0.5px] border-blue-300'
              : source === 'user' ? 'bg-green-50 border-[0.5px] border-green-300'
              : 'bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)]'
            const tag = hasOverride ? 'OVERRIDE'
              : source === 'api' ? 'API'
              : source === 'ai' ? 'AI'
              : source === 'user' ? 'EDITED'
              : null
            const tagColor = hasOverride ? 'text-amber-400'
              : source === 'api' ? 'text-purple-400'
              : source === 'ai' ? 'text-blue-400'
              : source === 'user' ? 'text-green-400'
              : ''
            return (
              <div key={field.key} className={`${cardClass} rounded-[10px] px-3 py-2.5 cursor-pointer group relative`}>
                {tag && <span className={`absolute top-1 right-1.5 text-[7px] font-bold uppercase ${tagColor}`}>{tag}</span>}
                <p className="text-[9px] text-txt-muted flex items-center gap-1">
                  {field.label}
                  <Pencil size={7} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                </p>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="text-ds-fine text-txt-muted">$</span>
                    <input
                      autoFocus
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveDealOverride(field.overrideKey, editValue)
                        if (e.key === 'Escape') setEditingField(null)
                      }}
                      onBlur={() => saveDealOverride(field.overrideKey, editValue)}
                      className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded px-1 py-0.5 text-ds-fine font-semibold text-txt-primary focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                      disabled={savingOverride}
                    />
                    <button
                      onClick={() => { saveDealOverride(field.overrideKey, '') }}
                      className="text-[8px] text-txt-muted hover:text-red-500"
                      title="Clear override"
                    >
                      <X size={9} />
                    </button>
                  </div>
                ) : (
                  <p
                    className={`text-ds-fine font-semibold ${field.color} flex items-center hover:bg-white/50 rounded px-0.5 -mx-0.5 transition-colors`}
                    onClick={() => {
                      setEditingField(field.overrideKey)
                      setEditValue(overrideValue ?? field.value ?? '')
                    }}
                  >
                    {fmt(displayValue)}
                  </p>
                )}
                {hasOverride && field.value && (
                  <p className="text-[8px] text-txt-muted line-through">{fmt(field.value)}</p>
                )}
              </div>
            )
          })}
        </div>
        {(property.beds || property.baths || property.sqft) && (
          <div className="flex items-center gap-3 mt-2 text-[10px] text-txt-secondary">
            {property.beds && <span>{property.beds} bed</span>}
            {property.baths && <span>{property.baths} bath</span>}
            {property.sqft && <span>{property.sqft.toLocaleString()} sqft</span>}
            {property.yearBuilt && <span>Built {property.yearBuilt}</span>}
          </div>
        )}
        {property.neighborhoodSummary && (
          <p className="text-[10px] text-txt-secondary mt-2 italic">{property.neighborhoodSummary}</p>
        )}
        <div className="mt-3">
          <InlineTextArea
            label="Description"
            value={description}
            field="description"
            propertyId={property.id}
            onSaved={handleBlastFieldSaved}
            {...(descriptionSource === 'ai'
              ? { labelColor: 'text-blue-700', bgColor: 'bg-blue-50 border-[0.5px] border-blue-200', textColor: 'text-blue-900' }
              : {})}
            source={descriptionSource}
          />
        </div>
        {(property.repairEstimate || property.rentalEstimate || property.floodZone) && (
          <div className="flex items-center gap-3 mt-2 text-[9px] text-txt-secondary">
            {property.repairEstimate && <span>Repair Est: <strong>${Number(property.repairEstimate).toLocaleString()}</strong></span>}
            {property.rentalEstimate && <span>Rental Est: <strong>${Number(property.rentalEstimate).toLocaleString()}/mo</strong></span>}
            {property.floodZone && <span>Flood: <strong>{property.floodZone}</strong></span>}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] font-medium text-txt-muted bg-surface-tertiary px-1.5 py-0.5 rounded-full">{totalRecipients} matched buyers</span>
          {property.propertyMarkets?.length > 0 && (
            <span className="text-[9px] font-medium text-semantic-blue bg-semantic-blue-bg px-1.5 py-0.5 rounded-full">{property.propertyMarkets.join(', ')}</span>
          )}
        </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Select Buyer Tiers</p>
        <div className="grid grid-cols-2 gap-2">
          {tierDefs.map(t => (
            <label
              key={t.tier}
              className={`flex items-start gap-2.5 cursor-pointer transition-colors ${
                selectedTiers.has(t.tier)
                  ? 'rounded-[10px] px-3 py-2.5 border-[0.5px]'
                  : 'bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] px-3 py-2.5 hover:bg-surface-tertiary'
              }`}
              style={selectedTiers.has(t.tier) ? { backgroundColor: 'rgba(192,57,43,0.05)', borderColor: 'rgba(192,57,43,0.25)' } : undefined}
            >
              <input type="checkbox" checked={selectedTiers.has(t.tier)} onChange={() => toggleTier(t.tier)} className="mt-0.5 accent-gunner-red" />
              <div>
                <p className="text-ds-fine font-semibold text-txt-primary">{t.emoji} {t.label}</p>
                <p className="text-[9px] text-txt-muted">{t.desc}{recipientCounts[t.tier] ? ` — ${recipientCounts[t.tier]} buyers` : ''}</p>
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

      {filteredBuyers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
              Recipients ({filteredBuyers.filter(b => selectedBuyerIds.has(b.id)).length} of {allBuyers.length} selected)
            </p>
            <div className="flex items-center gap-2">
              <button onClick={selectAllBuyers} className="text-[9px] font-medium text-semantic-blue hover:underline">Select All</button>
              <button onClick={deselectAllBuyers} className="text-[9px] font-medium text-txt-muted hover:underline">Clear</button>
              <button onClick={() => setShowRecipients(p => !p)} className="text-[9px] font-medium text-txt-secondary hover:text-txt-primary">
                {showRecipients ? 'Hide' : 'Show'} List
              </button>
            </div>
          </div>
          {showRecipients && (
            <div className="max-h-[200px] overflow-y-auto space-y-1 mb-2">
              {filteredBuyers.map(b => (
                <label key={b.id} className={`flex items-center gap-2 rounded-[8px] px-3 py-1.5 cursor-pointer transition-colors border-[0.5px] ${
                  selectedBuyerIds.has(b.id) ? 'bg-gunner-red-light border-gunner-red/20' : 'bg-surface-secondary border-[rgba(0,0,0,0.06)]'
                }`}>
                  <input type="checkbox" checked={selectedBuyerIds.has(b.id)} onChange={() => toggleBuyer(b.id)} className="accent-gunner-red" />
                  <div className="flex-1 min-w-0">
                    <span className="text-ds-fine font-medium text-txt-primary">{b.name}</span>
                    <span className="text-[9px] text-txt-muted ml-2">{b.phone ?? b.email ?? 'No contact'}</span>
                  </div>
                  <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                    b.tier === 'priority' ? 'bg-amber-100 text-amber-700' : b.tier === 'qualified' ? 'bg-green-100 text-green-700' : b.tier === 'jv' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>{b.tier}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 bg-surface-secondary rounded-[8px] px-3 py-2 border-[0.5px] border-[rgba(0,0,0,0.06)]">
            <span className="text-[9px] font-semibold text-txt-muted uppercase">Send via:</span>
            <button onClick={() => setSendChannel('sms')}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${sendChannel === 'sms' ? 'bg-green-600 text-white' : 'bg-surface-tertiary text-txt-secondary'}`}>
              SMS
            </button>
            <button onClick={() => setSendChannel('email')}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${sendChannel === 'email' ? 'bg-blue-600 text-white' : 'bg-surface-tertiary text-txt-secondary'}`}>
              Email
            </button>
            <div className="relative ml-auto">
              <button
                onClick={() => setFromDropdownOpen(p => !p)}
                className="text-[9px] text-txt-muted hover:text-txt-primary flex items-center gap-1 transition-colors"
              >
                FROM: <span className="font-semibold text-txt-secondary">{selectedFrom ? `${selectedFrom.name} — ${formatPhone(selectedFrom.phone)}` : 'Select...'}</span>
                <ChevronRight size={8} className={`transition-transform ${fromDropdownOpen ? 'rotate-90' : ''}`} />
              </button>
              {fromDropdownOpen && teamMembers.length > 0 && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-[8px] border-[0.5px] border-[rgba(0,0,0,0.1)] shadow-lg py-1 min-w-[200px]">
                  {teamMembers.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedFrom(m); setFromDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-surface-secondary transition-colors ${
                        selectedFrom?.phone === m.phone ? 'bg-gunner-red-light text-txt-primary font-semibold' : 'text-txt-secondary'
                      }`}
                    >
                      {m.name} — {formatPhone(m.phone)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {blastHistory.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Blast History</p>
          <div className="space-y-1.5">
            {blastHistory.map(b => (
              <div key={b.id} className="flex items-center justify-between bg-surface-secondary rounded-[8px] px-3 py-2 border-[0.5px] border-[rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2">
                  <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${b.channel === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {b.channel.toUpperCase()}
                  </span>
                  <span className="text-ds-fine text-txt-primary">{b.recipientCount} recipients</span>
                  <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${b.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {b.status}
                  </span>
                </div>
                {b.sentAt && <span className="text-[9px] text-txt-muted">{format(new Date(b.sentAt), 'MMM d, h:mm a')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-txt-muted text-center">Edit content before sending. System learns from your changes.</p>
    </div>
  )
}
