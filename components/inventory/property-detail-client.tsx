'use client'
// components/inventory/property-detail-client.tsx
// Full property detail page with 4 tabs (Overview · Activity · Data · Disposition)

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, CheckSquare, User, MapPin, ExternalLink, Copy,
  MessageSquare, FileText, ChevronRight, ChevronLeft, Zap, Pencil, Check,
  DollarSign, Bot, Send, Clock, Plus, Loader2,
  Home, Search as SearchIcon, Users, Activity, Sparkles, Megaphone, X, AlertTriangle, Calendar,
  Briefcase,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import { formatPhone, titleCase } from '@/lib/format'
import { STATUS_TO_APP_STAGE, APP_STAGE_LABELS, APP_STAGE_BADGE_COLORS } from '@/types/property'
import type { AppStage } from '@/types/property'
import { FloatingDropdown } from '@/components/ui/FloatingDropdown'
import { ContactsPanel } from '@/components/inventory/contacts-panel'
import { DispositionJourney } from '@/components/disposition/journey/disposition-journey'

const GHL_STAGE_COLORS: Record<string, string> = {
  'New Lead (1)': 'bg-sky-100 text-sky-700',
  'Warm Leads(2)': 'bg-orange-100 text-orange-700',
  'Hot Leads(2)': 'bg-red-100 text-red-700',
  'Pending Apt(3)': 'bg-yellow-100 text-yellow-700',
  'Walkthrough Apt Scheduled': 'bg-amber-100 text-amber-700',
  'Offer Apt Scheduled (3)': 'bg-lime-100 text-lime-700',
  'Made Offer (4)': 'bg-purple-100 text-purple-700',
  'Under Contract (5)': 'bg-emerald-100 text-emerald-700',
  'Purchased (6)': 'bg-green-100 text-green-700',
}
const STAGE_DISPLAY_NAMES: Record<string, string> = {
  'New Lead (1)': 'New Lead', 'Warm Leads(2)': 'Warm Lead', 'Hot Leads(2)': 'Hot Lead',
  'Pending Apt(3)': 'Pending Apt', 'Pending Apt (3)': 'Pending Apt',
  'Walkthrough Apt Scheduled': 'Walkthrough', 'Walkthrough Apt Scheduled (3)': 'Walkthrough',
  'Offer Apt Scheduled (3)': 'Offer Apt', 'Offer Apt Scheduled(3)': 'Offer Apt',
  'Made Offer (4)': 'Made Offer', 'Under Contract (5)': 'Under Contract', 'Purchased (6)': 'Purchased',
  '1 Month Follow Up': '1 Month', '4 Month Follow Up': '4 Month', '1 Year Follow Up': '1 Year',
}
function cleanStageName(raw: string): string {
  if (STAGE_DISPLAY_NAMES[raw]) return STAGE_DISPLAY_NAMES[raw]
  return raw.replace(/\s*\(\d+\)\s*/g, '').replace(/\s+/g, ' ').trim()
}
const SOURCE_COLORS: Record<string, string> = {
  'PPL': 'bg-violet-100 text-violet-700',
  'PPC': 'bg-sky-100 text-sky-700',
  'Texts': 'bg-cyan-100 text-cyan-700',
  'Form': 'bg-rose-100 text-rose-700',
  'Dialer': 'bg-orange-100 text-orange-700',
  'Cold Call': 'bg-orange-100 text-orange-700',
  'Direct Mail': 'bg-pink-100 text-pink-700',
  'Referral': 'bg-green-100 text-green-700',
}
const MARKET_COLORS: Record<string, string> = {
  'Nashville': 'bg-red-100 text-red-700',
  'Columbia': 'bg-teal-100 text-teal-700',
  'Knoxville': 'bg-indigo-100 text-indigo-700',
  'Chattanooga': 'bg-amber-100 text-amber-700',
  'Global': 'bg-gray-100 text-gray-600',
}

export interface PropertyDetail {
  id: string; address: string; city: string; state: string; zip: string; status: string
  arv: string | null; askingPrice: string | null; mao: string | null
  contractPrice: string | null; assignmentFee: string | null
  offerPrice: string | null; repairCost: string | null; wholesalePrice: string | null
  currentOffer: string | null; highestOffer: string | null; acceptedPrice: string | null; finalProfit: string | null
  fieldSources: Record<string, string>
  ghlContactId: string | null; createdAt: string
  beds: number | null; baths: number | null; sqft: number | null
  yearBuilt: number | null; lotSize: string | null
  propertyType: string | null; occupancy: string | null; lockboxCode: string | null
  waterType: string | null; waterNotes: string | null
  sewerType: string | null; sewerCondition: string | null; sewerNotes: string | null
  electricType: string | null; electricNotes: string | null
  marketName: string | null
  projectType: string[]; propertyMarkets: string[]
  description: string | null; internalNotes: string | null
  // Deal Intel
  propertyCondition: string | null
  lastOfferDate: string | null; lastContactedDate: string | null
  // AI enrichment fields
  repairEstimate: string | null; rentalEstimate: string | null
  constructionEstimate: string | null
  neighborhoodSummary: string | null; zestimate: string | null
  floodZone: string | null
  taxAssessment: string | null; annualTax: string | null
  aiEnrichmentStatus: string | null
  // Deal Blast overrides
  dealBlastAskingOverride: string | null; dealBlastArvOverride: string | null
  dealBlastContractOverride: string | null; dealBlastAssignmentFeeOverride: string | null
  // Alt offer types — Cash lives in askingPrice/mao/contractPrice/etc.
  offerTypes: string[]
  altPrices: Record<string, Record<string, string | null>>
  // Property Story — AI-generated narrative
  story: string | null
  storyUpdatedAt: string | null
  storyVersion: number
  // Risk factor — Cash-tab value; alt values live in altPrices[type].riskFactor
  riskFactor: string | null
  // Condition + intangibles + location/market — free-form strings
  roofCondition: string | null
  windowsCondition: string | null
  sidingCondition: string | null
  exteriorCondition: string | null
  comparableRisk: string | null
  basementStatus: string | null
  curbAppeal: string | null
  neighborsGrade: string | null
  parkingType: string | null
  yardGrade: string | null
  locationGrade: string | null
  marketRisk: string | null
  // Vendor distress + MLS (PropertyRadar + BatchData)
  distressScore: number | null
  preForeclosure: boolean | null
  bankOwned: boolean | null
  inBankruptcy: boolean | null
  inProbate: boolean | null
  inDivorce: boolean | null
  hasRecentEviction: boolean | null
  taxDelinquent: boolean | null
  foreclosureStatus: string | null
  mlsActive: boolean | null
  mlsPending: boolean | null
  mlsSold: boolean | null
  mlsStatus: string | null
  mlsType: string | null
  mlsListingDate: string | null
  mlsListingPrice: string | null
  mlsSoldPrice: string | null
  mlsDaysOnMarket: number | null
  mlsPricePerSqft: string | null
  mlsKeywords: string[]
  lastMlsStatus: string | null
  lastMlsListPrice: string | null
  lastMlsSoldPrice: string | null
  // Google Places
  googlePlaceId: string | null
  googleVerifiedAddress: string | null
  googleStreetViewUrl: string | null
  googlePhotoThumbnailUrl: string | null
  googleMapsUrl: string | null
  // Comprehensive vendor capture (20260423060000)
  addressValidity: string | null
  zipPlus4: string | null
  salePropensity: string | null
  salePropensityCategory: string | null
  listingStatus: string | null
  listingFailedDate: string | null
  listingOriginalDate: string | null
  listingSoldPrice: string | null
  listingSoldDate: string | null
  listingAgentName: string | null
  listingAgentPhone: string | null
  listingBrokerName: string | null
  foreclosureAuctionCity: string | null
  foreclosureAuctionLocation: string | null
  foreclosureAuctionTime: string | null
  foreclosureBorrower: string | null
  foreclosureDocumentType: string | null
  foreclosureFilingDate: string | null
  foreclosureRecordingDate: string | null
  foreclosureTrusteeName: string | null
  foreclosureTrusteePhone: string | null
  foreclosureTrusteeAddress: string | null
  foreclosureTrusteeSaleNum: string | null
  // v1.1 Wave 5 — ownerPortfolio* / seniorOwner / deceasedOwner /
  // cashBuyerOwner stripped from Property; render-side reads come from
  // property.sellers[0]'s seller copy of these (the canonical home).
  absenteeOwnerInState: boolean | null
  samePropertyMailing: boolean | null
  valuationAsOfDate: string | null
  valuationConfidence: number | null
  advancedPropertyType: string | null
  lotDepthFootage: number | null
  hasOpenLiens: boolean | null
  hasOpenPersonLiens: boolean | null
  underwater: boolean | null
  expiredListing: boolean | null
  deedHistoryJson: Array<Record<string, unknown>> | null
  mortgageHistoryJson: Array<Record<string, unknown>> | null
  liensJson: Array<Record<string, unknown>> | null
  sellers: Array<{
    id: string; name: string; phone: string | null; email: string | null
    isPrimary: boolean; role: string; ghlContactId: string | null
    // v1.1 Wave 3 Phase B — backfilled fields from linked Seller.
    firstName: string | null; middleName: string | null
    lastName: string | null; nameSuffix: string | null
    skipTracedPhone: string | null; skipTracedEmail: string | null
    skipTracedMailingAddress: string | null; skipTracedMailingCity: string | null
    skipTracedMailingState: string | null; skipTracedMailingZip: string | null
    seniorOwner: boolean | null; deceasedOwner: boolean | null; cashBuyerOwner: boolean | null
    totalPropertiesOwned: number
    ownerPortfolioTotalEquity: string | null
    ownerPortfolioTotalValue: string | null
    ownerPortfolioAvgYearBuilt: number | null
    motivationPrimary: string | null; motivationScore: number | null
    likelihoodToSellScore: number | null; urgencyLevel: string | null
    lastContactDate: string | null; totalCallCount: number
    doNotContact: boolean; isDeceased: boolean
  }>
  assignedTo: { id: string; name: string; role: string } | null
  calls: Array<{
    id: string; score: number | null; gradingStatus: string; direction: string
    callType: string | null; durationSeconds: number | null; calledAt: string | null
    aiSummary: string | null; assignedToName: string | null
  }>
  tasks: Array<{ id: string; title: string; category: string | null; priority: string; status: string; dueAt: string | null }>
  auditLogs: Array<{ id: string; action: string; payload: Record<string, unknown> | null; createdAt: string; userName: string }>
  leadSource: string | null
  ghlStageName: string | null
  milestones: Array<{ id?: string; type: string; date: string; notes: string | null; source?: string; loggedById?: string | null; loggedByName?: string | null }>
  dispoStatus: string | null
  teamMembers: Array<{ id: string; name: string }>
  messages: Array<{ id: string; text: string; mentions: Array<{ id: string; name: string }>; userId: string | null; userName: string; createdAt: string }>
  // v1.1 Session 67 Phase 2 — Partners on this deal (agents, wholesalers,
  // attorneys, etc). Loaded by app/(tenant)/[tenant]/inventory/[propertyId]/page.tsx
  // and rendered by the Partners tab. See components/inventory/partners-tab.tsx.
  partners: Array<{
    id: string; name: string
    phone: string | null; email: string | null; company: string | null
    ghlContactId: string | null
    types: string[]
    partnerGrade: string | null; tierClassification: string | null
    role: string
    commissionPercent: number | null
    commissionAmount: string | null
    purchasePrice: string | null
    assignmentFeePaid: string | null
    notesOnThisDeal: string | null
  }>
}

// Timezone abbreviation for display (e.g. "CST", "EST")
const TZ_ABBR = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''

type TabKey = 'overview' | 'activity' | 'data' | 'disposition'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: 'overview',    label: 'Overview',    icon: Home },
  { key: 'activity',    label: 'Activity',    icon: Activity },
  { key: 'data',        label: 'Data',        icon: SearchIcon },
  // The Disposition tab mounts the 5-section <DispositionJourney> — it
  // replaces the prior Sellers / Buyers / Partners / Outreach / Deal
  // Blast tabs, which collapsed into Section 2-5 of the journey + the
  // <ContactsPanel> shown at the top of Overview and Data tabs.
  { key: 'disposition', label: 'Disposition', icon: Megaphone },
]

