'use client'
// components/inventory/log-jv-deal-form.tsx
//
// Phase 5 of GHL multi-pipeline redesign — JV intake form.
// See docs/plans/ghl-multi-pipeline-bulletproof.md §10.
//
// Focused 2-section form: pick a Partner from the dropdown + fill in the
// deal details. Submits to POST /api/properties/jv-intake which creates
// the Property + PropertyPartner + audit log + fires immediate enrichment.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Save } from 'lucide-react'

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

export function LogJvDealForm({ tenantSlug, partners, teamMembers, defaultAssignedToId }: LogJvDealFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partnerSearch, setPartnerSearch] = useState('')
  const [form, setForm] = useState({
    partnerId: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    arv: '',
    askingPrice: '',
    contractPrice: '',
    assignmentFee: '',
    notes: '',
    assignedToId: defaultAssignedToId,
  })

  const filteredPartners = partnerSearch.trim()
    ? partners.filter(p => {
        const q = partnerSearch.toLowerCase()
        return p.name.toLowerCase().includes(q) || (p.company ?? '').toLowerCase().includes(q)
      })
    : partners

  const selectedPartner = partners.find(p => p.id === form.partnerId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.partnerId) {
      setError('Pick a partner first.')
      return
    }
    if (!form.address || !form.city || !form.state) {
      setError('Address, city, and state are required.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/properties/jv-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
        body: JSON.stringify(form),
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

      <h1 className="text-2xl font-bold mb-2">Log JV Deal</h1>
      <p className="text-sm text-gray-600 mb-6">
        Record a property sourced through a partner (agent, wholesaler, or other).
        Address gets enriched automatically.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Partner picker */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Partner</h2>
          {partners.length === 0 ? (
            <div className="text-sm text-gray-500">
              No partners yet.{' '}
              <Link href={`/${tenantSlug}/partners`} className="text-blue-600 hover:underline">
                Add one first
              </Link>
              .
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search by name or company..."
                value={partnerSearch}
                onChange={e => setPartnerSearch(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 mb-3 text-sm"
              />
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded">
                {filteredPartners.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No matches.</div>
                ) : (
                  filteredPartners.map(p => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                        form.partnerId === p.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="partnerId"
                        value={p.id}
                        checked={form.partnerId === p.id}
                        onChange={() => setForm({ ...form, partnerId: p.id })}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-gray-500">
                          {p.company && <span>{p.company} · </span>}
                          {p.types.join(', ') || 'untyped'}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {selectedPartner && (
                <div className="mt-3 text-sm text-green-700">
                  Selected: <strong>{selectedPartner.name}</strong>
                </div>
              )}
            </>
          )}
        </section>

        {/* Address */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Property Address</h2>
          <div className="grid grid-cols-1 gap-3">
            <input
              type="text"
              placeholder="Street address"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
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

        {/* Financials */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Financials (optional)</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Asking price</span>
              <input
                type="text"
                placeholder="$"
                value={form.askingPrice}
                onChange={e => setForm({ ...form, askingPrice: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">ARV</span>
              <input
                type="text"
                placeholder="$"
                value={form.arv}
                onChange={e => setForm({ ...form, arv: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Contract price</span>
              <input
                type="text"
                placeholder="$"
                value={form.contractPrice}
                onChange={e => setForm({ ...form, contractPrice: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Assignment fee</span>
              <input
                type="text"
                placeholder="$"
                value={form.assignmentFee}
                onChange={e => setForm({ ...form, assignmentFee: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        {/* Assignment + notes */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Assignment & Notes</h2>
          <label className="block text-sm mb-3">
            <span className="block text-gray-600 mb-1">Assigned to</span>
            <select
              value={form.assignedToId}
              onChange={e => setForm({ ...form, assignedToId: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name ?? '(unnamed)'} · {m.role}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-gray-600 mb-1">Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Anything specific to this deal..."
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
            disabled={loading || partners.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {loading ? 'Saving...' : 'Log JV Deal'}
          </button>
        </div>
      </form>
    </div>
  )
}
