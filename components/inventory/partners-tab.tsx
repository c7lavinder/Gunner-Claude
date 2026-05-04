'use client'
// components/inventory/partners-tab.tsx
//
// Property-detail Partners tab (Session 67 Phase 2). Lists every Partner
// linked to this property + supports linking a new one from a GHL contact.
// Mirrors the pattern from ContactsSection in property-detail-client.tsx
// (sellers tab) but extends with multi-type chips and per-deal economics.
//
// API surface: /api/properties/[propertyId]/partners (GET/POST/DELETE).
// See route.ts for shape.

import { useState } from 'react'
import Link from 'next/link'
import { Briefcase, Plus, X, Search, Edit2, Save } from 'lucide-react'
import { formatPhone, titleCase } from '@/lib/format'

const PARTNER_TYPES = [
  'agent',
  'wholesaler',
  'attorney',
  'title',
  'lender',
  'inspector',
  'contractor',
  'photographer',
  'property_manager',
  'other',
] as const
type PartnerType = (typeof PARTNER_TYPES)[number]

const ROLE_OPTIONS = [
  // Agent flavors
  'sourced_to_us',
  'taking_to_clients',
  'closing_agent',
  // Wholesaler flavors
  'sold_us_this',
  'we_sold_them_this',
  'jv_partner',
  // Service flavors
  'attorney_seller',
  'attorney_buyer',
  'title_company',
  'lender',
  'inspector',
  'contractor',
  'photographer',
  'property_manager',
  'other',
] as const

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function typeLabel(type: string): string {
  return type === 'property_manager' ? 'Property Mgr' : type.charAt(0).toUpperCase() + type.slice(1)
}

export interface PropertyPartnerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  company: string | null
  ghlContactId: string | null
  types: string[]
  partnerGrade: string | null
  tierClassification: string | null
  role: string
  commissionPercent: number | null
  commissionAmount: string | null
  purchasePrice: string | null
  assignmentFeePaid: string | null
  notesOnThisDeal: string | null
}

interface GHLContactSearchResult {
  id: string
  name: string
  phone: string | null
  email: string | null
  address?: string
}

