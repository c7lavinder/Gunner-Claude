'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Mail, MapPin, ExternalLink, User,
  Target, BarChart3, MessageSquare, Sparkles, Check, Building2,
} from 'lucide-react'
import { formatPhone, titleCase } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────

interface LinkedPropertyStage {
  id: string
  stage: string
  property: {
    id: string
    address: string
    city: string
    state: string
    status: string
    arv: string | null
    askingPrice: string | null
  }
}

interface BuyerData {
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
  company: string | null
  mailingAddress: string | null
  mailingCity: string | null
  mailingState: string | null
  mailingZip: string | null
  website: string | null
  preferredContactMethod: string | null
  bestTimeToContact: string | null
  doNotContact: boolean
  isDeceased: boolean
  isActive: boolean
  ghlContactId: string | null
  // Buybox — Geographic
  primaryMarkets: string[]
  countiesOfInterest: string[]
  citiesOfInterest: string[]
  zipCodesOfInterest: string[]
  neighborhoodsOfInterest: string[]
  geographicExclusions: string[]
  maxDriveDistanceMiles: number | null
  urbanRuralPreference: string | null
  isNationalBuyer: boolean
  isOutOfStateBuyer: boolean
  // Buybox — Property
  propertyTypes: string[]
  minBeds: number | null
  maxBeds: number | null
  minBaths: number | null
  maxBaths: number | null
  minSqft: number | null
  maxSqft: number | null
  minLotSizeAcres: number | null
  maxLotSizeAcres: number | null
  yearBuiltMin: number | null
  conditionRange: Record<string, unknown>
  maxRepairBudget: string | null
  structuralIssuesOk: boolean | null
  foundationIssuesOk: boolean | null
  fireDamageOk: boolean | null
  moldOk: boolean | null
  hoarderOk: boolean | null
  tenantOccupiedOk: boolean | null
  prefersVacant: boolean | null
  basementRequired: boolean | null
  garageRequired: boolean | null
  poolOk: boolean | null
  hoaOk: boolean | null
  historicDistrictOk: boolean | null
  // Buybox — Financial
  minPurchasePrice: string | null
  maxPurchasePrice: string | null
  minArv: string | null
  maxArv: string | null
  maxArvPercent: number | null
  minEquityRequired: string | null
  maxAssignmentFeeAccepted: string | null
  minRoiRequired: number | null
  minCashFlowRequired: string | null
  rehabBudgetMin: string | null
  rehabBudgetMax: string | null
  fundingType: string | null
  proofOfFundsOnFile: boolean
  pofAmount: string | null
  pofExpiration: string | null
  hardMoneyLender: string | null
  typicalCloseTimelineDays: number | null
  canCloseAsIs: boolean | null
  emdAmountComfortable: string | null
  doubleCloseOk: boolean | null
  subjectToOk: boolean | null
  // Activity & Performance
  buyerSinceDate: string | null
  lastDealClosedDate: string | null
  totalDealsClosedWithUs: number
  totalDealsClosedOverall: number | null
  averageDealPrice: string | null
  averageSpreadAccepted: string | null
  averageCloseTimelineDays: number | null
  blastResponseRate: number | null
  offerRate: number | null
  closeRate: number | null
  dealsFallenThrough: number
  fallThroughReasons: string[]
  totalVolumeFromUs: string | null
  referralsGiven: number
  referralsConverted: number
  reliabilityScore: number | null
  communicationScore: number | null
  buyerGrade: string | null
  // Blast & Communication
  blastFrequency: string | null
  bestBlastDay: string | null
  bestBlastTime: string | null
  preferredBlastChannel: string | null
  unsubscribedFromEmail: boolean
  unsubscribedFromText: boolean
  emailOpenRate: number | null
  textResponseRate: number | null
  callAnswerRate: number | null
  lastCommunicationDate: string | null
  averageResponseTimeHours: number | null
  engagementTrend: string | null
  isGhost: boolean
  // Relationship
  assignedToId: string | null
  howAcquired: string | null
  referralSourceName: string | null
  relationshipStrength: string | null
  personalNotes: string | null
  birthday: string | null
  spouseName: string | null
  keyStaffNames: string[]
  lastInPersonMeeting: string | null
  isVip: boolean
  hasExclusivityAgreement: boolean
  // Strategy
  exitStrategies: string[]
  holdPeriodMonths: number | null
  targetTenantProfile: string | null
  propertyManagementCompany: string | null
  typicalRehabTimelineDays: number | null
  offMarketOnly: boolean
  is1031Active: boolean
  isOpportunityZoneInterest: boolean
  creativeFinanceInterest: boolean
  isSubjectToBuyer: boolean
  // AI
  buyerScore: number | null
  matchLikelihoodScore: number | null
  reliabilityPrediction: number | null
  communicationStyleAi: string | null
  negotiationStyle: string | null
  ghostRiskScore: number | null
  upsellPotential: number | null
  lifetimeValueEstimate: string | null
  aiSummary: string | null
  recommendedApproach: string | null
  redFlagsAi: string[]
  churnRisk: number | null
  lastAiAnalysisDate: string | null
  // General
  tags: string[]
  internalNotes: string | null
  priorityFlag: boolean
  customFields: Record<string, unknown>
  fieldSources: Record<string, string>
  propertyStages: LinkedPropertyStage[]
}

