'use client'
// components/inventory/property-form.tsx
// Shared form for creating and editing properties

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

const STATUS_OPTIONS = [
  { value: 'NEW_LEAD', label: 'New lead' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'APPOINTMENT_SET', label: 'Appointment set' },
  { value: 'APPOINTMENT_COMPLETED', label: 'Appointment completed' },
  { value: 'OFFER_MADE', label: 'Offer made' },
  { value: 'UNDER_CONTRACT', label: 'Under contract' },
  { value: 'IN_DISPOSITION', label: 'In disposition' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'DEAD', label: 'Dead' },
]

interface TeamMember {
  id: string
  name: string
  role: string
}

interface PropertyFormData {
  id: string
  address: string
  city: string
  state: string
  zip: string
  status: string
  arv: string
  askingPrice: string
  mao: string
  contractPrice: string
  assignmentFee: string
  assignedToId: string
  sellerName: string
  sellerPhone: string
  sellerEmail: string
}

interface Props {
  mode: 'create' | 'edit'
  tenantSlug: string
  teamMembers: TeamMember[]
  initialData: PropertyFormData
}

export function PropertyForm({ mode, tenantSlug, teamMembers, initialData }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<PropertyFormData>(initialData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: keyof PropertyFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const url = mode === 'create' ? '/api/properties' : `/api/properties/${form.id}`
    const method = mode === 'create' ? 'POST' : 'PATCH'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          status: form.status,
          arv: form.arv || null,
          askingPrice: form.askingPrice || null,
          mao: form.mao || null,
          contractPrice: form.contractPrice || null,
          assignmentFee: form.assignmentFee || null,
          assignedToId: form.assignedToId || null,
          sellerName: form.sellerName || null,
          sellerPhone: form.sellerPhone || null,
          sellerEmail: form.sellerEmail || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setSaving(false)
        return
      }

      const propertyId = mode === 'create' ? data.property.id : form.id
      router.push(`/${tenantSlug}/inventory/${propertyId}`)
      router.refresh()
    } catch {
      setError('Network error — please try again')
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500/60 transition-colors'
  const labelCls = 'block text-xs font-medium text-gray-400 mb-1.5'
  const sectionCls = 'bg-[#1a1d27] border border-white/10 rounded-2xl p-6 space-y-4'

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={mode === 'edit' ? `/${tenantSlug}/inventory/${form.id}` : `/${tenantSlug}/inventory`}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          {mode === 'edit' ? 'Back to property' : 'Back to inventory'}
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white">
        {mode === 'create' ? 'Add property' : 'Edit property'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Property address */}
        <div className={sectionCls}>
          <h2 className="text-sm font-medium text-white">Property address</h2>
          <div>
            <label className={labelCls}>Street address *</label>
            <input
              value={form.address}
              onChange={update('address')}
              required
              placeholder="123 Main St"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>City *</label>
              <input
                value={form.city}
                onChange={update('city')}
                required
                placeholder="Memphis"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>State *</label>
              <select value={form.state} onChange={update('state')} required className={inputCls}>
                <option value="">Select state</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>ZIP code</label>
              <input value={form.zip} onChange={update('zip')} placeholder="38104" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={update('status')} className={inputCls}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Financials */}
        <div className={sectionCls}>
          <h2 className="text-sm font-medium text-white">Financials</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Asking price ($)</label>
              <input value={form.askingPrice} onChange={update('askingPrice')} type="number" placeholder="95000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>ARV ($)</label>
              <input value={form.arv} onChange={update('arv')} type="number" placeholder="180000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>MAO ($)</label>
              <input value={form.mao} onChange={update('mao')} type="number" placeholder="90000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contract price ($)</label>
              <input value={form.contractPrice} onChange={update('contractPrice')} type="number" placeholder="88000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Assignment fee ($)</label>
              <input value={form.assignmentFee} onChange={update('assignmentFee')} type="number" placeholder="12000" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Seller */}
        <div className={sectionCls}>
          <h2 className="text-sm font-medium text-white">Seller info</h2>
          <div>
            <label className={labelCls}>Seller name</label>
            <input value={form.sellerName} onChange={update('sellerName')} placeholder="Robert Smith" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.sellerPhone} onChange={update('sellerPhone')} placeholder="555-0101" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input value={form.sellerEmail} onChange={update('sellerEmail')} type="email" placeholder="seller@email.com" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Assignment */}
        <div className={sectionCls}>
          <h2 className="text-sm font-medium text-white">Assignment</h2>
          <div>
            <label className={labelCls}>Assigned to</label>
            <select value={form.assignedToId} onChange={update('assignedToId')} className={inputCls}>
              <option value="">Unassigned</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role.replace(/_/g, ' ').toLowerCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href={mode === 'edit' ? `/${tenantSlug}/inventory/${form.id}` : `/${tenantSlug}/inventory`}
            className="px-5 py-2.5 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !form.address || !form.city || !form.state}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : mode === 'create' ? 'Add property' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
