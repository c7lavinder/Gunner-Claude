'use client'
// ROI page — lead source cost tracking and ROI analysis

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { DollarSign, TrendingUp, Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/ui/toaster'

interface SourceSummary {
  source: string; totalSpend: number; currentMonthCost: number
  leads: number; deals: number; costPerLead: number
}

const DEFAULT_SOURCES = ['Facebook', 'Direct Mail', 'Cold Call', 'PPC', 'Referral', 'Driving for Dollars', 'Other']

export function RoiClient({
  tenantSlug, sources, currentMonth, currentYear,
}: {
  tenantSlug: string; sources: SourceSummary[]
  currentMonth: number; currentYear: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [addSource, setAddSource] = useState(DEFAULT_SOURCES[0])
  const [addCost, setAddCost] = useState('')
  const [saving, setSaving] = useState(false)

  const totalSpend = sources.reduce((s, src) => s + src.totalSpend, 0)
  const totalLeads = sources.reduce((s, src) => s + src.leads, 0)
  const totalDeals = sources.reduce((s, src) => s + src.deals, 0)

  async function saveCost() {
    if (!addCost) return
    setSaving(true)
    try {
      const res = await fetch('/api/lead-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: addSource, cost: parseFloat(addCost), month: currentMonth, year: currentYear }),
      })
      if (res.ok) {
        toast('Spend logged', 'success')
        setShowAdd(false)
        setAddCost('')
        startTransition(() => router.refresh())
      } else {
        toast('Failed to save spend', 'error')
      }
    } catch {
      toast('Failed to save spend', 'error')
    }
    setSaving(false)
  }

  const monthLabel = new Date(currentYear, currentMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const now = new Date()
  const isCurrentMonth = currentMonth === now.getMonth() + 1 && currentYear === now.getFullYear()

  function navigateMonth(delta: number) {
    let m = currentMonth + delta
    let y = currentYear
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    startTransition(() => router.push(`${pathname}?month=${m}&year=${y}`))
  }

  const inputCls = 'bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors'

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary">Lead Source ROI</h1>
          <p className="text-ds-body text-txt-secondary mt-0.5">Track spend per channel, measure cost per lead</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-body font-semibold px-4 py-2.5 rounded-[10px] transition-colors">
          <Plus size={14} /> Log spend
        </button>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-ds-label font-medium text-txt-primary min-w-[160px] text-center">{monthLabel}</span>
        <button onClick={() => navigateMonth(1)} disabled={isCurrentMonth} className="p-1.5 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary disabled:opacity-30 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
          <p className="text-ds-hero font-semibold text-txt-primary">${totalSpend.toLocaleString()}</p>
          <p className="text-ds-fine text-txt-secondary mt-1">Total spend</p>
        </div>
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
          <p className="text-ds-hero font-semibold text-txt-primary">{totalLeads}</p>
          <p className="text-ds-fine text-txt-secondary mt-1">Total leads</p>
        </div>
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
          <p className="text-ds-hero font-semibold text-semantic-green">{totalDeals}</p>
          <p className="text-ds-fine text-txt-secondary mt-1">Deals closed</p>
        </div>
      </div>

      {/* Add cost form */}
      {showAdd && (
        <div className="bg-white border-[0.5px] border-gunner-red/20 rounded-[14px] p-5">
          <h2 className="text-ds-label font-medium text-txt-primary mb-3">Log monthly spend — {monthLabel}</h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-ds-fine text-txt-secondary mb-1 block">Source</label>
              <select value={addSource} onChange={e => setAddSource(e.target.value)} className={`w-full ${inputCls}`}>
                {DEFAULT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="w-40">
              <label className="text-ds-fine text-txt-secondary mb-1 block">Cost ($)</label>
              <input type="number" value={addCost} onChange={e => setAddCost(e.target.value)} placeholder="500" className={`w-full ${inputCls}`} />
            </div>
            <button onClick={saveCost} disabled={!addCost || saving} className="bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-4 py-2.5 rounded-[10px] transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Source breakdown */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
        {sources.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign size={24} className="text-txt-muted mx-auto mb-3" />
            <p className="text-ds-body text-txt-secondary">No lead source data yet. Log your first monthly spend or properties will populate sources from GHL.</p>
          </div>
        ) : (
          sources.map(src => (
            <div key={src.source} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary transition-colors">
              <div className="w-10 h-10 rounded-[10px] bg-semantic-green-bg flex items-center justify-center shrink-0">
                <DollarSign size={16} className="text-semantic-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ds-body text-txt-primary font-medium">{src.source}</p>
                <p className="text-ds-fine text-txt-muted">{src.leads} leads · {src.deals} deals</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-ds-body font-semibold text-txt-primary">${src.totalSpend.toLocaleString()}</p>
                <p className="text-ds-fine text-txt-muted">
                  {src.costPerLead > 0 ? `$${src.costPerLead}/lead` : 'No cost data'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
