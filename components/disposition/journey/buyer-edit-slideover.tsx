'use client'
// components/disposition/journey/buyer-edit-slideover.tsx
// Shared right-side slide-over for editing a Buyer (Section 77 round 2).
// Used by Section 3 (Match Buyers kanban) and Section 4 (Track Responses
// kanban) so both surfaces edit through the same form.
//
// Field set is intentionally narrower than the full /buyers/[id] page —
// just the things a rep needs while triaging buyers in the kanban
// (contact, tier, markets, buybox budget, funding, notes). Everything
// else lives on the buyer page; the slide-over header has a "Open full
// buyer page" link.
//
// All writes go through PATCH /api/buyers/[buyerId] (which accepts the
// expanded field set as of Session 77 round 2).

import { useState } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import { titleCase } from '@/lib/format'

export interface EditableBuyer {
  id: string
  name: string
  phone: string | null
  mobilePhone?: string | null
  email: string | null
  company?: string | null
  tier: string
  markets: string[]
  // Buybox budget (optional — fields may be unknown until rep types them)
  minPurchasePrice?: string | null
  maxPurchasePrice?: string | null
  minArv?: string | null
  maxArv?: string | null
  maxRepairBudget?: string | null
  fundingType?: string | null
  pofAmount?: string | null
  verifiedFunding?: boolean
  notes?: string | null
}

const TIER_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'jv', label: 'JV Partner' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'halted', label: 'Halted' },
]

const FUNDING_TYPES = [
  { value: '', label: '—' },
  { value: 'cash', label: 'Cash' },
  { value: 'hard_money', label: 'Hard Money' },
  { value: 'private_lender', label: 'Private Lender' },
  { value: 'dscr', label: 'DSCR' },
  { value: 'conventional', label: 'Conventional' },
  { value: 'creative', label: 'Creative' },
  { value: 'other', label: 'Other' },
]

interface FormState {
  name: string
  phone: string
  mobilePhone: string
  email: string
  company: string
  tier: string
  markets: string  // comma-separated for editing
  minPurchasePrice: string
  maxPurchasePrice: string
  minArv: string
  maxArv: string
  maxRepairBudget: string
  fundingType: string
  pofAmount: string
  verifiedFunding: boolean
  notes: string
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
    mobilePhone: buyer.mobilePhone ?? '',
    email: buyer.email ?? '',
    company: buyer.company ?? '',
    tier: buyer.tier ?? 'unqualified',
    markets: (buyer.markets ?? []).join(', '),
    minPurchasePrice: buyer.minPurchasePrice ?? '',
    maxPurchasePrice: buyer.maxPurchasePrice ?? '',
    minArv: buyer.minArv ?? '',
    maxArv: buyer.maxArv ?? '',
    maxRepairBudget: buyer.maxRepairBudget ?? '',
    fundingType: buyer.fundingType ?? '',
    pofAmount: buyer.pofAmount ?? '',
    verifiedFunding: buyer.verifiedFunding ?? false,
    notes: buyer.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function num(s: string): number | null {
    if (!s.trim()) return null
    const n = parseFloat(s.replace(/[^0-9.]/g, ''))
    return isNaN(n) ? null : n
  }

  async function save() {
    setSaving(true)
    setError(null)
    const markets = form.markets.split(',').map(m => m.trim()).filter(Boolean)
    const payload = {
      name: form.name,
      phone: form.phone,
      mobilePhone: form.mobilePhone || null,
      email: form.email || null,
      company: form.company || null,
      tier: form.tier,
      markets,
      minPurchasePrice: num(form.minPurchasePrice),
      maxPurchasePrice: num(form.maxPurchasePrice),
      minArv: num(form.minArv),
      maxArv: num(form.maxArv),
      maxRepairBudget: num(form.maxRepairBudget),
      fundingType: form.fundingType || null,
      pofAmount: num(form.pofAmount),
      verifiedFunding: form.verifiedFunding,
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
          mobilePhone: form.mobilePhone || null,
          email: form.email || null,
          company: form.company || null,
          tier: form.tier,
          markets,
          minPurchasePrice: form.minPurchasePrice || null,
          maxPurchasePrice: form.maxPurchasePrice || null,
          minArv: form.minArv || null,
          maxArv: form.maxArv || null,
          maxRepairBudget: form.maxRepairBudget || null,
          fundingType: form.fundingType || null,
          pofAmount: form.pofAmount || null,
          verifiedFunding: form.verifiedFunding,
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
        {/* Header */}
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
          {/* Contact */}
          <FormSection title="Contact">
            <Field label="Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT_CLASS} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Mobile">
                <input value={form.mobilePhone} onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))} className={INPUT_CLASS} />
              </Field>
            </div>
            <Field label="Email">
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={INPUT_CLASS} />
            </Field>
            <Field label="Company">
              <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className={INPUT_CLASS} />
            </Field>
          </FormSection>

          {/* Tier + Markets */}
          <FormSection title="Tier & Markets">
            <Field label="Tier">
              <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} className={INPUT_CLASS}>
                {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Markets (comma separated)">
              <input value={form.markets} onChange={e => setForm(f => ({ ...f, markets: e.target.value }))}
                placeholder="Nashville, Chattanooga"
                className={INPUT_CLASS} />
            </Field>
          </FormSection>

          {/* Buybox / Budget */}
          <FormSection title="Buybox">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min Purchase">
                <input type="text" value={form.minPurchasePrice} onChange={e => setForm(f => ({ ...f, minPurchasePrice: e.target.value }))} placeholder="50,000" className={INPUT_CLASS} />
              </Field>
              <Field label="Max Purchase">
                <input type="text" value={form.maxPurchasePrice} onChange={e => setForm(f => ({ ...f, maxPurchasePrice: e.target.value }))} placeholder="250,000" className={INPUT_CLASS} />
              </Field>
              <Field label="Min ARV">
                <input type="text" value={form.minArv} onChange={e => setForm(f => ({ ...f, minArv: e.target.value }))} placeholder="100,000" className={INPUT_CLASS} />
              </Field>
              <Field label="Max ARV">
                <input type="text" value={form.maxArv} onChange={e => setForm(f => ({ ...f, maxArv: e.target.value }))} placeholder="500,000" className={INPUT_CLASS} />
              </Field>
              <Field label="Max Repair Budget">
                <input type="text" value={form.maxRepairBudget} onChange={e => setForm(f => ({ ...f, maxRepairBudget: e.target.value }))} placeholder="60,000" className={INPUT_CLASS} />
              </Field>
              <Field label="POF Amount">
                <input type="text" value={form.pofAmount} onChange={e => setForm(f => ({ ...f, pofAmount: e.target.value }))} className={INPUT_CLASS} />
              </Field>
            </div>
            <Field label="Funding Type">
              <select value={form.fundingType} onChange={e => setForm(f => ({ ...f, fundingType: e.target.value }))} className={INPUT_CLASS}>
                {FUNDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input type="checkbox" checked={form.verifiedFunding} onChange={e => setForm(f => ({ ...f, verifiedFunding: e.target.checked }))} className="accent-gunner-red" />
              <span className="text-ds-fine text-txt-secondary">Verified Funding</span>
            </label>
          </FormSection>

          {/* Notes */}
          <FormSection title="Notes">
            <Field label="Internal Notes">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className={`${INPUT_CLASS} resize-none`} />
            </Field>
          </FormSection>

          {error && <p className="text-[11px] text-semantic-red font-medium">{error}</p>}

          {/* Actions */}
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
