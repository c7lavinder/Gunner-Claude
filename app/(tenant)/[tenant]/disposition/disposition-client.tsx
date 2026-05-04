'use client'
// app/(tenant)/[tenant]/disposition/disposition-client.tsx
// Manager portfolio view — properties grouped by current journey stage
// (Ready to Blast → Awaiting Responses → In Offer → Closing). Each row
// click-throughs to /inventory/{id} → Disposition tab.

import Link from 'next/link'
import { ChevronRight, ArrowRight } from 'lucide-react'
import type { JourneyStatus } from '@/lib/disposition/journey-status'

export interface DispositionRow {
  id: string
  address: string
  city: string
  state: string
  status: string
  askingPrice: string | null
  assignmentFee: string | null
  stage: JourneyStatus['stage']
}

const STAGE_ORDER: Array<{ key: JourneyStatus['stage']; label: string; description: string }> = [
  { key: 'ready_to_blast',     label: 'Ready to Blast',     description: 'Deal info ready, no blast sent yet.' },
  { key: 'awaiting_responses', label: 'Awaiting Responses', description: 'Blast sent, waiting on buyer reply.' },
  { key: 'in_offer',           label: 'In Offer',           description: 'Offer(s) logged, awaiting acceptance.' },
  { key: 'closing',            label: 'Closing',            description: 'Offer accepted, under contract.' },
]

const fmtMoney = (v: string | null) => {
  if (!v) return null
  const n = Number(v)
  return isNaN(n) ? null : `$${n.toLocaleString()}`
}

export function DispositionClient({ tenantSlug, rows }: { tenantSlug: string; rows: DispositionRow[] }) {
  const grouped: Record<JourneyStatus['stage'], DispositionRow[]> = {
    ready_to_blast: [],
    awaiting_responses: [],
    in_offer: [],
    closing: [],
  }
  for (const r of rows) grouped[r.stage].push(r)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold text-txt-primary">Disposition pipeline</h1>
        <p className="text-[12px] text-txt-secondary mt-1">
          Every property in disposition or under contract, grouped by the current journey stage.
          Click a row to open its disposition workflow.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[12px] p-10 text-center">
          <p className="text-[14px] text-txt-primary font-medium">No properties in disposition</p>
          <p className="text-[12px] text-txt-secondary mt-1">
            When a property moves to <span className="font-medium">In Disposition</span> or
            <span className="font-medium"> Under Contract</span>, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {STAGE_ORDER.map(stage => {
            const stageRows = grouped[stage.key]
            return (
              <div key={stage.key} className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
                <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] bg-surface-secondary/50">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-txt-primary">
                      {stage.label}
                    </h2>
                    <span className="text-[11px] font-medium text-txt-muted">({stageRows.length})</span>
                  </div>
                  <p className="text-[11px] text-txt-secondary mt-0.5">{stage.description}</p>
                </div>
                {stageRows.length === 0 ? (
                  <p className="px-4 py-3 text-[12px] text-txt-muted italic">No properties in this stage.</p>
                ) : (
                  <ul className="divide-y divide-[rgba(0,0,0,0.06)]">
                    {stageRows.map(r => {
                      const asking = fmtMoney(r.askingPrice)
                      const fee = fmtMoney(r.assignmentFee)
                      return (
                        <li key={r.id}>
                          <Link
                            href={`/${tenantSlug}/inventory/${r.id}?tab=disposition`}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary/40 transition-colors group"
                          >
                            <ChevronRight size={14} className="text-txt-muted flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-txt-primary truncate">{r.address}</p>
                              <p className="text-[11px] text-txt-secondary">{r.city}, {r.state}</p>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-txt-secondary flex-shrink-0">
                              {asking && <span>Ask: <span className="font-medium text-txt-primary">{asking}</span></span>}
                              {fee && <span>Fee: <span className="font-medium text-txt-primary">{fee}</span></span>}
                              <span className="px-2 py-0.5 rounded-full bg-surface-tertiary text-[10px] font-medium">
                                {r.status.replace(/_/g, ' ').toLowerCase()}
                              </span>
                            </div>
                            <ArrowRight size={12} className="text-txt-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
