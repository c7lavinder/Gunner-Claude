'use client'
// components/disposition/journey/buyer-edit-slideover.tsx
// Buyer edit slide-over (Session 78b — compacted + market chips).
//
// Eight canonical buyer-info fields: tier, verifiedFunding,
// purchasedBefore, responseSpeed, lastContactDate, buybox, markets,
// internalNotes. Plus contact: name, phone (primary + mobile + secondary),
// email (primary + secondary), company.
//
// Markets are a chip multi-select with on-the-fly add — tenant-wide
// list passed in as marketOptions. Last contact date is auto-filled
// server-side from latest call/outreach but can be manually overridden.
// secondaryMarket retired in this rev (Session 78b).

import { useMemo, useState } from 'react'
import { X, ExternalLink, Loader2, Plus } from 'lucide-react'
import { titleCase } from '@/lib/format'

export interface EditableBuyer {
  id: string
  name: string
  phone: string | null
  mobilePhone?: string | null
  secondaryPhone?: string | null
  email: string | null
  secondaryEmail?: string | null
  company?: string | null
  // Canonical fields
  tier: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  responseSpeed: string
  lastContactDate: string | null
  buybox: string[]
  markets: string[]
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
  mobilePhone: string
  secondaryPhone: string
  email: string
  secondaryEmail: string
  company: string
  tier: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  responseSpeed: string
  lastContactDate: string
  buybox: string[]
  markets: string[]
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
  marketOptions = [],
  onClose,
  onSaved,
}: {
  buyer: EditableBuyer
  tenantSlug: string
  // Tenant-wide market suggestions (Buyer.primaryMarkets ∪ Property.propertyMarkets).
  // Reps can also add new markets that aren't in this list.
  marketOptions?: string[]
  onClose: () => void
  onSaved: (patch: Partial<EditableBuyer>) => void
}) {
  const [form, setForm] = useState<FormState>({
    name: buyer.name ?? '',
    phone: buyer.phone ?? '',
    mobilePhone: buyer.mobilePhone ?? '',
    secondaryPhone: buyer.secondaryPhone ?? '',
    email: buyer.email ?? '',
    secondaryEmail: buyer.secondaryEmail ?? '',
    company: buyer.company ?? '',
    tier: buyer.tier ?? 'unqualified',
    verifiedFunding: buyer.verifiedFunding ?? false,
    purchasedBefore: buyer.purchasedBefore ?? false,
    responseSpeed: buyer.responseSpeed ?? '',
    lastContactDate: isoToInputDate(buyer.lastContactDate),
    buybox: buyer.buybox ?? [],
    markets: buyer.markets ?? [],
    notes: buyer.notes ?? '',
  })
  const [marketInput, setMarketInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Combine tenant suggestions + this buyer's existing markets so the
  // chip list always shows everything the rep might pick. Dedupe + sort.
  const availableMarkets = useMemo(() => {
    const set = new Set<string>([...marketOptions, ...form.markets])
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [marketOptions, form.markets])

  function toggleBuybox(option: string) {
    setForm(f => ({
      ...f,
      buybox: f.buybox.includes(option) ? f.buybox.filter(b => b !== option) : [...f.buybox, option],
    }))
  }

  function toggleMarket(market: string) {
    setForm(f => ({
      ...f,
      markets: f.markets.includes(market) ? f.markets.filter(m => m !== market) : [...f.markets, market],
    }))
  }

  function addMarket() {
    const t = marketInput.trim()
    if (!t) return
    if (!form.markets.some(m => m.toLowerCase() === t.toLowerCase())) {
      setForm(f => ({ ...f, markets: [...f.markets, t] }))
    }
    setMarketInput('')
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name,
      phone: form.phone,
      mobilePhone: form.mobilePhone || null,
      secondaryPhone: form.secondaryPhone || null,
      email: form.email || null,
      secondaryEmail: form.secondaryEmail || null,
      company: form.company || null,
      tier: form.tier,
      verifiedFunding: form.verifiedFunding,
      purchasedBefore: form.purchasedBefore,
      responseSpeed: form.responseSpeed || null,
      lastContactDate: form.lastContactDate || null,
      buybox: form.buybox,
      markets: form.markets,
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
          secondaryPhone: form.secondaryPhone || null,
          email: form.email || null,
          secondaryEmail: form.secondaryEmail || null,
          company: form.company || null,
          tier: form.tier,
          verifiedFunding: form.verifiedFunding,
          purchasedBefore: form.purchasedBefore,
          responseSpeed: form.responseSpeed,
          lastContactDate: form.lastContactDate || null,
          buybox: form.buybox,
          markets: form.markets,
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
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-screen animate-in slide-in-from-right">
        {/* Sticky header — never scrolls off so the rep always sees who
            they're editing. */}
        <div className="shrink-0 bg-white border-b border-[rgba(0,0,0,0.06)] px-5 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-txt-primary truncate">Edit Buyer</h3>
            <p className="text-[11px] text-txt-muted truncate">{titleCase(buyer.name)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Tier + status flags + speed + last contact — compact 2-col */}
          <FormSection title="Status">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tier">
                <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} className={INPUT_CLASS}>
                  {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Response Speed">
                <select value={form.responseSpeed} onChange={e => setForm(f => ({ ...f, responseSpeed: e.target.value }))} className={INPUT_CLASS}>
                  {RESPONSE_SPEED_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-txt-secondary">
                <input type="checkbox" checked={form.verifiedFunding}
                  onChange={e => setForm(f => ({ ...f, verifiedFunding: e.target.checked }))}
                  className="accent-gunner-red" />
                Verified Funding
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-txt-secondary">
                <input type="checkbox" checked={form.purchasedBefore}
                  onChange={e => setForm(f => ({ ...f, purchasedBefore: e.target.checked }))}
                  className="accent-gunner-red" />
                Purchased Before
              </label>
            </div>
            <Field label="Last Contact Date (auto-fills from calls/texts)">
              <input type="date" value={form.lastContactDate}
                onChange={e => setForm(f => ({ ...f, lastContactDate: e.target.value }))}
                className={INPUT_CLASS} />
            </Field>
          </FormSection>

          {/* Markets — chip multi-select with add-new. */}
          <FormSection title="Markets & Buybox">
            <Field label="Markets (click to toggle, type to add new)">
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {availableMarkets.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMarket(m)}
                    className={`text-[10px] font-medium px-2 py-1 rounded-full transition-colors ${
                      form.markets.includes(m)
                        ? 'bg-gunner-red text-white'
                        : 'bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary hover:bg-surface-tertiary'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={marketInput}
                  onChange={e => setMarketInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMarket() } }}
                  placeholder="Add a market…"
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={addMarket}
                  disabled={!marketInput.trim()}
                  className="text-[10px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 px-3 py-2 rounded-[8px] inline-flex items-center gap-1 transition-colors shrink-0"
                >
                  <Plus size={11} /> Add
                </button>
              </div>
            </Field>

            <Field label="Buybox">
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
          </FormSection>

          {/* Contact — compact 2-col */}
          <FormSection title="Contact">
            <Field label="Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT_CLASS} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Phone">
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Mobile">
                <input value={form.mobilePhone} onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Secondary Phone">
                <input value={form.secondaryPhone} onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Company">
                <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Secondary Email">
                <input value={form.secondaryEmail} onChange={e => setForm(f => ({ ...f, secondaryEmail: e.target.value }))} className={INPUT_CLASS} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Internal Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} className={`${INPUT_CLASS} resize-none`} />
          </FormSection>

          {error && <p className="text-[11px] text-semantic-red font-medium">{error}</p>}
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 flex gap-2 bg-white px-5 py-3 border-t border-[rgba(0,0,0,0.06)]">
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
  )
}

const INPUT_CLASS = 'w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-gunner-red/30'

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-[0.08em] mb-1.5">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] text-txt-muted uppercase block mb-0.5 tracking-wider">{label}</label>
      {children}
    </div>
  )
}
