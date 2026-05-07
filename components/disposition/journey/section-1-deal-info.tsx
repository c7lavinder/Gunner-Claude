'use client'
// components/disposition/journey/section-1-deal-info.tsx
// Section 1 of the Disposition Journey: Deal info readiness checklist.
// Six gates (Session 77 spec) that must pass before Section 2 (blast
// generation) can produce a buyer-ready artifact:
//
//   1. Address                 — Property.address
//   2. Seller linked           — at least one PropertySeller
//   3. Contract                — property is in the disposition lane
//                                (Property.dispoStatus is set & not CLOSED)
//   4. Property details        — every field in the Property Details panel
//                                (delegated to lib/disposition/property-details-readiness.ts)
//   5. Photos                  — at least one PropertyPhoto row
//   6. Disposition Manager     — a PropertyTeamMember with role
//                                'DISPOSITION_MANAGER' is assigned
//
// Click-throughs jump to the right tab so the rep can fix the gap.
// Property details has an expandable sub-list because the rep won't
// guess which of the 26 fields is empty.

import { useState } from 'react'
import { Check, X, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'
import { checkPropertyDetailsReadiness } from '@/lib/disposition/property-details-readiness'

type JumpTarget = 'overview' | 'data'

interface RequiredItem {
  label: string
  filled: boolean
  jumpToTab: JumpTarget | null  // null = no in-page fix (e.g. contract = pipeline action)
  hint: string                  // shown when not filled, telling rep what to do
}

export function Section1DealInfo({
  property,
  onJumpToTab,
}: {
  property: PropertyDetail
  onJumpToTab: (tabKey: 'overview' | 'data') => void
}) {
  const items = computeItems(property)
  const filled = items.filter(i => i.filled).length
  const total = items.length
  const allDone = filled === total

  const detailsCheck = checkPropertyDetailsReadiness(property)
  const [showMissingDetails, setShowMissingDetails] = useState(false)

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-txt-secondary">
        Pre-flight checklist before this deal can be blasted to buyers.
      </div>

      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.label} className="flex items-start gap-2 text-[13px]">
            {item.filled ? (
              <Check size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <X size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={item.filled ? 'text-txt-primary font-medium' : 'text-txt-primary'}>
                  {item.label}
                </span>
                {!item.filled && item.jumpToTab && (
                  <button
                    onClick={() => onJumpToTab(item.jumpToTab as JumpTarget)}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gunner-red hover:text-gunner-red-dark"
                  >
                    {item.jumpToTab === 'overview' ? 'Edit on Overview' : 'Open Data tab'}
                    <ArrowRight size={10} />
                  </button>
                )}
              </div>
              {!item.filled && (
                <p className="text-[11px] text-txt-muted mt-0.5">{item.hint}</p>
              )}
              {/* Property details — show which sub-fields are missing */}
              {item.label === 'Property details — all fields filled' && !item.filled && (
                <div className="mt-1.5">
                  <button
                    onClick={() => setShowMissingDetails(p => !p)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-txt-muted hover:text-txt-secondary"
                  >
                    {showMissingDetails ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    {showMissingDetails ? 'Hide' : 'Show'} {detailsCheck.missing.length} missing
                  </button>
                  {showMissingDetails && (
                    <div className="mt-1.5 ml-1 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
                      {detailsCheck.missing.map(name => (
                        <span key={name} className="text-[11px] text-txt-muted">• {name}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,0,0,0.06)]">
        <div className="text-[12px] text-txt-secondary">
          {allDone ? (
            <span className="text-green-700 font-medium">All gates clear — ready to generate blast.</span>
          ) : (
            <>
              <span className="font-medium text-txt-primary">{total - filled}</span>
              {' of '}
              <span className="font-medium text-txt-primary">{total}</span>
              {' gates not met.'}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function computeItems(p: PropertyDetail): RequiredItem[] {
  const detailsCheck = checkPropertyDetailsReadiness(p)
  const dispoManagerAssigned = p.propertyTeam.some(t => t.role === 'DISPOSITION_MANAGER')
  const inDispoLane = !!p.dispoStatus && p.dispoStatus !== 'CLOSED'

  return [
    {
      label: 'Address',
      filled: !!p.address,
      jumpToTab: 'overview',
      hint: 'Add street address on Overview.',
    },
    {
      label: 'Seller linked',
      filled: (p.sellers?.length ?? 0) > 0,
      jumpToTab: 'overview',
      hint: 'Link a seller from the Contacts panel on Overview.',
    },
    {
      label: 'Contract — property in disposition lane',
      filled: inDispoLane,
      jumpToTab: null,
      hint: 'Move this property into the disposition pipeline in GHL once the contract is signed. Status syncs automatically.',
    },
    {
      label: 'Property details — all fields filled',
      filled: detailsCheck.allFilled,
      jumpToTab: 'overview',
      hint: `${detailsCheck.filledCount} of ${detailsCheck.totalCount} property-detail fields filled.`,
    },
    {
      label: 'Photos uploaded',
      filled: p.photoCount > 0,
      jumpToTab: 'data',
      hint: 'Upload at least one photo from the Data tab.',
    },
    {
      label: 'Disposition Manager assigned',
      filled: dispoManagerAssigned,
      jumpToTab: 'overview',
      hint: 'Assign a Disposition Manager in the Team panel on Overview. They become the contact on every generated artifact.',
    },
  ]
}