export function PropertyDetailClient({
  property, tenantSlug, canEdit, canManage, ghlContactId, ghlLocationId, projectTypeOptions,
}: {
  property: PropertyDetail
  tenantSlug: string
  canEdit: boolean
  canManage: boolean
  ghlContactId: string | null
  ghlLocationId?: string
  projectTypeOptions?: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams?.get('tab') as TabKey) || 'overview'
  const validInitialTab: TabKey =
    initialTab === 'overview' || initialTab === 'activity' ||
    initialTab === 'data' || initialTab === 'disposition'
      ? initialTab : 'overview'
  const [activeTab, setActiveTab] = useState<TabKey>(validInitialTab)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const { toast } = useToast()
  const [actionMsg, setActionMsg] = useState('')

  // ── Shared editable state (lifted from OverviewTab) ─────────────────────────
  // Lifted so the Property Details panel can render above the tab bar and stay
  // in sync with the Overview-tab price matrix cards. Any field the user edits
  // in the panel (arv / construction / mao / price) is reflected immediately in
  // the Overview pricing rows, and vice-versa, because both views read from the
  // same vals / sources / altPrices / offerTypes state below.
  const [vals, setVals] = useState({
    askingPrice: property.askingPrice,
    mao: property.mao,
    currentOffer: property.currentOffer,
    contractPrice: property.contractPrice,
    highestOffer: property.highestOffer,
    acceptedPrice: property.acceptedPrice,
    assignmentFee: property.assignmentFee,
    finalProfit: property.finalProfit,
    beds: property.beds,
    baths: property.baths,
    sqft: property.sqft,
    yearBuilt: property.yearBuilt,
    lotSize: property.lotSize,
    propertyType: property.propertyType,
    projectType: property.projectType,
    propertyMarkets: property.propertyMarkets,
    occupancy: property.occupancy,
    lockboxCode: property.lockboxCode,
    waterType: property.waterType,
    waterNotes: property.waterNotes,
    sewerType: property.sewerType,
    sewerCondition: property.sewerCondition,
    sewerNotes: property.sewerNotes,
    electricType: property.electricType,
    electricNotes: property.electricNotes,
    description: property.description,
    internalNotes: property.internalNotes,
    propertyCondition: property.propertyCondition,
    arv: property.arv,
    constructionEstimate: property.constructionEstimate,
    riskFactor: property.riskFactor,
    roofCondition: property.roofCondition,
    windowsCondition: property.windowsCondition,
    sidingCondition: property.sidingCondition,
    exteriorCondition: property.exteriorCondition,
    comparableRisk: property.comparableRisk,
    basementStatus: property.basementStatus,
    curbAppeal: property.curbAppeal,
    neighborsGrade: property.neighborsGrade,
    parkingType: property.parkingType,
    yardGrade: property.yardGrade,
    locationGrade: property.locationGrade,
    marketRisk: property.marketRisk,
  })
  const [sources, setSources] = useState<Record<string, string>>(property.fieldSources ?? {})
  const [offerTypes, setOfferTypes] = useState<string[]>(property.offerTypes ?? [])
  const [altPrices, setAltPrices] = useState<Record<string, Record<string, string | null>>>(property.altPrices ?? {})
  const isClosed = property.status === 'SOLD' || property.status === 'DISPO_CLOSED'

  // Auto-compute assignment fee + final profit on mount if inputs exist and
  // values are empty. Final profit only auto-populates once the deal is closed.
  useEffect(() => {
    const updates: Record<string, unknown> = {}
    const srcUpdates: Record<string, string> = {}
    if (!vals.assignmentFee && vals.acceptedPrice && vals.contractPrice) {
      const fee = Number(vals.acceptedPrice) - Number(vals.contractPrice)
      if (fee >= 0) { updates.assignmentFee = String(fee); srcUpdates.assignmentFee = 'ai' }
    }
    if (isClosed && !vals.finalProfit && property.arv && vals.contractPrice) {
      const repair = property.repairEstimate ? Number(property.repairEstimate) : 0
      const profit = Number(property.arv) - Number(vals.contractPrice) - repair
      updates.finalProfit = String(profit); srcUpdates.finalProfit = 'ai'
    }
    // Clear stale AI-generated finalProfit on non-closed deals
    if (!isClosed && vals.finalProfit && sources.finalProfit === 'ai') {
      updates.finalProfit = null
      srcUpdates.finalProfit = ''
    }
    if (Object.keys(updates).length > 0) {
      setVals(prev => ({ ...prev, ...updates }))
      setSources(prev => ({ ...prev, ...srcUpdates }))
      fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, fieldSources: srcUpdates }),
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleOfferTypesChange(next: string[]) {
    setOfferTypes(next)
    setAltPrices(prev => {
      const pruned: Record<string, Record<string, string | null>> = {}
      for (const t of next) if (prev[t]) pruned[t] = prev[t]
      return pruned
    })
  }

  function handleAltSaved(type: string, field: string, val: string | null) {
    setAltPrices(prev => {
      const next = { ...prev }
      const forType = { ...(next[type] ?? {}) }
      if (val == null || val === '') delete forType[field]
      else forType[field] = val
      if (Object.keys(forType).length > 0) next[type] = forType
      else delete next[type]
      return next
    })
  }

  function handleArraySaved(field: string, newVals: string[]) {
    setVals(prev => ({ ...prev, [field]: newVals }))
    setSources(prev => ({ ...prev, [field]: 'user' }))
  }

  function handleSaved(field: string, val: string | number | null, src?: string) {
    setVals(prev => {
      const next = { ...prev, [field]: val }
      // Auto-calc assignment fee when accepted/contract price changes
      if (field === 'acceptedPrice' && val && next.contractPrice && sources.assignmentFee !== 'user') {
        const fee = Number(val) - Number(next.contractPrice)
        if (fee >= 0) {
          next.assignmentFee = String(fee)
          fetch(`/api/properties/${property.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentFee: String(fee), fieldSources: { assignmentFee: 'ai' } }),
          }).catch(() => {})
          setSources(p => ({ ...p, assignmentFee: 'ai' }))
        }
      }
      if (field === 'contractPrice' && val && next.acceptedPrice && sources.assignmentFee !== 'user') {
        const fee = Number(next.acceptedPrice) - Number(val)
        if (fee >= 0) {
          next.assignmentFee = String(fee)
          fetch(`/api/properties/${property.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentFee: String(fee), fieldSources: { assignmentFee: 'ai' } }),
          }).catch(() => {})
          setSources(p => ({ ...p, assignmentFee: 'ai' }))
        }
      }
      // Auto-calc final profit once closed
      if (isClosed && ['contractPrice', 'arv'].includes(field) && sources.finalProfit !== 'user') {
        const arvVal = field === 'arv' ? val : property.arv
        const contractVal = field === 'contractPrice' ? val : next.contractPrice
        if (arvVal && contractVal) {
          const repair = property.repairEstimate ? Number(property.repairEstimate) : 0
          const profit = Number(arvVal) - Number(contractVal) - repair
          next.finalProfit = String(profit)
          fetch(`/api/properties/${property.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finalProfit: String(profit), fieldSources: { finalProfit: 'ai' } }),
          }).catch(() => {})
          setSources(p => ({ ...p, finalProfit: 'ai' }))
        }
      }
      return next
    })
    if (src !== undefined) {
      setSources(prev => {
        const next = { ...prev }
        if (src) next[field] = src; else delete next[field]
        return next
      })
    }
  }

  // Contact suggestion state
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0)
  const [suggestions, setSuggestions] = useState<Array<{
    id: string; fieldName: string; fieldLabel: string; targetType: string
    sellerId: string | null; buyerId: string | null
    currentValue: unknown; proposedValue: unknown; confidence: number | null
    evidence: string | null; status: string
  }>>([])
  const [showSuggestionModal, setShowSuggestionModal] = useState(false)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/properties/${property.id}/contact-suggestions`)
      .then(r => r.json())
      .then(d => {
        setPendingSuggestionCount(d.total ?? 0)
        setSuggestions(d.suggestions ?? [])
      })
      .catch(() => {})
  }, [property.id, tenantSlug])

  const appStage = STATUS_TO_APP_STAGE[property.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const dom = Math.floor((Date.now() - new Date(property.createdAt).getTime()) / 86400000)
  const domColor = dom <= 7 ? 'text-green-600' : dom <= 30 ? 'text-amber-500' : 'text-red-600'


  async function runGhlAction(type: string, payload: Record<string, string>) {
    if (!ghlContactId) return setActionMsg('No GHL contact linked')
    setSending(true)
    try {
      const res = await fetch('/api/ghl/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contactId: ghlContactId, ...payload }),
      })
      setActionMsg(res.ok ? 'Done!' : 'Action failed')
    } catch { setActionMsg('Network error') }
    setSending(false)
    setTimeout(() => setActionMsg(''), 3000)
  }

  return (
    <div className="max-w-7xl space-y-4">
      {/* Back to inventory */}
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-ds-body font-medium text-gunner-red hover:text-gunner-red-dark transition-colors">
        <ArrowLeft size={14} /> Back to Inventory
      </button>

      {/* Header card */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
        {/* Labels row — same as inventory list */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${badgeColor}`}>
            {APP_STAGE_LABELS[appStage]}
          </span>
          {property.ghlStageName && (
            <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${GHL_STAGE_COLORS[property.ghlStageName] ?? 'bg-blue-100 text-blue-700'}`}>
              {cleanStageName(property.ghlStageName)}
            </span>
          )}
          {property.marketName && (
            <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${MARKET_COLORS[property.marketName] ?? 'bg-red-100 text-red-700'}`}>
              {property.marketName}
            </span>
          )}
          {property.leadSource && (
            <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${SOURCE_COLORS[property.leadSource] ?? 'bg-violet-100 text-violet-700'}`}>
              {property.leadSource}
            </span>
          )}
          <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${
            dom <= 7 ? 'bg-green-100 text-green-700'
            : dom <= 30 ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
          }`}>{dom}d</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-ds-section font-semibold text-txt-primary">{property.address || <span className="text-txt-muted italic">Address missing</span>}</h1>
              {property.address && (
                <button
                  onClick={() => {
                    const full = `${property.address}, ${property.city}, ${property.state} ${property.zip}`
                    navigator.clipboard.writeText(full).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    })
                  }}
                  className="text-txt-muted hover:text-txt-secondary transition-colors relative"
                  title="Copy address"
                >
                  <Copy size={13} />
                  {copied && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-medium text-semantic-green bg-green-50 px-1.5 py-0.5 rounded whitespace-nowrap">Copied!</span>}
                </button>
              )}
            </div>
            <p className="text-ds-body text-txt-secondary flex items-center gap-1">
              <MapPin size={11} /> {[property.city, property.state].filter(Boolean).join(', ')} {property.zip ?? ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* AI Enrichment badge */}
            {property.aiEnrichmentStatus === 'pending' && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full animate-pulse">
                <Sparkles size={10} /> AI enriching...
              </span>
            )}
            {property.aiEnrichmentStatus === 'complete' && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                <Sparkles size={10} /> AI enriched
              </span>
            )}
            {property.aiEnrichmentStatus === 'failed' && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                <Sparkles size={10} /> Enrich failed
              </span>
            )}
            {/* Re-enrich button */}
            {property.aiEnrichmentStatus !== 'pending' && (
              <button
                disabled={enriching}
                onClick={async () => {
                  setEnriching(true)
                  try {
                    const res = await fetch(`/api/properties/${property.id}/re-enrich`, { method: 'POST' })
                    if (res.ok) {
                      toast('Property data refreshed', 'success')
                      router.refresh()
                    } else {
                      toast('Re-enrich failed — try again', 'error')
                    }
                  } catch {
                    toast('Re-enrich failed — try again', 'error')
                  }
                  setEnriching(false)
                }}
                className="flex items-center gap-1 text-ds-fine text-txt-muted hover:text-txt-primary bg-surface-secondary px-3 py-1.5 rounded-[10px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors disabled:opacity-50"
                title="Re-run AI enrichment"
              >
                {enriching ? <Loader2 size={11} className="animate-spin" /> : <Bot size={11} />}
                {enriching ? 'Enriching...' : 'Re-enrich'}
              </button>
            )}
            {ghlContactId && ghlLocationId && (
              <a
                href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${ghlContactId}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-ds-fine text-txt-muted hover:text-txt-primary bg-surface-secondary px-3 py-1.5 rounded-[10px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors"
              >
                <ExternalLink size={11} /> GHL
              </a>
            )}
          </div>
        </div>

        {/* Deal progress — view only, click for milestone details */}
        <DealProgress currentStatus={property.status} dispoStatus={property.dispoStatus} milestones={property.milestones} propertyId={property.id} canEdit={canEdit} teamMembers={property.teamMembers} />
      </div>

      {/* Property Details panel — persistent across tabs, sits between the
          pipeline visual and the tab bar. Reads/writes the same shared state
          so edits here are reflected in the Overview pricing rows instantly. */}
      <PropertyDetailsPanel
        propertyId={property.id}
        vals={vals}
        sources={sources}
        altPrices={altPrices}
        offerTypes={offerTypes}
        onSaved={handleSaved}
        onArraySaved={handleArraySaved}
        onAltSaved={handleAltSaved}
        projectTypeOptions={projectTypeOptions}
      />

      {/* Tab bar */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
        <div className="flex border-b border-[rgba(0,0,0,0.06)] overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                data-tab={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-ds-fine font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-gunner-red text-gunner-red'
                    : 'border-transparent text-txt-muted hover:text-txt-secondary'
                }`}
              >
                <Icon size={12} /> {tab.label}
                {tab.key === 'data' && pendingSuggestionCount > 0 && (
                  <span className="ml-1.5 bg-[#7F77DD] text-white text-[10px] font-medium rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {pendingSuggestionCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <ContactsPanel property={property} tenantSlug={tenantSlug} />
              <OverviewTab
                property={property} dom={dom} domColor={domColor} tenantSlug={tenantSlug}
                runGhlAction={runGhlAction} sending={sending} actionMsg={actionMsg}
                ghlContactId={ghlContactId} projectTypeOptions={projectTypeOptions}
                vals={vals} sources={sources} altPrices={altPrices} offerTypes={offerTypes}
                onSaved={handleSaved} onArraySaved={handleArraySaved} onAltSaved={handleAltSaved}
                onOfferTypesChange={handleOfferTypesChange}
              />
            </div>
          )}
          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* ── Contacts panel (replaces DataContactsSection) ───── */}
              <ContactsPanel property={property} tenantSlug={tenantSlug} />
              {/* ── Suggestion banner (only when there are pending) ── */}
              {pendingSuggestionCount > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-[#EEEDFE] border border-[#AFA9EC] rounded-[12px]">
                  <div className="flex items-center gap-3">
                    <span className="text-[#7F77DD] text-sm font-bold">✦</span>
                    <div>
                      <p className="text-[12px] font-semibold text-[#5B54B0]">{pendingSuggestionCount} suggestion{pendingSuggestionCount !== 1 ? 's' : ''} to approve</p>
                      <p className="text-[10px] text-[#7F77DD]">
                        From calls &middot; {property.sellers.map(s => s.name).join(', ') || 'Unknown contact'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSuggestionModal(true)}
                    className="px-3 py-1.5 bg-[#7F77DD] text-white text-[11px] font-semibold rounded-[8px] hover:bg-[#6B63C9] transition-colors"
                  >
                    Review
                  </button>
                </div>
              )}
              {/* ── MLS history (from REAPI/PropertyRadar) ────── */}
              <MlsPanel property={property} />
              {/* ── Vendor intel (BatchData motivation + PR flags + owner portfolio + foreclosure trustee) ── */}
              <VendorIntelPanel property={property} />
              {/* ── Deed / mortgage / lien history (vendor blobs) ── */}
              <HistoryPanel property={property} />
              {/* ── Property Data (existing research content) ── */}
              <ResearchTab property={property} />
            </div>
          )}
          {activeTab === 'activity' && (
            <ActivityTab property={property} tenantSlug={tenantSlug} runGhlAction={runGhlAction} sending={sending} ghlContactId={ghlContactId} />
          )}
          {activeTab === 'disposition' && (
            <DispositionJourney
              property={property}
              tenantSlug={tenantSlug}
              onJumpToTab={(t) => setActiveTab(t)}
            />
          )}
        </div>
      </div>

      {/* Offers are recorded via Outreach tab */}

      {/* ── Suggestion Review Modal ────────────────── */}
      {showSuggestionModal && (
        <SuggestionReviewModal
          suggestions={suggestions}
          tenantSlug={tenantSlug}
          propertyId={property.id}
          sellers={property.sellers}
          onClose={() => setShowSuggestionModal(false)}
          onUpdate={(remaining) => {
            setSuggestions(remaining)
            setPendingSuggestionCount(remaining.length)
            if (remaining.length === 0) setShowSuggestionModal(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Record Offer Modal ──────────────────────────────────────────────────────

function RecordOfferModal({ propertyId, tenantSlug, onClose }: { propertyId: string; tenantSlug: string; onClose: () => void }) {
  const [offerAmount, setOfferAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  async function submit() {
    if (!offerAmount) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerPrice: offerAmount,
          status: 'OFFER_MADE',
          lastOfferDate: new Date().toISOString(),
        }),
      })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => { onClose(); window.location.reload() }, 1000)
      }
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[14px] border-[0.5px] border-[rgba(0,0,0,0.08)] w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-ds-label font-semibold text-txt-primary mb-4">Record Offer</h3>
        {success ? (
          <p className="text-ds-body text-semantic-green font-medium py-4 text-center">Offer recorded!</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-ds-fine text-txt-muted block mb-1">Offer Amount *</label>
              <input
                type="number" value={offerAmount} onChange={e => setOfferAmount(e.target.value)}
                placeholder="150000"
                className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-ds-fine text-txt-muted block mb-1">Notes</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Offer details..." rows={3}
                className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 text-ds-fine font-medium text-txt-secondary bg-surface-secondary rounded-[8px] py-2 hover:bg-surface-tertiary transition-colors">
                Cancel
              </button>
              <button onClick={submit} disabled={!offerAmount || saving}
                className="flex-1 text-ds-fine font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 rounded-[8px] py-2 transition-colors">
                {saving ? 'Saving...' : 'Record Offer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Deal Progress ───────────────────────────────────────────────────────────

const ACQ_STEPS = [
  { key: 'NEW_LEAD', label: 'New Lead' }, { key: 'APPOINTMENT_SET', label: 'Appt Set' },
  { key: 'OFFER_MADE', label: 'Offer' }, { key: 'UNDER_CONTRACT', label: 'Contract' },
  { key: 'SOLD', label: 'Closed' },
]
const DISPO_STEPS = [
  { key: 'IN_DISPOSITION', label: 'New Deal' }, { key: 'DISPO_PUSHED', label: 'Pushed Out' },
  { key: 'DISPO_OFFERS', label: 'Offers' }, { key: 'DISPO_CONTRACTED', label: 'Contracted' },
  { key: 'DISPO_CLOSED', label: 'Closed' },
]

function DealProgress({ currentStatus, dispoStatus, milestones, propertyId, canEdit, teamMembers }: {
  currentStatus: string
  dispoStatus: string | null
  milestones: Array<{ id?: string; type: string; date: string; notes: string | null; source?: string; loggedById?: string | null; loggedByName?: string | null }>
  propertyId: string
  canEdit: boolean
  teamMembers: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [addingMilestone, setAddingMilestone] = useState<string | null>(null)
  const [milestoneNotes, setMilestoneNotes] = useState('')
  const [milestoneDate, setMilestoneDate] = useState('')
  const [milestoneUserId, setMilestoneUserId] = useState('')
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [editMilestoneDate, setEditMilestoneDate] = useState('')
  const [editMilestoneNotes, setEditMilestoneNotes] = useState('')
  const [editMilestoneUserId, setEditMilestoneUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const acqKeys = ACQ_STEPS.map(s => s.key)
  const dispoKeys = DISPO_STEPS.map(s => s.key)

  // Map step keys to milestone types
  const stepToMilestone: Record<string, string> = {
    // Acquisition
    NEW_LEAD: 'LEAD', APPOINTMENT_SET: 'APPOINTMENT_SET',
    OFFER_MADE: 'OFFER_MADE', UNDER_CONTRACT: 'UNDER_CONTRACT',
    SOLD: 'CLOSED',
    // Disposition
    IN_DISPOSITION: 'DISPO_NEW', DISPO_PUSHED: 'DISPO_PUSHED',
    DISPO_OFFERS: 'DISPO_OFFER_RECEIVED', DISPO_CONTRACTED: 'DISPO_CONTRACTED',
    DISPO_CLOSED: 'DISPO_CLOSED',
  }

  // Map milestone types → ALL records (not just latest) for showing history
  type MilestoneRecord = { id?: string; date: string; notes: string | null; source?: string; loggedById?: string | null; loggedByName?: string | null }
  const milestonesByType: Record<string, MilestoneRecord[]> = {}
  for (const m of milestones) {
    if (!milestonesByType[m.type]) milestonesByType[m.type] = []
    milestonesByType[m.type].push({ id: m.id, date: m.date, notes: m.notes, source: m.source, loggedById: m.loggedById, loggedByName: m.loggedByName })
  }

  // Simple: status → acq position, dispoStatus → dispo position. Two fields, two pipelines.
  const acqIdx = acqKeys.indexOf(currentStatus)
  const dispoIdx = dispoStatus ? dispoKeys.indexOf(dispoStatus) : -1

  // Types that can be manually logged — all types allowed so users can fill gaps flagged by caution icons
  const LOGGABLE_TYPES = [
    'LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT', 'CLOSED',
    'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED', 'DISPO_CLOSED',
  ]

  async function editMilestone(milestoneId: string) {
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (editMilestoneDate) body.date = editMilestoneDate
      if (editMilestoneNotes !== undefined) body.notes = editMilestoneNotes
      if (editMilestoneUserId) body.loggedById = editMilestoneUserId
      const res = await fetch('/api/milestones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: milestoneId, ...body }),
      })
      if (res.ok) {
        toast('Milestone updated', 'success')
        setEditingMilestoneId(null)
        router.refresh()
      } else toast('Failed to update', 'error')
    } catch { toast('Failed to update', 'error') }
    setSaving(false)
  }

  async function deleteMilestone(milestoneId: string) {
    if (!window.confirm('Delete this milestone? This affects KPI counts.')) return
    setSaving(true)
    try {
      const res = await fetch('/api/milestones', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: milestoneId }),
      })
      if (res.ok) {
        toast('Milestone deleted', 'success')
        router.refresh()
      } else toast('Failed to delete', 'error')
    } catch { toast('Failed to delete', 'error') }
    setSaving(false)
  }

  async function logMilestone(milestoneType: string) {
    if (!LOGGABLE_TYPES.includes(milestoneType)) return
    setSaving(true)
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          type: milestoneType,
          notes: milestoneNotes || undefined,
          date: milestoneDate || undefined,
          loggedById: milestoneUserId || undefined,
        }),
      })
      if (res.ok) {
        toast('Milestone logged', 'success')
        setAddingMilestone(null)
        setMilestoneNotes('')
        setMilestoneDate('')
        setMilestoneUserId('')
        router.refresh()
      } else {
        toast('Failed to log milestone', 'error')
      }
    } catch {
      toast('Failed to log milestone', 'error')
    }
    setSaving(false)
  }

  function ProgressRow({ steps, activeIdx }: { steps: typeof ACQ_STEPS; activeIdx: number; color: string }) {
    // Find the latest milestone date among all LATER stages (for stale detection)
    function hasLaterStageMilestone(stepIdx: number): boolean {
      for (let j = stepIdx + 1; j < steps.length; j++) {
        const laterType = stepToMilestone[steps[j].key] ?? ''
        if ((milestonesByType[laterType] ?? []).length > 0) return true
      }
      return false
    }

    return (
      <div>
        <div className="flex items-center">
          {steps.map((step, i) => {
            const isCurrent = i === activeIdx
            const milestoneType = stepToMilestone[step.key] ?? ''
            const stepMilestones = milestonesByType[milestoneType] ?? []
            const isPast = activeIdx >= 0 && i < activeIdx
            const everVisited = stepMilestones.length > 0 || isPast
            const isExpanded = expandedStep === step.key

            // Caution: stage is passed through (or current) but has no milestone,
            // AND a later stage DOES have a milestone (meaning this one was skipped)
            const needsCaution = (isPast || isCurrent) && stepMilestones.length === 0 && hasLaterStageMilestone(i)

            // Visual: solid red = current active stage, red outline = visited (has milestone), gray = never reached
            const circleClass = isCurrent
              ? `bg-gunner-red text-white ring-2 ring-offset-1 ring-gunner-red/30`
              : everVisited
              ? `border-2 border-gunner-red text-gunner-red`
              : 'border border-[rgba(0,0,0,0.1)] text-txt-muted'
            const labelClass = isCurrent
              ? 'text-gunner-red font-semibold'
              : everVisited ? 'text-txt-primary font-medium' : 'text-txt-muted'
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : step.key)}
                  className="flex flex-col items-center cursor-pointer hover:scale-110 transition-transform relative"
                  title={needsCaution ? `${step.label} — no milestone, won't count in KPIs` : everVisited ? `${step.label} — ${stepMilestones.length} time${stepMilestones.length !== 1 ? 's' : ''}` : step.label}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold transition-colors ${circleClass}`}>
                    {isCurrent || everVisited ? <Check size={8} /> : i + 1}
                  </div>
                  <span className={`text-[7px] mt-0.5 ${labelClass}`}>{step.label}</span>
                  {/* Caution badge — missing milestone, won't count in KPIs */}
                  {needsCaution && (
                    <span className="absolute -top-1 -right-1.5 text-amber-500" title="No milestone — won't count in KPIs">
                      <AlertTriangle size={8} fill="currentColor" />
                    </span>
                  )}
                  {/* Count badge for multiple milestones (only if no caution) */}
                  {!needsCaution && stepMilestones.length > 1 && (
                    <span className="absolute -top-1 -right-1.5 text-[6px] font-bold text-white bg-gunner-red w-3 h-3 rounded-full flex items-center justify-center">{stepMilestones.length}</span>
                  )}
                </button>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-px mx-0.5 ${
                    isCurrent && i < activeIdx ? 'bg-gunner-red/30'
                    : everVisited ? 'bg-gunner-red/20'
                    : 'bg-[rgba(0,0,0,0.06)]'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
        {/* Milestone detail popover — shows ALL entries for the stage + add button */}
        {expandedStep && steps.some(s => s.key === expandedStep) && (() => {
          const step = steps.find(s => s.key === expandedStep)!
          const milestoneType = stepToMilestone[step.key] ?? ''
          const stepMilestones = milestonesByType[milestoneType] ?? []
          const isCurrent = steps.indexOf(step) === activeIdx
          const isPast = activeIdx >= 0 && steps.indexOf(step) < activeIdx
          const everVisited = stepMilestones.length > 0
          const canLog = canEdit && LOGGABLE_TYPES.includes(milestoneType)
          const isAdding = addingMilestone === milestoneType
          const popoverCaution = (isPast || isCurrent) && stepMilestones.length === 0 && hasLaterStageMilestone(steps.indexOf(step))
          return (
            <div className={`mt-2 rounded-[8px] px-3 py-2 border-[0.5px] ${
              popoverCaution ? 'bg-amber-50 border-amber-200'
              : isCurrent ? 'bg-gunner-red/5 border-gunner-red/20'
              : everVisited || isPast ? 'bg-surface-secondary border-gunner-red/10'
              : 'bg-surface-secondary border-[rgba(0,0,0,0.06)]'
            }`}>
              <div className="flex items-center justify-between">
                <p className={`text-[10px] font-semibold ${popoverCaution ? 'text-amber-700' : isCurrent ? 'text-gunner-red' : everVisited || isPast ? 'text-txt-primary' : 'text-txt-muted'}`}>
                  {popoverCaution && <AlertTriangle size={9} className="inline mr-1 -mt-0.5" />}
                  {step.label}
                  {stepMilestones.length > 1 && <span className="text-txt-muted font-normal ml-1">({stepMilestones.length} times)</span>}
                </p>
                {canLog && !isAdding && (
                  <button
                    onClick={() => { setAddingMilestone(milestoneType); setMilestoneNotes(''); setMilestoneDate('') }}
                    className="text-[8px] text-gunner-red hover:text-gunner-red-dark flex items-center gap-0.5"
                  >
                    <Plus size={8} /> Log
                  </button>
                )}
              </div>
              {popoverCaution ? (
                <p className="text-[9px] text-amber-600 mt-0.5">No milestone — this stage won&apos;t count in KPIs. Log with the correct date.</p>
              ) : stepMilestones.length > 0 ? (
                <div className="space-y-1.5 mt-1">
                  {stepMilestones.map((m, mi) => {
                    const isEditingThis = editingMilestoneId === m.id
                    return (
                      <div key={mi}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] text-txt-muted">{format(new Date(m.date), 'MMM d, yyyy')}</span>
                          {m.loggedByName && <span className="text-[9px] font-medium text-txt-secondary">· {m.loggedByName}</span>}
                          {!m.loggedByName && <span className="text-[9px] text-txt-muted italic">· unassigned</span>}
                          {m.source && (
                            <span className={`text-[7px] px-1 py-0.5 rounded font-medium ${
                              m.source === 'AUTO_WEBHOOK' ? 'bg-purple-100 text-purple-700'
                              : m.source === 'AI' ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                            }`}>{m.source === 'AUTO_WEBHOOK' ? 'API' : m.source === 'AI' ? 'AI' : 'Manual'}</span>
                          )}
                          {m.notes && <span className="text-[9px] text-txt-muted">— {m.notes}</span>}
                          {canEdit && m.id && (
                            <div className="flex gap-1 ml-auto">
                              <button
                                onClick={() => {
                                  if (isEditingThis) { setEditingMilestoneId(null); return }
                                  setEditingMilestoneId(m.id!)
                                  setEditMilestoneDate(format(new Date(m.date), 'yyyy-MM-dd'))
                                  setEditMilestoneNotes(m.notes ?? '')
                                  setEditMilestoneUserId(m.loggedById ?? '')
                                }}
                                className="text-[8px] text-semantic-blue hover:underline"
                              >
                                {isEditingThis ? 'Cancel' : 'Edit'}
                              </button>
                              <button onClick={() => deleteMilestone(m.id!)} className="text-[8px] text-semantic-red hover:underline">
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                        {isEditingThis && (
                          <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-semantic-blue/30">
                            <select
                              value={editMilestoneUserId}
                              onChange={e => setEditMilestoneUserId(e.target.value)}
                              className="w-full text-[9px] px-2 py-1 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                            >
                              <option value="">Who did this?</option>
                              {teamMembers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                            <input type="date" value={editMilestoneDate} onChange={e => setEditMilestoneDate(e.target.value)}
                              className="w-full text-[9px] px-2 py-1 rounded border border-[rgba(0,0,0,0.1)] bg-white" />
                            <input type="text" value={editMilestoneNotes} onChange={e => setEditMilestoneNotes(e.target.value)}
                              placeholder="Notes" className="w-full text-[9px] px-2 py-1 rounded border border-[rgba(0,0,0,0.1)] bg-white" />
                            <button onClick={() => editMilestone(m.id!)} disabled={saving}
                              className="text-[8px] font-medium text-white bg-gunner-red px-2 py-0.5 rounded disabled:opacity-50">
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : isCurrent ? (
                <p className="text-[9px] text-txt-muted mt-0.5">Currently here — no milestone recorded</p>
              ) : isPast ? (
                <p className="text-[9px] text-txt-muted mt-0.5">Passed through — no milestone recorded yet</p>
              ) : (
                <p className="text-[9px] text-txt-muted mt-0.5">Not yet reached</p>
              )}
              {/* Inline milestone form */}
              {isAdding && (
                <div className="mt-2 space-y-1.5 border-t border-[rgba(0,0,0,0.06)] pt-2">
                  <select
                    value={milestoneUserId}
                    onChange={e => setMilestoneUserId(e.target.value)}
                    className="w-full text-[9px] px-2 py-1 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                  >
                    <option value="">Who did this?</option>
                    {teamMembers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input
                    type="date"
                    value={milestoneDate}
                    onChange={e => setMilestoneDate(e.target.value)}
                    className="w-full text-[9px] px-2 py-1 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                    placeholder="Date (optional — defaults to today)"
                  />
                  <input
                    type="text"
                    value={milestoneNotes}
                    onChange={e => setMilestoneNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full text-[9px] px-2 py-1 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                    onKeyDown={e => { if (e.key === 'Enter') logMilestone(milestoneType) }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => logMilestone(milestoneType)}
                      disabled={saving}
                      className="text-[8px] font-medium text-white bg-gunner-red hover:bg-gunner-red-dark px-2 py-0.5 rounded disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setAddingMilestone(null); setMilestoneNotes(''); setMilestoneDate(''); setMilestoneUserId('') }}
                      className="text-[8px] text-txt-muted hover:text-txt-primary px-2 py-0.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="bg-surface-secondary/50 border-[0.5px] border-[rgba(0,0,0,0.04)] rounded-[8px] px-3 py-2 mt-3 space-y-2">
      <div>
        <p className="text-[7px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Acquisition</p>
        <ProgressRow steps={ACQ_STEPS} activeIdx={acqIdx} color="bg-gunner-red" />
      </div>
      <div>
        <p className="text-[7px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Disposition</p>
        <ProgressRow steps={DISPO_STEPS} activeIdx={dispoIdx} color="bg-semantic-blue" />
      </div>
    </div>
  )
}

// ─── Inline Edit Components ──────────────────────────────────────────────────

// Source-based color styles: "api"=purple, "ai"=blue, "user"=green, null=gray
export function sourceStyles(source: string | null) {
  if (source === 'api') return { bg: 'bg-purple-50 border-[0.5px] border-purple-300', label: 'text-purple-700', value: 'text-purple-800', tag: 'API', tagColor: 'text-purple-400' }
  if (source === 'ai') return { bg: 'bg-blue-50 border-[0.5px] border-blue-300', label: 'text-blue-700', value: 'text-blue-800', tag: 'AI', tagColor: 'text-blue-400' }
  if (source === 'user') return { bg: 'bg-green-50 border-[0.5px] border-green-300', label: 'text-green-700', value: 'text-green-800', tag: 'EDITED', tagColor: 'text-green-400' }
  return { bg: 'bg-surface-secondary', label: 'text-txt-muted', value: 'text-txt-primary', tag: '', tagColor: '' }
}

function InlineEditCard({
  label, value, field, propertyId, source, onSaved,
}: {
  label: string; value: string | null; field: string; propertyId: string
  source?: string | null; onSaved: (field: string, val: string | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setEditValue(value ?? '')
    setEditing(true)
  }

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    if (raw === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      const newVal = raw || null
      const newSource = newVal ? 'user' : ''
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVal, fieldSources: newVal ? { [field]: 'user' } : { [field]: '' } }),
      })
      if (res.ok) { onSaved(field, newVal, newSource) }
      else { console.error('[InlineEdit] Save failed:', field, await res.text()) }
    } catch (e) { console.error('[InlineEdit] Error:', e) }
    setSaving(false)
    setEditing(false)
  }

  const displayValue = value ? `$${Number(value).toLocaleString()}` : null
  const s = sourceStyles(source || null)

  if (editing) {
    return (
      <div className={`${s.bg} rounded-[10px] px-3 py-2.5`}>
        <p className={`text-[9px] font-semibold uppercase tracking-wider ${s.label}`}>{label}</p>
        <input
          autoFocus type="number" value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1 text-ds-card font-semibold text-txt-primary mt-0.5 focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
          disabled={saving} placeholder="0"
        />
      </div>
    )
  }

  return (
    <div onClick={startEdit} className={`${s.bg} rounded-[10px] px-3 py-2.5 cursor-pointer hover:ring-1 hover:ring-gunner-red/20 transition-all group relative`}>
      {s.tag && (
        <span className={`absolute top-1 right-1.5 text-[7px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
      )}
      <p className={`text-[9px] font-semibold uppercase tracking-wider flex items-center justify-between ${s.label}`}>
        {label}
        <Pencil size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </p>
      <p className={`text-ds-card font-semibold mt-0.5 ${displayValue ? s.value : 'text-txt-muted'}`}>
        {displayValue ?? '—'}
      </p>
    </div>
  )
}

