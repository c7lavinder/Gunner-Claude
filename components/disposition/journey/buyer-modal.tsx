'use client'
// components/disposition/journey/buyer-modal.tsx
// Canonical buyer edit/add modal (Phase A1.1 — disposition rebuild).
//
// Replaces buyer-edit-slideover.tsx for both Section 3 (Match Buyers)
// and Section 4 (Track Responses) edit flows, and the inline add form
// in Section 3 (A2 will swap that trigger).
//
// Layout
//   • Center-page, dimensions fit content — no internal scroll.
//   • Two-column dense grid keeps all 14 canonical fields visible at once.
//   • Page scroll is locked while open. Backdrop click does NOT close.
//     Only X, Cancel, or Esc closes — prevents data loss after typing.
//
// Edit mode loads the canonical buyer record from GET /api/buyers/[id]
// on mount so checkboxes like "Purchased Before" reflect what's actually
// persisted (the kanban row doesn't carry every field).

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, ExternalLink } from 'lucide-react'
import { titleCase } from '@/lib/format'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SearchableMultiSelect } from '@/components/ui/searchable-multiselect'

export interface BuyerModalValue {
  id?: string
  name: string
  phone: string | null
  mobilePhone?: string | null
  secondaryPhone?: string | null
  email: string | null
  secondaryEmail?: string | null
  company?: string | null
  tier: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  responseSpeed: string
  buybox: string[]
  markets: string[]
  notes: string | null
}

const TIER_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'jv', label: 'JV Buyer' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'halted', label: 'Halted' },
]

const RESPONSE_SPEED_OPTIONS = [
  { value: 'lightning', label: 'Lightning' },
  { value: 'same day', label: 'Same Day' },
  { value: 'slow', label: 'Slow' },
  { value: 'ghost', label: 'Ghost' },
]

const BUYBOX_OPTIONS = ['Fix and Flip', 'Rental', 'Builder', 'Wholesale', 'Land', 'Commercial', 'Multi-Family']

interface FormState {
  name: string
  phone: string
  mobilePhone: string
  secondaryPhone: string
  email: string
  secondaryEmail: string
  company: string
  tier: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  responseSpeed: string
  buybox: string[]
  markets: string[]
  notes: string
}

