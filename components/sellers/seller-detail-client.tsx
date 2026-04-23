'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Mail, MapPin, ExternalLink, User, Clock,
  Heart, DollarSign, BarChart3, Sparkles, Check, Building2,
  Search, Loader2,
} from 'lucide-react'
import { formatPhone, titleCase } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────

interface LinkedProperty {
  isPrimary: boolean
  role: string
  property: {
    id: string
    address: string
    city: string
    state: string
    status: string
    arv: string | null
    assignedToName: string | null
  }
}

interface SellerData {
  id: string
  tenantId: string
  createdAt: string
  updatedAt: string
  name: string
  phone: string | null
  secondaryPhone: string | null
  mobilePhone: string | null
  email: string | null
  secondaryEmail: string | null
  mailingAddress: string | null
  mailingCity: string | null
  mailingState: string | null
  mailingZip: string | null
  dateOfBirth: string | null
  maritalStatus: string | null
  spouseName: string | null
  spousePhone: string | null
  spouseEmail: string | null
  occupation: string | null
  employer: string | null
  preferredContactMethod: string | null
  bestTimeToCall: string | null
  languagePreference: string | null
  doNotContact: boolean
  isDeceased: boolean
  ghlContactId: string | null
  yearsOwned: number | null
  howAcquired: string | null
  ownershipType: string | null
  entityName: string | null
  mortgageBalance: string | null
  monthlyMortgagePayment: string | null
  lenderName: string | null
  interestRate: number | null
  loanType: string | null
  remainingTermMonths: number | null
  hasSecondMortgage: boolean | null
  secondMortgageBalance: string | null
  hasHoa: boolean | null
  hoaAmount: string | null
  hoaStatus: string | null
  propertyTaxesCurrent: boolean | null
  propertyTaxesOwed: string | null
  hasLiens: boolean | null
  lienAmount: string | null
  lienType: string | null
  isProbate: boolean | null
  isEstate: boolean | null
  estateAttorneyName: string | null
  estateAttorneyPhone: string | null
  motivationPrimary: string | null
  motivationSecondary: string | null
  situation: string | null
  urgencyScore: number | null
  urgencyLevel: string | null
  saleTimeline: string | null
  hardshipType: string | null
  isDivorce: boolean | null
  isForeclosure: boolean | null
  foreclosureAuctionDate: string | null
  isBankruptcy: boolean | null
  isPreProbate: boolean | null
  isRecentlyInherited: boolean | null
  behindOnPayments: boolean | null
  monthsBehindOnPayments: number | null
  lifeEventNotes: string | null
  emotionalState: string | null
  decisionMakers: string | null
  isDecisionMakersConfirmed: boolean | null
  isTenantOccupied: boolean | null
  tenantLeaseEndDate: string | null
  isTenantPaying: boolean | null
  isEvictionInProgress: boolean | null
  isVacant: boolean | null
  vacantDurationMonths: number | null
  isListedWithAgent: boolean | null
  agentName: string | null
  agentListingExpiration: string | null
  willingToDoSellerFinancing: boolean | null
  willingToDoSubjectTo: boolean | null
  moveOutTimeline: string | null
  sellerAskingPrice: string | null
  lowestAcceptablePrice: string | null
  amountNeededToClear: string | null
  askingReason: string | null
  financialDistressScore: number | null
  monthlyCarryingCost: string | null
  hasInsurance: boolean | null
  insuranceCompany: string | null
  firstContactDate: string | null
  lastContactDate: string | null
  totalCallCount: number
  lastCallOutcome: string | null
  responseRate: number | null
  callsToAppointmentRatio: number | null
  bestDayToCall: string | null
  noAnswerStreak: number
  textResponseRate: number | null
  sentimentTrend: string | null
  commonObjections: unknown[]
  rapportScore: number | null
  engagementLevel: string | null
  lastMeaningfulConversationDate: string | null
  leadSource: string | null
  leadDate: string | null
  assignedToId: string | null
  campaignName: string | null
  listName: string | null
  timesRecycled: number
  referralSource: string | null
  leadScore: number | null
  motivationScore: number | null
  likelihoodToSellScore: number | null
  personalityType: string | null
  communicationStyle: string | null
  priceSensitivity: string | null
  objectionProfile: unknown[]
  recommendedApproach: string | null
  redFlags: unknown[]
  positiveSignals: unknown[]
  priceReductionLikelihood: number | null
  isSubjectToCandidate: boolean | null
  isCreativeFinanceCandidate: boolean | null
  followUpPriority: string | null
  predictedCloseProbability: number | null
  daysToCloseEstimate: number | null
  aiSummary: string | null
  aiCoachingNotes: string | null
  lastAiAnalysisDate: string | null
  countyOwnerName: string | null
  countyAssessedValue: string | null
  countyMarketValue: string | null
  lastSalePrice: string | null
  lastSaleDate: string | null
  parcelId: string | null
  legalDescription: string | null
  deedType: string | null
  zoning: string | null
  schoolDistrict: string | null
  floodZone: string | null
  neighborhoodRating: number | null
  walkScore: number | null
  crimeScore: number | null
  naturalDisasterRisk: string | null
  foreclosureHistoryCount: number | null
  environmentalFlags: unknown[]
  enrichmentStatus: string | null
  enrichmentLastUpdated: string | null
  appointmentSetDate: string | null
  appointmentCompletedDate: string | null
  walkThroughCompleted: boolean | null
  walkThroughNotes: string | null
  photosTaken: boolean | null
  interiorConditionRepNotes: string | null
  exteriorConditionRepNotes: string | null
  neighborhoodConditionNotes: string | null
  accessNotes: string | null
  tags: string[]
  internalNotes: string | null
  priorityFlag: boolean
  customFields: Record<string, unknown>
  fieldSources: Record<string, string>
  properties: LinkedProperty[]
}

