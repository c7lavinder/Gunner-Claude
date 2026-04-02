'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Search, ChevronDown, ChevronRight, Loader2, Bot, DollarSign, Clock, Zap } from 'lucide-react'

interface AiLogEntry {
  id: string
  createdAt: string
  userId: string | null
  type: string
  pageContext: string | null
  inputSummary: string
  outputSummary: string
  toolsCalled: unknown
  status: string
  errorMessage: string | null
  tokensIn: number | null
  tokensOut: number | null
  estimatedCost: number | null
  durationMs: number | null
  model: string | null
}

interface AiLogDetail extends AiLogEntry {
  inputFull: string | null
  outputFull: string | null
}

const TYPE_COLORS: Record<string, string> = {
  assistant_chat: 'bg-blue-100 text-blue-700',
  call_grading: 'bg-green-100 text-green-700',
  deal_intel: 'bg-purple-100 text-purple-700',
  next_steps: 'bg-amber-100 text-amber-700',
  blast_gen: 'bg-teal-100 text-teal-700',
  buyer_scoring: 'bg-orange-100 text-orange-700',
  property_enrich: 'bg-pink-100 text-pink-700',
  action_execution: 'bg-red-100 text-red-700',
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  rejected: 'bg-amber-100 text-amber-700',
  edited: 'bg-blue-100 text-blue-700',
}