export function BuyerModal({
  mode,
  buyer,
  propertyId,
  tenantSlug,
  marketOptions = [],
  defaultStageId,
  onClose,
  onSaved,
}: {
  mode: 'edit' | 'add'
  buyer?: BuyerModalValue
  propertyId?: string
  tenantSlug: string
  marketOptions?: string[]
  // GHL pipeline stageId to drop the new buyer into. Required by the
  // add-buyer API. Section 3 passes the first stage of the buyer
  // pipeline so the user never sees this field — matches edit-mode UX.
  defaultStageId?: string
  onClose: () => void
  onSaved: (next: BuyerModalValue) => void
}) {
  const [form, setForm] = useState<FormState>({
    name: buyer?.name ?? '',
    phone: buyer?.phone ?? '',
    mobilePhone: buyer?.mobilePhone ?? '',
    secondaryPhone: buyer?.secondaryPhone ?? '',
    email: buyer?.email ?? '',
    secondaryEmail: buyer?.secondaryEmail ?? '',
    company: buyer?.company ?? '',
    tier: buyer?.tier || 'unqualified',
    verifiedFunding: buyer?.verifiedFunding ?? false,
    purchasedBefore: buyer?.purchasedBefore ?? false,
    responseSpeed: buyer?.responseSpeed ?? '',
    buybox: buyer?.buybox ?? [],
    markets: buyer?.markets ?? [],
    notes: buyer?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingCanonical, setLoadingCanonical] = useState(mode === 'edit' && !!buyer?.id)

  // Lock page scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Edit mode: fetch the canonical buyer record so fields not carried by
  // the kanban row (purchasedBefore, responseSpeed, buybox, full markets,
  // company, secondary phone/email, etc.) reflect what's in the DB.
  useEffect(() => {
    if (mode !== 'edit' || !buyer?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/buyers/${buyer.id}`)
        if (!res.ok) { setLoadingCanonical(false); return }
        const data = await res.json()
        const b = data.buyer
        if (!b || cancelled) return
        setForm(f => ({
          ...f,
          name: b.name ?? f.name,
          phone: b.phone ?? f.phone,
          mobilePhone: b.mobilePhone ?? f.mobilePhone,
          email: b.email ?? f.email,
          company: b.company ?? f.company,
          tier: b.tier ?? f.tier,
          verifiedFunding: !!b.verifiedFunding,
          purchasedBefore: !!b.purchasedBefore,
          responseSpeed: b.responseSpeed ?? '',
          buybox: Array.isArray(b.buybox) ? b.buybox : f.buybox,
          markets: Array.isArray(b.markets) && b.markets.length > 0 ? b.markets : f.markets,
          notes: b.notes ?? f.notes,
        }))
      } catch { /* keep current form; user can still edit */ }
      finally { if (!cancelled) setLoadingCanonical(false) }
    })()
    return () => { cancelled = true }
  }, [mode, buyer?.id])

  const marketOptionsCombined = useMemo(() => {
    const set = new Set<string>([...marketOptions, ...form.markets])
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [marketOptions, form.markets])

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const canSave = mode === 'edit'
    ? form.name.trim().length > 0
    : form.name.trim().length > 0 && form.phone.trim().length > 0

  async function save() {
    if (!canSave) {
      setError(mode === 'add' ? 'Name and phone are required.' : 'Name is required.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      mobilePhone: form.mobilePhone.trim() || null,
      secondaryPhone: form.secondaryPhone.trim() || null,
      email: form.email.trim() || null,
      secondaryEmail: form.secondaryEmail.trim() || null,
      company: form.company.trim() || null,
      tier: form.tier,
      verifiedFunding: form.verifiedFunding,
      purchasedBefore: form.purchasedBefore,
      responseSpeed: form.responseSpeed || null,
      buybox: form.buybox,
      markets: form.markets,
      notes: form.notes.trim() || null,
    }

    try {
      if (mode === 'edit' && buyer?.id) {
        const res = await fetch(`/api/buyers/${buyer.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error ?? 'Save failed')
          setSaving(false)
          return
        }
        onSaved({ ...buyer, ...payload, id: buyer.id, responseSpeed: payload.responseSpeed ?? '' })
        onClose()
      } else {
        if (!propertyId) {
          setError('Internal error: propertyId missing for add mode')
          setSaving(false)
          return
        }
        if (!defaultStageId) {
          setError('Internal error: GHL buyer pipeline stages not loaded')
          setSaving(false)
          return
        }
        const [firstName, ...rest] = form.name.trim().split(/\s+/)
        const lastName = rest.join(' ')
        const addPayload = {
          firstName, lastName,
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          mobilePhone: form.mobilePhone.trim() || null,
          secondaryPhone: form.secondaryPhone.trim() || null,
          secondaryEmail: form.secondaryEmail.trim() || null,
          company: form.company.trim() || null,
          buyerTier: form.tier,
          buybox: form.buybox,
          markets: form.markets,
          source: 'manual',
          stageId: defaultStageId,
          verifiedFunding: form.verifiedFunding,
          hasPurchased: form.purchasedBefore,
          responseSpeed: form.responseSpeed || undefined,
          notes: form.notes.trim() || undefined,
        }
        const res = await fetch(`/api/properties/${propertyId}/buyers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addPayload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error ?? 'Add failed')
          setSaving(false)
          return
        }
        const data = await res.json()
        const created = data.buyer
        if (created) {
          onSaved({
            id: created.id,
            name: created.name ?? form.name.trim(),
            phone: created.phone ?? form.phone,
            mobilePhone: payload.mobilePhone,
            secondaryPhone: payload.secondaryPhone,
            email: created.email ?? payload.email,
            secondaryEmail: payload.secondaryEmail,
            company: payload.company,
            tier: payload.tier,
            verifiedFunding: payload.verifiedFunding,
            purchasedBefore: payload.purchasedBefore,
            responseSpeed: payload.responseSpeed ?? '',
            buybox: payload.buybox,
            markets: payload.markets,
            notes: payload.notes,
          })
        }
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div className="relative w-full max-w-3xl bg-white rounded-[14px] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-txt-primary">
              {mode === 'edit' ? 'Edit Buyer' : 'Add Buyer'}
            </h3>
            {mode === 'edit' && buyer?.name && (
              <p className="text-[11px] text-txt-muted truncate">
                {titleCase(buyer.name)}
                {loadingCanonical && <span className="ml-2 text-[10px]">loading…</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {mode === 'edit' && buyer?.id && (
              <a
                href={`/${tenantSlug}/buyers/${buyer.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-medium text-semantic-blue hover:underline inline-flex items-center gap-0.5"
              >
                Full page <ExternalLink size={9} />
              </a>
            )}
            <button onClick={onClose} className="text-txt-muted hover:text-txt-secondary" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body — single dense pane, no internal scroll. Two-column grid. */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* LEFT COLUMN — Status + Match Criteria */}
            <div className="space-y-3">
              <SectionLabel>Status</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tier" required>
                  <SearchableSelect
                    value={form.tier}
                    options={TIER_OPTIONS}
                    onChange={v => update('tier', v)}
                    placeholder="Tier…"
                  />
                </Field>
                <Field label="Response Speed">
                  <SearchableSelect
                    value={form.responseSpeed}
                    options={RESPONSE_SPEED_OPTIONS}
                    onChange={v => update('responseSpeed', v)}
                    placeholder="Speed…"
                    allowClear
                  />
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer text-[12px] text-txt-secondary">
                  <input type="checkbox" checked={form.verifiedFunding}
                    onChange={e => update('verifiedFunding', e.target.checked)}
                    className="accent-gunner-red" />
                  Verified Funding
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[12px] text-txt-secondary">
                  <input type="checkbox" checked={form.purchasedBefore}
                    onChange={e => update('purchasedBefore', e.target.checked)}
                    className="accent-gunner-red" />
                  Purchased Before
                </label>
              </div>

              <SectionLabel>Match Criteria</SectionLabel>
              <Field label="Markets (multi, add new)" required>
                <SearchableMultiSelect
                  values={form.markets}
                  options={marketOptionsCombined}
                  onChange={v => update('markets', v)}
                  placeholder="Search markets…"
                  allowAddNew
                />
              </Field>
              <Field label="Buybox (multi)" required>
                <SearchableMultiSelect
                  values={form.buybox}
                  options={BUYBOX_OPTIONS}
                  onChange={v => update('buybox', v)}
                  placeholder="Search buybox…"
                />
              </Field>
            </div>

            {/* RIGHT COLUMN — Contact + Notes */}
            <div className="space-y-3">
              <SectionLabel>Contact</SectionLabel>
              <Field label="Name" required>
                <input value={form.name} onChange={e => update('name', e.target.value)} className={INPUT_CLASS} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={mode === 'add' ? 'Phone*' : 'Phone'}>
                  <input value={form.phone} onChange={e => update('phone', e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Mobile">
                  <input value={form.mobilePhone} onChange={e => update('mobilePhone', e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Secondary Phone">
                  <input value={form.secondaryPhone} onChange={e => update('secondaryPhone', e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Company">
                  <input value={form.company} onChange={e => update('company', e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Email">
                  <input value={form.email} onChange={e => update('email', e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Secondary Email">
                  <input value={form.secondaryEmail} onChange={e => update('secondaryEmail', e.target.value)} className={INPUT_CLASS} />
                </Field>
              </div>

              <SectionLabel>Internal Notes</SectionLabel>
              <textarea
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                rows={3}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Anything the team should know…"
              />
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-semantic-red font-medium mt-3">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-[rgba(0,0,0,0.06)]">
          <button
            onClick={onClose}
            className="flex-1 border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary text-ds-fine font-medium py-2 rounded-[10px] hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[10px] transition-colors inline-flex items-center justify-center gap-1.5"
          >
            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : (mode === 'edit' ? 'Save changes' : 'Add buyer')}
          </button>
        </div>
      </div>
    </div>
  )
}

const INPUT_CLASS = 'w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-[0.08em]">{children}</p>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-txt-muted uppercase block mb-1 tracking-wider">
        {label}{required && <span className="text-semantic-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