interface BuyerDetailClientProps {
  buyer: BuyerData
  tenantSlug: string
}

// ── Helpers ───────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
}

const STAGE_COLORS: Record<string, string> = {
  matched: 'bg-gray-100 text-gray-600',
  added: 'bg-sky-100 text-sky-700',
  responded: 'bg-amber-100 text-amber-700',
  interested: 'bg-green-100 text-green-700',
}

const STATUS_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-sky-100 text-sky-700',
  CONTACTED: 'bg-blue-100 text-blue-700',
  APPOINTMENT_SET: 'bg-yellow-100 text-yellow-700',
  OFFER_MADE: 'bg-purple-100 text-purple-700',
  UNDER_CONTRACT: 'bg-emerald-100 text-emerald-700',
  IN_DISPOSITION: 'bg-orange-100 text-orange-700',
  DISPO_PUSHED: 'bg-violet-100 text-violet-700',
  DISPO_OFFERS: 'bg-fuchsia-100 text-fuchsia-700',
  DISPO_CONTRACTED: 'bg-teal-100 text-teal-700',
  DISPO_CLOSED: 'bg-green-100 text-green-700',
  SOLD: 'bg-green-100 text-green-700',
  DEAD: 'bg-gray-100 text-gray-500',
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

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return '\u2014'
  return `${(val * 100).toFixed(0)}%`
}