export function PartnersTab({
  propertyId,
  tenantSlug,
  initialPartners,
  canEdit,
}: {
  propertyId: string
  tenantSlug: string
  initialPartners: PropertyPartnerRow[]
  canEdit: boolean
}) {
  const [partners, setPartners] = useState(initialPartners)
  const [showLink, setShowLink] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
          <Briefcase size={10} className="inline -mt-0.5 text-gunner-red" /> Partners on this deal ({partners.length})
        </p>
        {canEdit && (
          <button
            onClick={() => setShowLink(v => !v)}
            className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-0.5 transition-colors"
          >
            {showLink ? <X size={10} /> : <Plus size={10} />}
            {showLink ? 'Cancel' : 'Link Partner'}
          </button>
        )}
      </div>

      {showLink && canEdit && (
        <LinkPartnerForm
          propertyId={propertyId}
          existingGhlContactIds={partners.map(p => p.ghlContactId).filter((id): id is string => !!id)}
          onLinked={(partner) => {
            setPartners(prev => [...prev, partner])
            setShowLink(false)
          }}
        />
      )}

      {partners.length === 0 ? (
        <p className="text-ds-fine text-txt-muted">No partners on this deal yet.</p>
      ) : (
        <div className="space-y-2">
          {partners.map(p => (
            <PartnerCard
              key={p.id}
              propertyId={propertyId}
              tenantSlug={tenantSlug}
              partner={p}
              canEdit={canEdit}
              isEditing={editingId === p.id}
              onEditToggle={() => setEditingId(editingId === p.id ? null : p.id)}
              onUpdate={(updated) => {
                setPartners(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
                setEditingId(null)
              }}
              onUnlink={() => setPartners(prev => prev.filter(x => x.id !== p.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Link Partner form ───────────────────────────────────────────────────────

function LinkPartnerForm({
  propertyId,
  existingGhlContactIds,
  onLinked,
}: {
  propertyId: string
  existingGhlContactIds: string[]
  onLinked: (partner: PropertyPartnerRow) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GHLContactSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<GHLContactSearchResult | null>(null)
  const [types, setTypes] = useState<PartnerType[]>([])
  const [role, setRole] = useState<string>('sourced_to_us')
  const [commissionPercent, setCommissionPercent] = useState('')
  const [commissionAmount, setCommissionAmount] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [assignmentFeePaid, setAssignmentFeePaid] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(q: string) {
    setQuery(q)
    setError(null)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.contacts ?? [])
    } catch {
      setResults([])
    }
    setSearching(false)
  }

  function toggleType(t: PartnerType) {
    setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function submit() {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        ghlContactId: selected.id,
        name: selected.name,
        phone: selected.phone,
        email: selected.email,
        types,
        role,
        commissionPercent: commissionPercent ? Number(commissionPercent) : null,
        commissionAmount: commissionAmount ? Number(commissionAmount) : null,
        purchasePrice: purchasePrice ? Number(purchasePrice) : null,
        assignmentFeePaid: assignmentFeePaid ? Number(assignmentFeePaid) : null,
        notesOnThisDeal: notes.trim() || null,
      }
      const res = await fetch(`/api/properties/${propertyId}/partners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to link')
        setSubmitting(false)
        return
      }
      onLinked(data.partner as PropertyPartnerRow)
    } catch {
      setError('Failed to link partner')
    }
    setSubmitting(false)
  }

  return (
    <div className="bg-surface-secondary rounded-[10px] p-3 space-y-3">
      {!selected ? (
        <>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted" />
            <input
              autoFocus
              value={query}
              onChange={e => search(e.target.value)}
              placeholder="Search GHL contacts..."
              className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] pl-7 pr-3 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
            />
          </div>
          {searching && <p className="text-ds-fine text-txt-muted">Searching...</p>}
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {results.map(c => {
                const alreadyLinked = existingGhlContactIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    disabled={alreadyLinked}
                    onClick={() => setSelected(c)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-[6px] text-ds-fine transition-colors ${
                      alreadyLinked
                        ? 'bg-surface-tertiary text-txt-muted cursor-not-allowed'
                        : 'bg-surface-primary hover:bg-surface-tertiary text-txt-primary'
                    }`}
                  >
                    <p className="font-medium">{titleCase(c.name)}{alreadyLinked ? ' (already linked)' : ''}</p>
                    <p className="text-txt-muted">{c.phone ? formatPhone(c.phone) : c.email ?? '—'}</p>
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Selected contact header */}
          <div className="flex items-start justify-between gap-2 bg-surface-primary rounded-[8px] px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-ds-body font-medium text-txt-primary truncate">{titleCase(selected.name)}</p>
              {selected.phone && <p className="text-ds-fine text-txt-muted">{formatPhone(selected.phone)}</p>}
              {selected.email && <p className="text-ds-fine text-txt-muted truncate">{selected.email}</p>}
            </div>
            <button onClick={() => setSelected(null)} className="text-txt-muted hover:text-semantic-red shrink-0 mt-0.5">
              <X size={12} />
            </button>
          </div>

          {/* Types chips — multi-select */}
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Types</p>
            <div className="flex flex-wrap gap-1">
              {PARTNER_TYPES.map(t => {
                const active = types.includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`text-[10px] font-medium px-2 py-1 rounded-full transition-colors ${
                      active
                        ? 'bg-gunner-red text-white'
                        : 'bg-surface-primary text-txt-secondary hover:text-txt-primary border-[0.5px] border-[rgba(0,0,0,0.1)]'
                    }`}
                  >
                    {typeLabel(t)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Per-deal role */}
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Role on this deal</p>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary focus:outline-none"
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>

          {/* Optional economics — only show fields relevant to selected types */}
          {(types.includes('agent') || role === 'closing_agent' || role === 'taking_to_clients' || role === 'sourced_to_us') && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Commission %" value={commissionPercent} onChange={setCommissionPercent} />
              <NumberField label="Commission $" value={commissionAmount} onChange={setCommissionAmount} />
            </div>
          )}
          {(types.includes('wholesaler') || role === 'sold_us_this' || role === 'we_sold_them_this' || role === 'jv_partner') && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Purchase price" value={purchasePrice} onChange={setPurchasePrice} />
              <NumberField label="Assignment fee" value={assignmentFeePaid} onChange={setAssignmentFeePaid} />
            </div>
          )}

          {/* Per-deal notes */}
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Notes on this deal</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none resize-none"
              placeholder="Optional context for this partner on this property"
            />
          </div>

          {error && <p className="text-ds-fine text-semantic-red">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || types.length === 0}
            className="w-full bg-gunner-red disabled:bg-txt-muted text-white text-ds-fine font-medium py-2 rounded-[8px] hover:bg-gunner-red-dark transition-colors disabled:cursor-not-allowed"
          >
            {submitting ? 'Linking...' : types.length === 0 ? 'Pick at least one type' : 'Link to deal'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Partner card ────────────────────────────────────────────────────────────

function PartnerCard({
  propertyId,
  tenantSlug: _tenantSlug,
  partner,
  canEdit,
  isEditing,
  onEditToggle,
  onUpdate,
  onUnlink,
}: {
  propertyId: string
  tenantSlug: string
  partner: PropertyPartnerRow
  canEdit: boolean
  isEditing: boolean
  onEditToggle: () => void
  onUpdate: (next: PropertyPartnerRow) => void
  onUnlink: () => void
}) {
  const [role, setRole] = useState(partner.role)
  const [commissionPercent, setCommissionPercent] = useState(partner.commissionPercent?.toString() ?? '')
  const [commissionAmount, setCommissionAmount] = useState(partner.commissionAmount ?? '')
  const [purchasePrice, setPurchasePrice] = useState(partner.purchasePrice ?? '')
  const [assignmentFeePaid, setAssignmentFeePaid] = useState(partner.assignmentFeePaid ?? '')
  const [notes, setNotes] = useState(partner.notesOnThisDeal ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/partners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          partnerId: partner.id,
          role,
          commissionPercent: commissionPercent ? Number(commissionPercent) : null,
          commissionAmount: commissionAmount ? Number(commissionAmount) : null,
          purchasePrice: purchasePrice ? Number(purchasePrice) : null,
          assignmentFeePaid: assignmentFeePaid ? Number(assignmentFeePaid) : null,
          notesOnThisDeal: notes.trim() || null,
        }),
      })
      if (res.ok) {
        onUpdate({
          ...partner,
          role,
          commissionPercent: commissionPercent ? Number(commissionPercent) : null,
          commissionAmount: commissionAmount || null,
          purchasePrice: purchasePrice || null,
          assignmentFeePaid: assignmentFeePaid || null,
          notesOnThisDeal: notes.trim() || null,
        })
      }
    } catch {}
    setSaving(false)
  }

  async function unlink() {
    if (!confirm('Unlink this partner from the deal? The partner record stays — only the link is removed.')) return
    try {
      const res = await fetch(`/api/properties/${propertyId}/partners`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partner.id }),
      })
      if (res.ok) onUnlink()
    } catch {}
  }

  return (
    <div className="bg-surface-secondary rounded-[10px] px-3 py-2.5 group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <Link
              href={`/${_tenantSlug}/contacts`}
              className="text-ds-body text-txt-primary font-medium truncate hover:text-gunner-red hover:underline transition-colors"
            >
              {titleCase(partner.name)}
            </Link>
            {partner.types.map(t => (
              <span
                key={t}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gunner-red-light text-gunner-red"
              >
                {typeLabel(t)}
              </span>
            ))}
            {partner.partnerGrade && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-semantic-blue-bg text-semantic-blue">
                {partner.partnerGrade}
              </span>
            )}
          </div>
          {partner.company && <p className="text-ds-fine text-txt-secondary">{partner.company}</p>}
          {partner.phone && <p className="text-ds-fine text-txt-secondary">{formatPhone(partner.phone)}</p>}
          {partner.email && <p className="text-ds-fine text-txt-secondary truncate">{partner.email}</p>}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
            <button onClick={onEditToggle} className="text-txt-muted hover:text-txt-primary" title="Edit">
              <Edit2 size={12} />
            </button>
            <button onClick={unlink} className="text-txt-muted hover:text-semantic-red" title="Unlink">
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Per-deal facts (read mode) */}
      {!isEditing && (
        <div className="mt-2 pt-2 border-t-[0.5px] border-[rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-txt-muted">
            <span><span className="text-txt-secondary font-medium">Role:</span> {roleLabel(partner.role)}</span>
            {partner.commissionPercent != null && <span><span className="text-txt-secondary font-medium">Commission:</span> {partner.commissionPercent}%</span>}
            {partner.commissionAmount && <span><span className="text-txt-secondary font-medium">Commission $:</span> {partner.commissionAmount}</span>}
            {partner.purchasePrice && <span><span className="text-txt-secondary font-medium">Purchase:</span> ${partner.purchasePrice}</span>}
            {partner.assignmentFeePaid && <span><span className="text-txt-secondary font-medium">Assignment fee:</span> ${partner.assignmentFeePaid}</span>}
          </div>
          {partner.notesOnThisDeal && (
            <p className="mt-1 text-ds-fine text-txt-secondary whitespace-pre-wrap">{partner.notesOnThisDeal}</p>
          )}
        </div>
      )}

      {/* Per-deal facts (edit mode) */}
      {isEditing && canEdit && (
        <div className="mt-2 pt-2 border-t-[0.5px] border-[rgba(0,0,0,0.06)] space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Role</p>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary focus:outline-none"
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Commission %" value={commissionPercent} onChange={setCommissionPercent} />
            <NumberField label="Commission $" value={commissionAmount} onChange={setCommissionAmount} />
            <NumberField label="Purchase price" value={purchasePrice} onChange={setPurchasePrice} />
            <NumberField label="Assignment fee" value={assignmentFeePaid} onChange={setAssignmentFeePaid} />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none resize-none"
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-gunner-red disabled:bg-txt-muted text-white text-ds-fine font-medium py-1.5 rounded-[8px] hover:bg-gunner-red-dark transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            <Save size={12} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Number field ────────────────────────────────────────────────────────────

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-[9px] font-medium text-txt-muted uppercase tracking-wider mb-0.5">{label}</p>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
      />
    </div>
  )
}
