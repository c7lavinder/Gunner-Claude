'use client'
// components/disposition/journey/section-4-responses.tsx
// Section 4 of the Disposition Journey: Track Responses.
// Session 77 rewrite — was a "coming soon" stub, now a 3-column kanban:
// Responded / Interested / Showing Scheduled.
//
//   • Responded — buyer replied; not yet qualified by rep or AI
//   • Interested — AI auto-flagged from responseIntent='interested'
//                  (in the buyer-response webhook), or rep manually moved
//   • Showing Scheduled — populated by the Section-5 fast-forward rule
//                         (logging a showing or offer auto-promotes here)
//
// Same surface as Section 3's kanban but read from a different endpoint
// (/section4-buyers) which skips the GHL match step.

import { useState, useEffect } from 'react'
import { Loader2, MessageSquare, Pencil, ChevronLeft, ChevronRight, Send, Sparkles } from 'lucide-react'
import { useToast } from '@/components/ui/toaster'
import { formatPhone, titleCase } from '@/lib/format'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'
import { SendModal } from './send-modal'
import { BuyerModal } from './buyer-modal'

type Stage = 'responded' | 'interested' | 'showing_scheduled'

interface Row {
  buyerId: string
  name: string
  phone: string | null
  email: string | null
  ghlContactId: string | null
  markets: string[]
  tier: string
  stage: Stage
  responseIntent: string | null   // interested | not_interested | needs_followup | unclear
  responseAt: string | null
  movedToInterestedAt: string | null
  matchScore: number | null
}

const COLUMNS: { key: Stage; label: string; helper: string }[] = [
  { key: 'responded', label: 'Responded', helper: 'Replied — not yet qualified' },
  { key: 'interested', label: 'Interested', helper: 'AI flagged or rep promoted' },
  { key: 'showing_scheduled', label: 'Showing Scheduled', helper: 'From Section 5 logs' },
]

const PREV: Record<Stage, Stage | null> = {
  responded: null,
  interested: 'responded',
  showing_scheduled: 'interested',
}
const NEXT: Record<Stage, Stage | null> = {
  responded: 'interested',
  interested: 'showing_scheduled',
  showing_scheduled: null,
}

const TIER_COLORS: Record<string, string> = {
  priority: 'bg-amber-100 text-amber-700',
  qualified: 'bg-green-100 text-green-700',
  jv: 'bg-blue-100 text-blue-700',
  realtor: 'bg-fuchsia-100 text-fuchsia-700',
  unqualified: 'bg-gray-100 text-gray-500',
  halted: 'bg-red-100 text-red-500',
}