interface SellerDetailClientProps {
  seller: SellerData
  tenantSlug: string
}

// ── Helpers ───────────────────────────────────────────────

const URGENCY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
  unknown: 'bg-gray-100 text-gray-600',
}

const STATUS_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-sky-100 text-sky-700',
  CONTACTED: 'bg-blue-100 text-blue-700',
  APPOINTMENT_SET: 'bg-yellow-100 text-yellow-700',
  APPOINTMENT_COMPLETED: 'bg-lime-100 text-lime-700',
  OFFER_MADE: 'bg-purple-100 text-purple-700',
  UNDER_CONTRACT: 'bg-emerald-100 text-emerald-700',
  SOLD: 'bg-green-100 text-green-700',
  DEAD: 'bg-gray-100 text-gray-500',
  FOLLOW_UP: 'bg-orange-100 text-orange-700',
}

function SourceBadge({ source }: { source: string | undefined }) {
  if (!source) return null
  if (source === 'ai') return <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold bg-purple-100 text-[#7F77DD]">✦ AI</span>
  if (source === 'api') return <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold bg-blue-100 text-blue-600">API</span>
  return <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold bg-green-100 text-green-600">Edited</span>
}

function fmtBool(val: boolean | null | undefined): string {
  if (val === true) return 'Yes'
  if (val === false) return 'No'
  return '\u2014'
}

function fmtMoney(val: string | null): string {
  if (!val) return '\u2014'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(val: number | null, scale: 'decimal' | 'whole' = 'decimal'): string {
  if (val === null || val === undefined) return '\u2014'
  const pct = scale === 'decimal' ? val * 100 : val
  return `${pct.toFixed(0)}%`
}

function fmtDate(val: string | null): string {
  if (!val) return '\u2014'
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Field Row Component ────────────────────────────────────

function FieldRow({
  label, fieldKey, value, sources, onSave, type = 'text',
}: {
  label: string
  fieldKey: string
  value: string
  sources: Record<string, string>
  onSave: (key: string, val: string) => void
  type?: 'text' | 'textarea' | 'select'
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(value)
  const [saved, setSaved] = useState(false)
  const isEmpty = !value || value === '\u2014'

  const handleSave = () => {
    setEditing(false)
    if (editVal !== value) {
      onSave(fieldKey, editVal)
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    }
  }

  return (
    <div className="flex items-start justify-between py-1.5 px-2 rounded hover:bg-black/[0.02] group min-h-[32px]">
      <span className="text-[10px] text-gray-500 w-[140px] shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 flex items-center gap-1 min-w-0">
        {editing ? (
          type === 'textarea' ? (
            <textarea
              className="flex-1 text-[11px] px-1.5 py-1 border border-gray-300 rounded bg-white resize-none"
              rows={3}
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={handleSave}
              autoFocus
            />
          ) : (
            <input
              className="flex-1 text-[11px] px-1.5 py-0.5 border border-gray-300 rounded bg-white"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={handleSave}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          )
        ) : (
          <span
            className={`text-[11px] cursor-pointer flex-1 truncate ${isEmpty ? 'text-gray-300' : 'text-gray-900'}`}
            onClick={() => { setEditVal(value === '\u2014' ? '' : value); setEditing(true) }}
          >
            {value || '\u2014'}
          </span>
        )}
        {saved && <Check className="w-3 h-3 text-green-500 shrink-0" />}
        {!isEmpty && <SourceBadge source={sources[fieldKey]} />}
      </div>
    </div>
  )
}

// ── Section Card ───────────────────────────────────────────

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// Button that triggers BatchData skip-trace for a seller and refreshes the
// page on success. Disabled by default once both phone AND email are present —
// click while holding Shift to force (re-fetch at $0.07 cost).
function SkipTraceButton({
  sellerId,
  hasPhone,
  hasEmail,
}: {
  sellerId: string
  hasPhone: boolean
  hasEmail: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'no-match'>('idle')
  const [touched, setTouched] = useState<number>(0)

  const alreadyComplete = hasPhone && hasEmail
  const disabled = status === 'loading'

  const run = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    const force = e.shiftKey || alreadyComplete
    setStatus('loading')
    try {
      const res = await fetch(
        `/api/sellers/${sellerId}/skip-trace${force ? '?force=1' : ''}`,
        { method: 'POST' },
      )
      const body = await res.json() as { traced?: boolean; fieldsTouched?: string[]; error?: string }
      if (!res.ok) {
        setStatus(body.error === 'skip-trace unavailable' ? 'no-match' : 'error')
        return
      }
      setTouched(body.fieldsTouched?.length ?? 0)
      setStatus('done')
      if ((body.fieldsTouched?.length ?? 0) > 0) router.refresh()
    } catch {
      setStatus('error')
    }
  }, [sellerId, alreadyComplete, router])

  const label = status === 'loading' ? 'Searching…'
    : status === 'done' ? (touched > 0 ? `Filled ${touched} field${touched === 1 ? '' : 's'}` : 'Nothing new')
    : status === 'no-match' ? 'No match'
    : status === 'error' ? 'Error — retry'
    : alreadyComplete ? 'Re-trace (Shift+click)'
    : 'Find contact info'

  return (
    <button
      onClick={run}
      disabled={disabled}
      title="Search BatchData skip-trace for phone + email ($0.07)"
      className={`
        flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[10px] font-medium
        transition-colors border
        ${status === 'done' && touched > 0 ? 'bg-green-50 text-green-700 border-green-200'
          : status === 'error' ? 'bg-red-50 text-red-700 border-red-200'
          : status === 'no-match' ? 'bg-gray-50 text-gray-500 border-gray-200'
          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}
        ${disabled ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
      `}
    >
      {status === 'loading'
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : status === 'done' && touched > 0
        ? <Check className="w-3 h-3" />
        : <Search className="w-3 h-3" />}
      {label}
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────

const TABS = ['Identity', 'Situation', 'Financial', 'Call History', 'AI Insights'] as const
type Tab = typeof TABS[number]
const TAB_ICONS: Record<Tab, React.ReactNode> = {
  'Identity': <User className="w-3.5 h-3.5" />,
  'Situation': <Heart className="w-3.5 h-3.5" />,
  'Financial': <DollarSign className="w-3.5 h-3.5" />,
  'Call History': <BarChart3 className="w-3.5 h-3.5" />,
  'AI Insights': <Sparkles className="w-3.5 h-3.5" />,
}

export function SellerDetailClient({ seller, tenantSlug }: SellerDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Identity')
  const [data, setData] = useState(seller)
  const [sources, setSources] = useState<Record<string, string>>(seller.fieldSources)

  const saveField = useCallback(async (fieldKey: string, value: string) => {
    const body: Record<string, unknown> = { [fieldKey]: value || null }
    try {
      const res = await fetch(`/api/${tenantSlug}/sellers/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const json = await res.json()
        setSources(json.seller.fieldSources ?? {})
        setData(prev => ({ ...prev, [fieldKey]: value || null }))
      }
    } catch {
      // silently fail — user sees no checkmark
    }
  }, [tenantSlug, data.id])

  const f = (key: string): string => {
    const v = (data as unknown as Record<string, unknown>)[key]
    if (v === null || v === undefined) return '\u2014'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    return String(v)
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)] px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>

          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
            {data.properties[0] && (
              <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-indigo-100 text-indigo-700">
                {data.properties[0].isPrimary ? 'Primary Seller' : titleCase(data.properties[0].role)}
              </span>
            )}
            {data.ghlContactId && (
              <a
                href={`https://app.gohighlevel.com/contacts/detail/${data.ghlContactId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600"
                title="Open in GHL"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {data.doNotContact && (
              <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">
                DNC
              </span>
            )}
          </div>

          {/* Key stats row */}
          <div className="flex items-center gap-6 mt-2 text-[10px] text-gray-500">
            {data.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" /> {formatPhone(data.phone)}
              </span>
            )}
            {data.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" /> {data.email}
              </span>
            )}
            {data.urgencyLevel && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${URGENCY_COLORS[data.urgencyLevel] ?? URGENCY_COLORS.unknown}`}>
                {titleCase(data.urgencyLevel)} Urgency
              </span>
            )}
            {data.leadScore !== null && (
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#7F77DD]" /> Score: {data.leadScore.toFixed(0)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {data.properties.length} {data.properties.length === 1 ? 'Property' : 'Properties'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)]">
        <div className="max-w-5xl mx-auto flex gap-1 px-6">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {TAB_ICONS[tab]} {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {activeTab === 'Identity' && (
          <>
            <SectionCard
              title="Contact Information"
              action={<SkipTraceButton sellerId={data.id} hasPhone={!!data.phone} hasEmail={!!data.email} />}
            >
              <FieldRow label="Phone" fieldKey="phone" value={formatPhone(data.phone)} sources={sources} onSave={saveField} />
              <FieldRow label="Secondary Phone" fieldKey="secondaryPhone" value={formatPhone(data.secondaryPhone)} sources={sources} onSave={saveField} />
              <FieldRow label="Mobile" fieldKey="mobilePhone" value={formatPhone(data.mobilePhone)} sources={sources} onSave={saveField} />
              <FieldRow label="Email" fieldKey="email" value={f('email')} sources={sources} onSave={saveField} />
              <FieldRow label="Secondary Email" fieldKey="secondaryEmail" value={f('secondaryEmail')} sources={sources} onSave={saveField} />
              <FieldRow label="Preferred Contact" fieldKey="preferredContactMethod" value={f('preferredContactMethod')} sources={sources} onSave={saveField} />
              <FieldRow label="Best Time to Call" fieldKey="bestTimeToCall" value={f('bestTimeToCall')} sources={sources} onSave={saveField} />
              <FieldRow label="Language" fieldKey="languagePreference" value={f('languagePreference')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Personal Details">
              <FieldRow label="Date of Birth" fieldKey="dateOfBirth" value={fmtDate(data.dateOfBirth)} sources={sources} onSave={saveField} />
              <FieldRow label="Marital Status" fieldKey="maritalStatus" value={f('maritalStatus')} sources={sources} onSave={saveField} />
              <FieldRow label="Spouse Name" fieldKey="spouseName" value={f('spouseName')} sources={sources} onSave={saveField} />
              <FieldRow label="Spouse Phone" fieldKey="spousePhone" value={formatPhone(data.spousePhone)} sources={sources} onSave={saveField} />
              <FieldRow label="Spouse Email" fieldKey="spouseEmail" value={f('spouseEmail')} sources={sources} onSave={saveField} />
              <FieldRow label="Occupation" fieldKey="occupation" value={f('occupation')} sources={sources} onSave={saveField} />
              <FieldRow label="Employer" fieldKey="employer" value={f('employer')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Mailing Address">
              <FieldRow label="Street" fieldKey="mailingAddress" value={f('mailingAddress')} sources={sources} onSave={saveField} />
              <FieldRow label="City" fieldKey="mailingCity" value={f('mailingCity')} sources={sources} onSave={saveField} />
              <FieldRow label="State" fieldKey="mailingState" value={f('mailingState')} sources={sources} onSave={saveField} />
              <FieldRow label="Zip" fieldKey="mailingZip" value={f('mailingZip')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Ownership">
              <FieldRow label="Years Owned" fieldKey="yearsOwned" value={f('yearsOwned')} sources={sources} onSave={saveField} />
              <FieldRow label="How Acquired" fieldKey="howAcquired" value={f('howAcquired')} sources={sources} onSave={saveField} />
              <FieldRow label="Ownership Type" fieldKey="ownershipType" value={f('ownershipType')} sources={sources} onSave={saveField} />
              <FieldRow label="Entity Name" fieldKey="entityName" value={f('entityName')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Lead Info">
              <FieldRow label="Lead Source" fieldKey="leadSource" value={f('leadSource')} sources={sources} onSave={saveField} />
              <FieldRow label="Lead Date" fieldKey="leadDate" value={fmtDate(data.leadDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Campaign" fieldKey="campaignName" value={f('campaignName')} sources={sources} onSave={saveField} />
              <FieldRow label="List Name" fieldKey="listName" value={f('listName')} sources={sources} onSave={saveField} />
              <FieldRow label="Referral Source" fieldKey="referralSource" value={f('referralSource')} sources={sources} onSave={saveField} />
              <FieldRow label="Times Recycled" fieldKey="timesRecycled" value={f('timesRecycled')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Notes">
              <FieldRow label="Internal Notes" fieldKey="internalNotes" value={f('internalNotes')} sources={sources} onSave={saveField} type="textarea" />
            </SectionCard>
          </>
        )}

        {activeTab === 'Situation' && (
          <>
            <SectionCard title="Motivation">
              <FieldRow label="Primary Motivation" fieldKey="motivationPrimary" value={f('motivationPrimary')} sources={sources} onSave={saveField} />
              <FieldRow label="Secondary Motivation" fieldKey="motivationSecondary" value={f('motivationSecondary')} sources={sources} onSave={saveField} />
              <FieldRow label="Urgency Score (1-10)" fieldKey="urgencyScore" value={f('urgencyScore')} sources={sources} onSave={saveField} />
              <FieldRow label="Urgency Level" fieldKey="urgencyLevel" value={f('urgencyLevel')} sources={sources} onSave={saveField} />
              <FieldRow label="Sale Timeline" fieldKey="saleTimeline" value={f('saleTimeline')} sources={sources} onSave={saveField} />
              <FieldRow label="Emotional State" fieldKey="emotionalState" value={f('emotionalState')} sources={sources} onSave={saveField} />
              <FieldRow label="Situation" fieldKey="situation" value={f('situation')} sources={sources} onSave={saveField} type="textarea" />
            </SectionCard>

            <SectionCard title="Hardship & Life Events">
              <FieldRow label="Hardship Type" fieldKey="hardshipType" value={f('hardshipType')} sources={sources} onSave={saveField} />
              <FieldRow label="Divorce" fieldKey="isDivorce" value={fmtBool(data.isDivorce)} sources={sources} onSave={saveField} />
              <FieldRow label="Foreclosure" fieldKey="isForeclosure" value={fmtBool(data.isForeclosure)} sources={sources} onSave={saveField} />
              <FieldRow label="Foreclosure Auction" fieldKey="foreclosureAuctionDate" value={fmtDate(data.foreclosureAuctionDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Bankruptcy" fieldKey="isBankruptcy" value={fmtBool(data.isBankruptcy)} sources={sources} onSave={saveField} />
              <FieldRow label="Pre-Probate" fieldKey="isPreProbate" value={fmtBool(data.isPreProbate)} sources={sources} onSave={saveField} />
              <FieldRow label="Recently Inherited" fieldKey="isRecentlyInherited" value={fmtBool(data.isRecentlyInherited)} sources={sources} onSave={saveField} />
              <FieldRow label="Behind on Payments" fieldKey="behindOnPayments" value={fmtBool(data.behindOnPayments)} sources={sources} onSave={saveField} />
              <FieldRow label="Months Behind" fieldKey="monthsBehindOnPayments" value={f('monthsBehindOnPayments')} sources={sources} onSave={saveField} />
              <FieldRow label="Life Event Notes" fieldKey="lifeEventNotes" value={f('lifeEventNotes')} sources={sources} onSave={saveField} type="textarea" />
            </SectionCard>

            <SectionCard title="Decision Makers">
              <FieldRow label="Decision Makers" fieldKey="decisionMakers" value={f('decisionMakers')} sources={sources} onSave={saveField} />
              <FieldRow label="Confirmed" fieldKey="isDecisionMakersConfirmed" value={fmtBool(data.isDecisionMakersConfirmed)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Occupancy & Property Status">
              <FieldRow label="Tenant Occupied" fieldKey="isTenantOccupied" value={fmtBool(data.isTenantOccupied)} sources={sources} onSave={saveField} />
              <FieldRow label="Lease End Date" fieldKey="tenantLeaseEndDate" value={fmtDate(data.tenantLeaseEndDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Tenant Paying" fieldKey="isTenantPaying" value={fmtBool(data.isTenantPaying)} sources={sources} onSave={saveField} />
              <FieldRow label="Eviction in Progress" fieldKey="isEvictionInProgress" value={fmtBool(data.isEvictionInProgress)} sources={sources} onSave={saveField} />
              <FieldRow label="Vacant" fieldKey="isVacant" value={fmtBool(data.isVacant)} sources={sources} onSave={saveField} />
              <FieldRow label="Vacant Duration (months)" fieldKey="vacantDurationMonths" value={f('vacantDurationMonths')} sources={sources} onSave={saveField} />
              <FieldRow label="Listed with Agent" fieldKey="isListedWithAgent" value={fmtBool(data.isListedWithAgent)} sources={sources} onSave={saveField} />
              <FieldRow label="Agent Name" fieldKey="agentName" value={f('agentName')} sources={sources} onSave={saveField} />
              <FieldRow label="Listing Expiration" fieldKey="agentListingExpiration" value={fmtDate(data.agentListingExpiration)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Creative Finance Willingness">
              <FieldRow label="Seller Financing" fieldKey="willingToDoSellerFinancing" value={fmtBool(data.willingToDoSellerFinancing)} sources={sources} onSave={saveField} />
              <FieldRow label="Subject To" fieldKey="willingToDoSubjectTo" value={fmtBool(data.willingToDoSubjectTo)} sources={sources} onSave={saveField} />
              <FieldRow label="Move-out Timeline" fieldKey="moveOutTimeline" value={f('moveOutTimeline')} sources={sources} onSave={saveField} />
            </SectionCard>
          </>
        )}

        {activeTab === 'Financial' && (
          <>
            <SectionCard title="Pricing">
              <FieldRow label="Asking Price" fieldKey="sellerAskingPrice" value={fmtMoney(data.sellerAskingPrice)} sources={sources} onSave={saveField} />
              <FieldRow label="Lowest Acceptable" fieldKey="lowestAcceptablePrice" value={fmtMoney(data.lowestAcceptablePrice)} sources={sources} onSave={saveField} />
              <FieldRow label="Amount to Clear" fieldKey="amountNeededToClear" value={fmtMoney(data.amountNeededToClear)} sources={sources} onSave={saveField} />
              <FieldRow label="Asking Reason" fieldKey="askingReason" value={f('askingReason')} sources={sources} onSave={saveField} type="textarea" />
              <FieldRow label="Monthly Carrying Cost" fieldKey="monthlyCarryingCost" value={fmtMoney(data.monthlyCarryingCost)} sources={sources} onSave={saveField} />
              <FieldRow label="Financial Distress (1-10)" fieldKey="financialDistressScore" value={f('financialDistressScore')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Mortgage">
              <FieldRow label="Mortgage Balance" fieldKey="mortgageBalance" value={fmtMoney(data.mortgageBalance)} sources={sources} onSave={saveField} />
              <FieldRow label="Monthly Payment" fieldKey="monthlyMortgagePayment" value={fmtMoney(data.monthlyMortgagePayment)} sources={sources} onSave={saveField} />
              <FieldRow label="Lender" fieldKey="lenderName" value={f('lenderName')} sources={sources} onSave={saveField} />
              <FieldRow label="Interest Rate" fieldKey="interestRate" value={data.interestRate !== null ? `${data.interestRate}%` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Loan Type" fieldKey="loanType" value={f('loanType')} sources={sources} onSave={saveField} />
              <FieldRow label="Remaining Term (months)" fieldKey="remainingTermMonths" value={f('remainingTermMonths')} sources={sources} onSave={saveField} />
              <FieldRow label="2nd Mortgage" fieldKey="hasSecondMortgage" value={fmtBool(data.hasSecondMortgage)} sources={sources} onSave={saveField} />
              <FieldRow label="2nd Mortgage Balance" fieldKey="secondMortgageBalance" value={fmtMoney(data.secondMortgageBalance)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Liens, Taxes, HOA">
              <FieldRow label="Has Liens" fieldKey="hasLiens" value={fmtBool(data.hasLiens)} sources={sources} onSave={saveField} />
              <FieldRow label="Lien Amount" fieldKey="lienAmount" value={fmtMoney(data.lienAmount)} sources={sources} onSave={saveField} />
              <FieldRow label="Lien Type" fieldKey="lienType" value={f('lienType')} sources={sources} onSave={saveField} />
              <FieldRow label="Property Taxes Current" fieldKey="propertyTaxesCurrent" value={fmtBool(data.propertyTaxesCurrent)} sources={sources} onSave={saveField} />
              <FieldRow label="Taxes Owed" fieldKey="propertyTaxesOwed" value={fmtMoney(data.propertyTaxesOwed)} sources={sources} onSave={saveField} />
              <FieldRow label="Has HOA" fieldKey="hasHoa" value={fmtBool(data.hasHoa)} sources={sources} onSave={saveField} />
              <FieldRow label="HOA Amount" fieldKey="hoaAmount" value={fmtMoney(data.hoaAmount)} sources={sources} onSave={saveField} />
              <FieldRow label="HOA Status" fieldKey="hoaStatus" value={f('hoaStatus')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Estate & Probate">
              <FieldRow label="Probate" fieldKey="isProbate" value={fmtBool(data.isProbate)} sources={sources} onSave={saveField} />
              <FieldRow label="Estate" fieldKey="isEstate" value={fmtBool(data.isEstate)} sources={sources} onSave={saveField} />
              <FieldRow label="Estate Attorney" fieldKey="estateAttorneyName" value={f('estateAttorneyName')} sources={sources} onSave={saveField} />
              <FieldRow label="Attorney Phone" fieldKey="estateAttorneyPhone" value={formatPhone(data.estateAttorneyPhone)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Insurance">
              <FieldRow label="Has Insurance" fieldKey="hasInsurance" value={fmtBool(data.hasInsurance)} sources={sources} onSave={saveField} />
              <FieldRow label="Insurance Company" fieldKey="insuranceCompany" value={f('insuranceCompany')} sources={sources} onSave={saveField} />
            </SectionCard>
          </>
        )}

        {activeTab === 'Call History' && (
          <>
            <SectionCard title="Interaction Stats">
              <FieldRow label="Total Calls" fieldKey="totalCallCount" value={String(data.totalCallCount)} sources={sources} onSave={saveField} />
              <FieldRow label="First Contact" fieldKey="firstContactDate" value={fmtDate(data.firstContactDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Last Contact" fieldKey="lastContactDate" value={fmtDate(data.lastContactDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Last Outcome" fieldKey="lastCallOutcome" value={f('lastCallOutcome')} sources={sources} onSave={saveField} />
              <FieldRow label="No-Answer Streak" fieldKey="noAnswerStreak" value={String(data.noAnswerStreak)} sources={sources} onSave={saveField} />
              <FieldRow label="Response Rate" fieldKey="responseRate" value={fmtPct(data.responseRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Text Response Rate" fieldKey="textResponseRate" value={fmtPct(data.textResponseRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Calls to Appointment" fieldKey="callsToAppointmentRatio" value={fmtPct(data.callsToAppointmentRatio)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Contact Preferences">
              <FieldRow label="Best Day to Call" fieldKey="bestDayToCall" value={f('bestDayToCall')} sources={sources} onSave={saveField} />
              <FieldRow label="Best Time to Call" fieldKey="bestTimeToCall" value={f('bestTimeToCall')} sources={sources} onSave={saveField} />
              <FieldRow label="Engagement Level" fieldKey="engagementLevel" value={f('engagementLevel')} sources={sources} onSave={saveField} />
              <FieldRow label="Sentiment Trend" fieldKey="sentimentTrend" value={f('sentimentTrend')} sources={sources} onSave={saveField} />
              <FieldRow label="Last Meaningful Conversation" fieldKey="lastMeaningfulConversationDate" value={fmtDate(data.lastMeaningfulConversationDate)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Rapport & Objections">
              <FieldRow label="Rapport Score (0-10)" fieldKey="rapportScore" value={data.rapportScore !== null ? String(data.rapportScore.toFixed(1)) : '\u2014'} sources={sources} onSave={saveField} />
              {Array.isArray(data.commonObjections) && data.commonObjections.length > 0 && (
                <div className="py-1.5 px-2">
                  <span className="text-[10px] text-gray-500 block mb-1">Common Objections</span>
                  <div className="flex flex-wrap gap-1">
                    {data.commonObjections.map((obj, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px]">
                        {String(obj)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Appointment & Visit">
              <FieldRow label="Appointment Set" fieldKey="appointmentSetDate" value={fmtDate(data.appointmentSetDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Appointment Completed" fieldKey="appointmentCompletedDate" value={fmtDate(data.appointmentCompletedDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Walk-through Done" fieldKey="walkThroughCompleted" value={fmtBool(data.walkThroughCompleted)} sources={sources} onSave={saveField} />
              <FieldRow label="Walk-through Notes" fieldKey="walkThroughNotes" value={f('walkThroughNotes')} sources={sources} onSave={saveField} type="textarea" />
              <FieldRow label="Photos Taken" fieldKey="photosTaken" value={fmtBool(data.photosTaken)} sources={sources} onSave={saveField} />
            </SectionCard>
          </>
        )}

        {activeTab === 'AI Insights' && (
          <>
            <SectionCard title="AI Scores">
              <FieldRow label="Motivation Score (0-1)" fieldKey="motivationScore" value={data.motivationScore !== null ? data.motivationScore.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Likelihood to Sell (0-1)" fieldKey="likelihoodToSellScore" value={data.likelihoodToSellScore !== null ? data.likelihoodToSellScore.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Predicted Close Prob (0-1)" fieldKey="predictedCloseProbability" value={data.predictedCloseProbability !== null ? data.predictedCloseProbability.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Price Reduction Likelihood" fieldKey="priceReductionLikelihood" value={data.priceReductionLikelihood !== null ? data.priceReductionLikelihood.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Days to Close Estimate" fieldKey="daysToCloseEstimate" value={f('daysToCloseEstimate')} sources={sources} onSave={saveField} />
              <FieldRow label="Lead Score (0-100)" fieldKey="leadScore" value={data.leadScore !== null ? data.leadScore.toFixed(0) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Follow-up Priority" fieldKey="followUpPriority" value={f('followUpPriority')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Personality & Communication">
              <FieldRow label="Personality Type" fieldKey="personalityType" value={f('personalityType')} sources={sources} onSave={saveField} />
              <FieldRow label="Communication Style" fieldKey="communicationStyle" value={f('communicationStyle')} sources={sources} onSave={saveField} />
              <FieldRow label="Price Sensitivity" fieldKey="priceSensitivity" value={f('priceSensitivity')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Creative Finance Candidates">
              <FieldRow label="Subject-To Candidate" fieldKey="isSubjectToCandidate" value={fmtBool(data.isSubjectToCandidate)} sources={sources} onSave={saveField} />
              <FieldRow label="Creative Finance Candidate" fieldKey="isCreativeFinanceCandidate" value={fmtBool(data.isCreativeFinanceCandidate)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="AI Summary & Coaching">
              <FieldRow label="AI Summary" fieldKey="aiSummary" value={f('aiSummary')} sources={sources} onSave={saveField} type="textarea" />
              <FieldRow label="Coaching Notes" fieldKey="aiCoachingNotes" value={f('aiCoachingNotes')} sources={sources} onSave={saveField} type="textarea" />
              <FieldRow label="Recommended Approach" fieldKey="recommendedApproach" value={f('recommendedApproach')} sources={sources} onSave={saveField} type="textarea" />
              <FieldRow label="Last AI Analysis" fieldKey="lastAiAnalysisDate" value={fmtDate(data.lastAiAnalysisDate)} sources={sources} onSave={saveField} />
            </SectionCard>

            {(data.redFlags.length > 0 || data.positiveSignals.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.redFlags.length > 0 && (
                  <SectionCard title="Red Flags">
                    <div className="flex flex-wrap gap-1">
                      {data.redFlags.map((flag, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-red-50 text-red-700 text-[9px]">
                          {String(flag)}
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                )}
                {data.positiveSignals.length > 0 && (
                  <SectionCard title="Positive Signals">
                    <div className="flex flex-wrap gap-1">
                      {data.positiveSignals.map((sig, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-[9px]">
                          {String(sig)}
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Linked Properties (always visible) ────────── */}
        <div className="mt-6">
          <SectionCard title={`Linked Properties (${data.properties.length})`}>
            {data.properties.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-2">No linked properties</p>
            ) : (
              <div className="space-y-2">
                {data.properties.map(ps => (
                  <Link
                    key={ps.property.id}
                    href={`/${tenantSlug}/inventory/${ps.property.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-[rgba(0,0,0,0.06)] hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-[11px] font-medium text-gray-900">{ps.property.address}</p>
                        <p className="text-[10px] text-gray-500">{ps.property.city}, {ps.property.state}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {ps.isPrimary && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-indigo-100 text-indigo-700">Primary</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${STATUS_COLORS[ps.property.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ps.property.status.replace(/_/g, ' ')}
                      </span>
                      {ps.property.arv && (
                        <span className="text-[10px] text-gray-500">ARV {fmtMoney(ps.property.arv)}</span>
                      )}
                      {ps.property.assignedToName && (
                        <span className="text-[10px] text-gray-400">{ps.property.assignedToName}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