function fmtDate(val: string | null): string {
  if (!val) return '\u2014'
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Field Row ──────────────────────────────────────────────

function FieldRow({
  label, fieldKey, value, sources, onSave, type = 'text',
}: {
  label: string
  fieldKey: string
  value: string
  sources: Record<string, string>
  onSave: (key: string, val: string) => void
  type?: 'text' | 'textarea'
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.04)]">
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ── Tag List (for JSON arrays like markets, exit strategies) ──

function TagList({ items, color = 'bg-gray-100 text-gray-700' }: { items: string[]; color?: string }) {
  if (!items.length) return <span className="text-[11px] text-gray-300">{'\u2014'}</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded text-[9px] font-medium ${color}`}>
          {String(item)}
        </span>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────

const TABS = ['Identity', 'Buybox', 'Activity', 'Communication', 'AI Insights'] as const
type Tab = typeof TABS[number]
const TAB_ICONS: Record<Tab, React.ReactNode> = {
  'Identity': <User className="w-3.5 h-3.5" />,
  'Buybox': <Target className="w-3.5 h-3.5" />,
  'Activity': <BarChart3 className="w-3.5 h-3.5" />,
  'Communication': <MessageSquare className="w-3.5 h-3.5" />,
  'AI Insights': <Sparkles className="w-3.5 h-3.5" />,
}

export function BuyerDetailClient({ buyer, tenantSlug }: BuyerDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Identity')
  const [data, setData] = useState(buyer)
  const [sources, setSources] = useState<Record<string, string>>(buyer.fieldSources)

  const saveField = useCallback(async (fieldKey: string, value: string) => {
    const body: Record<string, unknown> = { [fieldKey]: value || null }
    try {
      const res = await fetch(`/api/${tenantSlug}/buyers/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const json = await res.json()
        setSources(json.buyer.fieldSources ?? {})
        setData(prev => ({ ...prev, [fieldKey]: value || null }))
      }
    } catch {
      // silently fail
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
            {data.company && (
              <span className="text-[12px] text-gray-500">{data.company}</span>
            )}
            {data.buyerGrade && (
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${GRADE_COLORS[data.buyerGrade] ?? 'bg-gray-100 text-gray-600'}`}>
                Grade {data.buyerGrade}
              </span>
            )}
            {data.isVip && (
              <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">VIP</span>
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
              <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">DNC</span>
            )}
            {data.isGhost && (
              <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-gray-200 text-gray-600">Ghost</span>
            )}
          </div>

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
            {data.blastResponseRate !== null && (
              <span>Blast Response: {fmtPct(data.blastResponseRate)}</span>
            )}
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {data.totalDealsClosedWithUs} Deals Closed
            </span>
            <span>{data.propertyStages.length} Active {data.propertyStages.length === 1 ? 'Deal' : 'Deals'}</span>
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
            <SectionCard title="Contact Information">
              <FieldRow label="Phone" fieldKey="phone" value={formatPhone(data.phone)} sources={sources} onSave={saveField} />
              <FieldRow label="Secondary Phone" fieldKey="secondaryPhone" value={formatPhone(data.secondaryPhone)} sources={sources} onSave={saveField} />
              <FieldRow label="Mobile" fieldKey="mobilePhone" value={formatPhone(data.mobilePhone)} sources={sources} onSave={saveField} />
              <FieldRow label="Email" fieldKey="email" value={f('email')} sources={sources} onSave={saveField} />
              <FieldRow label="Secondary Email" fieldKey="secondaryEmail" value={f('secondaryEmail')} sources={sources} onSave={saveField} />
              <FieldRow label="Company" fieldKey="company" value={f('company')} sources={sources} onSave={saveField} />
              <FieldRow label="Website" fieldKey="website" value={f('website')} sources={sources} onSave={saveField} />
              <FieldRow label="Preferred Contact" fieldKey="preferredContactMethod" value={f('preferredContactMethod')} sources={sources} onSave={saveField} />
              <FieldRow label="Best Time" fieldKey="bestTimeToContact" value={f('bestTimeToContact')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Mailing Address">
              <FieldRow label="Street" fieldKey="mailingAddress" value={f('mailingAddress')} sources={sources} onSave={saveField} />
              <FieldRow label="City" fieldKey="mailingCity" value={f('mailingCity')} sources={sources} onSave={saveField} />
              <FieldRow label="State" fieldKey="mailingState" value={f('mailingState')} sources={sources} onSave={saveField} />
              <FieldRow label="Zip" fieldKey="mailingZip" value={f('mailingZip')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Relationship">
              <FieldRow label="How Acquired" fieldKey="howAcquired" value={f('howAcquired')} sources={sources} onSave={saveField} />
              <FieldRow label="Referral Source" fieldKey="referralSourceName" value={f('referralSourceName')} sources={sources} onSave={saveField} />
              <FieldRow label="Relationship Strength" fieldKey="relationshipStrength" value={f('relationshipStrength')} sources={sources} onSave={saveField} />
              <FieldRow label="VIP" fieldKey="isVip" value={fmtBool(data.isVip)} sources={sources} onSave={saveField} />
              <FieldRow label="Exclusivity Agreement" fieldKey="hasExclusivityAgreement" value={fmtBool(data.hasExclusivityAgreement)} sources={sources} onSave={saveField} />
              <FieldRow label="Spouse" fieldKey="spouseName" value={f('spouseName')} sources={sources} onSave={saveField} />
              <FieldRow label="Birthday" fieldKey="birthday" value={fmtDate(data.birthday)} sources={sources} onSave={saveField} />
              <FieldRow label="Last In-Person Meeting" fieldKey="lastInPersonMeeting" value={fmtDate(data.lastInPersonMeeting)} sources={sources} onSave={saveField} />
              <FieldRow label="Personal Notes" fieldKey="personalNotes" value={f('personalNotes')} sources={sources} onSave={saveField} type="textarea" />
            </SectionCard>

            <SectionCard title="Strategy & Preferences">
              <div className="py-1.5 px-2">
                <span className="text-[10px] text-gray-500 block mb-1">Exit Strategies</span>
                <TagList items={data.exitStrategies} color="bg-indigo-100 text-indigo-700" />
              </div>
              <FieldRow label="Hold Period (months)" fieldKey="holdPeriodMonths" value={f('holdPeriodMonths')} sources={sources} onSave={saveField} />
              <FieldRow label="Rehab Timeline (days)" fieldKey="typicalRehabTimelineDays" value={f('typicalRehabTimelineDays')} sources={sources} onSave={saveField} />
              <FieldRow label="PM Company" fieldKey="propertyManagementCompany" value={f('propertyManagementCompany')} sources={sources} onSave={saveField} />
              <FieldRow label="Off-Market Only" fieldKey="offMarketOnly" value={fmtBool(data.offMarketOnly)} sources={sources} onSave={saveField} />
              <FieldRow label="1031 Active" fieldKey="is1031Active" value={fmtBool(data.is1031Active)} sources={sources} onSave={saveField} />
              <FieldRow label="Opportunity Zone" fieldKey="isOpportunityZoneInterest" value={fmtBool(data.isOpportunityZoneInterest)} sources={sources} onSave={saveField} />
              <FieldRow label="Creative Finance" fieldKey="creativeFinanceInterest" value={fmtBool(data.creativeFinanceInterest)} sources={sources} onSave={saveField} />
              <FieldRow label="Subject-To Buyer" fieldKey="isSubjectToBuyer" value={fmtBool(data.isSubjectToBuyer)} sources={sources} onSave={saveField} />
              <FieldRow label="Target Tenant Profile" fieldKey="targetTenantProfile" value={f('targetTenantProfile')} sources={sources} onSave={saveField} type="textarea" />
            </SectionCard>

            <SectionCard title="Notes">
              <FieldRow label="Internal Notes" fieldKey="internalNotes" value={f('internalNotes')} sources={sources} onSave={saveField} type="textarea" />
            </SectionCard>
          </>
        )}

        {activeTab === 'Buybox' && (
          <>
            <SectionCard title="Geographic Preferences">
              <div className="py-1.5 px-2">
                <span className="text-[10px] text-gray-500 block mb-1">Primary Markets</span>
                <TagList items={data.primaryMarkets} color="bg-blue-100 text-blue-700" />
              </div>
              <div className="py-1.5 px-2">
                <span className="text-[10px] text-gray-500 block mb-1">Counties</span>
                <TagList items={data.countiesOfInterest} />
              </div>
              <div className="py-1.5 px-2">
                <span className="text-[10px] text-gray-500 block mb-1">Cities</span>
                <TagList items={data.citiesOfInterest} />
              </div>
              <div className="py-1.5 px-2">
                <span className="text-[10px] text-gray-500 block mb-1">Zip Codes</span>
                <TagList items={data.zipCodesOfInterest} />
              </div>
              <div className="py-1.5 px-2">
                <span className="text-[10px] text-gray-500 block mb-1">Exclusions</span>
                <TagList items={data.geographicExclusions} color="bg-red-50 text-red-600" />
              </div>
              <FieldRow label="Max Drive Distance" fieldKey="maxDriveDistanceMiles" value={data.maxDriveDistanceMiles ? `${data.maxDriveDistanceMiles} mi` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Urban/Rural Pref" fieldKey="urbanRuralPreference" value={f('urbanRuralPreference')} sources={sources} onSave={saveField} />
              <FieldRow label="National Buyer" fieldKey="isNationalBuyer" value={fmtBool(data.isNationalBuyer)} sources={sources} onSave={saveField} />
              <FieldRow label="Out-of-State" fieldKey="isOutOfStateBuyer" value={fmtBool(data.isOutOfStateBuyer)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Property Criteria">
              <div className="py-1.5 px-2">
                <span className="text-[10px] text-gray-500 block mb-1">Property Types</span>
                <TagList items={data.propertyTypes} color="bg-violet-100 text-violet-700" />
              </div>
              <FieldRow label="Beds" fieldKey="minBeds" value={data.minBeds !== null || data.maxBeds !== null ? `${data.minBeds ?? '?'} - ${data.maxBeds ?? '?'}` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Baths" fieldKey="minBaths" value={data.minBaths !== null || data.maxBaths !== null ? `${data.minBaths ?? '?'} - ${data.maxBaths ?? '?'}` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Sqft" fieldKey="minSqft" value={data.minSqft !== null || data.maxSqft !== null ? `${data.minSqft?.toLocaleString() ?? '?'} - ${data.maxSqft?.toLocaleString() ?? '?'}` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Lot Size (acres)" fieldKey="minLotSizeAcres" value={data.minLotSizeAcres !== null || data.maxLotSizeAcres !== null ? `${data.minLotSizeAcres ?? '?'} - ${data.maxLotSizeAcres ?? '?'}` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Year Built Min" fieldKey="yearBuiltMin" value={f('yearBuiltMin')} sources={sources} onSave={saveField} />
              <FieldRow label="Max Repair Budget" fieldKey="maxRepairBudget" value={fmtMoney(data.maxRepairBudget)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Condition Tolerance">
              <FieldRow label="Structural Issues OK" fieldKey="structuralIssuesOk" value={fmtBool(data.structuralIssuesOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Foundation Issues OK" fieldKey="foundationIssuesOk" value={fmtBool(data.foundationIssuesOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Fire Damage OK" fieldKey="fireDamageOk" value={fmtBool(data.fireDamageOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Mold OK" fieldKey="moldOk" value={fmtBool(data.moldOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Hoarder OK" fieldKey="hoarderOk" value={fmtBool(data.hoarderOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Tenant Occupied OK" fieldKey="tenantOccupiedOk" value={fmtBool(data.tenantOccupiedOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Prefers Vacant" fieldKey="prefersVacant" value={fmtBool(data.prefersVacant)} sources={sources} onSave={saveField} />
              <FieldRow label="Basement Required" fieldKey="basementRequired" value={fmtBool(data.basementRequired)} sources={sources} onSave={saveField} />
              <FieldRow label="Garage Required" fieldKey="garageRequired" value={fmtBool(data.garageRequired)} sources={sources} onSave={saveField} />
              <FieldRow label="Pool OK" fieldKey="poolOk" value={fmtBool(data.poolOk)} sources={sources} onSave={saveField} />
              <FieldRow label="HOA OK" fieldKey="hoaOk" value={fmtBool(data.hoaOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Historic District OK" fieldKey="historicDistrictOk" value={fmtBool(data.historicDistrictOk)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Financial Parameters">
              <FieldRow label="Purchase Range" fieldKey="minPurchasePrice" value={data.minPurchasePrice || data.maxPurchasePrice ? `${fmtMoney(data.minPurchasePrice)} - ${fmtMoney(data.maxPurchasePrice)}` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="ARV Range" fieldKey="minArv" value={data.minArv || data.maxArv ? `${fmtMoney(data.minArv)} - ${fmtMoney(data.maxArv)}` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Max ARV %" fieldKey="maxArvPercent" value={data.maxArvPercent !== null ? `${data.maxArvPercent}%` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Min Equity Required" fieldKey="minEquityRequired" value={fmtMoney(data.minEquityRequired)} sources={sources} onSave={saveField} />
              <FieldRow label="Max Assignment Fee" fieldKey="maxAssignmentFeeAccepted" value={fmtMoney(data.maxAssignmentFeeAccepted)} sources={sources} onSave={saveField} />
              <FieldRow label="Min ROI Required" fieldKey="minRoiRequired" value={data.minRoiRequired !== null ? `${data.minRoiRequired}%` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Min Cash Flow" fieldKey="minCashFlowRequired" value={fmtMoney(data.minCashFlowRequired)} sources={sources} onSave={saveField} />
              <FieldRow label="Rehab Budget" fieldKey="rehabBudgetMin" value={data.rehabBudgetMin || data.rehabBudgetMax ? `${fmtMoney(data.rehabBudgetMin)} - ${fmtMoney(data.rehabBudgetMax)}` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Funding Type" fieldKey="fundingType" value={f('fundingType')} sources={sources} onSave={saveField} />
              <FieldRow label="Proof of Funds" fieldKey="proofOfFundsOnFile" value={fmtBool(data.proofOfFundsOnFile)} sources={sources} onSave={saveField} />
              <FieldRow label="POF Amount" fieldKey="pofAmount" value={fmtMoney(data.pofAmount)} sources={sources} onSave={saveField} />
              <FieldRow label="POF Expiration" fieldKey="pofExpiration" value={fmtDate(data.pofExpiration)} sources={sources} onSave={saveField} />
              <FieldRow label="Hard Money Lender" fieldKey="hardMoneyLender" value={f('hardMoneyLender')} sources={sources} onSave={saveField} />
              <FieldRow label="Typical Close (days)" fieldKey="typicalCloseTimelineDays" value={f('typicalCloseTimelineDays')} sources={sources} onSave={saveField} />
              <FieldRow label="Can Close As-Is" fieldKey="canCloseAsIs" value={fmtBool(data.canCloseAsIs)} sources={sources} onSave={saveField} />
              <FieldRow label="EMD Comfortable" fieldKey="emdAmountComfortable" value={fmtMoney(data.emdAmountComfortable)} sources={sources} onSave={saveField} />
              <FieldRow label="Double Close OK" fieldKey="doubleCloseOk" value={fmtBool(data.doubleCloseOk)} sources={sources} onSave={saveField} />
              <FieldRow label="Subject-To OK" fieldKey="subjectToOk" value={fmtBool(data.subjectToOk)} sources={sources} onSave={saveField} />
            </SectionCard>
          </>
        )}

        {activeTab === 'Activity' && (
          <>
            <SectionCard title="Performance">
              <FieldRow label="Buyer Grade" fieldKey="buyerGrade" value={f('buyerGrade')} sources={sources} onSave={saveField} />
              <FieldRow label="Buyer Since" fieldKey="buyerSinceDate" value={fmtDate(data.buyerSinceDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Last Deal Closed" fieldKey="lastDealClosedDate" value={fmtDate(data.lastDealClosedDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Deals Closed (Us)" fieldKey="totalDealsClosedWithUs" value={String(data.totalDealsClosedWithUs)} sources={sources} onSave={saveField} />
              <FieldRow label="Deals Closed (Total)" fieldKey="totalDealsClosedOverall" value={f('totalDealsClosedOverall')} sources={sources} onSave={saveField} />
              <FieldRow label="Avg Deal Price" fieldKey="averageDealPrice" value={fmtMoney(data.averageDealPrice)} sources={sources} onSave={saveField} />
              <FieldRow label="Avg Spread Accepted" fieldKey="averageSpreadAccepted" value={fmtMoney(data.averageSpreadAccepted)} sources={sources} onSave={saveField} />
              <FieldRow label="Avg Close Time (days)" fieldKey="averageCloseTimelineDays" value={f('averageCloseTimelineDays')} sources={sources} onSave={saveField} />
              <FieldRow label="Total Volume (Us)" fieldKey="totalVolumeFromUs" value={fmtMoney(data.totalVolumeFromUs)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Conversion Rates">
              <FieldRow label="Blast Response Rate" fieldKey="blastResponseRate" value={fmtPct(data.blastResponseRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Offer Rate" fieldKey="offerRate" value={fmtPct(data.offerRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Close Rate" fieldKey="closeRate" value={fmtPct(data.closeRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Reliability Score" fieldKey="reliabilityScore" value={data.reliabilityScore !== null ? data.reliabilityScore.toFixed(1) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Communication Score" fieldKey="communicationScore" value={data.communicationScore !== null ? data.communicationScore.toFixed(1) : '\u2014'} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Issues & Referrals">
              <FieldRow label="Deals Fallen Through" fieldKey="dealsFallenThrough" value={String(data.dealsFallenThrough)} sources={sources} onSave={saveField} />
              {data.fallThroughReasons.length > 0 && (
                <div className="py-1.5 px-2">
                  <span className="text-[10px] text-gray-500 block mb-1">Fall-through Reasons</span>
                  <TagList items={data.fallThroughReasons} color="bg-red-50 text-red-600" />
                </div>
              )}
              <FieldRow label="Referrals Given" fieldKey="referralsGiven" value={String(data.referralsGiven)} sources={sources} onSave={saveField} />
              <FieldRow label="Referrals Converted" fieldKey="referralsConverted" value={String(data.referralsConverted)} sources={sources} onSave={saveField} />
            </SectionCard>
          </>
        )}

        {activeTab === 'Communication' && (
          <>
            <SectionCard title="Blast Preferences">
              <FieldRow label="Frequency" fieldKey="blastFrequency" value={f('blastFrequency')} sources={sources} onSave={saveField} />
              <FieldRow label="Best Day" fieldKey="bestBlastDay" value={f('bestBlastDay')} sources={sources} onSave={saveField} />
              <FieldRow label="Best Time" fieldKey="bestBlastTime" value={f('bestBlastTime')} sources={sources} onSave={saveField} />
              <FieldRow label="Preferred Channel" fieldKey="preferredBlastChannel" value={f('preferredBlastChannel')} sources={sources} onSave={saveField} />
              <FieldRow label="Unsubscribed Email" fieldKey="unsubscribedFromEmail" value={fmtBool(data.unsubscribedFromEmail)} sources={sources} onSave={saveField} />
              <FieldRow label="Unsubscribed Text" fieldKey="unsubscribedFromText" value={fmtBool(data.unsubscribedFromText)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Engagement Metrics">
              <FieldRow label="Email Open Rate" fieldKey="emailOpenRate" value={fmtPct(data.emailOpenRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Text Response Rate" fieldKey="textResponseRate" value={fmtPct(data.textResponseRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Call Answer Rate" fieldKey="callAnswerRate" value={fmtPct(data.callAnswerRate)} sources={sources} onSave={saveField} />
              <FieldRow label="Avg Response Time (hrs)" fieldKey="averageResponseTimeHours" value={data.averageResponseTimeHours !== null ? `${data.averageResponseTimeHours.toFixed(1)}h` : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Engagement Trend" fieldKey="engagementTrend" value={f('engagementTrend')} sources={sources} onSave={saveField} />
              <FieldRow label="Last Communication" fieldKey="lastCommunicationDate" value={fmtDate(data.lastCommunicationDate)} sources={sources} onSave={saveField} />
              <FieldRow label="Ghost" fieldKey="isGhost" value={fmtBool(data.isGhost)} sources={sources} onSave={saveField} />
            </SectionCard>
          </>
        )}

        {activeTab === 'AI Insights' && (
          <>
            <SectionCard title="AI Scores">
              <FieldRow label="Buyer Score" fieldKey="buyerScore" value={data.buyerScore !== null ? data.buyerScore.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Match Likelihood" fieldKey="matchLikelihoodScore" value={data.matchLikelihoodScore !== null ? data.matchLikelihoodScore.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Reliability Prediction" fieldKey="reliabilityPrediction" value={data.reliabilityPrediction !== null ? data.reliabilityPrediction.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Ghost Risk" fieldKey="ghostRiskScore" value={data.ghostRiskScore !== null ? data.ghostRiskScore.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Upsell Potential" fieldKey="upsellPotential" value={data.upsellPotential !== null ? data.upsellPotential.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Churn Risk" fieldKey="churnRisk" value={data.churnRisk !== null ? data.churnRisk.toFixed(2) : '\u2014'} sources={sources} onSave={saveField} />
              <FieldRow label="Lifetime Value Est" fieldKey="lifetimeValueEstimate" value={fmtMoney(data.lifetimeValueEstimate)} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="Communication & Negotiation">
              <FieldRow label="Communication Style" fieldKey="communicationStyleAi" value={f('communicationStyleAi')} sources={sources} onSave={saveField} />
              <FieldRow label="Negotiation Style" fieldKey="negotiationStyle" value={f('negotiationStyle')} sources={sources} onSave={saveField} />
            </SectionCard>

            <SectionCard title="AI Summary & Approach">
              <FieldRow label="AI Summary" fieldKey="aiSummary" value={f('aiSummary')} sources={sources} onSave={saveField} type="textarea" />
              <FieldRow label="Recommended Approach" fieldKey="recommendedApproach" value={f('recommendedApproach')} sources={sources} onSave={saveField} type="textarea" />
              <FieldRow label="Last AI Analysis" fieldKey="lastAiAnalysisDate" value={fmtDate(data.lastAiAnalysisDate)} sources={sources} onSave={saveField} />
            </SectionCard>

            {data.redFlagsAi.length > 0 && (
              <SectionCard title="Red Flags">
                <div className="flex flex-wrap gap-1">
                  {data.redFlagsAi.map((flag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-red-50 text-red-700 text-[9px]">
                      {String(flag)}
                    </span>
                  ))}
                </div>
              </SectionCard>
            )}
          </>
        )}

        {/* ── Active Deals (always visible) ─────────────── */}
        <div className="mt-6">
          <SectionCard title={`Active Deals (${data.propertyStages.length})`}>
            {data.propertyStages.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-2">No active deals</p>
            ) : (
              <div className="space-y-2">
                {data.propertyStages.map(ps => (
                  <Link
                    key={ps.id}
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
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${STAGE_COLORS[ps.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                        {titleCase(ps.stage)}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${STATUS_COLORS[ps.property.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ps.property.status.replace(/_/g, ' ')}
                      </span>
                      {ps.property.arv && (
                        <span className="text-[10px] text-gray-500">ARV {fmtMoney(ps.property.arv)}</span>
                      )}
                      {ps.property.askingPrice && (
                        <span className="text-[10px] text-gray-400">Ask {fmtMoney(ps.property.askingPrice)}</span>
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