function InlineDetailItem({
  label, value, field, propertyId, type = 'text', source, onSaved,
}: {
  label: string; value: string | number | null; field: string; propertyId: string
  type?: 'number' | 'text'; source?: string | null
  onSaved: (field: string, val: string | number | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    const current = value != null ? String(value) : ''
    if (raw === current) { setEditing(false); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      payload[field] = type === 'number' ? (raw ? Number(raw) : null) : (raw || null)
      payload.fieldSources = { [field]: 'user' }
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) onSaved(field, type === 'number' ? (raw ? Number(raw) : null) : (raw || null), 'user')
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  const s = sourceStyles(source ?? null)

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={s.label}>{label}:</span>
        <input
          autoFocus type={type === 'number' ? 'number' : 'text'} value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="w-20 bg-white border-[0.5px] border-gunner-red/30 rounded px-1.5 py-0.5 text-ds-fine font-medium text-txt-primary focus:outline-none"
          disabled={saving}
        />
      </span>
    )
  }

  const display = value != null ? (typeof value === 'number' ? (field === 'yearBuilt' ? String(value) : value.toLocaleString()) : value) : null

  return (
    <span
      className={`cursor-pointer hover:text-gunner-red transition-colors group inline-flex items-center gap-1 ${source ? `px-1.5 py-0.5 rounded ${s.bg}` : ''}`}
      onClick={() => { setEditValue(value != null ? String(value) : ''); setEditing(true) }}
    >
      <span className={s.label}>{label}:</span>
      <span className={`font-medium group-hover:underline ${display ? s.value : 'text-txt-muted'}`}>{display ?? '—'}</span>
      <Pencil size={7} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />
    </span>
  )
}

export function InlineTextArea({
  label, value, field, propertyId, labelColor, bgColor, textColor, source, onSaved,
}: {
  label: string; value: string | null; field: string; propertyId: string
  labelColor?: string; bgColor?: string; textColor?: string; source?: string
  onSaved: (field: string, val: string | null, src?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const sourceTag = source === 'ai' ? 'AI' : source === 'api' ? 'API' : source === 'user' ? 'EDITED' : null
  const tagColor = source === 'ai' ? 'text-blue-400' : source === 'api' ? 'text-purple-400' : source === 'user' ? 'text-green-400' : ''

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    if (raw === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: raw || null, fieldSources: { [field]: raw ? 'user' : '' } }),
      })
      if (res.ok) onSaved(field, raw || null, raw ? 'user' : undefined)
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className={`${bgColor ?? 'bg-surface-secondary'} rounded-[10px] px-4 py-3`}>
        <p className={`text-[9px] font-semibold uppercase tracking-wider mb-1 ${labelColor ?? 'text-txt-muted'}`}>{label}</p>
        <textarea
          autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
          rows={3}
          className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1.5 text-ds-fine text-txt-primary focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
          disabled={saving} placeholder="Click to add..."
        />
      </div>
    )
  }

  return (
    <div
      onClick={() => { setEditValue(value ?? ''); setEditing(true) }}
      className={`${bgColor ?? 'bg-surface-secondary'} rounded-[10px] px-4 py-3 cursor-pointer hover:ring-1 hover:ring-gunner-red/20 transition-all group relative`}
    >
      {sourceTag && (
        <span className={`absolute top-1.5 right-2 text-[7px] font-bold uppercase ${tagColor}`}>{sourceTag}</span>
      )}
      <p className={`text-[9px] font-semibold uppercase tracking-wider mb-1 flex items-center justify-between ${labelColor ?? 'text-txt-muted'}`}>
        {label}
        <Pencil size={8} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity mr-6" />
      </p>
      <p className={`text-ds-fine ${value ? (textColor ?? 'text-txt-secondary') : 'text-txt-muted'}`}>
        {value ?? 'Click to add...'}
      </p>
    </div>
  )
}

// ─── Inline Select (dropdown) ─────────────────────────────────────────────────

function InlineSelect({
  label, value, field, propertyId, options, source, onSaved,
}: {
  label: string; value: string | null; field: string; propertyId: string
  options: string[]; source?: string | null
  onSaved: (field: string, val: string | number | null, src?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function pick(val: string | null) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val, fieldSources: val ? { [field]: 'user' } : { [field]: '' } }),
      })
      if (res.ok) onSaved(field, val, val ? 'user' : '')
    } catch {}
    setSaving(false)
    setOpen(false)
  }

  const tagColor = source === 'ai' ? 'text-blue-400' : source === 'api' ? 'text-purple-400' : source === 'user' ? 'text-green-400' : ''
  const tagLabel = source === 'ai' ? 'AI' : source === 'api' ? 'API' : source === 'user' ? 'EDITED' : ''

  return (
    <FloatingDropdown
      open={open}
      onOpenChange={setOpen}
      width={176}
      trigger={
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 text-ds-fine font-medium text-txt-primary bg-surface-secondary hover:bg-[rgba(0,0,0,0.06)] px-2 py-1 rounded-[6px] transition-colors whitespace-nowrap"
        >
          {value ?? <span className="text-txt-muted">Select</span>}
          {tagLabel && <span className={`text-[6px] font-bold uppercase ${tagColor}`}>{tagLabel}</span>}
        </button>
      }
    >
      <div className="py-0.5">
        {options.map(o => (
          <button key={o} onClick={() => pick(o)}
            className={`block w-full text-left px-3 py-1.5 text-ds-fine hover:bg-surface-secondary transition-colors ${o === value ? 'font-semibold text-gunner-red' : 'text-txt-primary'}`}>
            {o}
          </button>
        ))}
        {value && (
          <button onClick={() => pick(null)}
            className="block w-full text-left px-3 py-1.5 text-ds-fine text-txt-muted hover:bg-surface-secondary transition-colors border-t border-[rgba(0,0,0,0.06)]">
            Clear
          </button>
        )}
      </div>
    </FloatingDropdown>
  )
}

// ─── Inline Text (click to edit single-line) ──────────────────────────────────

function InlineText({
  label, value, field, propertyId, placeholder, source, onSaved,
}: {
  label: string; value: string | null; field: string; propertyId: string
  placeholder?: string; source?: string | null
  onSaved: (field: string, val: string | number | null, src?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setEditValue(value ?? '')
    setEditing(true)
  }

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    if (raw === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      const newVal = raw || null
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVal, fieldSources: newVal ? { [field]: 'user' } : { [field]: '' } }),
      })
      if (res.ok) onSaved(field, newVal, newVal ? 'user' : '')
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  const tagColor = source === 'ai' ? 'text-blue-400' : source === 'api' ? 'text-purple-400' : source === 'user' ? 'text-green-400' : ''
  const tagLabel = source === 'ai' ? 'AI' : source === 'api' ? 'API' : source === 'user' ? 'EDITED' : ''

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 flex-1 min-w-0">
        <input
          autoFocus type="text" value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 min-w-0 bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1 text-ds-fine text-txt-primary focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
          disabled={saving} placeholder={placeholder}
        />
      </span>
    )
  }

  return (
    <span
      onClick={startEdit}
      className="inline-flex items-center gap-1 cursor-pointer hover:text-gunner-red transition-colors group flex-1 min-w-0"
    >
      <span className={`text-ds-fine truncate ${value ? 'text-txt-secondary' : 'text-txt-muted'}`}>
        {value ?? (placeholder ? <span className="italic">{placeholder}</span> : 'Click to add')}
      </span>
      {tagLabel && <span className={`text-[6px] font-bold uppercase shrink-0 ${tagColor}`}>{tagLabel}</span>}
      <Pencil size={7} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity shrink-0" />
    </span>
  )
}

// ─── Multi-Select Tag Fields ─────────────────────────────────────────────────

const PROJECT_TYPE_OPTIONS = ['Fix and Flip', 'Rental', 'Retail', 'Land', 'New Build', 'Commercial', 'Multi-Family']
const PROPERTY_TYPE_OPTIONS = ['House', 'Land', 'Multi-Family', 'Commercial', 'Condo', 'Townhome', 'Mobile Home', 'Other']

// ─── Grid Detail Cell ──────────────────────────────────────────────────────
// Used inside the property details grid — click to edit in-place

