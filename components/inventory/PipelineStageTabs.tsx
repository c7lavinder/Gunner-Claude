'use client'
// components/inventory/PipelineStageTabs.tsx
// Pipeline stage selector — Acquisition, Disposition, Long-Term
// Click a stage to filter properties. Click again to deselect.

import { useState } from 'react'
import {
  UserPlus, CalendarCheck, DollarSign, FileText, CheckCircle,
  Package, Send, Receipt, Handshake, Clock, XCircle,
  ChevronRight, SlidersHorizontal,
} from 'lucide-react'
import type { AppStage } from '@/types/property'

// ─── Stage definitions ───────────────────────────────────────────────────────

const ACQ_STAGES: Array<{ key: AppStage; label: string; icon: typeof UserPlus; step: number }> = [
  { key: 'acquisition.new_lead',   label: 'New Lead',   icon: UserPlus,      step: 1 },
  { key: 'acquisition.appt_set',   label: 'Appt Set',   icon: CalendarCheck, step: 2 },
  { key: 'acquisition.offer_made', label: 'Offer Made', icon: DollarSign,    step: 3 },
  { key: 'acquisition.contract',   label: 'Contract',   icon: FileText,      step: 4 },
  { key: 'acquisition.closed',     label: 'Closed',     icon: CheckCircle,   step: 5 },
]

const DISPO_STAGES: Array<{ key: AppStage; label: string; icon: typeof Package; step: number }> = [
  { key: 'disposition.new_deal',         label: 'New Deal',   icon: Package,   step: 1 },
  { key: 'disposition.pushed_out',       label: 'Pushed Out', icon: Send,      step: 2 },
  { key: 'disposition.offers_received',  label: 'Offers',     icon: Receipt,   step: 3 },
  { key: 'disposition.contracted',       label: 'Contracted', icon: Handshake, step: 4 },
  { key: 'disposition.closed',           label: 'Closed',     icon: CheckCircle, step: 5 },
]

const LT_BUCKETS: Array<{ key: AppStage; label: string; icon: typeof Clock }> = [
  { key: 'longterm.follow_up', label: 'Follow Up', icon: Clock },
  { key: 'longterm.dead',      label: 'Dead',      icon: XCircle },
]

// ─── Component ───────────────────────────────────────────────────────────────

interface PipelineStageTabsProps {
  stageCounts: Partial<Record<AppStage, number>>
  selectedStage: AppStage | null
  onStageSelect: (stage: AppStage | null) => void
}