export function Section4Responses({ property, tenantSlug }: { property: PropertyDetail; tenantSlug: string }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [sendTargets, setSendTargets] = useState<Row[] | null>(null)
  const [editTarget, setEditTarget] = useState<Row | null>(null)
  const [marketOptions, setMarketOptions] = useState<string[]>([])

  async function loadMarketOptionsIfNeeded() {
    if (marketOptions.length > 0) return
    try {
      const res = await fetch(`/api/properties/${property.id}/buyers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getFormOptions' }),
      })
      const data = await res.json()
      if (Array.isArray(data.options?.markets)) setMarketOptions(data.options.markets)
    } catch { /* modal still opens; user can type to add markets */ }
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/section4-buyers`)
      const data = await res.json()
      setRows(data.rows ?? [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [property.id])  // eslint-disable-line react-hooks/exhaustive-deps

  async function moveStage(buyerId: string, newStage: Stage) {
    // Optimistic
    setRows(prev => prev.map(r => r.buyerId === buyerId ? { ...r, stage: newStage } : r))
    try {
      const res = await fetch(`/api/properties/${property.id}/buyer-stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId, stage: newStage }),
      })
      if (!res.ok) {
        // Revert on failure
        toast('Failed to move buyer', 'error')
        load()
      }
    } catch {
      toast('Failed to move buyer', 'error')
      load()
    }
  }

  function buyersInColumn(stage: Stage) {
    return rows.filter(r => r.stage === stage)
  }

  if (loading) {
    return (
      <div className="py-8 text-center">
        <Loader2 size={16} className="animate-spin text-txt-muted mx-auto" />
        <p className="text-ds-fine text-txt-muted mt-2">Loading responses...</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare size={32} className="mx-auto text-txt-muted mb-3" />
        <div className="text-[14px] font-medium text-txt-primary mb-1">
          No responses yet
        </div>
        <div className="text-[12px] text-txt-secondary max-w-md mx-auto">
          Buyers land here once they reply to a blast or get logged in Section 5
          (offers / showings). Send something from Section 3 first.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map(col => {
          const colRows = buyersInColumn(col.key)
          return (
            <div key={col.key} className="min-w-[280px] flex-1 rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-txt-muted">{col.label}</span>
                  <span className="text-[10px] font-medium bg-surface-tertiary text-txt-muted px-1.5 py-0.5 rounded-full ml-1.5">{colRows.length}</span>
                </div>
              </div>
              <p className="text-[10px] text-txt-muted mb-2">{col.helper}</p>

              <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-400px)]">
                {colRows.length === 0 ? (
                  <p className="text-[10px] text-txt-muted text-center py-4">No buyers</p>
                ) : (
                  colRows.map(r => {
                    const prev = PREV[r.stage]
                    const next = NEXT[r.stage]
                    const aiFlagged = col.key === 'interested' && r.responseIntent === 'interested'
                    const isNotInterested = r.responseIntent === 'not_interested'
                    const cardClasses = isNotInterested
                      ? 'bg-gray-50 opacity-60 rounded-lg border-[0.5px] border-[rgba(0,0,0,0.08)] p-3'
                      : col.key === 'showing_scheduled'
                        ? 'bg-green-50/30 border-l-2 border-green-400 rounded-lg border-r-[0.5px] border-t-[0.5px] border-b-[0.5px] border-r-[rgba(0,0,0,0.08)] border-t-[rgba(0,0,0,0.08)] border-b-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow'
                        : col.key === 'interested'
                          ? 'bg-fuchsia-50/30 border-l-2 border-fuchsia-400 rounded-lg border-r-[0.5px] border-t-[0.5px] border-b-[0.5px] border-r-[rgba(0,0,0,0.08)] border-t-[rgba(0,0,0,0.08)] border-b-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow'
                          : 'bg-amber-50/30 border-l-2 border-amber-400 rounded-lg border-r-[0.5px] border-t-[0.5px] border-b-[0.5px] border-r-[rgba(0,0,0,0.08)] border-t-[rgba(0,0,0,0.08)] border-b-[rgba(0,0,0,0.08)] shadow-sm p-3 hover:shadow-md transition-shadow'
                    return (
                      <div key={r.buyerId} className={cardClasses}>
                        {isNotInterested && (
                          <div className="mb-1">
                            <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">Not Interested</span>
                          </div>
                        )}
                        {aiFlagged && (
                          <div className="mb-1 flex items-center gap-1 text-[8px] font-semibold text-fuchsia-700">
                            <Sparkles size={9} /> AI auto-flagged interested
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mb-1">
                          {r.matchScore != null && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-blue-100 text-blue-700">
                              {Math.round(r.matchScore)}
                            </span>
                          )}
                          <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 capitalize ${TIER_COLORS[r.tier] ?? TIER_COLORS.unqualified}`}>
                            {r.tier}
                          </span>
                          <a
                            href={`/${tenantSlug}/buyers/${r.buyerId}`}
                            className="text-ds-fine font-semibold text-txt-primary truncate flex-1 hover:text-gunner-red hover:underline"
                            title="Open buyer page"
                          >
                            {titleCase(r.name)}
                          </a>
                        </div>
                        {r.phone && (
                          <p className="text-[10px] text-txt-muted mb-2 pl-0.5">{formatPhone(r.phone)}</p>
                        )}
                        {r.responseIntent && (
                          <p className="text-[10px] text-txt-secondary italic mb-2">
                            Intent: <span className="font-medium capitalize">{r.responseIntent.replace('_', ' ')}</span>
                          </p>
                        )}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSendTargets([r])}
                            disabled={!r.phone && !r.email}
                            className="flex items-center gap-1 text-[9px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 px-2 py-1 rounded-md transition-colors"
                            title="Follow up with artifact or custom message"
                          >
                            <Send size={10} /> Send
                          </button>
                          <button
                            onClick={() => { setEditTarget(r); loadMarketOptionsIfNeeded() }}
                            className="flex items-center gap-1 text-[9px] font-medium text-txt-muted hover:text-txt-secondary bg-surface-tertiary hover:bg-surface-secondary px-2 py-1 rounded-md transition-colors"
                            title="Edit buyer"
                          >
                            <Pencil size={9} /> Edit
                          </button>
                          <div className="flex-1" />
                          {prev && (
                            <button
                              onClick={() => moveStage(r.buyerId, prev)}
                              className="text-[10px] font-bold text-txt-muted hover:text-txt-primary bg-surface-tertiary hover:bg-surface-secondary w-6 h-6 rounded flex items-center justify-center transition-colors"
                              title={`Move to ${prev.replace('_', ' ')}`}
                            >
                              <ChevronLeft size={14} />
                            </button>
                          )}
                          {next && (
                            <button
                              onClick={() => moveStage(r.buyerId, next)}
                              className="text-[10px] font-bold text-txt-muted hover:text-txt-primary bg-surface-tertiary hover:bg-surface-secondary w-6 h-6 rounded flex items-center justify-center transition-colors"
                              title={`Move to ${next.replace('_', ' ')}`}
                            >
                              <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {sendTargets && (
        <SendModal
          propertyId={property.id}
          propertyAddress={property.address}
          tenantSlug={tenantSlug}
          buyers={sendTargets.map(r => ({
            id: r.buyerId, name: r.name, phone: r.phone, email: r.email, tier: r.tier,
          }))}
          artifacts={{
            description: (property.dispoArtifacts?.description as string | undefined),
            listingPost: (property.dispoArtifacts?.listingPost as string | undefined),
            socialPost: (property.dispoArtifacts?.socialPost as string | undefined),
          }}
          onClose={() => setSendTargets(null)}
          onSent={() => { /* Section 4 stages don't auto-promote on follow-up send */ }}
        />
      )}

      {editTarget && (
        <BuyerModal
          mode="edit"
          buyer={{
            id: editTarget.buyerId,
            name: editTarget.name,
            phone: editTarget.phone,
            email: editTarget.email,
            tier: editTarget.tier,
            markets: editTarget.markets ?? [],
            verifiedFunding: false,
            purchasedBefore: false,
            responseSpeed: '',
            buybox: [],
            notes: null,
          }}
          tenantSlug={tenantSlug}
          marketOptions={marketOptions}
          onClose={() => setEditTarget(null)}
          onSaved={(next) => {
            // Merge into the local rows so the kanban card reflects the
            // edit without a refetch.
            setRows(prev => prev.map(r => r.buyerId === editTarget.buyerId
              ? {
                  ...r,
                  name: next.name ?? r.name,
                  phone: next.phone ?? r.phone,
                  email: next.email ?? r.email,
                  tier: next.tier ?? r.tier,
                  markets: next.markets ?? r.markets,
                }
              : r,
            ))
          }}
        />
      )}
    </div>
  )
}
