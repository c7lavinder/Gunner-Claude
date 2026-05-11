'use client'
// components/disposition/journey/buyer-modal.tsx
// Canonical buyer edit/add modal (Phase A1 — disposition rebuild).
// Replaces buyer-edit-slideover.tsx for the buyer-edit flow and the
// inline add form in section-3 for the buyer-add flow. Same component,
// `mode` prop flips between PATCH (edit) and POST (add).
//
// Layout: center-page, fixed dimensions, body scrolls inside. The page
// scroll is locked while the modal is open. Backdrop click does NOT
// close — only the X or Cancel button — to prevent accidental data loss
// after typing into many fields.
//
// Field set (14 canonical):
//   Contact: name, phone, mobilePhone, secondaryPhone, email,
//            secondaryEmail, company
//   Status:  tier, responseSpeed, verifiedFunding, purchasedBefore
//   Match:   markets[] (searchable multi, add-new), buybox[] (searchable multi)
//   Notes

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
  onClose,
  onSaved,
}: {
  mode: 'edit' | 'add'
  buyer?: BuyerModalValue
  propertyId?: string
  tenantSlug: string
  marketOptions?: string[]
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

  // Lock page scroll while the modal is open. Restored on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Allow Esc to close (matches user expectation; backdrop click is the
  // only thing we suppress).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
        // Match the existing POST /api/properties/[id]/buyers add path.
        // It expects firstName + lastName (split from name), so we split
        // on first space. Backend joins them back into Buyer.name.
        const [firstName, ...rest] = form.name.trim().split(/\s+/)
        const lastName = rest.join(' ')
        const addPayload = {
          firstName,
          lastName,
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          buyerTier: form.tier,
          buybox: form.buybox,
          markets: form.markets,
          source: 'manual',
          verifiedFunding: form.verifiedFunding,
          hasPurchased: form.purchasedBefore,
          responseSpeed: form.responseSpeed || null,
          notes: form.notes.trim() || null,
          // Optional contact-detail extras the API can persist if present.
          mobilePhone: form.mobilePhone.trim() || null,
          secondaryPhone: form.secondaryPhone.trim() || null,
          secondaryEmail: form.secondaryEmail.trim() || null,
          company: form.company.trim() || null,
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
      {/* Backdrop — click is suppressed (no onClick) to prevent accidental
          data loss. Use X / Cancel / Esc to close. */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      {/* Modal frame — fixed dimensions, body scrolls inside */}
      <div className="relative w-full max-w-2xl bg-white rounded-[14px] shadow-2xl flex flex-col overflow-hidden"
           style={{ maxHeight: 'min(80vh, 640px)' }}>
        {/* Header */}
        <div className="shrink-0 px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-txt-primary">
              {mode === 'edit' ? 'Edit Buyer' : 'Add Buyer'}
            </h3>
            {mode === 'edit' && buyer?.name && (
              <p className="text-[11px] text-txt-muted truncate">{titleCase(buyer.name)}</p>
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

        {/* Body — scrolls inside the modal */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Status row */}
          <Section title="Status">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tier" required>
                <SearchableSelect
                  value={form.tier}
                  options={TIER_OPTIONS}
                  onChange={v => update('tier', v)}
                  placeholder="Pick a tier…"
                />
              </Field>
              <Field label="Response Speed">
                <SearchableSelect
                  value={form.responseSpeed}
                  options={RESPONSE_SPEED_OPTIONS}
                  onChange={v => update('responseSpeed', v)}
                  placeholder="Pick a speed…"
                  allowClear
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
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
          </Section>

          {/* Match criteria */}
          <Section title="Match Criteria">
            <Field label="Markets (searchable, multi-select, add new on the fly)" required>
              <SearchableMultiSelect
                values={form.markets}
                options={marketOptionsCombined}
                onChange={v => update('markets', v)}
                placeholder="Search markets or type to add new…"
                allowAddNew
              />
            </Field>
            <Field label="Buybox (searchable, multi-select)" required>
              <SearchableMultiSelect
                values={form.buybox}
                options={BUYBOX_OPTIONS}
                onChange={v => update('buybox', v)}
                placeholder="Search buybox…"
              />
            </Field>
          </Section>

          {/* Contact info */}
          <Section title="Contact">
            <Field label="Name" required>
              <input
                value={form.name}
                onChange={e => update('name', e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={mode === 'add' ? 'Phone (primary)*' : 'Phone (primary)'} required={mode === 'add'}>
                <input
                  value={form.phone}
                  onChange={e => update('phone', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Mobile">
                <input
                  value={form.mobilePhone}
                  onChange={e => update('mobilePhone', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Secondary Phone">
                <input
                  value={form.secondaryPhone}
                  onChange={e => update('secondaryPhone', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Company">
                <input
                  value={form.company}
                  onChange={e => update('company', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Email">
                <input
                  value={form.email}
                  onChange={e => update('email', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Secondary Email">
                <input
                  value={form.secondaryEmail}
                  onChange={e => update('secondaryEmail', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
          </Section>

          {/* Notes */}
          <Section title="Internal Notes">
            <textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              rows={3}
              className={`${INPUT_CLASS} resize-none`}
              placeholder="Anything the team should know…"
            />
          </Section>

          {error && (
            <p className="text-[12px] text-semantic-red font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-[rgba(0,0,0,0.06)] bg-white">
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-[0.08em] mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
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
