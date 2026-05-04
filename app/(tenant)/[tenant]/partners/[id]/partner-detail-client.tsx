'use client'
// app/(tenant)/[tenant]/partners/[id]/partner-detail-client.tsx
// Partner detail surface — mirrors the seller/buyer detail patterns,
// kept lean. Sections: identity, type-flavored cards (agent / wholesaler),
// performance counters, deal history, edit form. Edit covers
// partner-level fields; per-deal facts are still edited from the
// property detail Partners tab.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Briefcase, Edit2, Save, X, ExternalLink, Phone, Mail,
  Globe, Star, AlertTriangle, MapPin, Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatPhone, titleCase } from '@/lib/format'

const PARTNER_TYPES = [
  'agent', 'wholesaler', 'attorney', 'title', 'lender',
  'inspector', 'contractor', 'photographer', 'property_manager', 'other',
] as const
type PartnerType = (typeof PARTNER_TYPES)[number]

function typeLabel(t: string): string {
  return t === 'property_manager' ? 'Property Mgr' : t.charAt(0).toUpperCase() + t.slice(1)
}

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const STATUS_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-sky-100 text-sky-700',
  CONTACTED: 'bg-blue-100 text-blue-700',
  APPOINTMENT_SET: 'bg-amber-100 text-amber-700',
  APPOINTMENT_COMPLETED: 'bg-amber-100 text-amber-700',
  OFFER_MADE: 'bg-orange-100 text-orange-700',
  UNDER_CONTRACT: 'bg-violet-100 text-violet-700',
  IN_DISPOSITION: 'bg-violet-100 text-violet-700',
  SOLD: 'bg-green-100 text-green-700',
  DISPO_CLOSED: 'bg-green-100 text-green-700',
  DEAD: 'bg-gray-100 text-gray-500',
}

interface DealRow {
  propertyId: string
  role: string
  commissionPercent: number | null
  commissionAmount: string | null
  purchasePrice: string | null
  assignmentFeePaid: string | null
  notesOnThisDeal: string | null
  createdAt: string
  property: {
    id: string
    address: string
    city: string | null
    state: string | null
    status: string
    arv: string | null
    askingPrice: string | null
  }
}

export interface PartnerDetail {
  id: string
  createdAt: string
  updatedAt: string

  name: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  email: string | null
  ghlContactId: string | null
  company: string | null
  website: string | null

  types: string[]

  brokerageName: string | null
  brokerageAddress: string | null
  licenseNumber: string | null
  licenseState: string | null
  licenseExpiration: string | null

  buyerListSize: number | null
  dealsPerMonthEstimate: number | null
  prefersAssignment: boolean | null
  typicalAssignmentFee: string | null

  primaryMarkets: string[]
  propertyTypeFocus: string | null
  yearsExperience: number | null
  specialties: string[]

  dealsSourcedToUsCount: number
  dealsTakenFromUsCount: number
  dealsClosedWithUsCount: number
  jvHistoryCount: number
  lastDealDate: string | null
  responseRate: number | null
  reliabilityScore: number | null
  partnerGrade: string | null
  averageCommissionPercent: number | null

  preferredContactMethod: string | null
  bestTimeToContact: string | null
  doNotContact: boolean

  tierClassification: string | null
  reputationNotes: string | null
  badWithUsFlag: boolean
  priorityFlag: boolean

  tags: string[]
  internalNotes: string | null

  deals: DealRow[]
}

