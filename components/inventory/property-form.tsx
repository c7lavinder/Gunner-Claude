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

// GHL sends full state names, dropdown uses abbreviations — normalize
const STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN',
  'texas': 'TX', 'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
}

function normalizeState(raw: string): string {
  if (!raw) return ''
  const upper = raw.trim().toUpperCase()
  if (US_STATES.includes(upper)) return upper
  return STATE_NAME_TO_ABBR[raw.trim().toLowerCase()] ?? raw
}

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
  offerPrice: string
  repairCost: string
  wholesalePrice: string
  assignedToId: string
  sellerName: string
  sellerPhone: string
  sellerEmail: string
  beds: string
  baths: string
  sqft: string
  yearBuilt: string
  lotSize: string
  propertyType: string
  occupancy: string
  lockboxCode: string
  description: string
  internalNotes: string
}

interface Props {
  mode: 'create' | 'edit'
  tenantSlug: string
  teamMembers: TeamMember[]
  initialData: PropertyFormData
}

export function PropertyForm({ mode, tenantSlug, teamMembers, initialData }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<PropertyFormData>({
    ...initialData,
    state: normalizeState(initialData.state),
  })
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
          offerPrice: form.offerPrice || null,
          repairCost: form.repairCost || null,
          wholesalePrice: form.wholesalePrice || null,
          assignedToId: form.assignedToId || null,
          sellerName: form.sellerName || null,
          sellerPhone: form.sellerPhone || null,
          sellerEmail: form.sellerEmail || null,
          beds: form.beds ? parseInt(form.beds) : null,
          baths: form.baths ? parseInt(form.baths) : null,
          sqft: form.sqft ? parseInt(form.sqft) : null,
          yearBuilt: form.yearBuilt ? parseInt(form.yearBuilt) : null,
          lotSize: form.lotSize || null,
          propertyType: form.propertyType || null,
          occupancy: form.occupancy || null,
          lockboxCode: form.lockboxCode || null,
          description: form.description || null,
          internalNotes: form.internalNotes || null,
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

  const inputCls = 'w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-4 py-2.5 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors'
  const labelCls = 'block text-ds-fine font-medium text-txt-secondary mb-1.5'
  const sectionCls = 'bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-6 space-y-4'

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={mode === 'edit' ? `/${tenantSlug}/inventory/${form.id}` : `/${tenantSlug}/inventory`}
          className="inline-flex items-center gap-1.5 text-ds-body text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <ArrowLeft size={14} />
          {mode === 'edit' ? 'Back to property' : 'Back to inventory'}
        </Link>
      </div>
      <h1 className="text-ds-page font-semibold text-txt-primary">
        {mode === 'create' ? 'Add property' : 'Edit property'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Property address */}
        <div className={sectionCls}>
          <h2 className="text-ds-label font-medium text-txt-primary">Property address</h2>
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
          <h2 className="text-ds-label font-medium text-txt-primary">Financials</h2>
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
            <div>
              <label className={labelCls}>Offer price ($)</label>
              <input value={form.offerPrice} onChange={update('offerPrice')} type="number" placeholder="85000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Repair cost ($)</label>
              <input value={form.repairCost} onChange={update('repairCost')} type="number" placeholder="25000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Wholesale price ($)</label>
              <input value={form.wholesalePrice} onChange={update('wholesalePrice')} type="number" placeholder="110000" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Property details */}
        <div className={sectionCls}>
          <h2 className="text-ds-label font-medium text-txt-primary">Property details</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Beds</label>
              <input value={form.beds} onChange={update('beds')} type="number" placeholder="3" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Baths</label>
              <input value={form.baths} onChange={update('baths')} type="number" placeholder="2" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Sqft</label>
              <input value={form.sqft} onChange={update('sqft')} type="number" placeholder="1450" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Year built</label>
              <input value={form.yearBuilt} onChange={update('yearBuilt')} type="number" placeholder="1985" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Lot size</label>
              <input value={form.lotSize} onChange={update('lotSize')} placeholder="0.25 acres" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Property type</label>
              <select value={form.propertyType} onChange={update('propertyType')} className={inputCls}>
                <option value="">Select type</option>
                <option value="House">House</option>
                <option value="Land">Land</option>
                <option value="Multi-Family">Multi-Family</option>
                <option value="Commercial">Commercial</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Occupancy</label>
              <select value={form.occupancy} onChange={update('occupancy')} className={inputCls}>
                <option value="">Select occupancy</option>
                <option value="Vacant">Vacant</option>
                <option value="Owner Occupied">Owner Occupied</option>
                <option value="Tenant Occupied">Tenant Occupied</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Lockbox / Access Code</label>
              <input value={form.lockboxCode} onChange={update('lockboxCode')} placeholder="1234" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={update('description')} placeholder="Property description..." rows={3} className={inputCls + ' resize-none'} />
          </div>
          <div>
            <label className={labelCls}>Internal notes</label>
            <textarea value={form.internalNotes} onChange={update('internalNotes')} placeholder="Team-only notes..." rows={2} className={inputCls + ' resize-none'} />
          </div>
        </div>

        {/* Seller */}
        <div className={sectionCls}>
          <h2 className="text-ds-label font-medium text-txt-primary">Seller info</h2>
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
          <h2 className="text-ds-label font-medium text-txt-primary">Assignment</h2>
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
          <div className="bg-semantic-red-bg border-[0.5px] border-semantic-red/20 rounded-[14px] px-4 py-3 text-semantic-red text-ds-body">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href={mode === 'edit' ? `/${tenantSlug}/inventory/${form.id}` : `/${tenantSlug}/inventory`}
            className="px-5 py-2.5 text-ds-body text-txt-secondary hover:text-txt-primary bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] transition-colors font-medium"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !form.address || !form.city || !form.state}
            className="flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-6 py-2.5 rounded-[10px] transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : mode === 'create' ? 'Add property' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