function DetailCell({
  label, value, field, propertyId, type = 'text', source, onSaved, options,
}: {
  label: string; value: string | number | null; field: string; propertyId: string
  type?: 'number' | 'text' | 'select'; source?: string | null; options?: string[]
  onSaved: (field: string, val: string | number | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const s = sourceStyles(source ?? null)

  function startEdit() {
    if (type === 'select') { setDropdownOpen(!dropdownOpen); setSearch(''); return }
    setEditValue(value != null ? String(value) : '')
    setEditing(true)
  }

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    const current = value != null ? String(value) : ''
    if (raw === current) { setEditing(false); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      payload[field] = type === 'number' ? (raw ? Number(raw) : null) : (raw || null)
      payload.fieldSources = { [field]: raw ? 'user' : '' }
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) onSaved(field, type === 'number' ? (raw ? Number(raw) : null) : (raw || null), raw ? 'user' : '')
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  async function selectOption(val: string | null) {
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val, fieldSources: val ? { [field]: 'user' } : { [field]: '' } }),
      })
      if (res.ok) onSaved(field, val, val ? 'user' : '')
    } catch {}
    setSaving(false)
    setDropdownOpen(false)
    setSearch('')
  }

  const display = value != null ? (typeof value === 'number' ? (field === 'yearBuilt' ? String(value) : value.toLocaleString()) : value) : null
  const filteredOpts = (options ?? []).filter(o => o.toLowerCase().includes(search.toLowerCase()))

  const cellContent = (
    <div
      onClick={startEdit}
      className={`h-full px-3 py-2.5 cursor-pointer hover:bg-[rgba(0,0,0,0.02)] transition-colors group relative ${source ? s.bg : ''}`}
    >
      {source && s.tag && (
        <span className={`absolute top-0.5 right-1.5 text-[6px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
      )}
      <p className={`text-[8px] font-semibold uppercase tracking-wider ${source ? s.label : 'text-txt-muted'}`}>{label}</p>
      {editing ? (
        <input
          autoFocus type={type === 'number' ? 'number' : 'text'} value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded-[4px] px-1.5 py-0.5 text-ds-fine font-semibold text-txt-primary mt-0.5 focus:outline-none"
          disabled={saving}
        />
      ) : (
        <p className={`text-ds-fine font-semibold mt-0.5 flex items-center gap-1 ${display ? (source ? s.value : 'text-txt-primary') : 'text-txt-muted'}`}>
          {display ?? '—'}
          <Pencil size={7} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity shrink-0" />
        </p>
      )}
    </div>
  )

  if (type === 'select') {
    return (
      <FloatingDropdown
        open={dropdownOpen}
        onOpenChange={(v) => { setDropdownOpen(v); if (!v) setSearch('') }}
        width={176}
        trigger={cellContent}
      >
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-surface-secondary rounded-[4px] px-2 py-1 text-[10px] placeholder-txt-muted focus:outline-none mb-1" />
        <div className="max-h-36 overflow-y-auto space-y-0.5">
          {value && (
            <button onClick={() => selectOption(null)} disabled={saving}
              className="w-full text-left text-[10px] text-semantic-red px-2 py-1 rounded hover:bg-surface-secondary transition-colors">Clear</button>
          )}
          {filteredOpts.map(o => (
            <button key={o} onClick={() => selectOption(o)} disabled={saving}
              className={`w-full text-left text-[10px] px-2 py-1 rounded hover:bg-surface-secondary transition-colors ${
                o === value ? 'text-gunner-red font-semibold bg-gunner-red-light' : 'text-txt-primary'
              }`}>{o}</button>
          ))}
        </div>
      </FloatingDropdown>
    )
  }

  return cellContent
}

// ─── Tag Row (for Market / Project Type multi-select) ───────────────────────

function TagRow({ label, values, options, field, propertyId, allowCustom, source, onSaved }: {
  label: string; values: string[]; options: string[]; field: string; propertyId: string
  allowCustom?: boolean; source?: string | null; onSaved: (field: string, vals: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [localValues, setLocalValues] = useState(values)

  useEffect(() => { setLocalValues(values) }, [values])

  const filtered = options.filter(o =>
    !localValues.includes(o) && o.toLowerCase().includes(search.toLowerCase())
  )
  const showCustom = allowCustom && search.length >= 2 && !options.some(o => o.toLowerCase() === search.toLowerCase()) && !localValues.some(v => v.toLowerCase() === search.toLowerCase())

  async function toggle(val: string) {
    const newVals = localValues.includes(val) ? localValues.filter(v => v !== val) : [...localValues, val]
    setLocalValues(newVals)
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVals, fieldSources: { [field]: 'user' } }),
      })
      if (res.ok) { onSaved(field, newVals) }
      else { setLocalValues(values) }
    } catch { setLocalValues(values) }
    setSaving(false)
    setSearch('')
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider shrink-0 w-[70px]">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-h-[20px]">
        {localValues.map(v => {
          const tagStyle = source === 'api' ? 'bg-purple-100 text-purple-700'
            : source === 'ai' ? 'bg-blue-100 text-blue-700'
            : source === 'user' ? 'bg-green-100 text-green-700'
            : 'bg-gunner-red-light text-gunner-red'
          return (
            <span key={v} className={`inline-flex items-center gap-1 ${tagStyle} text-[10px] font-semibold px-2 py-0.5 rounded-full`}>
              {v}
              <button onClick={() => toggle(v)} className="hover:opacity-60 transition-opacity"><X size={8} /></button>
            </span>
          )
        })}
        <FloatingDropdown
          open={open}
          onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}
          width={208}
          trigger={
            <button onClick={() => setOpen(!open)}
              className="inline-flex items-center gap-0.5 text-[10px] text-txt-muted hover:text-gunner-red px-1.5 py-0.5 rounded-full border border-dashed border-[rgba(0,0,0,0.12)] hover:border-gunner-red/30 transition-all">
              <Plus size={8} /> Add
            </button>
          }
        >
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder={allowCustom ? 'Search or type custom...' : 'Search...'}
            className="w-full bg-surface-secondary rounded-[4px] px-2 py-1 text-[10px] placeholder-txt-muted focus:outline-none mb-1" />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.map(o => (
              <button key={o} onClick={() => toggle(o)} disabled={saving}
                className="w-full text-left text-[10px] text-txt-primary px-2 py-1 rounded hover:bg-surface-secondary transition-colors">{o}</button>
            ))}
            {showCustom && (
              <button onClick={() => toggle(search)} disabled={saving}
                className="w-full text-left text-[10px] text-gunner-red font-semibold px-2 py-1 rounded hover:bg-surface-secondary transition-colors">
                + Add &ldquo;{search}&rdquo;
              </button>
            )}
            {filtered.length === 0 && !showCustom && (
              <p className="text-[10px] text-txt-muted px-2 py-1">No options</p>
            )}
          </div>
        </FloatingDropdown>
      </div>
    </div>
  )
}

// ─── Team Members Section ────────────────────────────────────────────────────

const TEAM_ROLE_OPTIONS = ['Admin', 'Lead Manager', 'Acquisition Manager', 'Disposition Manager']

const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
  OWNER: { label: 'Owner', color: 'bg-purple-100 text-purple-700' },
  ADMIN: { label: 'Admin', color: 'bg-gray-100 text-gray-700' },
  Admin: { label: 'Admin', color: 'bg-gray-100 text-gray-700' },
  TEAM_LEAD: { label: 'Team Lead', color: 'bg-indigo-100 text-indigo-700' },
  LEAD_MANAGER: { label: 'Lead Manager', color: 'bg-blue-100 text-blue-700' },
  'Lead Manager': { label: 'Lead Manager', color: 'bg-blue-100 text-blue-700' },
  ACQUISITION_MANAGER: { label: 'Acq. Manager', color: 'bg-green-100 text-green-700' },
  'Acquisition Manager': { label: 'Acq. Manager', color: 'bg-green-100 text-green-700' },
  DISPOSITION_MANAGER: { label: 'Dispo Manager', color: 'bg-orange-100 text-orange-700' },
  'Disposition Manager': { label: 'Dispo Manager', color: 'bg-orange-100 text-orange-700' },
  Team: { label: 'Team', color: 'bg-gray-100 text-gray-600' },
}

function formatRole(role: string): { label: string; color: string } {
  return ROLE_DISPLAY[role] ?? { label: role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: 'bg-gray-100 text-gray-600' }
}

function TeamSection({ propertyId, tenantSlug }: { propertyId: string; tenantSlug: string }) {
  const [members, setMembers] = useState<Array<{ id: string; userId: string; name: string; role: string; source: string }>>([])
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string }>>([])
  const [showAdd, setShowAdd] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('Lead Manager')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setShowAdd(false)
    fetch(`/api/properties/${propertyId}/team`)
      .then(r => r.json())
      .then(d => { setMembers(d.members ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [propertyId])

  useEffect(() => {
    fetch(`/api/${tenantSlug}/dayhub/team-numbers`)
      .then(r => r.json())
      .then(d => setAllUsers((d.numbers ?? []).map((n: { name: string; userId: string }) => ({ id: n.userId, name: n.name }))))
      .catch(() => {})
  }, [tenantSlug])

  async function addMember() {
    if (!selectedUserId) return
    const res = await fetch(`/api/properties/${propertyId}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
    })
    if (res.ok) {
      const data = await res.json()
      setMembers(prev => [...prev.filter(m => m.userId !== selectedUserId), data.member])
      setShowAdd(false)
      setSelectedUserId('')
    }
  }

  async function removeMember(userId: string) {
    await fetch(`/api/properties/${propertyId}/team`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setMembers(prev => prev.filter(m => m.userId !== userId))
  }

  const availableUsers = allUsers.filter(u => !members.some(m => m.userId === u.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">Team</p>
        <button onClick={() => setShowAdd(!showAdd)} className="text-txt-muted hover:text-gunner-red transition-colors">
          <Plus size={12} />
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-secondary rounded-[10px] p-3 mb-2 space-y-2">
          <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
            className="w-full text-ds-fine bg-white border-[0.5px] rounded-[8px] px-3 py-1.5" style={{ borderColor: 'var(--border-medium)' }}>
            <option value="">Select team member...</option>
            {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
            className="w-full text-ds-fine bg-white border-[0.5px] rounded-[8px] px-3 py-1.5" style={{ borderColor: 'var(--border-medium)' }}>
            {TEAM_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={addMember} disabled={!selectedUserId}
            className="w-full text-ds-fine font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 rounded-[8px] py-1.5 transition-colors">
            Add to Team
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-ds-fine text-txt-muted">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-ds-fine text-txt-muted italic">No team members assigned</p>
      ) : (
        <div className="space-y-1.5">
          {members.map(m => {
            const roleInfo = formatRole(m.role)
            return (
            <div key={m.userId} className="group flex items-center gap-2.5 bg-surface-secondary rounded-[10px] px-3 py-2.5 border-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
              <div className="w-7 h-7 rounded-full bg-white border-[0.5px] flex items-center justify-center shrink-0" style={{ borderColor: 'var(--border-medium)' }}>
                <User size={13} className="text-txt-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-ds-fine font-semibold text-txt-primary truncate">{m.name}</p>
                <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${roleInfo.color}`}>
                  {roleInfo.label}
                </span>
              </div>
              <button onClick={() => removeMember(m.userId)}
                className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-semantic-red transition-all shrink-0">
                <X size={10} />
              </button>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Inline AI Actions ───────────────────────────────────────────────────────

function InlineAI({ propertyId }: { propertyId: string }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([])
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<Record<string, string> | null>(null)
  const [executing, setExecuting] = useState(false)

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      // First try outreach action parsing
      const actionRes = await fetch('/api/ai/outreach-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, propertyId }),
      })
      const actionData = await actionRes.json()
      const action = actionData.action

      if (action && action.type !== 'none') {
        // Outreach action detected — show confirmation
        setPendingAction(action)
        const labels: Record<string, string> = { offer: 'Record Offer', offer_update: 'Update Offer', showing: 'Schedule Showing', send: 'Log Send' }
        setMessages(prev => [...prev, { role: 'assistant', text: `I'll ${labels[action.type] ?? action.type}. Review and confirm below.` }])
      } else {
        // Fall back to regular AI Coach
        const coachRes = await fetch('/api/ai/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, { role: 'user', content: text }].map(m => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: 'text' in m ? m.text : (m as { content: string }).content,
            })),
            propertyId,
          }),
        })
        const coachData = await coachRes.json()
        setMessages(prev => [...prev, { role: 'assistant', text: action?.reply ?? coachData.reply ?? 'No response' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to connect' }])
    }
    setLoading(false)
  }

  async function confirmAction() {
    if (!pendingAction) return
    setExecuting(true)
    try {
      const a = pendingAction
      const payload: Record<string, unknown> = {
        recipientName: a.recipientName ?? 'Unknown',
        recipientContact: '',
        source: 'AI',
        notes: a.notes ?? null,
      }

      if (a.type === 'offer') {
        payload.type = 'offer'
        payload.offerAmount = a.offerAmount
        payload.channel = a.channel ?? 'offer'
      } else if (a.type === 'offer_update') {
        // Find the most recent offer log for this recipient to update it
        try {
          const logsRes = await fetch(`/api/properties/${propertyId}/outreach`)
          const logsData = await logsRes.json()
          const existingOffer = (logsData.logs ?? []).find(
            (l: { type: string; recipientName: string }) => l.type === 'offer' && l.recipientName?.toLowerCase() === (a.recipientName ?? '').toLowerCase()
          )
          if (existingOffer) {
            payload.action = 'update'
            payload.logId = existingOffer.id
            payload.offerStatus = a.offerStatus
            payload.offerAmount = a.offerAmount
          } else {
            // No existing offer found — create new with status
            payload.type = 'offer'
            payload.offerAmount = a.offerAmount
            payload.channel = 'offer'
          }
        } catch {
          payload.type = 'offer'
          payload.offerAmount = a.offerAmount
          payload.channel = 'offer'
        }
      } else if (a.type === 'showing') {
        payload.type = 'showing'
        if (a.showingDate) {
          const showDt = new Date(`${a.showingDate}T${a.showingTime || '09:00'}:00`)
          payload.showingDate = showDt.toISOString()
        }
      } else if (a.type === 'send') {
        payload.type = 'send'
        payload.channel = a.channel ?? 'sms'
      }

      await fetch(`/api/properties/${propertyId}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setMessages(prev => [...prev, { role: 'assistant', text: 'Done!' }])
      setPendingAction(null)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to execute' }])
    }
    setExecuting(false)
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
        <Sparkles size={10} className="inline -mt-0.5 text-semantic-purple" /> AI Actions
      </p>

      {/* Chat history */}
      {messages.length > 0 && (
        <div className="space-y-2 mb-2 max-h-[250px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`text-ds-fine px-2.5 py-1.5 rounded-[8px] ${
              m.role === 'user'
                ? 'bg-gunner-red text-white ml-4'
                : 'bg-surface-secondary text-txt-primary mr-4'
            }`}>
              {m.text}
            </div>
          ))}
          {loading && (
            <div className="bg-surface-secondary rounded-[8px] px-2.5 py-1.5 mr-4">
              <Loader2 size={12} className="animate-spin text-txt-muted" />
            </div>
          )}
        </div>
      )}

      {/* Pending action confirmation card */}
      {pendingAction && (
        <div className="bg-purple-50 border-[0.5px] border-purple-300 rounded-[8px] px-3 py-2.5 mb-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">AI</span>
            <span className="text-[10px] font-semibold text-purple-700 uppercase">{pendingAction.type?.replace('_', ' ')}</span>
          </div>
          <div className="space-y-1">
            {pendingAction.recipientName && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">To:</span>
                <input value={pendingAction.recipientName} onChange={e => setPendingAction(p => p ? { ...p, recipientName: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
              </div>
            )}
            {pendingAction.offerAmount && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Amount:</span>
                <input value={pendingAction.offerAmount} onChange={e => setPendingAction(p => p ? { ...p, offerAmount: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" type="number" />
              </div>
            )}
            {pendingAction.offerStatus && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Status:</span>
                <select value={pendingAction.offerStatus} onChange={e => setPendingAction(p => p ? { ...p, offerStatus: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none">
                  {['Pending', 'Accepted', 'Rejected', 'Countered', 'Expired'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {pendingAction.showingDate && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">When:</span>
                <input type="date" value={pendingAction.showingDate} onChange={e => setPendingAction(p => p ? { ...p, showingDate: e.target.value } : p)}
                  className="bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
                <input type="time" value={pendingAction.showingTime ?? '09:00'} onChange={e => setPendingAction(p => p ? { ...p, showingTime: e.target.value } : p)}
                  className="bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
              </div>
            )}
            {pendingAction.channel && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Via:</span>
                <select value={pendingAction.channel} onChange={e => setPendingAction(p => p ? { ...p, channel: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none">
                  {['sms', 'email', 'call', 'offer', 'in_person'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {pendingAction.notes && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-600">Notes:</span>
                <input value={pendingAction.notes} onChange={e => setPendingAction(p => p ? { ...p, notes: e.target.value } : p)}
                  className="flex-1 bg-white rounded px-1.5 py-0.5 text-[10px] border-[0.5px] border-purple-200 focus:outline-none" />
              </div>
            )}
          </div>
          <div className="flex gap-1.5 pt-1">
            <button onClick={confirmAction} disabled={executing}
              className="flex-1 bg-semantic-purple hover:bg-semantic-purple/90 disabled:opacity-50 text-white text-[10px] font-semibold py-1.5 rounded-[6px] transition-colors">
              {executing ? 'Executing...' : 'Confirm'}
            </button>
            <button onClick={() => setPendingAction(null)}
              className="flex-1 bg-surface-secondary text-txt-secondary text-[10px] font-medium py-1.5 rounded-[6px] hover:bg-surface-tertiary transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Record offer, schedule showing, analyze..."
          className="flex-1 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
        />
        <button onClick={send} disabled={!input.trim() || loading}
          className="bg-semantic-purple hover:bg-semantic-purple/90 disabled:opacity-40 text-white px-3 rounded-[8px] transition-colors">
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Contacts Section ────────────────────────────────────────────────────────

const CONTACT_ROLES = ['Primary Seller', 'Co-Seller', 'Spouse', 'Buyer', 'Buyer Agent', 'Attorney', 'Agent', 'Other']

function ContactsSection({ propertyId, tenantSlug, initialSellers }: {
  propertyId: string
  tenantSlug: string
  initialSellers: PropertyDetail['sellers']
}) {
  const [sellers, setSellers] = useState(initialSellers)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; phone: string | null; email: string | null }>>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedRole, setSelectedRole] = useState('Primary Seller')

  async function searchContacts(q: string) {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.contacts ?? [])
    } catch { setResults([]) }
    setSearching(false)
  }

  async function addContact(contact: { id: string; name: string; phone: string | null; email: string | null }) {
    setAdding(true)
    try {
      const isPrimary = selectedRole === 'Primary Seller' || sellers.length === 0
      const res = await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ghlContactId: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          role: selectedRole,
          isPrimary,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSellers(prev => [...prev, data.seller])
        setShowSearch(false)
        setQuery('')
        setResults([])
      }
    } catch {}
    setAdding(false)
  }

  async function removeContact(sellerId: string) {
    try {
      const res = await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId }),
      })
      if (res.ok) setSellers(prev => prev.filter(s => s.id !== sellerId))
    } catch {}
  }

  async function updateRole(sellerId: string, role: string) {
    try {
      await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateRole', sellerId, role }),
      })
      setSellers(prev => prev.map(s => s.id === sellerId ? { ...s, role } : s))
    } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
          <Users size={10} className="inline -mt-0.5 text-gunner-red" /> Contacts ({sellers.length})
        </p>
        <button onClick={() => setShowSearch(!showSearch)}
          className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-0.5 transition-colors">
          {showSearch ? <X size={10} /> : <Plus size={10} />}
          {showSearch ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* GHL Contact search */}
      {showSearch && (
        <div className="mb-3 space-y-2">
          <input
            autoFocus value={query} onChange={e => searchContacts(e.target.value)}
            placeholder="Search GHL contacts..."
            className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none"
          />
          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
            className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-1.5 text-ds-fine text-txt-primary">
            {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {searching && <p className="text-ds-fine text-txt-muted">Searching...</p>}
          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {results.map(c => {
                const alreadyLinked = sellers.some(s => s.ghlContactId === c.id)
                return (
                  <button key={c.id} onClick={() => !alreadyLinked && addContact(c)}
                    disabled={alreadyLinked || adding}
                    className={`w-full text-left px-2.5 py-1.5 rounded-[6px] text-ds-fine transition-colors ${
                      alreadyLinked ? 'bg-surface-tertiary text-txt-muted cursor-not-allowed' : 'bg-surface-secondary hover:bg-surface-tertiary text-txt-primary'
                    }`}>
                    <p className="font-medium">{c.name}{alreadyLinked ? ' (linked)' : ''}</p>
                    <p className="text-txt-muted">{c.phone ?? c.email ?? '—'}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Linked contacts list */}
      {sellers.length === 0 ? (
        <p className="text-ds-fine text-txt-muted">No contacts linked</p>
      ) : (
        <div className="space-y-2">
          {sellers.map(s => (
            <div key={s.id} className="bg-surface-secondary rounded-[8px] px-2.5 py-2 group">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Link href={`/${tenantSlug}/sellers/${s.id}`}
                      className="text-ds-body text-txt-primary font-medium truncate hover:text-gunner-red hover:underline transition-colors">
                      {titleCase(s.name)}
                    </Link>
                    <select value={s.role} onChange={e => updateRole(s.id, e.target.value)}
                      className="text-[9px] font-medium bg-transparent text-gunner-red cursor-pointer border-none focus:outline-none">
                      {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {s.phone && <p className="text-ds-fine text-txt-secondary">{formatPhone(s.phone)}</p>}
                  {s.email && <p className="text-ds-fine text-txt-secondary truncate">{s.email}</p>}
                </div>
                <button onClick={() => removeContact(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-semantic-red transition-all shrink-0 mt-0.5">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Offer Type Manager ──────────────────────────────────────────────────────
// Single header control that manages the per-property list of alt offer types
// (Cash is always implicit and never appears in this list). Adding a type makes
// it appear as a sub-row in every PriceMatrixCard below; removing it strips
// every price entered under that type server-side.

const OFFER_TYPE_PRESETS = ['Novation', 'Subto', 'Partnership', 'Seller Finance']

function OfferTypeManager({ propertyId, offerTypes, onChange }: {
  propertyId: string
  offerTypes: string[]
  onChange: (next: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(next: string[]) {
    setSaving(true)
    try {
      await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerTypes: next }),
      })
      onChange(next)
    } catch {}
    setSaving(false)
  }

  function addType(name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed.toLowerCase() === 'cash' || offerTypes.includes(trimmed)) {
      setAdding(false); setNewName(''); return
    }
    save([...offerTypes, trimmed])
    setAdding(false); setNewName('')
  }

  function removeType(name: string) {
    if (!window.confirm(`Remove "${name}" offer type? Any values entered for this type will be cleared.`)) return
    save(offerTypes.filter(t => t !== name))
  }

  const availablePresets = OFFER_TYPE_PRESETS.filter(p => !offerTypes.includes(p))

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mr-0.5">Offer Types</span>
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gunner-red-light text-gunner-red border-[0.5px] border-gunner-red/20">Cash</span>
      {offerTypes.map(t => (
        <span key={t} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-txt-primary border-[0.5px] border-[rgba(0,0,0,0.08)]">
          {t}
          <button onClick={() => removeType(t)} disabled={saving} className="hover:text-semantic-red transition-colors"><X size={8} /></button>
        </span>
      ))}
      {adding ? (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addType(newName)
              if (e.key === 'Escape') { setAdding(false); setNewName('') }
            }}
            placeholder="Type name…"
            className="text-[10px] bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
          />
          {availablePresets.slice(0, 3).map(p => (
            <button key={p} onClick={() => addType(p)} disabled={saving}
              className="text-[9px] text-txt-secondary hover:text-gunner-red underline transition-colors">{p}</button>
          ))}
          <button onClick={() => { setAdding(false); setNewName('') }} className="text-txt-muted hover:text-semantic-red transition-colors"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="text-[10px] font-medium text-gunner-red hover:text-gunner-red-dark inline-flex items-center gap-0.5 transition-colors">
          <Plus size={10} /> Add type
        </button>
      )}
    </div>
  )
}

// ─── Price Matrix Card ────────────────────────────────────────────────────────
// One card per price field (Asking, MAO, Contract, etc.). Cash value lives big
// at the top (mirrors legacy InlineEditCard); alt-type rows render underneath
// as a small grey list. Each cell is independently inline-editable and saves
// through the shared PATCH /api/properties/[id] — altPrices is merge-by-key
// server-side so concurrent edits on different cells don't clobber.

export function PriceMatrixCard({
  label, field, cashValue, source, altPrices, offerTypes, propertyId, onCashSaved, onAltSaved,
}: {
  label: string
  field: string
  cashValue: string | null
  source?: string | null
  altPrices: Record<string, Record<string, string | null>>
  offerTypes: string[]
  propertyId: string
  onCashSaved: (field: string, val: string | null, src: string) => void
  onAltSaved: (type: string, field: string, val: string | null) => void
}) {
  const [editing, setEditing] = useState<'cash' | string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const s = sourceStyles(source || null)

  function startEdit(key: 'cash' | string) {
    const current = key === 'cash' ? (cashValue ?? '') : (altPrices[key]?.[field] ?? '')
    setEditValue(String(current ?? ''))
    setEditing(key)
  }

  async function saveEdit() {
    if (saving || editing == null) return
    const raw = editValue.trim()
    const currentValue = editing === 'cash' ? (cashValue ?? '') : (altPrices[editing]?.[field] ?? '')
    if (raw === String(currentValue ?? '')) { setEditing(null); return }

    setSaving(true)
    try {
      if (editing === 'cash') {
        const newVal = raw || null
        await fetch(`/api/properties/${propertyId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: newVal, fieldSources: newVal ? { [field]: 'user' } : { [field]: '' } }),
        })
        onCashSaved(field, newVal, newVal ? 'user' : '')
      } else {
        const type = editing
        const newVal = raw || null
        await fetch(`/api/properties/${propertyId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ altPrices: { [type]: { [field]: newVal } } }),
        })
        onAltSaved(type, field, newVal)
      }
    } catch {}
    setSaving(false)
    setEditing(null)
  }

  const cashDisplay = cashValue ? `$${Number(cashValue).toLocaleString()}` : null

  return (
    <div className={`${s.bg} rounded-[10px] px-3 py-2.5 flex flex-col gap-1 group relative`}>
      {s.tag && (
        <span className={`absolute top-1 right-1.5 text-[7px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
      )}

      {/* Cash hero */}
      <div>
        <p className={`text-[9px] font-semibold uppercase tracking-wider flex items-center justify-between ${s.label}`}>
          {label}
          <Pencil size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </p>
        {editing === 'cash' ? (
          <input
            autoFocus type="number" value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }}
            className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-1 text-ds-card font-semibold text-txt-primary mt-0.5 focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
            disabled={saving}
          />
        ) : (
          <button onClick={() => startEdit('cash')} className="text-left w-full mt-0.5 flex items-baseline gap-1.5 cursor-pointer">
            <span className={`text-ds-card font-semibold ${cashDisplay ? s.value : 'text-txt-muted'}`}>
              {cashDisplay ?? '—'}
            </span>
            <span className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider">Cash</span>
          </button>
        )}
      </div>

      {/* Alt-type rows */}
      {offerTypes.length > 0 && (
        <div className="border-t border-[rgba(0,0,0,0.06)] pt-1 space-y-0.5">
          {offerTypes.map(type => {
            const altValue = altPrices[type]?.[field] ?? null
            const altDisplay = altValue ? `$${Number(altValue).toLocaleString()}` : null
            const isEditing = editing === type
            return (
              <div key={type} className="flex items-center justify-between text-[10px]">
                <span className="text-txt-muted font-medium truncate pr-1">{type}</span>
                {isEditing ? (
                  <input
                    autoFocus type="number" value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }}
                    className="w-24 bg-white border-[0.5px] border-gunner-red/30 rounded-[4px] px-1.5 py-0 text-[10px] font-medium text-right focus:outline-none"
                    disabled={saving}
                  />
                ) : (
                  <button onClick={() => startEdit(type)}
                    className={`font-semibold hover:text-gunner-red transition-colors ${altDisplay ? 'text-txt-primary' : 'text-txt-muted'}`}>
                    {altDisplay ?? '—'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Computed Spread Card ────────────────────────────────────────────────────
// Read-only matrix card mirroring PriceMatrixCard's visual structure. Cash hero
// plus alt-type sub-rows, all computed as acceptedPrice − contractPrice for
// that offer type. Keeps the Profit Summary row in visual lockstep with the
// Assignment Fee + Final Profit cards next to it (same height, same layout,
// same alt-type sub-rows populated from offerTypes).

export function ComputedSpreadCard({
  cashAccepted, cashContract, altPrices, offerTypes,
}: {
  cashAccepted: string | null
  cashContract: string | null
  altPrices: Record<string, Record<string, string | null>>
  offerTypes: string[]
}) {
  function spreadFor(accepted: string | null | undefined, contract: string | null | undefined): number | null {
    if (!accepted || !contract) return null
    const a = Number(accepted), c = Number(contract)
    if (!Number.isFinite(a) || !Number.isFinite(c)) return null
    return a - c
  }

  const cashSpread = spreadFor(cashAccepted, cashContract)
  const cashDisplay = cashSpread != null ? `$${cashSpread.toLocaleString()}` : null

  // Reuse the exact same source-style tokens as PriceMatrixCard with source='ai'
  // so wrapper, label, and value colors are byte-identical to the cards next to
  // us. This is the only way to guarantee visual parity — hand-rolled hex
  // shades drift.
  const s = sourceStyles('ai')

  return (
    <div className={`${s.bg} rounded-[10px] px-3 py-2.5 flex flex-col gap-1 relative`}>
      {s.tag && (
        <span className={`absolute top-1 right-1.5 text-[7px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
      )}
      {/* Cash hero — matches PriceMatrixCard markup, minus the Pencil (read-only) */}
      <div>
        <p className={`text-[9px] font-semibold uppercase tracking-wider ${s.label}`}>EST. SPREAD</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className={`text-ds-card font-semibold ${cashDisplay ? s.value : 'text-txt-muted'}`}>
            {cashDisplay ?? '—'}
          </span>
          <span className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider">Cash</span>
        </div>
      </div>

      {/* Alt-type sub-rows — same markup as PriceMatrixCard's alt rows */}
      {offerTypes.length > 0 && (
        <div className="border-t border-[rgba(0,0,0,0.06)] pt-1 space-y-0.5">
          {offerTypes.map(type => {
            const altSpread = spreadFor(altPrices[type]?.acceptedPrice, altPrices[type]?.contractPrice)
            const display = altSpread != null ? `$${altSpread.toLocaleString()}` : null
            return (
              <div key={type} className="flex items-center justify-between text-[10px]">
                <span className="text-txt-muted font-medium truncate pr-1">{type}</span>
                <span className={`font-semibold ${display ? 'text-txt-primary' : 'text-txt-muted'}`}>
                  {display ?? '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Property Story Card ──────────────────────────────────────────────────────
// Replaces Description + Internal Notes on Overview. AI-generated paragraph
// that updates after each graded call + daily 7am cron. Manual refresh button
// for on-demand regen. Empty state shown when there's not enough signal.

function PropertyStoryCard({
  propertyId, initialStory, initialUpdatedAt,
}: {
  propertyId: string
  initialStory: string | null
  initialUpdatedAt: string | null
}) {
  const [story, setStory] = useState(initialStory)
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  async function regenerate() {
    setRegenerating(true); setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/story`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Regeneration failed')
        toast('Story regeneration failed', 'error')
      } else if (data.status === 'skipped') {
        setError(data.reason ?? 'Not enough signal yet')
      } else {
        setStory(data.story ?? null)
        setUpdatedAt(data.storyUpdatedAt ?? null)
        toast('Story refreshed', 'success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      toast('Story regeneration failed', 'error')
    }
    setRegenerating(false)
  }

  const updatedLabel = updatedAt
    ? `Updated ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}`
    : 'Not generated yet'

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={11} className="text-semantic-purple" />
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Deal Story</p>
          <span className="text-[8px] text-txt-muted">{updatedLabel}</span>
        </div>
        <button onClick={regenerate} disabled={regenerating}
          className="text-[9px] font-medium text-semantic-blue hover:text-semantic-blue/80 flex items-center gap-1 disabled:opacity-50 transition-colors">
          {regenerating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>
      <div className="p-4">
        {regenerating && !story ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-surface-secondary rounded w-full" />
            <div className="h-3 bg-surface-secondary rounded w-5/6" />
            <div className="h-3 bg-surface-secondary rounded w-4/5" />
          </div>
        ) : story ? (
          <p className="text-ds-fine text-txt-primary whitespace-pre-wrap leading-relaxed">{story}</p>
        ) : (
          <p className="text-ds-fine text-txt-muted italic">
            {error ?? 'No story yet. Grade a call, add sellers or milestones, or hit Regenerate to build one.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Compact Detail Cell ─────────────────────────────────────────────────────
// Label + clickable value pill, styled to match the Target Markets tag row.
// Replaces the big-box DetailCell grid inside Property Details on Overview.

function CompactDetailCell({
  label, value, field, propertyId, type = 'text', options, source, suffix, onSaved,
}: {
  label: string
  value: string | number | null
  field: string
  propertyId: string
  type?: 'number' | 'text' | 'select'
  options?: string[]
  source?: string | null
  suffix?: string
  onSaved: (field: string, val: string | number | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const s = sourceStyles(source ?? null)
  const display = value != null && value !== ''
    ? (typeof value === 'number'
        ? (field === 'yearBuilt' ? String(value) : value.toLocaleString())
        : String(value))
    : null
  const displayWithSuffix = display && suffix ? `${display} ${suffix}` : display

  async function save(val: string | number | null) {
    if (saving) return
    setSaving(true)
    try {
      const hasVal = val != null && val !== ''
      await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val, fieldSources: { [field]: hasVal ? 'user' : '' } }),
      })
      onSaved(field, val, hasVal ? 'user' : '')
    } catch {}
    setSaving(false)
    setEditing(false)
    setDropdownOpen(false)
  }

  const pillClass = `inline-flex items-center gap-1 text-ds-fine font-medium transition-colors ${
    source ? `${s.bg} px-2 py-0.5 rounded-[6px]` : ''
  } ${display ? (source ? s.value : 'text-txt-primary') : 'text-txt-muted'} hover:text-gunner-red group`

  if (editing && type !== 'select') {
    return (
      <div className="flex items-center justify-between gap-2 h-[28px]">
        <span className="text-[10px] text-txt-muted font-medium shrink-0">{label}</span>
        <input
          autoFocus type={type === 'number' ? 'number' : 'text'} value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => {
            const raw = editValue.trim()
            const next = type === 'number' ? (raw ? Number(raw) : null) : (raw || null)
            save(next)
          }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="w-32 bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-0.5 text-ds-fine text-right focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
          disabled={saving}
        />
      </div>
    )
  }

  const pill = (
    <button
      onClick={() => {
        if (type === 'select') { setDropdownOpen(o => !o); return }
        setEditValue(value != null ? String(value) : '')
        setEditing(true)
      }}
      className={pillClass}
    >
      {displayWithSuffix ?? '—'}
      {/* Tag text intentionally omitted — panel header legend carries the color key */}
      <Pencil size={7} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />
    </button>
  )

  if (type === 'select') {
    return (
      <div className="flex items-center justify-between gap-2 h-[28px]">
        <span className="text-[10px] text-txt-muted font-medium shrink-0">{label}</span>
        <FloatingDropdown
          open={dropdownOpen}
          onOpenChange={setDropdownOpen}
          width={160}
          trigger={pill}
        >
          <div className="py-0.5 max-h-48 overflow-y-auto">
            {(options ?? []).map(o => (
              <button key={o} onClick={() => save(o)}
                className={`block w-full text-left px-3 py-1.5 text-ds-fine hover:bg-surface-secondary transition-colors ${
                  o === value ? 'font-semibold text-gunner-red' : 'text-txt-primary'
                }`}>{o}</button>
            ))}
            {value && (
              <button onClick={() => save(null)}
                className="block w-full text-left px-3 py-1.5 text-ds-fine text-semantic-red hover:bg-surface-secondary transition-colors border-t border-[rgba(0,0,0,0.06)]">
                Clear
              </button>
            )}
          </div>
        </FloatingDropdown>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 h-[28px]">
      <span className="text-[10px] text-txt-muted font-medium shrink-0">{label}</span>
      {pill}
    </div>
  )
}

// ─── Compact Multi-Tag Cell ──────────────────────────────────────────────────
// Vertical label + wrapping pills + inline +Add affordance. Used for Market +
// Project Type inside the narrow Details column of the Property Details panel.
// Same API semantics as TagRow (saves via PATCH [field]: string[]).

function CompactMultiTag({
  label, values, options, field, propertyId, source, allowCustom, onSaved,
}: {
  label: string
  values: string[]
  options: string[]
  field: string
  propertyId: string
  source?: string | null
  allowCustom?: boolean
  onSaved: (field: string, vals: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [local, setLocal] = useState(values)

  useEffect(() => { setLocal(values) }, [values])

  const filtered = options.filter(o =>
    !local.includes(o) && o.toLowerCase().includes(search.toLowerCase())
  )
  const showCustom = allowCustom && search.length >= 2 &&
    !options.some(o => o.toLowerCase() === search.toLowerCase()) &&
    !local.some(v => v.toLowerCase() === search.toLowerCase())

  async function toggle(val: string) {
    const next = local.includes(val) ? local.filter(v => v !== val) : [...local, val]
    setLocal(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next, fieldSources: { [field]: 'user' } }),
      })
      if (res.ok) onSaved(field, next)
      else setLocal(values)
    } catch { setLocal(values) }
    setSaving(false)
    setSearch('')
  }

  // Neutral grey by default so the row reads the same weight as a plain
  // CompactDetailCell value; source-tagged styling only when set explicitly.
  const pillStyle = source === 'api' ? 'bg-purple-100 text-purple-700'
    : source === 'ai' ? 'bg-blue-100 text-blue-700'
    : source === 'user' ? 'bg-green-100 text-green-700'
    : 'bg-surface-secondary text-txt-secondary'

  return (
    <div className="flex items-center justify-between gap-2 h-[28px]">
      <span className="text-[10px] text-txt-muted font-medium shrink-0">{label}</span>
      {/* Right side: pills + Add button. flex-nowrap + overflow-hidden keeps the
          row at a fixed height no matter how many tags are entered — content
          never pushes sibling rows down. Pills remain readable for typical
          1–3 values; open the dropdown to manage the full list. */}
      <div className="flex items-center gap-1 flex-nowrap overflow-hidden justify-end min-w-0">
        {local.map(v => (
          <span key={v} className={`inline-flex items-center gap-1 ${pillStyle} text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0`}>
            {v}
            <button onClick={() => toggle(v)} className="hover:opacity-60 transition-opacity"><X size={8} /></button>
          </span>
        ))}
        <FloatingDropdown
          open={open}
          onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}
          width={200}
          trigger={
            <button onClick={() => setOpen(!open)}
              className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-txt-muted hover:text-gunner-red px-1.5 py-0.5 rounded-full border border-dashed border-[rgba(0,0,0,0.12)] hover:border-gunner-red/30 transition-all">
              <Plus size={8} /> Add
            </button>
          }
        >
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder={allowCustom ? 'Search or add custom…' : 'Search…'}
            className="w-full bg-surface-secondary rounded-[4px] px-2 py-1 text-[10px] placeholder-txt-muted focus:outline-none mb-1" />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.map(o => (
              <button key={o} onClick={() => toggle(o)} disabled={saving}
                className="w-full text-left text-[10px] text-txt-primary px-2 py-1 rounded hover:bg-surface-secondary transition-colors">{o}</button>
            ))}
            {showCustom && (
              <button onClick={() => toggle(search)} disabled={saving}
                className="w-full text-left text-[10px] text-gunner-red font-semibold px-2 py-1 rounded hover:bg-surface-secondary transition-colors">
                + Add &ldquo;{search}&rdquo;
              </button>
            )}
            {filtered.length === 0 && !showCustom && (
              <p className="text-[10px] text-txt-muted px-2 py-1">No options</p>
            )}
          </div>
        </FloatingDropdown>
      </div>
    </div>
  )
}

// ─── Numbers Column — tabbed per offer type ─────────────────────────────────
// Third column of the Property Details panel. Tab bar at top (Cash persistent
// default + any alt offer types from OfferTypeManager). Each tab shows the 5
// fields (ARV, Construction, Max Offer, Risk Factor, Price) with source color
// coding. Cash tab writes to top-level property columns via handleSaved; alt
// tabs write to altPrices[type][field] via handleAltSaved. Same purple/blue/
// green source scheme as the rest of the panel.

const NUMBERS_FIELDS: Array<{ key: string; label: string; kind: 'money' | 'text' }> = [
  { key: 'arv',                 label: 'ARV',          kind: 'money' },
  { key: 'constructionEstimate', label: 'Construction', kind: 'money' },
  { key: 'mao',                 label: 'Max Offer',    kind: 'money' },
  { key: 'riskFactor',          label: 'Risk Factor',  kind: 'text'  },
  { key: 'askingPrice',         label: 'Price',        kind: 'money' },
]

function NumbersColumn({
  propertyId, cashValues, cashSources, altPrices, offerTypes,
  onCashSaved, onAltSaved,
}: {
  propertyId: string
  cashValues: Record<string, string | null>
  cashSources: Record<string, string>
  altPrices: Record<string, Record<string, string | null>>
  offerTypes: string[]
  onCashSaved: (field: string, val: string | null, src: string) => void
  onAltSaved: (type: string, field: string, val: string | null) => void
}) {
  const [activeTab, setActiveTab] = useState<string>('Cash')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  // If the active tab was an alt type that got removed, snap back to Cash
  useEffect(() => {
    if (activeTab !== 'Cash' && !offerTypes.includes(activeTab)) setActiveTab('Cash')
  }, [offerTypes, activeTab])

  const tabs = ['Cash', ...offerTypes]

  function getValue(field: string): string | null {
    if (activeTab === 'Cash') return cashValues[field] ?? null
    return altPrices[activeTab]?.[field] ?? null
  }

  function getSource(field: string): string | null {
    if (activeTab === 'Cash') return cashSources[field] ?? null
    // Alt-price values don't have API/AI source tracking — they originate from
    // user edits, so the presence of a value implies user-edited.
    return altPrices[activeTab]?.[field] ? 'user' : null
  }

  function formatDisplay(field: string, val: string | null): string | null {
    if (val == null || val === '') return null
    const f = NUMBERS_FIELDS.find(x => x.key === field)
    if (f?.kind === 'money') return `$${Number(val).toLocaleString()}`
    return val
  }

  // Risk Factor is computed: (Construction + Max Offer) / ARV for the active
  // offer-type tab. Returns null when any input is missing or ARV is zero.
  // Displayed as a percentage — lower = less exposure against the as-repaired
  // value. Intentionally read-only: users edit the three inputs, not the ratio.
  function computedRiskFactor(): string | null {
    const src = activeTab === 'Cash' ? cashValues : (altPrices[activeTab] ?? {})
    const construction = Number(src.constructionEstimate)
    const maxOffer = Number(src.mao)
    const arv = Number(src.arv)
    if (!Number.isFinite(construction) || !Number.isFinite(maxOffer) || !Number.isFinite(arv) || arv <= 0) return null
    return ((construction + maxOffer) / arv * 100).toFixed(1) + '%'
  }

  async function save(field: string) {
    if (saving) return
    const raw = editValue.trim()
    const current = getValue(field) ?? ''
    if (raw === String(current ?? '')) { setEditingField(null); return }
    setSaving(true)
    try {
      const newVal = raw || null
      if (activeTab === 'Cash') {
        await fetch(`/api/properties/${propertyId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: newVal, fieldSources: { [field]: newVal ? 'user' : '' } }),
        })
        onCashSaved(field, newVal, newVal ? 'user' : '')
      } else {
        await fetch(`/api/properties/${propertyId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ altPrices: { [activeTab]: { [field]: newVal } } }),
        })
        onAltSaved(activeTab, field, newVal)
      }
    } catch {}
    setSaving(false)
    setEditingField(null)
  }

  return (
    <div>
      {/* Section header + tab bar — matched underline treatment with sibling columns */}
      <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-[rgba(0,0,0,0.08)]">
        <p className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em] shrink-0">Numbers</p>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {tabs.map(t => {
            const isActive = activeTab === t
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`text-[9px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                  isActive
                    ? (t === 'Cash' ? 'bg-gunner-red text-white' : 'bg-txt-primary text-white')
                    : 'bg-surface-secondary text-txt-muted hover:text-txt-secondary'
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* 5 field rows */}
      <div className="space-y-0.5">
        {NUMBERS_FIELDS.map(f => {
          // Risk Factor is derived: (construction + max offer) / arv for the
          // active offer-type tab. Read-only — rendered in the blue "AI" pill
          // styling since the value originates from a computation, not a user
          // edit. Falls back to muted plain text when inputs are incomplete.
          if (f.key === 'riskFactor') {
            const display = computedRiskFactor()
            const ai = sourceStyles('ai')
            return (
              <div key={f.key} className="flex items-center justify-between gap-2 h-[28px]" title="(Construction + Max Offer) / ARV">
                <span className="text-[10px] text-txt-muted font-medium shrink-0">{f.label}</span>
                {display ? (
                  <span className={`inline-flex items-center text-ds-fine font-medium px-2 py-0.5 rounded-[6px] ${ai.bg} ${ai.value}`}>
                    {display}
                  </span>
                ) : (
                  <span className="text-ds-fine font-medium text-txt-muted">—</span>
                )}
              </div>
            )
          }

          const val = getValue(f.key)
          const src = getSource(f.key)
          const display = formatDisplay(f.key, val)
          const s = sourceStyles(src ?? null)
          const isEditing = editingField === f.key
          const pillClass = `inline-flex items-center gap-1 text-ds-fine font-medium transition-colors ${
            src ? `${s.bg} px-2 py-0.5 rounded-[6px]` : ''
          } ${display ? (src ? s.value : 'text-txt-primary') : 'text-txt-muted'} hover:text-gunner-red group`

          if (isEditing) {
            return (
              <div key={f.key} className="flex items-center justify-between gap-2 h-[28px]">
                <span className="text-[10px] text-txt-muted font-medium shrink-0">{f.label}</span>
                <input
                  autoFocus
                  type={f.kind === 'money' ? 'number' : 'text'}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => save(f.key)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingField(null)
                  }}
                  disabled={saving}
                  className="w-28 bg-white border-[0.5px] border-gunner-red/30 rounded-[6px] px-2 py-0.5 text-ds-fine text-right focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                />
              </div>
            )
          }

          return (
            <div key={f.key} className="flex items-center justify-between gap-2 h-[28px]">
              <span className="text-[10px] text-txt-muted font-medium shrink-0">{f.label}</span>
              <button
                onClick={() => { setEditValue(val ?? ''); setEditingField(f.key) }}
                className={pillClass}
              >
                {display ?? '—'}
                {/* Tag text intentionally omitted — panel header legend carries the color key */}
                <Pencil size={7} className="opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

// Shape of the shared editable state passed down from PropertyDetailClient.
// Declared here so OverviewTab and PropertyDetailsPanel share a single type
// instead of each re-declaring the same field list. Fields come from the
// Property row + a handful of derived columns (arv / construction estimate).
interface SharedVals {
  askingPrice: string | null
  mao: string | null
  currentOffer: string | null
  contractPrice: string | null
  highestOffer: string | null
  acceptedPrice: string | null
  assignmentFee: string | null
  finalProfit: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  lotSize: string | null
  propertyType: string | null
  projectType: string[]
  propertyMarkets: string[]
  occupancy: string | null
  lockboxCode: string | null
  waterType: string | null
  waterNotes: string | null
  sewerType: string | null
  sewerCondition: string | null
  sewerNotes: string | null
  electricType: string | null
  electricNotes: string | null
  description: string | null
  internalNotes: string | null
  propertyCondition: string | null
  arv: string | null
  constructionEstimate: string | null
  riskFactor: string | null
  // Condition + intangibles + location/market grades
  roofCondition: string | null
  windowsCondition: string | null
  sidingCondition: string | null
  exteriorCondition: string | null
  comparableRisk: string | null
  basementStatus: string | null
  curbAppeal: string | null
  neighborsGrade: string | null
  parkingType: string | null
  yardGrade: string | null
  locationGrade: string | null
  marketRisk: string | null
}

// ─── Property Details Panel ─────────────────────────────────────────────────
// Lives at page level, above the tab bar. Three-column layout (Details /
// Specs / Numbers) kept in sync with the Overview tab's pricing rows via the
// shared state in PropertyDetailClient.

function PropertyDetailsPanel({
  propertyId, vals, sources, altPrices, offerTypes, onSaved, onArraySaved, onAltSaved, projectTypeOptions,
}: {
  propertyId: string
  vals: SharedVals
  sources: Record<string, string>
  altPrices: Record<string, Record<string, string | null>>
  offerTypes: string[]
  onSaved: (field: string, val: string | number | null, src?: string) => void
  onArraySaved: (field: string, vals: string[]) => void
  onAltSaved: (type: string, field: string, val: string | null) => void
  projectTypeOptions?: string[]
}) {
  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Property Details</p>
        <div className="flex items-center gap-2">
          <span className="text-[7px] font-bold text-purple-500 bg-purple-50 px-1 py-0.5 rounded">API</span>
          <span className="text-[7px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded">AI</span>
          <span className="text-[7px] font-bold text-green-500 bg-green-50 px-1 py-0.5 rounded">EDITED</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(0,0,0,0.04)]">
        {/* Column 1 — Details */}
        <div className="px-4 py-2">
          <p className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em] pb-1.5 mb-2 border-b border-[rgba(0,0,0,0.08)]">Details</p>
          <CompactDetailCell label="Type" value={vals.propertyType} field="propertyType" propertyId={propertyId} type="select" options={PROPERTY_TYPE_OPTIONS} source={sources.propertyType} onSaved={onSaved} />
          <CompactMultiTag label="Market" values={vals.propertyMarkets} options={['Nashville', 'Columbia', 'Knoxville', 'Chattanooga']}
            field="propertyMarkets" propertyId={propertyId} allowCustom source={sources.propertyMarkets} onSaved={onArraySaved} />
          <CompactMultiTag label="Project Type" values={vals.projectType} options={projectTypeOptions ?? PROJECT_TYPE_OPTIONS}
            field="projectType" propertyId={propertyId} allowCustom source={sources.projectType} onSaved={onArraySaved} />
          <CompactDetailCell label="Access" value={vals.lockboxCode} field="lockboxCode" propertyId={propertyId} source={sources.lockboxCode} onSaved={onSaved} />
          <CompactDetailCell label="Occupancy" value={vals.occupancy} field="occupancy" propertyId={propertyId} type="select" options={['Vacant', 'Owner', 'Renter', 'Squatter', 'Family']} source={sources.occupancy} onSaved={onSaved} />
        </div>

        {/* Column 2 — Specs */}
        <div className="px-4 py-2">
          <p className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em] pb-1.5 mb-2 border-b border-[rgba(0,0,0,0.08)]">Specs</p>
          <CompactDetailCell label="Beds" value={vals.beds} field="beds" propertyId={propertyId} type="number" source={sources.beds} onSaved={onSaved} />
          <CompactDetailCell label="Baths" value={vals.baths} field="baths" propertyId={propertyId} type="number" source={sources.baths} onSaved={onSaved} />
          <CompactDetailCell label="Sqft" value={vals.sqft} field="sqft" propertyId={propertyId} type="number" source={sources.sqft} suffix="sqft" onSaved={onSaved} />
          <CompactDetailCell label="Lot Size" value={vals.lotSize} field="lotSize" propertyId={propertyId} source={sources.lotSize} onSaved={onSaved} />
          <CompactDetailCell label="Year Built" value={vals.yearBuilt} field="yearBuilt" propertyId={propertyId} type="number" source={sources.yearBuilt} onSaved={onSaved} />
        </div>

        {/* Column 3 — Numbers (tabbed per offer type) */}
        <div className="px-4 py-2">
          <NumbersColumn
            propertyId={propertyId}
            cashValues={{
              arv: vals.arv,
              constructionEstimate: vals.constructionEstimate,
              mao: vals.mao,
              riskFactor: vals.riskFactor,
              askingPrice: vals.askingPrice,
            }}
            cashSources={sources}
            altPrices={altPrices}
            offerTypes={offerTypes}
            onCashSaved={onSaved}
            onAltSaved={onAltSaved}
          />
        </div>
      </div>

      {/* Second tier — qualitative grades that require eyes-on or
          neighborhood feel. Same 3-col layout as the top tier so visuals
          line up; each field is a free-form string (A-F, 1-10, "Good",
          "Needs replacement", etc.). */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(0,0,0,0.04)] border-t border-[rgba(0,0,0,0.04)]">
        {/* Column 1 — Condition */}
        <div className="px-4 py-2">
          <p className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em] pb-1.5 mb-2 border-b border-[rgba(0,0,0,0.08)]">Condition</p>
          <CompactDetailCell label="Roof" value={vals.roofCondition} field="roofCondition" propertyId={propertyId} source={sources.roofCondition} onSaved={onSaved} />
          <CompactDetailCell label="Windows" value={vals.windowsCondition} field="windowsCondition" propertyId={propertyId} source={sources.windowsCondition} onSaved={onSaved} />
          <CompactDetailCell label="Siding" value={vals.sidingCondition} field="sidingCondition" propertyId={propertyId} source={sources.sidingCondition} onSaved={onSaved} />
          <CompactDetailCell label="Exterior" value={vals.exteriorCondition} field="exteriorCondition" propertyId={propertyId} source={sources.exteriorCondition} onSaved={onSaved} />
        </div>

        {/* Column 2 — Intangibles */}
        <div className="px-4 py-2">
          <p className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em] pb-1.5 mb-2 border-b border-[rgba(0,0,0,0.08)]">Intangibles</p>
          <CompactDetailCell label="Comp Risk" value={vals.comparableRisk} field="comparableRisk" propertyId={propertyId} source={sources.comparableRisk} onSaved={onSaved} />
          <CompactDetailCell label="Basement" value={vals.basementStatus} field="basementStatus" propertyId={propertyId} source={sources.basementStatus} onSaved={onSaved} />
          <CompactDetailCell label="Curb Appeal" value={vals.curbAppeal} field="curbAppeal" propertyId={propertyId} source={sources.curbAppeal} onSaved={onSaved} />
          <CompactDetailCell label="Neighbors" value={vals.neighborsGrade} field="neighborsGrade" propertyId={propertyId} source={sources.neighborsGrade} onSaved={onSaved} />
          <CompactDetailCell label="Parking" value={vals.parkingType} field="parkingType" propertyId={propertyId} source={sources.parkingType} onSaved={onSaved} />
          <CompactDetailCell label="Yard" value={vals.yardGrade} field="yardGrade" propertyId={propertyId} source={sources.yardGrade} onSaved={onSaved} />
        </div>

        {/* Column 3 — Location & Market */}
        <div className="px-4 py-2">
          <p className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em] pb-1.5 mb-2 border-b border-[rgba(0,0,0,0.08)]">Location & Market</p>
          <CompactDetailCell label="Location Grade" value={vals.locationGrade} field="locationGrade" propertyId={propertyId} source={sources.locationGrade} onSaved={onSaved} />
          <CompactDetailCell label="Market Risk" value={vals.marketRisk} field="marketRisk" propertyId={propertyId} source={sources.marketRisk} onSaved={onSaved} />
        </div>
      </div>
    </div>
  )
}

function OverviewTab({
  property, dom, domColor, tenantSlug, runGhlAction, sending, actionMsg, ghlContactId, projectTypeOptions,
  vals, sources, altPrices, offerTypes, onSaved, onArraySaved, onAltSaved, onOfferTypesChange,
}: {
  property: PropertyDetail; dom: number; domColor: string
  tenantSlug: string; runGhlAction: (type: string, payload: Record<string, string>) => void
  sending: boolean; actionMsg: string; ghlContactId: string | null
  projectTypeOptions?: string[]
  vals: SharedVals
  sources: Record<string, string>
  altPrices: Record<string, Record<string, string | null>>
  offerTypes: string[]
  onSaved: (field: string, val: string | number | null, src?: string) => void
  onArraySaved: (field: string, vals: string[]) => void
  onAltSaved: (type: string, field: string, val: string | null) => void
  onOfferTypesChange: (next: string[]) => void
}) {
  // Local alias so the rest of the body can keep using the same names it used
  // when this state was declared locally inside OverviewTab.
  const handleSaved = onSaved
  const handleAltSaved = onAltSaved
  const handleOfferTypesChange = onOfferTypesChange
  // Appointments for this property's contact — fetch past 7 days + next 7 days
  const [appointments, setAppointments] = useState<Array<{ id: string; startTime: string; calendarName: string; status: string }>>([])
  useEffect(() => {
    if (!ghlContactId) return
    const now = new Date()
    // Build date strings for 14 days centered on today
    const dates: string[] = []
    for (let offset = -7; offset <= 7; offset++) {
      const d = new Date(now.getTime() + offset * 86400000)
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }
    // Fetch all dates in parallel and merge
    Promise.all(dates.map(date =>
      fetch(`/api/${tenantSlug}/dayhub/appointments?date=${date}`)
        .then(r => r.json())
        .then(d => (d.appointments ?? []) as Array<{ id: string; contactId: string; startTime: string; calendarName: string; status: string }>)
        .catch(() => [] as Array<{ id: string; contactId: string; startTime: string; calendarName: string; status: string }>)
    )).then(results => {
      const allAppts = results.flat()
      // Filter to this contact and dedup by id
      const seen = new Set<string>()
      const filtered = allAppts
        .filter(a => a.contactId === ghlContactId)
        .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      setAppointments(filtered)
    })
  }, [tenantSlug, ghlContactId])

  // State + handlers are now lifted to PropertyDetailClient and passed as props.
  // This tab stays in sync with the persistent Property Details panel above.

  return (
    <div className="space-y-5">
      {/* Offer type manager — one control, populates sub-rows in every price card below */}
      <OfferTypeManager propertyId={property.id} offerTypes={offerTypes} onChange={handleOfferTypesChange} />

      {/* Row 1 — Pricing Intent */}
      <div>
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Pricing Intent</p>
        <div className="grid grid-cols-3 gap-3">
          <PriceMatrixCard label="ASKING PRICE" field="askingPrice" cashValue={vals.askingPrice} source={sources.askingPrice} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          <PriceMatrixCard label="MAX ALLOWABLE OFFER" field="mao" cashValue={vals.mao} source={sources.mao} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          <PriceMatrixCard label="CURRENT OFFER" field="currentOffer" cashValue={vals.currentOffer} source={sources.currentOffer} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
        </div>
      </div>

      {/* Row 2 — Deal Outcomes */}
      <div>
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Deal Outcomes</p>
        <div className="grid grid-cols-3 gap-3">
          <PriceMatrixCard label="CONTRACT PRICE" field="contractPrice" cashValue={vals.contractPrice} source={sources.contractPrice} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          <PriceMatrixCard label="HIGHEST OFFER" field="highestOffer" cashValue={vals.highestOffer} source={sources.highestOffer} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          <PriceMatrixCard label="ACCEPTED PRICE" field="acceptedPrice" cashValue={vals.acceptedPrice} source={sources.acceptedPrice} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
        </div>
      </div>

      {/* Row 3 — Profit Summary */}
      <div>
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Profit Summary</p>
        <div className="grid grid-cols-3 gap-3">
          <ComputedSpreadCard
            cashAccepted={vals.acceptedPrice}
            cashContract={vals.contractPrice}
            altPrices={altPrices}
            offerTypes={offerTypes}
          />
          <PriceMatrixCard label="ASSIGNMENT FEE" field="assignmentFee" cashValue={vals.assignmentFee} source={sources.assignmentFee} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          <PriceMatrixCard label="FINAL PROFIT" field="finalProfit" cashValue={vals.finalProfit} source={sources.finalProfit} altPrices={altPrices} offerTypes={offerTypes} propertyId={property.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
        </div>
      </div>

      {/* Property Details panel lives at page level above the tab bar now,
          so it persists across tabs. See <PropertyDetailsPanel /> in the
          parent render. */}

      {/* Deal Story — AI-generated narrative, replaces the old Description + Internal Notes
          blocks. Those fields now live on the Deal Blast tab where they feed blast copy. */}
      <PropertyStoryCard
        propertyId={property.id}
        initialStory={property.story}
        initialUpdatedAt={property.storyUpdatedAt}
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: seller + assigned + actions */}
        <div className="space-y-4">
          {/* Contacts (linked GHL contacts) */}
          <ContactsSection propertyId={property.id} tenantSlug={tenantSlug} initialSellers={property.sellers} />

          {/* Team Members */}
          <TeamSection propertyId={property.id} tenantSlug={tenantSlug} />

          {/* AI Actions */}
          <InlineAI propertyId={property.id} />
        </div>

        {/* Right: calls + tasks */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calls */}
          <div>
            {(() => {
              // Filter to graded calls with duration > 0
              const gradedCalls = property.calls.filter(c => c.gradingStatus === 'COMPLETED' && (c.durationSeconds ?? 0) > 0)
              return <>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
              <Phone size={10} className="inline -mt-0.5 text-gunner-red" /> Graded Calls ({gradedCalls.length})
            </p>
            {gradedCalls.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">No graded calls yet</p>
            ) : (
              <div className="space-y-1">
                {gradedCalls.map(c => {
                  const score = c.score ?? 0
                  const sc = score >= 80 ? 'bg-semantic-green text-white' : score >= 60 ? 'bg-semantic-amber text-white' : 'bg-semantic-red text-white'
                  return (
                    <Link key={c.id} href={`/${tenantSlug}/calls/${c.id}`} className="flex items-center gap-3 p-2 rounded-[8px] hover:bg-surface-secondary transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${c.gradingStatus === 'COMPLETED' ? sc : 'bg-surface-tertiary text-txt-muted'}`}>
                        {c.gradingStatus === 'COMPLETED' ? Math.round(score) : '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ds-fine text-txt-secondary truncate">{c.aiSummary ?? `${c.direction.toLowerCase()} ${c.callType ?? 'call'}`}</p>
                        <p className="text-ds-fine text-txt-muted">{c.assignedToName} · {c.calledAt ? formatDistanceToNow(new Date(c.calledAt), { addSuffix: true }) : '—'}</p>
                      </div>
                      <ChevronRight size={10} className="text-txt-muted shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
              </>
            })()}
          </div>

          {/* Tasks */}
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
              <CheckSquare size={10} className="inline -mt-0.5 text-semantic-blue" /> Tasks ({property.tasks.length})
            </p>
            {property.tasks.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">No open tasks</p>
            ) : (
              <div className="space-y-1">
                {property.tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-[8px]">
                    <div className="w-3 h-3 rounded border border-[rgba(0,0,0,0.14)] shrink-0" />
                    <p className="text-ds-fine text-txt-secondary flex-1 truncate">{t.title}</p>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                      t.priority === 'URGENT' ? 'bg-semantic-red-bg text-semantic-red' :
                      t.priority === 'HIGH' ? 'bg-semantic-amber-bg text-semantic-amber' :
                      'bg-surface-tertiary text-txt-muted'
                    }`}>{t.priority.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Appointments */}
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
              <Calendar size={10} className="inline -mt-0.5 text-semantic-purple" /> Appointments ({appointments.length})
            </p>
            {appointments.length === 0 ? (
              <p className="text-ds-fine text-txt-muted">{ghlContactId ? 'No appointments in the last 7 days or next 7 days' : 'No GHL contact linked'}</p>
            ) : (
              <div className="space-y-1">
                {appointments.map(a => {
                  const apptDate = new Date(a.startTime)
                  const isPast = apptDate < new Date()
                  const statusColor = a.status === 'showed' ? 'bg-green-100 text-green-700'
                    : a.status === 'no-show' || a.status === 'noshow' ? 'bg-red-100 text-red-700'
                    : a.status === 'cancelled' ? 'bg-gray-100 text-gray-500'
                    : 'bg-blue-100 text-blue-700'
                  return (
                    <div key={a.id} className={`flex items-center gap-2 p-2 rounded-[8px] ${isPast ? 'opacity-60' : ''}`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isPast ? 'bg-gray-300' : 'bg-semantic-purple'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-ds-fine text-txt-secondary truncate">{a.calendarName}</p>
                        <p className="text-[9px] text-txt-muted">
                          {apptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at{' '}
                          {apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${statusColor}`}>
                        {a.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Data Tab — Contacts Section ─────────────────────────────────────────────

interface SuggestionItem {
  id: string; fieldName: string; fieldLabel: string; targetType: string
  sellerId: string | null; buyerId: string | null
  currentValue: unknown; proposedValue: unknown; confidence: number | null
  evidence: string | null; status: string
}

// ─── Suggestion Review Modal ─────────────────────────────────────────────────

function SuggestionReviewModal({
  suggestions, tenantSlug, propertyId, sellers, onClose, onUpdate,
}: {
  suggestions: SuggestionItem[]
  tenantSlug: string
  propertyId: string
  sellers: PropertyDetail['sellers']
  onClose: () => void
  onUpdate: (remaining: SuggestionItem[]) => void
}) {
  const [items, setItems] = useState(suggestions)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const getContactName = (s: SuggestionItem) => {
    if (s.sellerId) {
      const seller = sellers.find(sel => sel.id === s.sellerId)
      return seller ? `${seller.name} (${seller.role})` : 'Seller'
    }
    return s.targetType === 'property' ? 'Property' : 'Buyer'
  }

  async function handleDecision(id: string, status: 'approved' | 'edited' | 'skipped', finalValue?: unknown) {
    setProcessing(id)
    try {
      const res = await fetch(`/api/${tenantSlug}/properties/${propertyId}/contact-suggestions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: [{ id, status, finalValue }] }),
      })
      if (res.ok) {
        const remaining = items.filter(i => i.id !== id)
        setItems(remaining)
        onUpdate(remaining)
      }
    } catch { /* silent */ }
    setProcessing(null)
    setEditingId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-xl max-h-[80vh] flex flex-col" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
          <div>
            <h2 className="text-[14px] font-bold text-gray-900">{items.length} suggestion{items.length !== 1 ? 's' : ''} to approve</h2>
            <p className="text-[10px] text-gray-500">Review AI-extracted data from calls</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
        </div>

        {/* Suggestion list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {items.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-8">All suggestions reviewed</p>
          ) : (
            items.map(s => (
              <div key={s.id} className="border border-[rgba(0,0,0,0.08)] rounded-[12px] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-900">{s.fieldLabel}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold bg-purple-100 text-[#7F77DD]">✦ AI</span>
                </div>
                <p className="text-[10px] text-gray-500">For: {getContactName(s)}</p>
                <p className="text-[12px] font-medium text-[#7F77DD]">
                  Proposed: {String(s.proposedValue ?? '')}
                </p>
                {s.evidence && (
                  <p className="text-[10px] text-gray-400 italic">&ldquo;{s.evidence}&rdquo;</p>
                )}
                {s.confidence !== null && (
                  <p className="text-[9px] text-gray-400">Confidence: {(s.confidence * 100).toFixed(0)}%</p>
                )}

                {editingId === s.id ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      className="flex-1 text-[11px] px-2 py-1 border border-gray-300 rounded bg-white"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      autoFocus
                    />
                    <button
                      onClick={() => handleDecision(s.id, 'edited', editValue)}
                      disabled={processing === s.id}
                      className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-semibold rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2.5 py-1 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => handleDecision(s.id, 'approved', s.proposedValue)}
                      disabled={processing === s.id}
                      className="px-3 py-1 bg-[#7F77DD] text-white text-[10px] font-semibold rounded-[6px] hover:bg-[#6B63C9] disabled:opacity-50"
                    >
                      Push
                    </button>
                    <button
                      onClick={() => { setEditingId(s.id); setEditValue(String(s.proposedValue ?? '')) }}
                      className="px-3 py-1 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-[6px] hover:bg-amber-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDecision(s.id, 'skipped')}
                      disabled={processing === s.id}
                      className="px-3 py-1 bg-gray-100 text-gray-500 text-[10px] font-semibold rounded-[6px] hover:bg-gray-200 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MLS Panel ───────────────────────────────────────────────────────────────
// Surfaces MLS activity (active/pending/sold flags, listing date, list/sold
// prices, days on market, PPSF, keywords) that flow in from PropertyRadar's
// subscription + any MLS data BatchData returns. Renders nothing when no
// MLS data has been captured.

function MlsPanel({ property }: { property: PropertyDetail }) {
  const hasAnyMls =
    property.mlsActive || property.mlsPending || property.mlsSold ||
    property.mlsStatus || property.mlsListingPrice || property.mlsSoldPrice ||
    property.mlsListingDate || property.mlsDaysOnMarket != null ||
    property.lastMlsStatus || property.lastMlsListPrice ||
    (property.mlsKeywords && property.mlsKeywords.length > 0)

  if (!hasAnyMls) return null

  // Resolve an effective status — current flag first, then text status
  const effectiveStatus = property.mlsActive ? 'Active'
    : property.mlsPending ? 'Pending'
    : property.mlsSold ? 'Sold'
    : property.mlsStatus
    ?? property.lastMlsStatus
    ?? null

  const statusColor = effectiveStatus?.toLowerCase().includes('active') ? 'bg-green-100 text-green-700 border-green-300'
    : effectiveStatus?.toLowerCase().includes('pending') ? 'bg-amber-100 text-amber-700 border-amber-300'
    : effectiveStatus?.toLowerCase().includes('sold') ? 'bg-blue-100 text-blue-700 border-blue-300'
    : effectiveStatus?.toLowerCase().includes('cancel') || effectiveStatus?.toLowerCase().includes('expired') || effectiveStatus?.toLowerCase().includes('fail')
      ? 'bg-slate-100 text-slate-600 border-slate-200'
    : 'bg-gray-100 text-gray-600 border-gray-200'

  const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : '—'
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : '—'

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">MLS History</p>
        {effectiveStatus && (
          <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full border whitespace-nowrap ${statusColor}`}>
            {effectiveStatus}
          </span>
        )}
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <MlsStat label="Listing Date"        value={fmtDate(property.mlsListingDate)} />
        <MlsStat label="Listing Price"       value={fmt(property.mlsListingPrice ?? property.lastMlsListPrice)} />
        <MlsStat label="Sold Price"          value={fmt(property.mlsSoldPrice ?? property.lastMlsSoldPrice)} />
        <MlsStat label="Days on Market"      value={property.mlsDaysOnMarket != null ? String(property.mlsDaysOnMarket) : '—'} />
        <MlsStat label="Price per Sqft"      value={fmt(property.mlsPricePerSqft)} />
        <MlsStat label="Listing Type"        value={property.mlsType ?? '—'} />
      </div>
      {property.mlsKeywords && property.mlsKeywords.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {property.mlsKeywords.map((kw, i) => (
              <span key={i} className="text-[10px] px-2 py-[2px] rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MlsStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-ds-body text-txt-primary">{value}</p>
    </div>
  )
}

// ─── Vendor Intel Panel ──────────────────────────────────────────────────
// Surfaces BatchData + PropertyRadar scalars captured by the comprehensive
// vendor migration: seller motivation, owner portfolio, foreclosure trustee
// contact, owner flags. Renders only sections that have data.

function VendorIntelPanel({ property }: { property: PropertyDetail }) {
  // v1.1 Wave 5 — owner-side flags + portfolio aggregates moved to Seller.
  // primarySeller (or first seller) carries the canonical values now.
  const primarySeller = property.sellers.find(s => s.isPrimary) ?? property.sellers[0]
  const hasMotivation = property.salePropensity != null || property.salePropensityCategory
  const hasPortfolio = (primarySeller?.totalPropertiesOwned ?? 0) > 1
    || primarySeller?.ownerPortfolioTotalValue != null
  const hasFlags = primarySeller?.seniorOwner === true
    || primarySeller?.deceasedOwner === true
    || property.absenteeOwnerInState === true
    || property.samePropertyMailing === true
    || property.hasOpenLiens === true
    || property.hasOpenPersonLiens === true
    || property.underwater === true
    || property.expiredListing === true
    || primarySeller?.cashBuyerOwner === true
  const hasForeclosureDetail = property.foreclosureTrusteeName
    || property.foreclosureAuctionCity
    || property.foreclosureFilingDate
  const hasListingHistory = property.listingFailedDate
    || property.listingSoldDate
    || property.listingAgentName
  const hasAddressMeta = property.advancedPropertyType
    || property.lotDepthFootage != null
    || property.addressValidity

  const hasAny = hasMotivation || hasPortfolio || hasFlags || hasForeclosureDetail || hasListingHistory || hasAddressMeta
  if (!hasAny) return null

  const fmtMoney = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : '—'
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : '—'

  const flagPills: Array<{ label: string; tone: 'red' | 'amber' | 'blue' | 'slate' }> = []
  if (primarySeller?.deceasedOwner === true) flagPills.push({ label: 'Deceased owner', tone: 'red' })
  if (property.expiredListing === true) flagPills.push({ label: 'Expired listing', tone: 'amber' })
  if (property.underwater === true) flagPills.push({ label: 'Underwater', tone: 'red' })
  if (property.hasOpenLiens === true) flagPills.push({ label: 'Open liens', tone: 'amber' })
  if (property.hasOpenPersonLiens === true) flagPills.push({ label: 'Personal liens', tone: 'amber' })
  if (primarySeller?.seniorOwner === true) flagPills.push({ label: 'Senior owner', tone: 'blue' })
  if (primarySeller?.cashBuyerOwner === true) flagPills.push({ label: 'Cash buyer owner', tone: 'blue' })
  if (property.absenteeOwnerInState === true) flagPills.push({ label: 'Absentee (in-state)', tone: 'slate' })
  if (property.samePropertyMailing === true) flagPills.push({ label: 'Mailing = property', tone: 'slate' })

  const toneClass: Record<string, string> = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  }

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.04)]">
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Vendor Intel</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Flags row */}
        {flagPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flagPills.map((p, i) => (
              <span key={i} className={`text-[10px] font-medium px-2 py-[2px] rounded-full border whitespace-nowrap ${toneClass[p.tone]}`}>
                {p.label}
              </span>
            ))}
          </div>
        )}

        {/* Motivation score + property type + address meta */}
        {(hasMotivation || hasAddressMeta) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {hasMotivation && (
              <MlsStat
                label="Sale Propensity"
                value={property.salePropensity != null
                  ? `${Number(property.salePropensity).toFixed(1)}${property.salePropensityCategory ? ` (${property.salePropensityCategory})` : ''}`
                  : (property.salePropensityCategory ?? '—')
                }
              />
            )}
            {property.advancedPropertyType && (
              <MlsStat label="Property Type" value={property.advancedPropertyType} />
            )}
            {property.lotDepthFootage != null && (
              <MlsStat label="Lot Depth" value={`${property.lotDepthFootage} ft`} />
            )}
            {property.addressValidity && (
              <MlsStat
                label="Address"
                value={`${property.addressValidity}${property.zipPlus4 ? ` · ZIP+4 ${property.zipPlus4}` : ''}`}
              />
            )}
          </div>
        )}

        {/* Owner portfolio */}
        {hasPortfolio && (
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Owner Portfolio</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MlsStat label="Properties" value={primarySeller?.totalPropertiesOwned != null && primarySeller.totalPropertiesOwned > 0 ? String(primarySeller.totalPropertiesOwned) : '—'} />
              <MlsStat label="Total Equity" value={fmtMoney(primarySeller?.ownerPortfolioTotalEquity ?? null)} />
              <MlsStat label="Total Value" value={fmtMoney(primarySeller?.ownerPortfolioTotalValue ?? null)} />
              <MlsStat label="Avg Year Built" value={primarySeller?.ownerPortfolioAvgYearBuilt != null ? String(primarySeller.ownerPortfolioAvgYearBuilt) : '—'} />
            </div>
          </div>
        )}

        {/* Listing history */}
        {hasListingHistory && (
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Listing History</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MlsStat label="Listed" value={fmtDate(property.listingOriginalDate)} />
              <MlsStat label="Failed" value={fmtDate(property.listingFailedDate)} />
              <MlsStat label="Sold" value={fmtDate(property.listingSoldDate)} />
              <MlsStat label="Sold Price" value={fmtMoney(property.listingSoldPrice)} />
              {property.listingAgentName && (
                <MlsStat label="Last Agent" value={property.listingAgentName} />
              )}
              {property.listingAgentPhone && (
                <MlsStat label="Agent Phone" value={property.listingAgentPhone} />
              )}
              {property.listingBrokerName && (
                <MlsStat label="Broker" value={property.listingBrokerName} />
              )}
            </div>
          </div>
        )}

        {/* Foreclosure trustee (only when in foreclosure) */}
        {hasForeclosureDetail && (
          <div>
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-2">Foreclosure Detail</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MlsStat label="Filing Date" value={fmtDate(property.foreclosureFilingDate)} />
              <MlsStat label="Auction City" value={property.foreclosureAuctionCity ?? '—'} />
              <MlsStat label="Auction Time" value={property.foreclosureAuctionTime ?? '—'} />
              <MlsStat label="Borrower" value={property.foreclosureBorrower ?? '—'} />
              <MlsStat label="Trustee" value={property.foreclosureTrusteeName ?? '—'} />
              <MlsStat label="Trustee Phone" value={property.foreclosureTrusteePhone ?? '—'} />
              <MlsStat label="Sale Number" value={property.foreclosureTrusteeSaleNum ?? '—'} />
              <MlsStat label="Auction Location" value={property.foreclosureAuctionLocation ?? '—'} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── History Panel ───────────────────────────────────────────────────────
// Renders the deed / mortgage / lien history arrays that now land in
// dedicated JSON columns. Collapsed by default; shows row counts as teasers.

function HistoryPanel({ property }: { property: PropertyDetail }) {
  const [open, setOpen] = useState<'deed' | 'mortgage' | 'lien' | null>(null)

  const deedRows = property.deedHistoryJson ?? []
  const mortgageRows = property.mortgageHistoryJson ?? []
  const lienRows = property.liensJson ?? []
  const hasAny = deedRows.length + mortgageRows.length + lienRows.length > 0
  if (!hasAny) return null

  const fmtMoney = (v: unknown) => v != null && v !== 0 ? `$${Number(v).toLocaleString()}` : '—'
  const fmtDate = (v: unknown) => {
    if (!v) return '—'
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString()
  }

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.04)]">
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Title & Encumbrance History</p>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          {deedRows.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(open === 'deed' ? null : 'deed')}
              className={`text-[11px] px-3 py-1 rounded-full border transition ${open === 'deed' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-[rgba(0,0,0,0.1)] text-txt-primary hover:bg-gray-50'}`}
            >
              Deeds ({deedRows.length})
            </button>
          )}
          {mortgageRows.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(open === 'mortgage' ? null : 'mortgage')}
              className={`text-[11px] px-3 py-1 rounded-full border transition ${open === 'mortgage' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-[rgba(0,0,0,0.1)] text-txt-primary hover:bg-gray-50'}`}
            >
              Mortgages ({mortgageRows.length})
            </button>
          )}
          {lienRows.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(open === 'lien' ? null : 'lien')}
              className={`text-[11px] px-3 py-1 rounded-full border transition ${open === 'lien' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-[rgba(0,0,0,0.1)] text-txt-primary hover:bg-gray-50'}`}
            >
              Liens ({lienRows.length})
            </button>
          )}
        </div>

        {open === 'deed' && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-txt-muted border-b border-[rgba(0,0,0,0.04)]">
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Sale Price</th>
                  <th className="py-1 pr-3">Document Type</th>
                  <th className="py-1 pr-3">Buyers</th>
                </tr>
              </thead>
              <tbody>
                {deedRows.map((r, i) => (
                  <tr key={i} className="border-b border-[rgba(0,0,0,0.02)]">
                    <td className="py-1 pr-3 whitespace-nowrap">{fmtDate(r.recordingDate ?? r.saleDate)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{fmtMoney(r.salePrice)}</td>
                    <td className="py-1 pr-3">{String(r.documentType ?? r.deedType ?? '—')}</td>
                    <td className="py-1 pr-3">{Array.isArray(r.buyers) ? r.buyers.join(', ') : String(r.buyers ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open === 'mortgage' && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-txt-muted border-b border-[rgba(0,0,0,0.04)]">
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Loan Amount</th>
                  <th className="py-1 pr-3">Rate</th>
                  <th className="py-1 pr-3">Term</th>
                  <th className="py-1 pr-3">Lender</th>
                </tr>
              </thead>
              <tbody>
                {mortgageRows.map((r, i) => (
                  <tr key={i} className="border-b border-[rgba(0,0,0,0.02)]">
                    <td className="py-1 pr-3 whitespace-nowrap">{fmtDate(r.recordingDate ?? r.documentDate)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{fmtMoney(r.loanAmount)}</td>
                    <td className="py-1 pr-3">{r.interestRate != null ? `${r.interestRate}%` : '—'}</td>
                    <td className="py-1 pr-3">{r.loanTermMonths ? `${r.loanTermMonths}mo` : '—'}</td>
                    <td className="py-1 pr-3">{String(r.lenderName ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open === 'lien' && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-txt-muted border-b border-[rgba(0,0,0,0.04)]">
                  <th className="py-1 pr-3">Recorded</th>
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Document</th>
                  <th className="py-1 pr-3">Ref</th>
                </tr>
              </thead>
              <tbody>
                {lienRows.map((r, i) => (
                  <tr key={i} className="border-b border-[rgba(0,0,0,0.02)]">
                    <td className="py-1 pr-3 whitespace-nowrap">{fmtDate(r.recordingDate)}</td>
                    <td className="py-1 pr-3">{String(r.lienType ?? '—')}</td>
                    <td className="py-1 pr-3">{String(r.documentType ?? '—')}</td>
                    <td className="py-1 pr-3">{String(r.documentNumber ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Research Tab (Property Data Section) ────────────────────────────────────

function ResearchTab({ property }: { property: PropertyDetail }) {
  const [researching, setResearching] = useState(false)
  const [research, setResearch] = useState<Record<string, unknown> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/properties/${property.id}/research`)
      .then(r => r.json())
      .then(d => { if (d.research) setResearch(d.research as Record<string, unknown>); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [property.id])

  async function handleReResearch() {
    setResearching(true); setError('')
    try {
      const res = await fetch(`/api/properties/${property.id}/research`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResearch(data.research)
        // BatchData enrichment runs in background — reload after a few seconds
        setTimeout(async () => {
          const r = await fetch(`/api/properties/${property.id}/research`)
          const d = await r.json()
          if (d.research) setResearch(d.research as Record<string, unknown>)
        }, 5000)
      } else { setError(data.error ?? 'Research failed') }
    } catch { setError('Network error') }
    setResearching(false)
  }

  const googleData = research?.googlePlaceData as Record<string, unknown> | null
  const coords = research?.coordinates as { lat: number; lng: number } | null
  const streetViewUrl = research?.streetViewUrl as string | null
  const researchedAt = research?.researchedAt as string | null
  const bd = (research?.batchData ?? {}) as Record<string, unknown>
  const hasBatchData = bd.enrichedAt != null
  const fullAddr = `${property.address}, ${property.city}, ${property.state} ${property.zip}`

  const fmt$ = (v: unknown) => v != null ? `$${Number(v).toLocaleString()}` : '—'
  const fmtStr = (v: unknown) => v != null && v !== '' ? String(v) : '—'
  const fmtPct = (v: unknown) => v != null ? `${Number(v).toFixed(1)}%` : '—'
  const fmtBool = (v: unknown) => v === true ? 'Yes' : v === false ? 'No' : '—'

  // Research data is stored in zillowData.batchData — editable fields stored separately
  const [editedFields, setEditedFields] = useState<Record<string, string>>({})
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function getResearchSource(key: string): 'api' | 'user' | null {
    if (editedFields[key] !== undefined) return 'user'
    if (bd[key] != null && bd[key] !== '' && bd[key] !== false) return 'api'
    return null
  }

  function getDisplayValue(key: string, formatted: string): string {
    if (editedFields[key] !== undefined) return editedFields[key]
    return formatted
  }

  function startEdit(key: string, currentValue: string) {
    setEditingField(key)
    setEditValue(currentValue === '—' ? '' : currentValue)
  }

  function saveEdit(key: string) {
    setEditedFields(prev => ({ ...prev, [key]: editValue }))
    setEditingField(null)
  }

  // Source-based styling: purple=API, blue=AI, green=user
  function DataCard({ label, value, fieldKey, highlight }: { label: string; value: string; fieldKey?: string; highlight?: boolean }) {
    const source = fieldKey ? getResearchSource(fieldKey) : (highlight ? 'api' : null)
    const displayVal = fieldKey ? getDisplayValue(fieldKey, value) : value
    const isEditing = editingField === fieldKey

    const bgColor = source === 'api' ? 'bg-purple-50 border-[0.5px] border-purple-200'
      : source === 'user' ? 'bg-green-50 border-[0.5px] border-green-200'
      : 'bg-surface-secondary'
    const labelColor = source === 'api' ? 'text-purple-600' : source === 'user' ? 'text-green-600' : 'text-txt-muted'
    const valueColor = source === 'api' ? 'text-purple-800' : source === 'user' ? 'text-green-800' : displayVal !== '—' ? 'text-txt-primary' : 'text-txt-muted'

    if (isEditing && fieldKey) {
      return (
        <div className={`rounded-[8px] px-3 py-2 ${bgColor}`}>
          <p className={`text-[8px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</p>
          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
            onBlur={() => saveEdit(fieldKey)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(fieldKey); if (e.key === 'Escape') setEditingField(null) }}
            className="w-full bg-white border-[0.5px] border-green-300 rounded px-1.5 py-0.5 text-ds-fine font-semibold mt-0.5 focus:outline-none" />
        </div>
      )
    }

    return (
      <div onClick={() => fieldKey && startEdit(fieldKey, displayVal)}
        className={`rounded-[8px] px-3 py-2 ${bgColor} ${fieldKey ? 'cursor-pointer hover:ring-1 hover:ring-gunner-red/20' : ''} transition-all group relative`}>
        {source && (
          <span className={`absolute top-1 right-1.5 text-[7px] font-bold uppercase ${source === 'api' ? 'text-purple-400' : 'text-green-400'}`}>
            {source === 'api' ? 'API' : 'EDITED'}
          </span>
        )}
        <p className={`text-[8px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</p>
        <p className={`text-ds-fine font-semibold mt-0.5 ${valueColor}`}>
          {displayVal}
          {fieldKey && <Pencil size={7} className="inline ml-1 opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ds-label font-semibold text-txt-primary">Property Research</h3>
          <p className="text-ds-fine text-txt-muted">
            {error ? <span className="text-semantic-red">{error}</span>
              : researchedAt ? `Last updated: ${format(new Date(researchedAt), 'MMM d, yyyy h:mm a')}`
              : loaded ? 'Not yet researched' : 'Loading...'}
            {hasBatchData && <span className="ml-2 text-[9px] text-purple-600 font-medium">BatchData enriched</span>}
          </p>
        </div>
        <button onClick={handleReResearch} disabled={researching}
          className="text-ds-fine font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 px-3 py-1.5 rounded-[8px] flex items-center gap-1 transition-colors">
          {researching && <Loader2 size={11} className="animate-spin" />}
          {researching ? 'Researching...' : researchedAt ? 'Re-Research' : 'Research Now'}
        </button>
      </div>

      {/* Street View */}
      {streetViewUrl && (
        <div className="rounded-[10px] overflow-hidden border-[0.5px] border-[rgba(0,0,0,0.08)]">
          <img src={streetViewUrl} alt="Street view" className="w-full h-48 object-cover" />
        </div>
      )}

      {/* Source legend */}
      <div className="flex items-center gap-3">
        <span className="text-[9px] text-txt-muted">Sources:</span>
        <span className="text-[9px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">API</span>
        <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">AI</span>
        <span className="text-[9px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Edited</span>
        <span className="text-[9px] text-txt-muted">Click any field to edit</span>
      </div>

      {/* Valuation */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Valuation</p>
        </div>
        <div className="grid grid-cols-3 gap-3 p-3">
          <DataCard label="Estimated Value" value={fmt$(bd.estimatedValue)} fieldKey="estimatedValue" />
          <DataCard label="Assessed Value" value={fmt$(bd.assessedValue)} fieldKey="assessedValue" />
          {property.zestimate && <DataCard label="Zestimate" value={fmt$(property.zestimate)} />}
          {!property.zestimate && <DataCard label="APN" value={fmtStr(bd.apn)} fieldKey="apn" />}
        </div>
        <div className="grid grid-cols-3 gap-3 px-3 pb-3">
          <DataCard label="Price Range" value={bd.priceRangeMin != null ? `${fmt$(bd.priceRangeMin)} – ${fmt$(bd.priceRangeMax)}` : '—'} fieldKey="priceRangeMin" />
          <DataCard label="Confidence" value={bd.confidenceScore != null ? `${bd.confidenceScore}%` : '—'} fieldKey="confidenceScore" />
          <DataCard label="APN" value={fmtStr(bd.apn)} fieldKey="apn" />
        </div>
        {/* AI Estimates + Flood Zone */}
        {(property.repairEstimate || property.rentalEstimate || property.floodZone || property.neighborhoodSummary) && (
          <div className="border-t border-[rgba(0,0,0,0.04)] p-3 space-y-2">
            <div className="grid grid-cols-3 gap-3">
              {property.arv && <DataCard label="ARV" value={fmt$(property.arv)} highlight />}
              {property.repairEstimate && <DataCard label="Repair Estimate" value={fmt$(property.repairEstimate)} highlight />}
              {property.rentalEstimate && <DataCard label="Rental Estimate" value={`${fmt$(property.rentalEstimate)}/mo`} highlight />}
              {property.floodZone && <DataCard label="Flood Zone" value={property.floodZone} highlight />}
            </div>
            {property.neighborhoodSummary && (
              <div className="bg-blue-50 border-[0.5px] border-blue-200 rounded-[8px] px-3 py-2 relative">
                <span className="absolute top-1 right-1.5 text-[7px] font-bold text-blue-400">AI</span>
                <p className="text-[8px] font-semibold text-blue-600 uppercase tracking-wider">Neighborhood</p>
                <p className="text-[11px] text-blue-800 mt-0.5">{property.neighborhoodSummary}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Owner Intel */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Owner Intelligence</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
          <DataCard label="Owner" value={fmtStr(bd.ownerName)} fieldKey="ownerName" />
          <DataCard label="Absentee" value={fmtBool(bd.absenteeOwner)} fieldKey="absenteeOwner" highlight={bd.absenteeOwner != null} />
          <DataCard label="Owner Occupied" value={fmtBool(bd.ownerOccupied)} fieldKey="ownerOccupied" />
          <DataCard label="County" value={fmtStr(bd.county)} fieldKey="county" />
        </div>
        {(bd.ownerMailingAddress != null || editedFields.ownerMailingAddress) && (
          <div className="px-3 pb-3">
            <DataCard label="Owner Mailing Address" value={fmtStr(bd.ownerMailingAddress)} fieldKey="ownerMailingAddress" />
          </div>
        )}
      </div>

      {/* Deal Signals — same source color system */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Deal Signals</p>
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-bold text-purple-500 bg-purple-50 px-1 py-0.5 rounded">API</span>
            <span className="text-[7px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded">AI</span>
            <span className="text-[7px] font-bold text-green-500 bg-green-50 px-1 py-0.5 rounded">EDITED</span>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 p-3">
          {[
            { k: 'highEquity', l: 'High Equity' },
            { k: 'freeAndClear', l: 'Free & Clear' },
            { k: 'cashBuyer', l: 'Cash Buyer' },
            { k: 'taxDefault', l: 'Tax Default' },
            { k: 'preforeclosure', l: 'Pre-Foreclosure' },
            { k: 'vacant', l: 'Vacant' },
            { k: 'absenteeOwner', l: 'Absentee Owner' },
            { k: 'corporateOwned', l: 'Corporate' },
            { k: 'trustOwned', l: 'Trust' },
          ].map(flag => {
            // Determine source: user override > API direct > AI derived
            const edited = editedFields[flag.k]
            const apiVal = bd[flag.k]
            const isTrue = edited !== undefined ? edited === 'Yes' || edited === 'true' : apiVal === true
            const isFalse = edited !== undefined ? edited === 'No' || edited === 'false' : apiVal === false

            // Absentee: if API says false but ownerOccupied is true, that's an AI derivation
            // Determine source for coloring
            let source: 'api' | 'ai' | 'user' | null = null
            if (edited !== undefined) source = 'user'
            else if (apiVal === true) source = 'api' // only color when YES from API

            const s = sourceStyles(source)

            // Only show colored card when YES — No/empty stay blank/gray
            const showColored = isTrue && source != null

            return (
              <div key={flag.k}
                onClick={() => startEdit(flag.k, isTrue ? 'Yes' : isFalse ? 'No' : '')}
                className={`rounded-[8px] px-2.5 py-2 cursor-pointer hover:ring-1 hover:ring-gunner-red/20 transition-all group relative ${showColored ? s.bg : 'bg-surface-secondary'}`}
              >
                {showColored && s.tag && (
                  <span className={`absolute top-0.5 right-1 text-[6px] font-bold uppercase ${s.tagColor}`}>{s.tag}</span>
                )}
                <p className={`text-[8px] font-semibold uppercase tracking-wider ${showColored ? s.label : 'text-txt-muted'}`}>{flag.l}</p>
                {editingField === flag.k ? (
                  <select autoFocus value={editValue}
                    onChange={e => { setEditValue(e.target.value); saveEdit(flag.k) }}
                    onBlur={() => setEditingField(null)}
                    className="w-full bg-white border-[0.5px] border-green-300 rounded px-1 py-0.5 text-ds-fine font-semibold mt-0.5 focus:outline-none">
                    <option value="">—</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                ) : (
                  <p className={`text-ds-fine font-bold mt-0.5 ${isTrue ? (showColored ? s.value : 'text-semantic-green') : 'text-txt-muted'}`}>
                    {isTrue ? '✓ Yes' : '—'}
                    <Pencil size={6} className="inline ml-1 opacity-0 group-hover:opacity-100 text-txt-muted transition-opacity" />
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Equity & Financial */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Equity & Financial</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
          <DataCard label="Equity" value={fmtPct(bd.equityPercent)} fieldKey="equityPercent" />
          <DataCard label="LTV" value={fmtPct(bd.ltv)} fieldKey="ltv" />
          <DataCard label="Open Liens" value={bd.totalOpenLienCount != null ? String(bd.totalOpenLienCount) : '—'} fieldKey="totalOpenLienCount" />
          <DataCard label="Owner Type" value={fmtStr(bd.ownerType)} fieldKey="ownerType" />
        </div>
      </div>

      {/* Tax & Assessment */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Tax & Assessment</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
          <DataCard label="Tax Assessed Value" value={fmt$(bd.taxAssessedValue)} fieldKey="taxAssessedValue" />
          <DataCard label="Annual Tax" value={fmt$(bd.annualTaxAmount)} fieldKey="annualTaxAmount" />
          <DataCard label="Tax Year" value={bd.taxYear != null ? String(bd.taxYear) : '—'} fieldKey="taxYear" />
          <DataCard label="Ownership Length" value={bd.ownershipLength != null ? `${bd.ownershipLength} yrs` : '—'} fieldKey="ownershipLength" />
        </div>
      </div>

      {/* Mortgage */}
      {(bd.mortgageAmount != null || bd.mortgageLender != null) && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
          <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Mortgage</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
            <DataCard label="Mortgage Amount" value={fmt$(bd.mortgageAmount)} fieldKey="mortgageAmount" />
            <DataCard label="Lender" value={fmtStr(bd.mortgageLender)} fieldKey="mortgageLender" />
            <DataCard label="Mortgage Date" value={bd.mortgageDate ? format(new Date(String(bd.mortgageDate)), 'MMM d, yyyy') : '—'} fieldKey="mortgageDate" />
            <DataCard label="Loan Type" value={fmtStr(bd.mortgageType)} fieldKey="mortgageType" />
          </div>
        </div>
      )}

      {/* Building Details */}
      {(bd.stories != null || bd.foundation != null || bd.roofType != null || bd.heatingType != null) && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
          <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Building Details</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
            <DataCard label="Stories" value={bd.stories != null ? String(bd.stories) : '—'} fieldKey="stories" />
            <DataCard label="Garage" value={bd.garageSpaces != null ? `${bd.garageSpaces} spaces` : '—'} fieldKey="garageSpaces" />
            <DataCard label="Pool" value={fmtBool(bd.pool)} fieldKey="pool" />
            <DataCard label="Foundation" value={fmtStr(bd.foundation)} fieldKey="foundation" />
            <DataCard label="Roof" value={fmtStr(bd.roofType)} fieldKey="roofType" />
            <DataCard label="Heating" value={fmtStr(bd.heatingType)} fieldKey="heatingType" />
            <DataCard label="Cooling" value={fmtStr(bd.coolingType)} fieldKey="coolingType" />
            <DataCard label="Exterior" value={fmtStr(bd.exteriorWalls)} fieldKey="exteriorWalls" />
          </div>
        </div>
      )}

      {/* School, Zoning & Location */}
      {(bd.schoolDistrict != null || bd.zoning != null || bd.latitude != null) && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
          <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Zoning & Location</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
            <DataCard label="School District" value={fmtStr(bd.schoolDistrict)} fieldKey="schoolDistrict" />
            <DataCard label="Zoning" value={fmtStr(bd.zoning)} fieldKey="zoning" />
            <DataCard label="Zoning Desc." value={fmtStr(bd.zoningDescription)} fieldKey="zoningDescription" />
            {bd.latitude != null && <DataCard label="Coordinates" value={`${Number(bd.latitude).toFixed(4)}, ${Number(bd.longitude).toFixed(4)}`} />}
          </div>
        </div>
      )}

      {/* Marketing Attribution */}
      {(property.leadSource || (property as unknown as { leadSubSource?: string }).leadSubSource) && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
          <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Marketing Attribution</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
            <DataCard label="Lead Source" value={fmtStr(property.leadSource)} />
            <DataCard label="Sub-Source" value={fmtStr((property as unknown as { leadSubSource?: string }).leadSubSource)} />
          </div>
        </div>
      )}

      {/* Sale History */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Sale History</p>
        </div>
        <div className="grid grid-cols-3 gap-3 p-3">
          <DataCard label="Last Sale Price" value={fmt$(bd.lastSalePrice)} fieldKey="lastSalePrice" />
          <DataCard label="Last Sale Date" value={bd.lastSaleDate ? format(new Date(String(bd.lastSaleDate)), 'MMM d, yyyy') : '—'} fieldKey="lastSaleDate" />
          <DataCard label="Sale Type" value={fmtStr(bd.lastSaleType)} fieldKey="lastSaleType" />
        </div>
      </div>

      {/* Permits */}
      {bd.permitCount != null && Number(bd.permitCount) > 0 && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
          <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
            <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Permits ({String(bd.permitCount)})</p>
          </div>
          <div className="flex flex-wrap gap-1.5 p-3">
            {Array.isArray(bd.permitTags) && (bd.permitTags as string[]).map(tag => (
              <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-txt-secondary">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Utilities */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Utilities</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
          <DataCard label="Water" value={fmtStr(property.waterType)} fieldKey="waterType" />
          <DataCard label="Sewer" value={fmtStr(property.sewerType)} fieldKey="sewerType" />
          <DataCard label="Sewer Condition" value={fmtStr(property.sewerCondition)} fieldKey="sewerCondition" />
          <DataCard label="Electric" value={fmtStr(property.electricType)} fieldKey="electricType" />
          <DataCard label="Water Notes" value={fmtStr(property.waterNotes)} fieldKey="waterNotes" />
          <DataCard label="Sewer Notes" value={fmtStr(property.sewerNotes)} fieldKey="sewerNotes" />
        </div>
      </div>

      {/* Seller & Deal Intel */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Seller & Deal Intel</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
          <DataCard label="Condition" value={fmtStr(property.propertyCondition)} fieldKey="propertyCondition" />
        </div>
      </div>

      {/* ── COMPUTED METRICS ────────────────────────────────────── */}
      <ComputedMetricsSection propertyId={property.id} />

      {/* ── DEAL INTELLIGENCE (from calls — blue source) ───────────── */}
      <DealIntelSection dealIntel={(property as unknown as { dealIntel?: Record<string, unknown> }).dealIntel ?? null} />

      {/* External links */}
      <div className="flex gap-3">
        <a href={`https://www.zillow.com/homes/${encodeURIComponent(fullAddr)}`} target="_blank" rel="noopener noreferrer"
          className="text-ds-fine font-medium text-semantic-blue hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> Zillow
        </a>
        <a href={`https://www.google.com/maps/place/${encodeURIComponent(fullAddr)}`} target="_blank" rel="noopener noreferrer"
          className="text-ds-fine font-medium text-semantic-blue hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> Google Maps
        </a>
        {coords && (
          <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords.lat},${coords.lng}`} target="_blank" rel="noopener noreferrer"
            className="text-ds-fine font-medium text-semantic-blue hover:underline flex items-center gap-1">
            <ExternalLink size={10} /> Street View
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Computed Metrics (Research tab) ─────────────────────────────────────────

function ComputedMetricsSection({ propertyId }: { propertyId: string }) {
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/metrics`)
      .then(r => r.json())
      .then(d => { if (d.metrics) setMetrics(d.metrics); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [propertyId])

  if (!loaded || !metrics) return null

  const fmt = (v: unknown) => v != null ? String(v) : '—'
  const fmtDays = (v: unknown) => v != null ? `${v}d` : '—'
  const fmtMin = (v: unknown) => v != null ? `${v} min` : '—'
  const fmt$ = (v: unknown) => v != null ? `$${Number(v).toLocaleString()}` : '—'
  const fmtPct = (v: unknown) => v != null ? `${v}%` : '—'

  const m = metrics as {
    leadAge?: number; speedToFirstContact?: number | null
    totalCallCount?: number; outboundCallCount?: number; inboundCallCount?: number; voicemailCount?: number
    contactAttemptsVsMade?: { attempts: number; contacts: number }
    daysSinceLastContact?: number | null; avgCallScore?: number | null
    daysInCurrentStage?: number | null
    appointmentHistory?: { set: number; completed: number; noShowed: number }
    mao?: number | null; equityEstimate?: number | null; negotiationGap?: number | null
    zestimateVsARV?: number | null; taxAssessmentVsARV?: number | null
  }

  return (
    <>
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">COMPUTED METRICS</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Engagement */}
      <div className="border-[0.5px] border-gray-200 rounded-[12px] overflow-hidden">
        <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
          <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider">Engagement</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3">
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Lead Age</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmtDays(m.leadAge)}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Speed to 1st Contact</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmtMin(m.speedToFirstContact)}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Total Calls</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmt(m.totalCallCount)}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Out / In</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{m.outboundCallCount ?? 0} / {m.inboundCallCount ?? 0}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Voicemails</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmt(m.voicemailCount)}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Answer Rate</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">
              {m.contactAttemptsVsMade && m.contactAttemptsVsMade.attempts > 0
                ? `${Math.round((m.contactAttemptsVsMade.contacts / m.contactAttemptsVsMade.attempts) * 100)}%`
                : '—'}
            </p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Days Since Contact</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmtDays(m.daysSinceLastContact)}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Avg Call Score</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{m.avgCallScore != null ? `${m.avgCallScore}%` : '—'}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Days in Stage</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmtDays(m.daysInCurrentStage)}</p>
          </div>
          <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
            <p className="text-[8px] font-semibold text-txt-muted uppercase">Appointments</p>
            <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">
              {m.appointmentHistory ? `${m.appointmentHistory.set} set, ${m.appointmentHistory.completed} done` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Deal Financials (computed) */}
      {(m.mao != null || m.equityEstimate != null || m.negotiationGap != null) && (
        <div className="border-[0.5px] border-gray-200 rounded-[12px] overflow-hidden">
          <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider">Computed Deal Numbers</p>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
              <p className="text-[8px] font-semibold text-txt-muted uppercase">MAO</p>
              <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmt$(m.mao)}</p>
            </div>
            <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
              <p className="text-[8px] font-semibold text-txt-muted uppercase">Equity Estimate</p>
              <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmt$(m.equityEstimate)}</p>
            </div>
            <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
              <p className="text-[8px] font-semibold text-txt-muted uppercase">Negotiation Gap</p>
              <p className="text-ds-fine font-semibold text-txt-primary mt-0.5">{fmt$(m.negotiationGap)}</p>
            </div>
            {m.zestimateVsARV != null && (
              <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
                <p className="text-[8px] font-semibold text-txt-muted uppercase">Zestimate vs ARV</p>
                <p className={`text-ds-fine font-semibold mt-0.5 ${m.zestimateVsARV > 0 ? 'text-semantic-green' : 'text-semantic-red'}`}>
                  {m.zestimateVsARV > 0 ? '+' : ''}{fmtPct(m.zestimateVsARV)}
                </p>
              </div>
            )}
            {m.taxAssessmentVsARV != null && (
              <div className="rounded-[8px] bg-surface-secondary px-3 py-2">
                <p className="text-[8px] font-semibold text-txt-muted uppercase">Tax Assess vs ARV</p>
                <p className={`text-ds-fine font-semibold mt-0.5 ${m.taxAssessmentVsARV < 0 ? 'text-semantic-green' : 'text-semantic-amber'}`}>
                  {m.taxAssessmentVsARV > 0 ? '+' : ''}{fmtPct(m.taxAssessmentVsARV)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Deal Intel Display (Research tab) ──────────────────────────────────────

const INTEL_SECTIONS: Array<{ key: string; label: string; color: string; fields: string[] }> = [
  { key: 'lead_quality', label: 'Lead Quality', color: 'indigo', fields: [
    'leadGrade', 'leadQualityScore', 'sellerResponsiveness', 'financialDistressLevel', 'financialDistressDetails',
    'disqualificationRisks', 'isDisqualified', 'disqualificationReason',
    'qualificationCallCompleted', 'qualificationOutcome',
    'leadSourceFeedback', 'leadSourceFeedbackNotes',
    'adCampaignName', 'adSetName', 'adCreative', 'leadFormSubmittedAt', 'speedToFirstContact',
  ]},
  { key: 'seller', label: 'Seller Profile', color: 'blue', fields: [
    'sellerMotivationLevel', 'sellerMotivationReason', 'costOfInaction', 'painQuantification', 'costOfInactionMonthly',
    'statedVsImpliedMotivation', 'sellerWhySelling',
    'sellerTimeline', 'sellerTimelineUrgency', 'sellerKnowledgeLevel', 'sellerCommunicationStyle',
    'sellerContactPreference', 'sellerPersonalityProfile', 'sellerEmotionalTriggers', 'sellerFamilySituation',
    'sellerPreviousInvestorContact', 'sellerAlternativePlan', 'sellerOnlineBehavior',
  ]},
  { key: 'decision', label: 'Decision Making', color: 'purple', fields: [
    'decisionMakers', 'decisionMakersConfirmed', 'decisionMakerNotes', 'documentReadiness',
  ]},
  { key: 'negotiation', label: 'Price Negotiation', color: 'green', fields: [
    'sellerAskingHistory', 'offersWeHaveMade', 'competingOffers', 'priceAnchors', 'stickingPoints', 'counterOffers',
  ]},
  { key: 'condition', label: 'Property Condition', color: 'amber', fields: [
    'conditionNotesFromSeller', 'repairItemsMentioned', 'accessSituation', 'gateCodeAccessNotes',
    'tenantSituation', 'utilityStatus', 'environmentalConcerns', 'unpermittedWork',
    'insuranceSituation', 'neighborhoodComplaints', 'previousDealFellThrough',
    'walkthroughNotes', 'walkthroughRepairList', 'walkthroughConditionVsSeller', 'walkthroughPhotosNotes',
  ]},
  { key: 'legal', label: 'Legal & Title', color: 'red', fields: [
    'titleIssuesMentioned', 'legalComplications', 'liensMentioned', 'backTaxesMentioned',
    'hoaMentioned', 'mortgageBalanceMentioned',
  ]},
  { key: 'communication', label: 'Communication Intel', color: 'teal', fields: [
    'whatNotToSay', 'toneShiftMoments', 'exactTriggerPhrases', 'questionsSellerAskedUs',
    'infoVolunteeredVsExtracted', 'silencePausePatterns', 'appointmentLogisticsPreferences', 'bestApproachNotes',
  ]},
  { key: 'status', label: 'Deal Status', color: 'orange', fields: [
    'rollingDealSummary', 'dealHealthScore', 'dealRedFlags', 'dealGreenFlags',
    'dealHealthTrajectory', 'dealRiskLevel',
    'commitmentsWeMade', 'promisesTheyMade', 'promiseDeadlines',
    'nextStepAgreed', 'triggerEvents', 'topicsNotYetDiscussed', 'objectionsEncountered',
    'relationshipRapportLevel', 'bestRepForThisSeller',
    'totalTouchCount', 'touchBreakdown', 'daysSinceFirstContact', 'daysSinceLastContact',
    'speedToFirstResponse', 'appointmentHistory',
  ]},
  { key: 'marketing', label: 'Marketing', color: 'pink', fields: [
    'howTheyFoundUs', 'referralSource', 'referralChain', 'firstMarketingPieceReceived',
    'whichMarketingMessageResonated',
  ]},
]

const INTEL_FIELD_LABELS: Record<string, string> = {
  sellerMotivationLevel: 'Motivation (1-10)', sellerMotivationReason: 'Motivation Reason',
  statedVsImpliedMotivation: 'Stated vs Implied', sellerWhySelling: 'Why Selling',
  sellerTimeline: 'Timeline', sellerTimelineUrgency: 'Urgency',
  sellerKnowledgeLevel: 'Knowledge Level', sellerCommunicationStyle: 'Communication Style',
  sellerContactPreference: 'Contact Preference', sellerEmotionalTriggers: 'Emotional Triggers',
  sellerFamilySituation: 'Family Situation', sellerPreviousInvestorContact: 'Previous Investors',
  sellerAlternativePlan: 'Alternative Plan',
  sellerPersonalityProfile: 'Personality Profile', sellerOnlineBehavior: 'Online Behavior',
  costOfInaction: 'Cost of Inaction', costOfInactionMonthly: 'Monthly Cost of Not Selling ($)', painQuantification: 'Pain Quantification',
  // Lead Quality
  leadGrade: 'Lead Grade', leadQualityScore: 'Quality Score (1-100)',
  sellerResponsiveness: 'Seller Responsiveness', financialDistressLevel: 'Financial Distress',
  financialDistressDetails: 'Distress Details', disqualificationRisks: 'DQ Risks',
  isDisqualified: 'Disqualified?', disqualificationReason: 'DQ Reason',
  leadSourceFeedback: 'Lead Source Quality', leadSourceFeedbackNotes: 'Source Feedback',
  adCampaignName: 'Ad Campaign', adSetName: 'Ad Set', adCreative: 'Ad Creative',
  leadFormSubmittedAt: 'Lead Form Submitted', speedToFirstContact: 'Speed to Contact (min)',
  qualificationCallCompleted: 'Qual Call Done?', qualificationOutcome: 'Qualification Outcome',
  decisionMakers: 'Decision Makers', decisionMakersConfirmed: 'DM Confirmed',
  decisionMakerNotes: 'DM Notes', documentReadiness: 'Document Readiness',
  sellerAskingHistory: 'Asking History', offersWeHaveMade: 'Our Offers',
  competingOffers: 'Competing Offers', priceAnchors: 'Price Anchors',
  stickingPoints: 'Sticking Points', counterOffers: 'Counter Offers',
  conditionNotesFromSeller: 'Condition Notes', repairItemsMentioned: 'Repairs Mentioned',
  accessSituation: 'Access', gateCodeAccessNotes: 'Gate Code / Access',
  tenantSituation: 'Tenant Situation', utilityStatus: 'Utilities',
  environmentalConcerns: 'Environmental', unpermittedWork: 'Unpermitted Work',
  insuranceSituation: 'Insurance', neighborhoodComplaints: 'Neighborhood Issues',
  previousDealFellThrough: 'Previous Deal Failed',
  walkthroughNotes: 'Walkthrough Notes', walkthroughRepairList: 'Walkthrough Repair List',
  walkthroughConditionVsSeller: 'Condition vs Seller Claims', walkthroughPhotosNotes: 'Photo Notes',
  titleIssuesMentioned: 'Title Issues', legalComplications: 'Legal Issues',
  liensMentioned: 'Liens', backTaxesMentioned: 'Back Taxes',
  hoaMentioned: 'HOA', mortgageBalanceMentioned: 'Mortgage (Seller Says)',
  whatNotToSay: 'What Not to Say', toneShiftMoments: 'Tone Shifts',
  exactTriggerPhrases: 'Trigger Phrases', questionsSellerAskedUs: 'Seller Questions',
  infoVolunteeredVsExtracted: 'Info Volunteered vs Extracted', silencePausePatterns: 'Silence Patterns',
  appointmentLogisticsPreferences: 'Appointment Preferences', bestApproachNotes: 'Best Approach',
  rollingDealSummary: 'Deal Summary', dealHealthScore: 'Deal Health (1-10)',
  dealRedFlags: 'Red Flags', dealGreenFlags: 'Green Flags',
  commitmentsWeMade: 'Our Commitments',
  promisesTheyMade: 'Their Promises', promiseDeadlines: 'Deadlines',
  nextStepAgreed: 'Next Step', triggerEvents: 'Trigger Events',
  topicsNotYetDiscussed: 'Topics Not Discussed', objectionsEncountered: 'Objections',
  relationshipRapportLevel: 'Rapport Level', bestRepForThisSeller: 'Best Rep for Seller',
  dealHealthTrajectory: 'Deal Trajectory', dealRiskLevel: 'Risk Level',
  totalTouchCount: 'Total Touches', touchBreakdown: 'Touch Breakdown',
  daysSinceFirstContact: 'Days Since First Contact', daysSinceLastContact: 'Days Since Last Contact',
  speedToFirstResponse: 'Speed to First Response (hrs)', appointmentHistory: 'Appointment History',
  howTheyFoundUs: 'How Found Us', referralSource: 'Referral',
  referralChain: 'Referral Chain', firstMarketingPieceReceived: 'First Marketing Piece',
  whichMarketingMessageResonated: 'Message Resonated',
}

// Placeholder values that should render as blank
const BLANK_PLACEHOLDERS = new Set([
  'unknown', 'unknown - not discussed', 'not discussed', 'n/a', 'none', 'null', 'undefined',
])

function formatIntelValue(val: unknown): string {
  if (val === null || val === undefined) return ''

  // Unwrap FieldValue wrapper: { value, updatedAt, sourceCallId, confidence }
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    return formatIntelValue((val as { value: unknown }).value)
  }

  // Unwrap AccumulatedField wrapper: { items, updatedAt }
  if (typeof val === 'object' && 'items' in (val as Record<string, unknown>)) {
    const items = (val as { items: unknown[] }).items
    return items.map(i => formatSingleItem(i)).filter(Boolean).join('\n')
  }

  // Plain array
  if (Array.isArray(val)) return val.map(i => formatSingleItem(i)).filter(Boolean).join('\n')

  // Plain object (not a wrapper)
  if (typeof val === 'object') {
    return formatSingleItem(val)
  }

  const str = String(val)
  if (BLANK_PLACEHOLDERS.has(str.toLowerCase().trim())) return ''
  return str
}

function formatSingleItem(item: unknown): string {
  if (item === null || item === undefined) return ''
  if (typeof item === 'string') {
    if (BLANK_PLACEHOLDERS.has(item.toLowerCase().trim())) return ''
    return item
  }
  if (typeof item === 'number' || typeof item === 'boolean') return String(item)
  if (typeof item === 'object') {
    const o = item as Record<string, unknown>
    // Strip internal tracking fields
    const display: string[] = []
    for (const [k, v] of Object.entries(o)) {
      if (['_addedAt', '_sourceCallId', 'sourceCallId', 'updatedAt', 'confidence', 'callId'].includes(k)) continue
      if (v === null || v === undefined) continue
      const sv = typeof v === 'object' ? JSON.stringify(v) : String(v)
      if (BLANK_PLACEHOLDERS.has(sv.toLowerCase().trim())) continue
      // Use known display keys directly
      if (k === 'objection' || k === 'what' || k === 'event' || k === 'name' || k === 'phrase' || k === 'item') {
        display.unshift(sv) // Put the main value first
      } else if (k === 'whatWorked' && sv) {
        display.push(`→ What worked: ${sv}`)
      } else if (k === 'whatDidntWork' && sv) {
        display.push(`→ What didn't work: ${sv}`)
      } else if (k === 'effectivenessRating' && sv) {
        display.push(`(${sv})`)
      } else if (k === 'amount' && sv) {
        display.push(`$${Number(sv).toLocaleString()}`)
      } else if (k === 'date' && sv) {
        display.push(sv)
      } else {
        display.push(`${k}: ${sv}`)
      }
    }
    return display.join(' ')
  }
  return String(item)
}

function DealIntelSection({ dealIntel }: { dealIntel: Record<string, unknown> | null }) {
  if (!dealIntel || Object.keys(dealIntel).length === 0) return null

  const populatedSections = INTEL_SECTIONS.filter(section =>
    section.fields.some(f => {
      const val = dealIntel[f]
      if (!val) return false
      // Skip placeholder values
      if (typeof val === 'string' && BLANK_PLACEHOLDERS.has(val.toLowerCase().trim())) return false
      const formatted = formatIntelValue(val)
      return formatted !== '' && formatted !== '[]' && formatted !== '{}'
    })
  )

  if (populatedSections.length === 0) return null

  const colorMap: Record<string, { bg: string; border: string; headerBg: string; text: string }> = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   headerBg: 'bg-blue-100',   text: 'text-blue-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', headerBg: 'bg-purple-100', text: 'text-purple-700' },
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  headerBg: 'bg-green-100',  text: 'text-green-700' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  headerBg: 'bg-amber-100',  text: 'text-amber-700' },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    headerBg: 'bg-red-100',    text: 'text-red-700' },
    teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   headerBg: 'bg-teal-100',   text: 'text-teal-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', headerBg: 'bg-orange-100', text: 'text-orange-700' },
    pink:   { bg: 'bg-pink-50',   border: 'border-pink-200',   headerBg: 'bg-pink-100',   text: 'text-pink-700' },
  }

  return (
    <>
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-blue-200" />
        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">DEAL INTELLIGENCE (from calls)</span>
        <span className="text-[7px] font-bold text-blue-400">AI</span>
        <div className="flex-1 h-px bg-blue-200" />
      </div>

      {populatedSections.map(section => {
        const c = colorMap[section.color] ?? colorMap.blue
        const populated = section.fields.filter(f => {
          const formatted = formatIntelValue(dealIntel[f])
          return formatted !== '' && formatted !== '[]' && formatted !== '{}'
        })
        return (
          <div key={section.key} className={`border-[0.5px] ${c.border} rounded-[12px] overflow-hidden`}>
            <div className={`px-4 py-2 ${c.headerBg} border-b ${c.border} flex items-center justify-between`}>
              <p className={`text-[9px] font-semibold uppercase tracking-wider ${c.text}`}>{section.label}</p>
              <span className={`text-[7px] font-bold ${c.text}`}>AI</span>
            </div>
            <div className={`grid grid-cols-2 gap-2 p-3 ${c.bg}`}>
              {populated.map(field => {
                const formatted = formatIntelValue(dealIntel[field])
                const isLong = formatted.length > 80
                return (
                  <div key={field} className={`rounded-[8px] bg-white/60 px-3 py-2 ${isLong ? 'col-span-2' : ''}`}>
                    <p className={`text-[8px] font-semibold uppercase tracking-wider ${c.text}`}>
                      {INTEL_FIELD_LABELS[field] ?? field}
                    </p>
                    <div className="text-[11px] text-txt-primary mt-0.5 leading-relaxed">
                      {formatted.includes('\n') ? (
                        <ul className="space-y-0.5">
                          {formatted.split('\n').filter(Boolean).map((line, li) => (
                            <li key={li} className="flex items-start gap-1.5">
                              <span className="text-txt-muted mt-1 shrink-0">·</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : formatted}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ─── Activity / Messaging Tab ────────────────────────────────────────────────

function ActivityTab({ property, tenantSlug }: {
  property: PropertyDetail
  tenantSlug: string
  runGhlAction: (type: string, payload: Record<string, string>) => void
  sending: boolean; ghlContactId: string | null
}) {
  const [messages, setMessages] = useState(property.messages)
  const [input, setInput] = useState('')
  const [mentionSearch, setMentionSearch] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [pendingMentions, setPendingMentions] = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = useState(false)

  const team = property.teamMembers

  // Detect @mention in input
  function handleInput(val: string) {
    setInput(val)
    const atMatch = val.match(/@(\w*)$/)
    if (atMatch) {
      setMentionSearch(atMatch[1])
      setShowMentions(true)
    } else {
      setShowMentions(false)
    }
  }

  function insertMention(member: { id: string; name: string }) {
    const before = input.replace(/@\w*$/, '')
    setInput(`${before}@${member.name} `)
    if (!pendingMentions.some(m => m.id === member.id)) {
      setPendingMentions(prev => [...prev, member])
    }
    setShowMentions(false)
  }

  async function sendMessage() {
    if (!input.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input.trim(), mentions: pendingMentions }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [data.message, ...prev])
        setInput('')
        setPendingMentions([])
      }
    } catch {}
    setSaving(false)
  }

  const filteredTeam = team.filter(m =>
    m.name.toLowerCase().includes(mentionSearch.toLowerCase())
  )

  // Render message text with @mentions highlighted
  function renderText(text: string, mentions: Array<{ name: string }>) {
    if (mentions.length === 0) return text
    const parts: Array<{ type: 'text' | 'mention'; value: string }> = []
    let remaining = text
    for (const m of mentions) {
      const idx = remaining.indexOf(`@${m.name}`)
      if (idx >= 0) {
        if (idx > 0) parts.push({ type: 'text', value: remaining.slice(0, idx) })
        parts.push({ type: 'mention', value: `@${m.name}` })
        remaining = remaining.slice(idx + m.name.length + 1)
      }
    }
    if (remaining) parts.push({ type: 'text', value: remaining })
    if (parts.length === 0) return text
    return (
      <>{parts.map((p, i) => p.type === 'mention'
        ? <span key={i} className="text-semantic-blue font-semibold">{p.value}</span>
        : <span key={i}>{p.value}</span>
      )}</>
    )
  }

  return (
    // Same 3-col split as Overview's bottom section: Contacts / Team / AI on
    // the left column, internal messaging fills the right 2 columns. Matching
    // the Overview grid keeps the side panels identical in width and spacing.
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="space-y-4">
        <ContactsSection propertyId={property.id} tenantSlug={tenantSlug} initialSellers={property.sellers} />
        <TeamSection propertyId={property.id} tenantSlug={tenantSlug} />
        <InlineAI propertyId={property.id} />
      </div>

      <div className="lg:col-span-2 space-y-4">
        {/* Message input with @mention */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={e => handleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Type a message... use @ to tag someone"
                rows={2}
                className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
              />
              {/* @mention dropdown */}
              {showMentions && filteredTeam.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-white border-[0.5px] border-[rgba(0,0,0,0.12)] rounded-[8px] shadow-lg p-1 z-20">
                  {filteredTeam.slice(0, 6).map(m => (
                    <button key={m.id} onClick={() => insertMention(m)}
                      className="w-full text-left px-3 py-1.5 rounded-[6px] hover:bg-surface-secondary text-ds-fine transition-colors">
                      <span className="font-medium text-txt-primary">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={sendMessage} disabled={!input.trim() || saving}
              className="self-end bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white px-4 py-2.5 rounded-[10px] transition-colors shrink-0">
              <Send size={14} />
            </button>
          </div>
          {pendingMentions.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[9px] text-txt-muted">Tagging:</span>
              {pendingMentions.map(m => (
                <span key={m.id} className="text-[9px] font-semibold text-semantic-blue bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  @{m.name}
                  <button onClick={() => setPendingMentions(prev => prev.filter(p => p.id !== m.id))} className="hover:text-semantic-red"><X size={7} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Messages thread */}
        <div className="space-y-0">
          {messages.length === 0 ? (
            <div className="bg-surface-secondary rounded-[12px] p-8 text-center">
              <MessageSquare size={20} className="text-txt-muted mx-auto mb-2 opacity-40" />
              <p className="text-ds-body text-txt-muted">No messages yet</p>
              <p className="text-[10px] text-txt-muted mt-1">Start a conversation — use @ to tag team members</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.id} className="flex gap-3 relative py-3">
                {/* Vertical line */}
                {i < messages.length - 1 && (
                  <div className="absolute left-[13px] top-[40px] bottom-0 w-px bg-[rgba(0,0,0,0.06)]" />
                )}
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-gunner-red-light flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-gunner-red text-[10px] font-semibold">{m.userName?.[0]?.toUpperCase() ?? '?'}</span>
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-ds-fine font-semibold text-txt-primary">{m.userName}</p>
                    <p className="text-[10px] text-txt-muted">{formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}</p>
                  </div>
                  <p className="text-ds-fine text-txt-secondary mt-0.5 whitespace-pre-wrap">
                    {renderText(m.text, m.mentions)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