export function PartnerDetailClient({
  partner: initial,
  tenantSlug,
  canEdit,
}: {
  partner: PartnerDetail
  tenantSlug: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [partner, setPartner] = useState(initial)
  const [editing, setEditing] = useState(false)

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6">
      <Link
        href={`/${tenantSlug}/partners`}
        className="inline-flex items-center gap-1 text-ds-fine text-txt-muted hover:text-txt-primary mb-4 transition-colors"
      >
        <ArrowLeft size={12} /> Back to Partners
      </Link>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Briefcase size={20} className="text-gunner-red shrink-0" />
              <h1 className="text-ds-section font-semibold text-txt-primary">
                {titleCase(partner.name)}
              </h1>
              {partner.priorityFlag && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-0.5">
                  <Star size={10} className="fill-amber-700" /> Priority
                </span>
              )}
              {partner.badWithUsFlag && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 inline-flex items-center gap-0.5">
                  <AlertTriangle size={10} /> Bad with us
                </span>
              )}
              {partner.partnerGrade && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-semantic-blue-bg text-semantic-blue">
                  Grade {partner.partnerGrade}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 mb-1">
              {partner.types.length === 0 ? (
                <span className="text-ds-fine text-txt-muted italic">No types set</span>
              ) : (
                partner.types.map(t => (
                  <span
                    key={t}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gunner-red-light text-gunner-red"
                  >
                    {typeLabel(t)}
                  </span>
                ))
              )}
            </div>
            {partner.company && <p className="text-ds-body text-txt-secondary">{partner.company}</p>}
          </div>
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-txt-primary text-ds-fine font-medium rounded-[10px] transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Edit2 size={12} /> Edit partner
            </button>
          )}
        </div>
      </header>

      {editing && canEdit ? (
        <EditPartnerForm
          partner={partner}
          onSave={(updated) => {
            setPartner(updated)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
          onDelete={() => router.push(`/${tenantSlug}/partners`)}
        />
      ) : (
        <ReadView partner={partner} tenantSlug={tenantSlug} />
      )}
    </div>
  )
}

// ─── Read view ───────────────────────────────────────────────────────────────

