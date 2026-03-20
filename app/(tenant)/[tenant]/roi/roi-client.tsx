'use client'
// ROI page — lead source cost tracking and ROI analysis

import { useState } from 'react'
import { DollarSign, TrendingUp, Plus, Loader2 } from 'lucide-react'

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
    await fetch('/api/lead-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: addSource, cost: parseFloat(addCost), month: currentMonth, year: currentYear }),
    })
    setSaving(false)
    setShowAdd(false)
    setAddCost('')
    window.location.reload()
  }

  const monthLabel = new Date(currentYear, currentMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Lead Source ROI</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track spend per channel, measure cost per lead</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={14} /> Log spend
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <p className="text-2xl font-semibold text-white">${totalSpend.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Total spend</p>
        </div>
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <p className="text-2xl font-semibold text-white">{totalLeads}</p>
          <p className="text-xs text-gray-400 mt-1">Total leads</p>
        </div>
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <p className="text-2xl font-semibold text-green-400">{totalDeals}</p>
          <p className="text-xs text-gray-400 mt-1">Deals closed</p>
        </div>
      </div>

      {/* Add cost form */}
      {showAdd && (
        <div className="bg-[#1a1d27] border border-orange-500/30 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white mb-3">Log monthly spend — {monthLabel}</h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Source</label>
              <select value={addSource} onChange={e => setAddSource(e.target.value)} className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {DEFAULT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="w-40">
              <label className="text-xs text-gray-400 mb-1 block">Cost ($)</label>
              <input type="number" value={addCost} onChange={e => setAddCost(e.target.value)} placeholder="500" className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            </div>
            <button onClick={saveCost} disabled={!addCost || saving} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Source breakdown */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
        {sources.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign size={24} className="text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No lead source data yet. Log your first monthly spend or properties will populate sources from GHL.</p>
          </div>
        ) : (
          sources.map(src => (
            <div key={src.source} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                <DollarSign size={16} className="text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{src.source}</p>
                <p className="text-xs text-gray-500">{src.leads} leads · {src.deals} deals</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-white">${src.totalSpend.toLocaleString()}</p>
                <p className="text-xs text-gray-500">
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