export function PipelineStageTabs({ stageCounts, selectedStage, onStageSelect }: PipelineStageTabsProps) {
  const [acqOpen, setAcqOpen] = useState(() => { try { return localStorage.getItem('pipeline.acq') !== 'false' } catch { return true } })
  const [dispoOpen, setDispoOpen] = useState(() => { try { return localStorage.getItem('pipeline.dispo') !== 'false' } catch { return true } })
  const [ltOpen, setLtOpen] = useState(() => { try { return localStorage.getItem('pipeline.lt') !== 'false' } catch { return true } })

  function toggleAcq() { const next = !acqOpen; setAcqOpen(next); try { localStorage.setItem('pipeline.acq', String(next)) } catch {} }
  function toggleDispo() { const next = !dispoOpen; setDispoOpen(next); try { localStorage.setItem('pipeline.dispo', String(next)) } catch {} }
  function toggleLt() { const next = !ltOpen; setLtOpen(next); try { localStorage.setItem('pipeline.lt', String(next)) } catch {} }

  function handleSelect(stage: AppStage) {
    onStageSelect(selectedStage === stage ? null : stage)
  }

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
      {/* Acquisition */}
      <Section
        label="Acquisition"
        icon={<ChevronRight size={11} />}
        open={acqOpen}
        onToggle={toggleAcq}
      >
        <StageRow stages={ACQ_STAGES} stageCounts={stageCounts} selectedStage={selectedStage} onSelect={handleSelect} />
      </Section>

      {/* Disposition */}
      <Section
        label="Disposition"
        icon={<SlidersHorizontal size={11} />}
        open={dispoOpen}
        onToggle={toggleDispo}
        border
      >
        <StageRow stages={DISPO_STAGES} stageCounts={stageCounts} selectedStage={selectedStage} onSelect={handleSelect} />
      </Section>

      {/* Long-Term */}
      <Section
        label="Long-Term"
        icon={<Clock size={11} />}
        open={ltOpen}
        onToggle={toggleLt}
        border
      >
        <div className="flex gap-2 px-4 pb-4">
          {LT_BUCKETS.map(bucket => {
            const count = stageCounts[bucket.key] ?? 0
            const isSelected = selectedStage === bucket.key
            const Icon = bucket.icon
            const isFollowUp = bucket.key === 'longterm.follow_up'
            return (
              <button
                key={bucket.key}
                onClick={() => handleSelect(bucket.key)}
                className={`flex items-center gap-2.5 flex-1 px-3.5 py-2.5 rounded-[10px] border-[0.5px] transition-all ${
                  isSelected
                    ? isFollowUp
                      ? 'bg-amber-50 border-amber-300 shadow-sm'
                      : 'bg-gray-100 border-gray-300 shadow-sm'
                    : 'bg-surface-secondary border-[rgba(0,0,0,0.06)] hover:border-[rgba(0,0,0,0.14)]'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isSelected
                    ? isFollowUp ? 'bg-amber-500 text-white' : 'bg-gray-500 text-white'
                    : count > 0
                      ? isFollowUp ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
                      : 'bg-gray-100 text-gray-400'
                }`}>
                  <Icon size={14} />
                </div>
                <div className="text-left">
                  <p className={`text-[11px] font-semibold ${
                    isSelected
                      ? isFollowUp ? 'text-amber-700' : 'text-gray-700'
                      : count > 0 ? 'text-txt-primary' : 'text-txt-muted'
                  }`}>{bucket.label}</p>
                  <p className="text-[9px] text-txt-muted">{count}</p>
                </div>
              </button>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ label, icon, open, onToggle, border, children }: {
  label: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  border?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={border ? 'border-t border-[rgba(0,0,0,0.06)]' : ''}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-4 py-2.5 text-left hover:bg-surface-secondary transition-colors"
      >
        <ChevronRight size={10} className={`text-txt-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-txt-muted">{icon}</span>
        <span className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">{label}</span>
      </button>
      {open && children}
    </div>
  )
}

// ─── Pipeline stage row ──────────────────────────────────────────────────────

function StageRow({ stages, stageCounts, selectedStage, onSelect }: {
  stages: Array<{ key: AppStage; label: string; icon: typeof UserPlus; step: number }>
  stageCounts: Partial<Record<AppStage, number>>
  selectedStage: AppStage | null
  onSelect: (stage: AppStage) => void
}) {
  return (
    <div className="flex items-start justify-between px-4 pb-4">
      {stages.map((stage, i) => {
        const count = stageCounts[stage.key] ?? 0
        const isSelected = selectedStage === stage.key
        const Icon = stage.icon
        return (
          <div key={stage.key} className="flex items-start flex-1 min-w-0">
            <button
              onClick={() => onSelect(stage.key)}
              className="flex flex-col items-center gap-1 w-full"
            >
              {/* Circle */}
              <div className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                isSelected
                  ? 'bg-gunner-red text-white shadow-md ring-2 ring-gunner-red-light'
                  : count > 0
                    ? 'bg-gunner-red-light text-gunner-red hover:shadow-sm hover:scale-105'
                    : 'bg-gray-100 text-gray-400'
              }`}>
                <Icon size={15} />
                {count > 0 && (
                  <span className={`absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold rounded-full px-0.5 ring-[1.5px] ring-white ${
                    isSelected ? 'bg-white text-gunner-red' : 'bg-gunner-red text-white'
                  }`}>
                    {count}
                  </span>
                )}
              </div>
              {/* Label */}
              <p className={`text-[9px] font-semibold leading-tight text-center ${
                isSelected ? 'text-gunner-red' : count > 0 ? 'text-txt-primary' : 'text-gray-400'
              }`}>
                {stage.label}
              </p>
              <p className="text-[8px] text-txt-muted">Step {stage.step}</p>
            </button>
            {/* Connecting line */}
            {i < stages.length - 1 && (
              <div className="flex-1 flex items-center pt-[18px] px-0.5 min-w-[10px]">
                <div className="h-[1.5px] w-full rounded-full bg-[rgba(0,0,0,0.08)]" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
