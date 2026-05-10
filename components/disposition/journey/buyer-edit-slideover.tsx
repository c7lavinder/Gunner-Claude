'use client'
// components/disposition/journey/buyer-edit-slideover.tsx
// Buyer edit slide-over (Session 78 — narrowed scope).
//
// The fields shown here are the canonical buyer-info set Gunner now
// owns: tier, verifiedFunding, purchasedBefore, responseSpeed,
// lastContactDate, internalNotes, buybox, markets, secondaryMarket.
// The earlier sprawl (buybox-budget min/max, ARV ranges, funding type,
// POF) lives on the buyer detail page tabs — that's the deep dive,
// this is the at-a-glance editor used by Section 3 + the buyer page
// hero.
//
// All writes go through PATCH /api/buyers/[buyerId]. The route maps
// purchasedBefore → customFields.hasPurchased (legacy storage key)
// and secondaryMarket → customFields.secondaryMarkets[0].

import { useState } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import { titleCase } from '@/lib/format'

export interface EditableBuyer {
  id: string
  name: string
  phone: string | null
  email: string | null
  company?: string | null
  // Canonical fields
  tier: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  responseSpeed: string
  lastContactDate: string | null
  buybox: string[]
  markets: string[]
  secondaryMarket: string | null
  notes: string | null
}

const TIER_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'jv', label: 'JV Partner' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'halted', label: 'Halted' },
]

const RESPONSE_SPEED_OPTIONS = [
  { value: '', label: '—' },
  { value: 'lightning', label: 'Lightning' },
  { value: 'same day', label: 'Same Day' },
  { value: 'slow', label: 'Slow' },
  { value: 'ghost', label: 'Ghost' },
]

const BUYBOX_OPTIONS = ['Fix and Flip', 'Rental', 'Builder', 'Wholesale', 'Land', 'Commercial', 'Multi-Family']

interface FormState {
  name: string
  phone: string
  email: string
  company: string
  tier: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  responseSpeed: string
  lastContactDate: string
  buybox: string[]
  markets: string  // comma-separated for editing
  secondaryMarket: string
  notes: string
}

function isoToInputDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function BuyerEditSlideover({
  buyer,
  tenantSlug,
  onClose,
  onSaved,
}: {
  buyer: EditableBuyer
  tenantSlug: string
  onClose: () => void
  onSaved: (patch: Partial<EditableBuyer>) => void
}) {
  const [form, setForm] = useState<FormState>({
    name: buyer.name ?? '',
    phone: buyer.phone ?? '',
    email: buyer.email ?? '',
    company: buyer.company ?? '',
    tier: buyer.tier ?? 'unqualified',
    verifiedFunding: buyer.verifiedFunding ?? false,
    purchasedBefore: buyer.purchasedBefore ?? false,
    responseSpeed: buyer.responseSpeed ?? '',
    lastContactDate: isoToInputDate(buyer.lastContactDate),
    buybox: buyer.buybox ?? [],
    markets: (buyer.markets ?? []).join(', '),
    secondaryMarket: buyer.secondaryMarket ?? '',
    notes: buyer.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleBuybox(option: string) {
    setForm(f => ({
      ...f,
      buybox: f.buybox.includes(option) ? f.buybox.filter(b => b !== option) : [...f.buybox, option],
    }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const markets = form.markets.split(',').map(m => m.trim()).filter(Boolean)
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      company: form.company || null,
      tier: form.tier,
      verifiedFunding: form.verifiedFunding,
      purchasedBefore: form.purchasedBefore,
      responseSpeed: form.responseSpeed || null,
      lastContactDate: form.lastContactDate || null,
      buybox: form.buybox,
      markets,
      secondaryMarket: form.secondaryMarket || null,
      notes: form.notes || null,
    }
    try {
      const res = await fetch(`/api/buyers/${buyer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onSaved({
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          company: form.company || null,
          tier: form.tier,
          verifiedFunding: form.verifiedFunding,
          purchasedBefore: form.purchasedBefore,
          responseSpeed: form.responseSpeed,
          lastContactDate: form.lastContactDate || null,
          buybox: form.buybox,
          markets,
          secondaryMarket: form.secondaryMarket || null,
          notes: form.notes || null,
        })
        onClose()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Save failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right">
        <div className="sticky top-0 bg-white border-b border-[rgba(0,0,0,0.06)] px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-ds-label font-semibold text-txt-primary">Edit Buyer</h3>
            <p className="text-[11px] text-txt-muted">{titleCase(buyer.name)}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/${tenantSlug}/buyers/${buyer.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-medium text-semantic-blue hover:underline inline-flex items-center gap-0.5"
              title="Open full buyer page"
            >
              Full page <ExternalLink size={9} />
            </a>
            <button onClick={onClose} className="text-txt-muted hover:text-txt-secondary"><X size={16} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Tier + Funding flags */}
          <FormSection title="Tier & Status">
            <Field label="Tier">
              <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} className={INPUT_CLASS}>
                {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.verifiedFunding}
                  onChange={e => setForm(f => ({ ...f, verifiedFunding: e.target.checked }))}
                  className="accent-gunner-red" />
                <span className="text-ds-fine text-txt-secondary">Verified Funding</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.purchasedBefore}
                  onChange={e => setForm(f => ({ ...f, purchasedBefore: e.target.checked }))}
                  className="accent-gunner-red" />
                <span className="text-ds-fine text-txt-secondary">Purchased Before</span>
              </label>
            </div>
            <Field label="Response Speed">
              <select value={form.responseSpeed} onChange={e => setForm(f => ({ ...f, responseSpeed: e.target.value }))} className={INPUT_CLASS}>
                {RESPONSE_SPEED_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Last Contact Date">
              <input type="date" value={form.lastContactDate}
                onChange={e => setForm(f => ({ ...f, lastContactDate: e.target.value }))}
                className={INPUT_CLASS} />
            </Field>
          </FormSection>

          {/* Markets + buybox */}
          <FormSection title="Buybox & Markets">
            <Field label="Buybox (select all that apply)">
              <div className="flex flex-wrap gap-1.5">
                {BUYBOX_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleBuybox(opt)}
                    className={`text-[10px] font-medium px-2 py-1 rounded-full transition-colors ${
                      form.buybox.includes(opt)
                        ? 'bg-gunner-red text-white'
                        : 'bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary hover:bg-surface-tertiary'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Markets (comma separated)">
              <input value={form.markets} onChange={e => setForm(f => ({ ...f, markets: e.target.value }))}
                placeholder="Nashville, Chattanooga"
                className={INPUT_CLASS} />
            </Field>
            <Field label="Secondary Market">
              <input value={form.secondaryMarket} onChange={e => setForm(f => ({ ...f, secondaryMarket: e.target.value }))}
                placeholder="One-off market for this deal"
                className={INPUT_CLASS} />
            </Field>
          </FormSection>

          {/* Contact (kept editable here for convenience even though
              GHL is the source of truth — when GHL two-way write is
              wired up later, these will round-trip). */}
          <FormSection title="Contact">
            <Field label="Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT_CLASS} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={INPUT_CLASS} />
              </Field>
            </div>
            <Field label="Company">
              <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className={INPUT_CLASS} />
            </Field>
          </FormSection>

          {/* Internal notes */}
          <FormSection title="Internal Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={4} className={`${INPUT_CLASS} resize-none`} />
          </FormSection>

          {error && <p className="text-[11px] text-semantic-red font-medium">{error}</p>}

          <div className="flex gap-2 sticky bottom-0 bg-white pt-2 -mx-5 px-5 pb-1 border-t border-[rgba(0,0,0,0.06)]">
            <button onClick={onClose}
              className="flex-1 border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary text-ds-fine font-medium py-2 rounded-[10px] hover:bg-surface-secondary transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[10px] transition-colors inline-flex items-center justify-center gap-1.5">
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const INPUT_CLASS = 'w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/30'

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] text-txt-muted uppercase block mb-0.5">{label}</label>
      {children}
    </div>
  )
}