export function AiLogsClient({ tenantSlug }: { tenantSlug: string }) {
  const [logs, setLogs] = useState<AiLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ todayCount: 0, weekErrorRate: 0, weekTotal: 0, weekErrors: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AiLogDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) })
    if (typeFilter) params.set('type', typeFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)

    fetch(`/api/admin/ai-logs?${params}`)
      .then(r => r.json())
      .then(d => {
        setLogs(d.logs ?? [])
        setTotal(d.total ?? 0)
        if (d.stats) setStats(d.stats)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [typeFilter, statusFilter, search, page])

  async function loadDetail(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/ai-logs/${id}`)
      const data = await res.json()
      setDetail(data.log)
    } catch {}
    setLoadingDetail(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-[18px] font-bold text-txt-primary">AI Logs</h1>
        <p className="text-[12px] text-txt-muted">Every AI interaction — debug, improve, monitor costs</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border-[0.5px] rounded-[12px] p-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Bot size={14} className="text-semantic-blue" />
            <span className="text-[10px] font-semibold text-txt-muted uppercase">Today</span>
          </div>
          <p className="text-[20px] font-bold text-txt-primary">{stats.todayCount}</p>
        </div>
        <div className="bg-white border-[0.5px] rounded-[12px] p-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-semantic-purple" />
            <span className="text-[10px] font-semibold text-txt-muted uppercase">This Week</span>
          </div>
          <p className="text-[20px] font-bold text-txt-primary">{stats.weekTotal}</p>
        </div>
        <div className="bg-white border-[0.5px] rounded-[12px] p-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-semantic-red" />
            <span className="text-[10px] font-semibold text-txt-muted uppercase">Error Rate</span>
          </div>
          <p className="text-[20px] font-bold text-txt-primary">{stats.weekErrorRate}%</p>
          <p className="text-[9px] text-txt-muted">{stats.weekErrors} errors this week</p>
        </div>
        <div className="bg-white border-[0.5px] rounded-[12px] p-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-semantic-green" />
            <span className="text-[10px] font-semibold text-txt-muted uppercase">Est. Cost Today</span>
          </div>
          <p className="text-[20px] font-bold text-txt-primary">
            ${logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString())
              .reduce((sum, l) => sum + (l.estimatedCost ?? 0), 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-white border-[0.5px] rounded-[10px] px-3 py-2" style={{ borderColor: 'var(--border-medium)' }}>
          <Search size={14} className="text-txt-muted" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search input/output..."
            className="flex-1 text-[12px] text-txt-primary bg-transparent focus:outline-none placeholder:text-txt-muted" />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
          className="bg-white border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary" style={{ borderColor: 'var(--border-medium)' }}>
          <option value="">All Types</option>
          <option value="assistant_chat">Assistant Chat</option>
          <option value="call_grading">Call Grading</option>
          <option value="deal_intel">Deal Intel</option>
          <option value="next_steps">Next Steps</option>
          <option value="blast_gen">Blast Gen</option>
          <option value="buyer_scoring">Buyer Scoring</option>
          <option value="property_enrich">Property Enrich</option>
          <option value="action_execution">Action Execution</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}
          className="bg-white border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary" style={{ borderColor: 'var(--border-medium)' }}>
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Errors</option>
          <option value="rejected">Rejected</option>
          <option value="edited">Edited</option>
        </select>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-txt-muted" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border-[0.5px] rounded-[14px] py-12 text-center" style={{ borderColor: 'var(--border-light)' }}>
          <Bot size={24} className="text-txt-muted mx-auto mb-2" />
          <p className="text-[13px] text-txt-muted">No AI logs yet</p>
        </div>
      ) : (
        <div className="bg-white border-[0.5px] rounded-[14px] overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
          {logs.map(log => (
            <div key={log.id}>
              <button onClick={() => loadDetail(log.id)}
                className="w-full text-left px-4 py-3 border-b-[0.5px] hover:bg-surface-secondary transition-colors flex items-center gap-3"
                style={{ borderColor: 'var(--border-light)' }}>
                {expandedId === log.id ? <ChevronDown size={12} className="text-txt-muted shrink-0" /> : <ChevronRight size={12} className="text-txt-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${TYPE_COLORS[log.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {log.type.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[log.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {log.status}
                    </span>
                    {log.model && <span className="text-[9px] text-txt-muted">{log.model}</span>}
                    {log.durationMs && (
                      <span className="text-[9px] text-txt-muted flex items-center gap-0.5">
                        <Clock size={8} /> {(log.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    {log.estimatedCost != null && (
                      <span className="text-[9px] text-txt-muted">${log.estimatedCost.toFixed(3)}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-txt-primary truncate">{log.inputSummary}</p>
                  <p className="text-[10px] text-txt-muted truncate">{log.outputSummary}</p>
                </div>
                <span className="text-[9px] text-txt-muted shrink-0 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </button>

              {/* Expanded detail */}
              {expandedId === log.id && (
                <div className="px-4 py-3 bg-surface-secondary border-b-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
                  {loadingDetail ? (
                    <Loader2 size={14} className="animate-spin text-txt-muted" />
                  ) : detail ? (
                    <div className="space-y-3">
                      {log.errorMessage && (
                        <div className="bg-red-50 border border-red-200 rounded-[8px] p-3">
                          <p className="text-[10px] font-semibold text-red-700 mb-1">Error</p>
                          <p className="text-[11px] text-red-600 font-mono">{log.errorMessage}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">Full Input</p>
                        <pre className="text-[10px] text-txt-secondary bg-white rounded-[8px] p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono border-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
                          {detail.inputFull ?? log.inputSummary}
                        </pre>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">Full Output</p>
                        <pre className="text-[10px] text-txt-secondary bg-white rounded-[8px] p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono border-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
                          {detail.outputFull ?? log.outputSummary}
                        </pre>
                      </div>
                      {log.toolsCalled != null && (
                        <div>
                          <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">Tools Called</p>
                          <pre className="text-[10px] text-txt-secondary bg-white rounded-[8px] p-3 max-h-[100px] overflow-y-auto whitespace-pre-wrap font-mono border-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
                            {JSON.stringify(log.toolsCalled, null, 2)}
                          </pre>
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-[9px] text-txt-muted">
                        {log.tokensIn != null && <span>Input: {log.tokensIn.toLocaleString()} tokens</span>}
                        {log.tokensOut != null && <span>Output: {log.tokensOut.toLocaleString()} tokens</span>}
                        {log.pageContext && <span>Page: {log.pageContext}</span>}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-txt-muted">Showing {page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="text-[11px] px-3 py-1.5 rounded-[8px] bg-surface-secondary text-txt-secondary disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= total}
              className="text-[11px] px-3 py-1.5 rounded-[8px] bg-surface-secondary text-txt-secondary disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
