'use client'
// components/disposition/journey/section-2-deal-blast.tsx
// Section 2 of the Disposition Journey: Generate Deal Blast.
// Session 77 rewrite — generation only, no sending. The 3 artifacts
// (description / listing-site post / FB social post) are produced by
// <Section2Artifacts/> below; sending lives in Section 3 (Match Buyers)
// where the recipient kanban dispatches them per-buyer or in bulk.
//
// What stays here: deal-summary cards (Contract / Asking / ARV / Fee),
// internal notes, the 3 generators, plus the PDF flyer download.

import { useState } from 'react'
import { FileText, Loader2, Pencil, Wand2, X } from 'lucide-react'
import {
  InlineTextArea,
  type PropertyDetail,
} from '@/components/inventory/property-detail-client'
import { Section2Artifacts } from './section-2-artifacts'
import { isDispoManagerRole } from '@/lib/disposition/property-details-readiness'
import { useToast } from '@/components/ui/toaster'

export function Section2DealBlast({
  property,
  description,
  onDescriptionChange,
  internalNotes,
  onInternalNotesChange,
  artifacts,
  onArtifactsChange,
}: {
  property: PropertyDetail
  tenantSlug: string
  // Lifted from DispositionJourney so collapse/expand doesn't lose state.
  description: string | null
  onDescriptionChange: (val: string | null) => void
  internalNotes: string | null
  onInternalNotesChange: (val: string | null) => void
  artifacts: Record<string, unknown>
  onArtifactsChange: (next: Record<string, unknown>) => void
}) {
  const { toast } = useToast()
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string | null>>({
    dealBlastContractOverride: property.dealBlastContractOverride,
    // Session 77 — investor-facing asking. Treated as a "primary" key here,
    // not an override (there's no seller-asking fallback to strike through).
    dispoAskingPrice: property.dispoAskingPrice,
  })
  const [fieldSources, setFieldSources] = useState<Record<string, string>>(
    (property.fieldSources ?? {}) as Record<string, string>,
  )
  const [savingOverride, setSavingOverride] = useState(false)

  const [generatingDescription, setGeneratingDescription] = useState(false)
  const descriptionSource = fieldSources.description
  const hasDispoManager = property.propertyTeam.some(t => isDispoManagerRole(t.role))

  function handleBlastFieldSaved(field: string, val: string | number | null, src?: string) {
    if (field === 'description') {
      onDescriptionChange(val as string | null)
      if (src !== undefined) {
        setFieldSources(prev => {
          const next = { ...prev }
          if (src) next.description = src
          else delete next.description
          return next
        })
      }
    } else if (field === 'internalNotes') {
      onInternalNotesChange(val as string | null)
    }
  }

  async function generateDescription() {
    if (!hasDispoManager || generatingDescription) return
    setGeneratingDescription(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/dispo-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'description' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error ?? 'Failed to generate description', 'error')
      } else {
        const newText = data.text ?? ''
        onDescriptionChange(newText)
        // The dispo-generate route writes dispoArtifacts.description, so
        // also persist to Property.description for the canonical source.
        await fetch(`/api/properties/${property.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: newText,
            fieldSources: { description: 'ai' },
          }),
        }).catch(() => {})
        setFieldSources(prev => ({ ...prev, description: 'ai' }))
        toast('Description generated', 'success')
      }
    } catch {
      toast('Failed to generate description', 'error')
    }
    setGeneratingDescription(false)
  }

  async function saveDealOverride(overrideKey: string, value: string) {
    setSavingOverride(true)
    try {
      const numericValue = value ? parseFloat(value.replace(/[^0-9.]/g, '')) : null
      const stored = numericValue ? numericValue.toString() : null
      // Stamp fieldSources alongside the value so the card flips to the
      // green "EDITED" state on save and stays that way after refresh.
      await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [overrideKey]: stored,
          fieldSources: { [overrideKey]: stored ? 'user' : '' },
        }),
      })
      setOverrides(prev => ({ ...prev, [overrideKey]: stored }))
      setFieldSources(prev => {
        const next = { ...prev }
        if (stored) next[overrideKey] = 'user'
        else delete next[overrideKey]
        return next
      })
    } catch {
      // revert on error
    }
    setSavingOverride(false)
    setEditingField(null)
  }

  const fmt = (v: string | null | undefined) => {
    if (v == null || v === '') return '—'
    const n = Number(v)
    return isNaN(n) ? '—' : `$${n.toLocaleString()}`
  }

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
          <p className="text-[8px] text-txt-muted italic">Asking is what we ask the investor — distinct from seller&apos;s ask on Overview. Click any value to edit.</p>
        </div>
        <div className="p-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Order: Contract → Asking. ARV is shown above in the Property
              Details panel; Assignment Fee belongs after the deal closes,
              not before sending — both are dropped here per Session 78. */}
          {([
            { key: 'contractPrice', overrideKey: 'dealBlastContractOverride', label: 'Contract', value: property.contractPrice, color: 'text-txt-primary', isPrimaryWrite: false },
            { key: 'dispoAskingPrice', overrideKey: 'dispoAskingPrice', label: 'Asking', value: null, color: 'text-txt-primary', isPrimaryWrite: true },
          ] as const).map(field => {
            const source = field.isPrimaryWrite ? fieldSources[field.overrideKey] : fieldSources[field.key]
            const overrideValue = overrides[field.overrideKey]
            const displayValue = overrideValue ?? field.value
            const hasOverride = overrideValue !== null && overrideValue !== undefined
            const isEditing = editingField === field.overrideKey
            // Asking writes directly to its own field — no "override" semantics.
            // Suppress the OVERRIDE tag + strikethrough fallback for primary-write cards.
            const cardClass = (!field.isPrimaryWrite && hasOverride)
              ? 'bg-amber-50 border-[0.5px] border-amber-300'
              : source === 'api' ? 'bg-purple-50 border-[0.5px] border-purple-300'
              : source === 'ai' ? 'bg-blue-50 border-[0.5px] border-blue-300'
              : source === 'user' ? 'bg-green-50 border-[0.5px] border-green-300'
              : 'bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)]'
            const tag = (!field.isPrimaryWrite && hasOverride) ? 'OVERRIDE'
              : source === 'api' ? 'API'
              : source === 'ai' ? 'AI'
              : source === 'user' ? 'EDITED'
              : null
            const tagColor = (!field.isPrimaryWrite && hasOverride) ? 'text-amber-400'
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
                      title={field.isPrimaryWrite ? 'Clear value' : 'Clear override'}
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
                {!field.isPrimaryWrite && hasOverride && field.value && (
                  <p className="text-[8px] text-txt-muted line-through">{fmt(field.value)}</p>
                )}
              </div>
            )
          })}
        </div>
        {(property.beds || property.baths || property.sqft || property.propertyType) && (
          <div className="flex items-center gap-3 mt-2 text-[10px] text-txt-secondary">
            {property.beds && <span>{property.beds} bed</span>}
            {property.baths && <span>{property.baths} bath</span>}
            {property.sqft && <span>{property.sqft.toLocaleString()} sqft</span>}
            {property.propertyType && <span>{property.propertyType}</span>}
            {property.yearBuilt && <span>Built {property.yearBuilt}</span>}
          </div>
        )}
        {property.neighborhoodSummary && (
          <p className="text-[10px] text-txt-secondary mt-2 italic">{property.neighborhoodSummary}</p>
        )}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Description</p>
            <button
              onClick={generateDescription}
              disabled={!hasDispoManager || generatingDescription}
              title={!hasDispoManager ? 'Assign a Disposition Manager first.' : ''}
              className="text-[10px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 px-2.5 py-1 rounded-[6px] inline-flex items-center gap-1 transition-colors"
            >
              {generatingDescription ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
              {generatingDescription ? 'Generating...' : (description ? 'Regenerate' : 'Generate')}
            </button>
          </div>
          <InlineTextArea
            label=""
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
        {/* Session 77 — repair + rental dropped from this strip; repair lives
            in Property Details panel above and rental is moved to the Data
            tab. Flood stays — it's investor-relevant context. */}
        {property.floodZone && (
          <div className="flex items-center gap-3 mt-2 text-[9px] text-txt-secondary">
            <span>Flood: <strong>{property.floodZone}</strong></span>
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          {property.buyersMatchedCount > 0 && (
            <span className="text-[9px] font-medium text-txt-muted bg-surface-tertiary px-1.5 py-0.5 rounded-full">{property.buyersMatchedCount} buyers in pipeline</span>
          )}
          {property.propertyMarkets?.length > 0 && (
            <span className="text-[9px] font-medium text-semantic-blue bg-semantic-blue-bg px-1.5 py-0.5 rounded-full">{property.propertyMarkets.join(', ')}</span>
          )}
        </div>
        </div>
      </div>

      {/* Session 78 — listing post + social post + per-tier messages.
          Description was promoted out of artifacts and lives next to the
          deal summary above (single source of truth on Property.description).
          No send button — sending lives in Section 3 (Match buyers). */}
      <Section2Artifacts
        propertyId={property.id}
        artifacts={artifacts}
        onArtifactsChange={onArtifactsChange}
        hasDispoManager={hasDispoManager}
      />

      <p className="text-[10px] text-txt-muted text-center bg-surface-secondary rounded-[8px] py-2 border-[0.5px] border-[rgba(0,0,0,0.06)]">
        Sending happens in Section 3 (Match Buyers).
      </p>
    </div>
  )
}
