'use client'
// components/inventory/log-jv-deal-form.tsx
//
// Phase B1 — JV intake rewrite. Captures the wholesaling JV scenario
// where a partner already has a property under contract with the
// original seller and brings it to us to assign / take over. The
// partner is acting like a seller from our POV.
//
// Three explicit sections:
//   1. Partner       — who brought us the deal (searchable dropdown).
//   2. Property      — address only; financials live in the next section.
//   3. Deal Terms    — partner's contract price (their contract with the
//                      seller), ARV, fee we pay the partner, and a
//                      computed "our cost basis" so the user can see
//                      what they're committing to.
//
// Notes:
//   • Fee to partner persists to PropertyPartner.assignmentFeePaid
//     (the existing column for "fee paid OUT to a partner on this deal").
//   • Property.assignmentFee is NOT written here — that's the fee WE
//     collect when WE dispo to a buyer, decided later in Disposition.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Save, Info } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/searchable-select'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

interface Partner {
  id: string
  name: string
  types: string[]
  company: string | null
}

interface TeamMember {
  id: string
  name: string | null
  role: string
}

interface LogJvDealFormProps {
  tenantSlug: string
  partners: Partner[]
  teamMembers: TeamMember[]
  defaultAssignedToId: string
}

function parseMoney(raw: string): number | null {
  const trimmed = raw.trim().replace(/[$,]/g, '')
  if (!trimmed) return null
  const num = parseFloat(trimmed)
  return Number.isFinite(num) ? num : null
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function LogJvDealForm({ tenantSlug, partners, teamMembers, defaultAssignedToId }: LogJvDealFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    partnerId: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    arv: '',
    partnerContractPrice: '',
    feeToPartner: '',
    initialAsking: '',
    notes: '',
    assignedToId: defaultAssignedToId,
  })

  const partnerOptions = useMemo(() => partners.map(p => ({
    value: p.id,
    label: p.company ? `${p.name} — ${p.company}` : p.name,
  })), [partners])

  const teamOptions = useMemo(() => teamMembers.map(m => ({
    value: m.id,
    label: `${m.name ?? '(unnamed)'} · ${m.role.replaceAll('_', ' ').toLowerCase()}`,
  })), [teamMembers])

  const contractPriceNum = parseMoney(form.partnerContractPrice)
  const feeNum = parseMoney(form.feeToPartner)
  const ourCostBasis = (contractPriceNum ?? 0) + (feeNum ?? 0)
  const arvNum = parseMoney(form.arv)
  const expectedSpread = arvNum != null && ourCostBasis > 0 ? arvNum - ourCostBasis : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.partnerId) return setError('Pick a partner first.')
    if (!form.address || !form.city || !form.state) return setError('Address, city, and state are required.')

    setLoading(true)
    try {
      const res = await fetch('/api/properties/jv-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
        body: JSON.stringify({
          partnerId: form.partnerId,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          arv: form.arv || null,
          contractPrice: form.partnerContractPrice || null,
          askingPrice: form.initialAsking || null,
          feeToPartner: form.feeToPartner || null,
          notes: form.notes || null,
          assignedToId: form.assignedToId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create JV deal')
        setLoading(false)
        return
      }
      router.push(`/${tenantSlug}/inventory/${data.property.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link
        href={`/${tenantSlug}/inventory`}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to inventory
      </Link>

      <h1 className="text-2xl font-bold mb-1">Log JV Deal</h1>
      <p className="text-sm text-gray-600 mb-6">
        A partner already has this property under contract with the seller and is bringing it to us. Capture
        what they&apos;re locked up for, what we&apos;ll pay them, and we&apos;ll work the disposition from here.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {partners.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
          You don&apos;t have any partners yet.{' '}
          <Link href={`/${tenantSlug}/partners`} className="underline font-medium">
            Add one first
          </Link>{' '}
          then come back here.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Step 1 — Partner */}
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <StepBadge n={1} />
              <h2 className="font-semibold">Partner</h2>
            </div>
            <p className="text-xs text-gray-500 mb-2">Who brought us this deal?</p>
            <SearchableSelect
              value={form.partnerId}
              options={partnerOptions}
              onChange={v => setForm(f => ({ ...f, partnerId: v }))}
              placeholder="Search partners…"
            />
          </section>

          {/* Step 2 — Property */}
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <StepBadge n={2} />
              <h2 className="font-semibold">Property</h2>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Street address"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                required
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="City"
                  value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                  required
                />
                <select
                  value={form.state}
                  onChange={e => setForm({ ...form, state: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                  required
                >
                  <option value="">State</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="ZIP"
                  value={form.zip}
                  onChange={e => setForm({ ...form, zip: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          {/* Step 3 — Deal Terms */}
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <StepBadge n={3} />
              <h2 className="font-semibold">Deal Terms</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              What the partner has the property locked up for, what they expect from us, and the ARV.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <MoneyField
                label="Partner's contract price"
                helper="What the partner is paying the original seller."
                value={form.partnerContractPrice}
                onChange={v => setForm(f => ({ ...f, partnerContractPrice: v }))}
              />
              <MoneyField
                label="Fee to partner"
                helper="What we'll pay the partner at close."
                value={form.feeToPartner}
                onChange={v => setForm(f => ({ ...f, feeToPartner: v }))}
              />
              <MoneyField
                label="ARV"
                helper="After-repair value."
                value={form.arv}
                onChange={v => setForm(f => ({ ...f, arv: v }))}
              />
              <MoneyField
                label="Initial asking (to our buyers)"
                helper="Optional. You can set or change this later."
                value={form.initialAsking}
                onChange={v => setForm(f => ({ ...f, initialAsking: v }))}
              />
            </div>

            {/* Computed summary */}
            {(contractPriceNum || feeNum) && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
                  <Info size={11} /> Our position
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Our cost basis</p>
                    <p className="font-semibold tabular-nums">{formatMoney(ourCostBasis)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">contract + fee</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Expected ARV spread</p>
                    <p className={`font-semibold tabular-nums ${expectedSpread != null && expectedSpread < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {expectedSpread != null ? formatMoney(expectedSpread) : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">ARV − our cost basis</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Assignment + notes */}
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3">Assignment &amp; Notes</h2>
            <label className="block text-sm mb-3">
              <span className="block text-gray-600 mb-1">Assigned to</span>
              <SearchableSelect
                value={form.assignedToId}
                options={teamOptions}
                onChange={v => setForm(f => ({ ...f, assignedToId: v }))}
                placeholder="Pick a team member…"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-gray-600 mb-1">Notes</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none"
                placeholder="Anything specific to this deal…"
              />
            </label>
          </section>

          <div className="flex gap-3 justify-end">
            <Link
              href={`/${tenantSlug}/inventory`}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !form.partnerId}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {loading ? 'Saving…' : 'Log JV Deal'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
      {n}
    </span>
  )
}

function MoneyField({
  label, helper, value, onChange,
}: {
  label: string
  helper: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="text-sm">
      <span className="block text-gray-700 font-medium mb-0.5">{label}</span>
      <span className="block text-[10px] text-gray-500 mb-1">{helper}</span>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded pl-5 pr-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="0"
        />
      </div>
    </label>
  )
}
