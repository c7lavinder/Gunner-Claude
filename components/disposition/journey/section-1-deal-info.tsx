'use client'
// components/disposition/journey/section-1-deal-info.tsx
// Section 1 of the Disposition Journey: Deal info readiness checklist.
// Surfaces what dispo needs from acq before the deal can blast.
// Click-throughs to Overview / Data tabs to fill missing fields.

import { Check, X, ArrowRight } from 'lucide-react'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'

interface RequiredField {
  label: string
  filled: boolean
  // Tab key on the property-detail page where this field lives.
  // Click jumps the user to that tab so they can edit.
  jumpToTab: 'overview' | 'data'
}

export function Section1DealInfo({
  property,
  onJumpToTab,
}: {
  property: PropertyDetail
  onJumpToTab: (tabKey: 'overview' | 'data') => void
}) {
  const fields = computeFields(property)
  const filled = fields.filter(f => f.filled).length
  const total = fields.length
  const allDone = filled === total

  const missing = fields.filter(f => !f.filled)
  const missingTabs = Array.from(new Set(missing.map(f => f.jumpToTab)))

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-txt-secondary">
        Pre-flight checklist for blasting. Acquisitions → Dispositions handoff.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {fields.map(f => (
          <div key={f.label} className="flex items-center gap-2 text-[13px]">
            {f.filled ? (
              <Check size={14} className="text-green-600 flex-shrink-0" />
            ) : (
              <X size={14} className="text-red-500 flex-shrink-0" />
            )}
            <span className={f.filled ? 'text-txt-primary' : 'text-txt-secondary'}>
              {f.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,0,0,0.06)]">
        <div className="text-[12px] text-txt-secondary">
          {allDone ? (
            <span className="text-green-700 font-medium">All fields complete — ready to blast.</span>
          ) : (
            <>
              <span className="font-medium text-txt-primary">{total - filled}</span>
              {' of '}
              <span className="font-medium text-txt-primary">{total}</span>
              {' fields incomplete.'}
            </>
          )}
        </div>
        {!allDone && (
          <div className="flex gap-2">
            {missingTabs.map(t => (
              <button
                key={t}
                onClick={() => onJumpToTab(t)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-gunner-red hover:text-gunner-red-dark"
              >
                Edit on {t === 'overview' ? 'Overview' : 'Data'} <ArrowRight size={12} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper for the journey-status util to know which fields gate readiness.
// Kept inline here (rather than imported into journey-status.ts) so the
// portfolio query at /disposition can compute readiness from a narrow
// projection without importing UI code.
function computeFields(p: PropertyDetail): RequiredField[] {
  return [
    { label: 'Address',           filled: !!p.address,                jumpToTab: 'overview' },
    { label: 'Asking price',      filled: !!p.askingPrice,            jumpToTab: 'overview' },
    { label: 'ARV',               filled: !!p.arv,                    jumpToTab: 'overview' },
    { label: 'Description',       filled: !!p.description,            jumpToTab: 'overview' },
    { label: 'Assignment fee',    filled: !!p.assignmentFee,          jumpToTab: 'overview' },
    { label: 'Photos',            filled: hasPhotos(p),               jumpToTab: 'data' },
    { label: 'Seller linked',     filled: (p.sellers?.length ?? 0) > 0, jumpToTab: 'overview' },
  ]
}

function hasPhotos(p: PropertyDetail): boolean {
  // Today the property doesn't expose a photo array directly; Google
  // photo thumbnail is a proxy. Tune when a real photos field exists.
  return !!p.googlePhotoThumbnailUrl
}