function ReadView({ partner, tenantSlug: _tenantSlug }: { partner: PartnerDetail; tenantSlug: string }) {
  return (
    <div className="space-y-6">
      {/* Identity + counters row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Identity card */}
        <Card title="Contact">
          <Field icon={Phone} label="Phone">{partner.phone ? formatPhone(partner.phone) : '—'}</Field>
          <Field icon={Mail} label="Email">{partner.email ?? '—'}</Field>
          <Field icon={Globe} label="Website">
            {partner.website ? (
              <a href={partner.website} target="_blank" rel="noopener noreferrer" className="text-gunner-red hover:underline truncate inline-block max-w-full">
                {partner.website}
              </a>
            ) : '—'}
          </Field>
          {partner.ghlContactId && (
            <Field label="GHL contact">
              <a
                href={`https://app.gohighlevel.com/contacts/detail/${partner.ghlContactId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gunner-red hover:underline inline-flex items-center gap-1"
              >
                Open in GHL <ExternalLink size={10} />
              </a>
            </Field>
          )}
          <Field label="Comm pref">
            {partner.preferredContactMethod ?? '—'}
            {partner.bestTimeToContact && ` · ${partner.bestTimeToContact}`}
          </Field>
          {partner.doNotContact && (
            <p className="text-ds-fine font-medium text-semantic-red mt-1">Do not contact</p>
          )}
        </Card>

        {/* Performance card */}
        <Card title="Performance with us" colSpan={2}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Stat label="Sourced to us" value={partner.dealsSourcedToUsCount} />
            <Stat label="Taken from us" value={partner.dealsTakenFromUsCount} />
            <Stat label="Closed w/ us" value={partner.dealsClosedWithUsCount} highlight />
            <Stat label="JV history" value={partner.jvHistoryCount} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-ds-fine">
            <KV label="Last deal" value={partner.lastDealDate ? new Date(partner.lastDealDate).toLocaleDateString() : '—'} />
            <KV label="Response rate" value={partner.responseRate != null ? `${(partner.responseRate * 100).toFixed(0)}%` : '—'} />
            <KV label="Reliability" value={partner.reliabilityScore != null ? `${(partner.reliabilityScore * 100).toFixed(0)}%` : '—'} />
            {partner.averageCommissionPercent != null && (
              <KV label="Avg commission" value={`${partner.averageCommissionPercent}%`} />
            )}
            {partner.tierClassification && <KV label="Tier" value={partner.tierClassification} />}
          </div>
        </Card>
      </div>

      {/* Type-flavored cards (conditional) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {partner.types.includes('agent') && (
          <Card title="Brokerage / license">
            <KV label="Brokerage" value={partner.brokerageName ?? '—'} />
            <KV label="Address" value={partner.brokerageAddress ?? '—'} />
            <KV label="License #" value={partner.licenseNumber ?? '—'} />
            <KV label="State" value={partner.licenseState ?? '—'} />
            <KV
              label="License expires"
              value={partner.licenseExpiration ? new Date(partner.licenseExpiration).toLocaleDateString() : '—'}
            />
          </Card>
        )}
        {partner.types.includes('wholesaler') && (
          <Card title="Wholesaler operation">
            <KV label="Buyer list size" value={partner.buyerListSize?.toString() ?? '—'} />
            <KV label="Deals / month" value={partner.dealsPerMonthEstimate?.toString() ?? '—'} />
            <KV
              label="Prefers"
              value={
                partner.prefersAssignment === true
                  ? 'Assignment'
                  : partner.prefersAssignment === false
                    ? 'Double-close'
                    : '—'
              }
            />
            <KV label="Typical assignment fee" value={partner.typicalAssignmentFee ? `$${partner.typicalAssignmentFee}` : '—'} />
          </Card>
        )}
      </div>

      {/* Markets + experience */}
      <Card title="Markets & focus">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-ds-fine">
          <KV
            label="Primary markets"
            value={partner.primaryMarkets.length > 0 ? partner.primaryMarkets.join(', ') : '—'}
          />
          <KV label="Property type focus" value={partner.propertyTypeFocus ?? '—'} />
          <KV label="Years experience" value={partner.yearsExperience?.toString() ?? '—'} />
          <KV
            label="Specialties"
            value={partner.specialties.length > 0 ? partner.specialties.join(', ') : '—'}
          />
        </div>
      </Card>

      {/* Reputation */}
      {(partner.tierClassification || partner.reputationNotes || partner.badWithUsFlag) && (
        <Card title="Reputation notes">
          {partner.reputationNotes ? (
            <p className="text-ds-body text-txt-primary whitespace-pre-wrap">{partner.reputationNotes}</p>
          ) : (
            <p className="text-ds-fine text-txt-muted italic">No notes</p>
          )}
        </Card>
      )}

      {/* Deal history table */}
      <Card title={`Deal history (${partner.deals.length})`}>
        {partner.deals.length === 0 ? (
          <p className="text-ds-fine text-txt-muted">No properties linked yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-ds-fine">
              <thead>
                <tr className="border-b-[0.5px] border-[rgba(0,0,0,0.06)] text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Property</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Role on deal</th>
                  <th className="text-left px-3 py-2">Economics</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="text-left px-3 py-2">Linked</th>
                </tr>
              </thead>
              <tbody>
                {partner.deals.map(d => (
                  <tr key={d.propertyId} className="border-b-[0.5px] border-[rgba(0,0,0,0.04)] hover:bg-surface-secondary transition-colors">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/${_tenantSlug}/inventory/${d.property.id}`}
                        className="text-txt-primary font-medium hover:text-gunner-red hover:underline inline-flex items-center gap-0.5"
                      >
                        <MapPin size={11} className="text-txt-muted" />
                        <span className="truncate">{d.property.address}</span>
                      </Link>
                      {(d.property.city || d.property.state) && (
                        <p className="text-[10px] text-txt-muted ml-3.5">
                          {[d.property.city, d.property.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[d.property.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {d.property.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-txt-secondary">{roleLabel(d.role)}</td>
                    <td className="px-3 py-2.5 text-txt-secondary">
                      {d.commissionPercent != null && <p>{d.commissionPercent}%</p>}
                      {d.commissionAmount && <p>${d.commissionAmount}</p>}
                      {d.purchasePrice && <p>Purchase: ${d.purchasePrice}</p>}
                      {d.assignmentFeePaid && <p>Asgmt fee: ${d.assignmentFeePaid}</p>}
                      {d.commissionPercent == null && !d.commissionAmount && !d.purchasePrice && !d.assignmentFeePaid && '—'}
                    </td>
                    <td className="px-3 py-2.5 text-txt-secondary max-w-[200px] truncate">{d.notesOnThisDeal ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[10px] text-txt-muted">{new Date(d.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Internal notes */}
      {partner.internalNotes && (
        <Card title="Internal notes">
          <p className="text-ds-body text-txt-primary whitespace-pre-wrap">{partner.internalNotes}</p>
        </Card>
      )}

      {/* Tags */}
      {partner.tags.length > 0 && (
        <Card title="Tags">
          <div className="flex flex-wrap gap-1">
            {partner.tags.map(t => (
              <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-txt-secondary">
                {t}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Edit form ───────────────────────────────────────────────────────────────

function EditPartnerForm({
  partner,
  onSave,
  onCancel,
  onDelete,
}: {
  partner: PartnerDetail
  onSave: (updated: PartnerDetail) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(partner.name)
  const [phone, setPhone] = useState(partner.phone ?? '')
  const [email, setEmail] = useState(partner.email ?? '')
  const [company, setCompany] = useState(partner.company ?? '')
  const [website, setWebsite] = useState(partner.website ?? '')
  const [types, setTypes] = useState<PartnerType[]>(
    partner.types.filter((t): t is PartnerType => (PARTNER_TYPES as readonly string[]).includes(t)),
  )

  // Agent
  const [brokerageName, setBrokerageName] = useState(partner.brokerageName ?? '')
  const [licenseNumber, setLicenseNumber] = useState(partner.licenseNumber ?? '')
  const [licenseState, setLicenseState] = useState(partner.licenseState ?? '')

  // Wholesaler
  const [buyerListSize, setBuyerListSize] = useState(partner.buyerListSize?.toString() ?? '')
  const [dealsPerMonth, setDealsPerMonth] = useState(partner.dealsPerMonthEstimate?.toString() ?? '')
  const [prefersAssignment, setPrefersAssignment] = useState<boolean | null>(partner.prefersAssignment)

  // Markets
  const [primaryMarkets, setPrimaryMarkets] = useState(partner.primaryMarkets.join(', '))
  const [propertyTypeFocus, setPropertyTypeFocus] = useState(partner.propertyTypeFocus ?? '')
  const [yearsExperience, setYearsExperience] = useState(partner.yearsExperience?.toString() ?? '')

  // Reputation
  const [partnerGrade, setPartnerGrade] = useState(partner.partnerGrade ?? '')
  const [tierClassification, setTierClassification] = useState(partner.tierClassification ?? '')
  const [priorityFlag, setPriorityFlag] = useState(partner.priorityFlag)
  const [badWithUsFlag, setBadWithUsFlag] = useState(partner.badWithUsFlag)
  const [reputationNotes, setReputationNotes] = useState(partner.reputationNotes ?? '')

  // Communication
  const [preferredContactMethod, setPreferredContactMethod] = useState(partner.preferredContactMethod ?? '')
  const [bestTimeToContact, setBestTimeToContact] = useState(partner.bestTimeToContact ?? '')
  const [doNotContact, setDoNotContact] = useState(partner.doNotContact)

  const [internalNotes, setInternalNotes] = useState(partner.internalNotes ?? '')

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleType(t: PartnerType) {
    setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body = {
        name,
        phone: phone.trim() || null,
        email: email.trim() || null,
        company: company.trim() || null,
        website: website.trim() || null,
        types,
        brokerageName: brokerageName.trim() || null,
        licenseNumber: licenseNumber.trim() || null,
        licenseState: licenseState.trim() || null,
        buyerListSize: buyerListSize ? Number(buyerListSize) : null,
        dealsPerMonthEstimate: dealsPerMonth ? Number(dealsPerMonth) : null,
        prefersAssignment,
        primaryMarkets: primaryMarkets.split(',').map(m => m.trim()).filter(Boolean),
        propertyTypeFocus: propertyTypeFocus.trim() || null,
        yearsExperience: yearsExperience ? Number(yearsExperience) : null,
        partnerGrade: partnerGrade.trim() || null,
        tierClassification: tierClassification.trim() || null,
        priorityFlag,
        badWithUsFlag,
        reputationNotes: reputationNotes.trim() || null,
        preferredContactMethod: preferredContactMethod.trim() || null,
        bestTimeToContact: bestTimeToContact.trim() || null,
        doNotContact,
        internalNotes: internalNotes.trim() || null,
      }
      const res = await fetch(`/api/partners/${partner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save')
        setSaving(false)
        return
      }
      // Merge into local partner shape — keep deals + counters intact from server
      onSave({
        ...partner,
        name: data.partner.name ?? name,
        phone: data.partner.phone ?? null,
        email: data.partner.email ?? null,
        company: data.partner.company ?? null,
        website: data.partner.website ?? null,
        types: (data.partner.types ?? types) as string[],
        brokerageName: data.partner.brokerageName ?? null,
        licenseNumber: data.partner.licenseNumber ?? null,
        licenseState: data.partner.licenseState ?? null,
        buyerListSize: data.partner.buyerListSize ?? null,
        dealsPerMonthEstimate: data.partner.dealsPerMonthEstimate ?? null,
        prefersAssignment: data.partner.prefersAssignment ?? null,
        primaryMarkets: (data.partner.primaryMarkets ?? body.primaryMarkets) as string[],
        propertyTypeFocus: data.partner.propertyTypeFocus ?? null,
        yearsExperience: data.partner.yearsExperience ?? null,
        partnerGrade: data.partner.partnerGrade ?? null,
        tierClassification: data.partner.tierClassification ?? null,
        priorityFlag: data.partner.priorityFlag ?? false,
        badWithUsFlag: data.partner.badWithUsFlag ?? false,
        reputationNotes: data.partner.reputationNotes ?? null,
        preferredContactMethod: data.partner.preferredContactMethod ?? null,
        bestTimeToContact: data.partner.bestTimeToContact ?? null,
        doNotContact: data.partner.doNotContact ?? false,
        internalNotes: data.partner.internalNotes ?? null,
      })
    } catch {
      setError('Failed to save')
    }
    setSaving(false)
  }

  async function deletePartner() {
    if (!confirm(`Delete ${partner.name}? This removes the Partner row and unlinks them from every property. The GHL contact stays.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/partners/${partner.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDelete()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to delete')
        setDeleting(false)
      }
    } catch {
      setError('Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Identity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextField label="Name" value={name} onChange={setName} required />
          <TextField label="Phone" value={phone} onChange={setPhone} />
          <TextField label="Email" value={email} onChange={setEmail} />
          <TextField label="Company" value={company} onChange={setCompany} />
          <TextField label="Website" value={website} onChange={setWebsite} />
        </div>
      </Card>

      <Card title="Types (multi-select)">
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
                    : 'bg-surface-secondary text-txt-secondary hover:text-txt-primary border-[0.5px] border-[rgba(0,0,0,0.1)]'
                }`}
              >
                {typeLabel(t)}
              </button>
            )
          })}
        </div>
      </Card>

      {types.includes('agent') && (
        <Card title="Brokerage / license">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField label="Brokerage name" value={brokerageName} onChange={setBrokerageName} />
            <TextField label="License #" value={licenseNumber} onChange={setLicenseNumber} />
            <TextField label="License state" value={licenseState} onChange={setLicenseState} />
          </div>
        </Card>
      )}

      {types.includes('wholesaler') && (
        <Card title="Wholesaler operation">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TextField label="Buyer list size" value={buyerListSize} onChange={setBuyerListSize} type="number" />
            <TextField label="Deals / month" value={dealsPerMonth} onChange={setDealsPerMonth} type="number" />
            <div>
              <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Prefers</p>
              <select
                value={prefersAssignment === null ? '' : prefersAssignment ? 'assignment' : 'double_close'}
                onChange={e => {
                  const v = e.target.value
                  setPrefersAssignment(v === '' ? null : v === 'assignment')
                }}
                className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary focus:outline-none"
              >
                <option value="">Either</option>
                <option value="assignment">Assignment</option>
                <option value="double_close">Double-close</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      <Card title="Markets & focus">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextField label="Primary markets (comma-separated)" value={primaryMarkets} onChange={setPrimaryMarkets} />
          <TextField label="Property type focus" value={propertyTypeFocus} onChange={setPropertyTypeFocus} />
          <TextField label="Years experience" value={yearsExperience} onChange={setYearsExperience} type="number" />
        </div>
      </Card>

      <Card title="Reputation">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <TextField label="Grade (A/B/C/D)" value={partnerGrade} onChange={setPartnerGrade} />
          <TextField label="Tier (A_list / B_list / C_list)" value={tierClassification} onChange={setTierClassification} />
        </div>
        <div className="flex flex-wrap gap-3 mb-3">
          <label className="flex items-center gap-1.5 text-ds-fine text-txt-secondary cursor-pointer">
            <input type="checkbox" checked={priorityFlag} onChange={e => setPriorityFlag(e.target.checked)} />
            Priority flag
          </label>
          <label className="flex items-center gap-1.5 text-ds-fine text-txt-secondary cursor-pointer">
            <input type="checkbox" checked={badWithUsFlag} onChange={e => setBadWithUsFlag(e.target.checked)} />
            Bad with us
          </label>
        </div>
        <TextArea label="Reputation notes" value={reputationNotes} onChange={setReputationNotes} />
      </Card>

      <Card title="Communication">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <TextField label="Preferred method (call / text / email)" value={preferredContactMethod} onChange={setPreferredContactMethod} />
          <TextField label="Best time to contact" value={bestTimeToContact} onChange={setBestTimeToContact} />
        </div>
        <label className="flex items-center gap-1.5 text-ds-fine text-txt-secondary cursor-pointer">
          <input type="checkbox" checked={doNotContact} onChange={e => setDoNotContact(e.target.checked)} />
          Do not contact
        </label>
      </Card>

      <Card title="Internal notes">
        <TextArea label="" value={internalNotes} onChange={setInternalNotes} rows={4} />
      </Card>

      {error && (
        <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-[10px] px-4 py-2 text-ds-fine text-semantic-red">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={deletePartner}
          disabled={deleting || saving}
          className="text-ds-fine font-medium text-semantic-red hover:text-semantic-red/80 transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <Trash2 size={12} /> {deleting ? 'Deleting...' : 'Delete partner'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-ds-fine text-txt-secondary hover:text-txt-primary transition-colors flex items-center gap-1"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name}
            className="px-3 py-1.5 bg-gunner-red disabled:bg-txt-muted text-white text-ds-fine font-medium rounded-[10px] hover:bg-gunner-red-dark transition-colors disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Save size={12} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function Card({ title, children, colSpan }: { title: string; children: React.ReactNode; colSpan?: number }) {
  return (
    <div
      className={`bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-4 ${colSpan === 2 ? 'lg:col-span-2' : ''}`}
    >
      <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon?: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <p className="text-[9px] font-medium text-txt-muted uppercase tracking-wider mb-0.5">
        {Icon && <Icon size={9} className="inline -mt-0.5 mr-0.5" />}
        {label}
      </p>
      <div className="text-ds-fine text-txt-primary">{children}</div>
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-medium text-txt-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-ds-fine text-txt-primary">{value}</p>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-[10px] px-3 py-2 ${highlight ? 'bg-gunner-red-light' : 'bg-surface-secondary'}`}>
      <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">{label}</p>
      <p className={`text-ds-section font-semibold ${highlight ? 'text-gunner-red' : 'text-txt-primary'}`}>{value}</p>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-1">
        {label}{required && <span className="text-semantic-red"> *</span>}
      </p>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors"
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div>
      {label && <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-1">{label}</p>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors resize-none"
      />
    </div>
  )
}
