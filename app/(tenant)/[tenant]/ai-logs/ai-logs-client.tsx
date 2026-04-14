'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Search, ChevronDown, ChevronRight, Loader2, Bot, DollarSign, Clock, Zap, User, MessageSquare, Phone, FileText, Send, Sparkles } from 'lucide-react'

interface AiLogEntry {
  id: string
  createdAt: string
  userId: string | null
  userName: string | null
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

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Bot }> = {
  assistant_chat: { label: 'Chat', color: 'bg-blue-100 text-blue-700', icon: MessageSquare },
  call_grading: { label: 'Grading', color: 'bg-green-100 text-green-700', icon: Phone },
  deal_intel: { label: 'Deal Intel', color: 'bg-purple-100 text-purple-700', icon: Sparkles },
  next_steps: { label: 'Next Steps', color: 'bg-amber-100 text-amber-700', icon: Zap },
  blast_gen: { label: 'Blast', color: 'bg-teal-100 text-teal-700', icon: Send },
  buyer_scoring: { label: 'Scoring', color: 'bg-orange-100 text-orange-700', icon: FileText },
  property_enrich: { label: 'Enrich', color: 'bg-pink-100 text-pink-700', icon: FileText },
  action_execution: { label: 'Action', color: 'bg-red-100 text-red-700', icon: Zap },
}

const CT = 'America/Chicago'

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

  const todayCost = logs
    .filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, l) => sum + (l.estimatedCost ?? 0), 0)

  return (
    <div className="max-w-[1000px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-txt-primary">AI Activity</h1>
        <p className="text-[12px] text-txt-muted">Everything your team asks the AI and what it returns</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Bot size={14} className="text-semantic-blue" />} label="Today" value={stats.todayCount} />
        <StatCard icon={<Zap size={14} className="text-purple-600" />} label="This Week" value={stats.weekTotal} />
        <StatCard icon={<AlertTriangle size={14} className="text-semantic-red" />} label="Errors" value={stats.weekErrors} sub={`${stats.weekErrorRate}% rate`} />
        <StatCard icon={<DollarSign size={14} className="text-semantic-green" />} label="Cost Today" value={`$${todayCost.toFixed(2)}`} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-white border-[0.5px] rounded-[10px] px-3 py-2" style={{ borderColor: 'var(--border-medium)' }}>
          <Search size={14} className="text-txt-muted" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search conversations..."
            className="flex-1 text-[12px] text-txt-primary bg-transparent focus:outline-none placeholder:text-txt-muted" />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
          className="bg-white border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary" style={{ borderColor: 'var(--border-medium)' }}>
          <option value="">All Types</option>
          <option value="assistant_chat">Chat</option>
          <option value="call_grading">Call Grading</option>
          <option value="deal_intel">Deal Intel</option>
          <option value="next_steps">Next Steps</option>
          <option value="blast_gen">Blast Gen</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}
          className="bg-white border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary" style={{ borderColor: 'var(--border-medium)' }}>
          <option value="">All</option>
          <option value="success">Success</option>
          <option value="error">Errors</option>
        </select>
      </div>

      {/* Log Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-txt-muted" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border-[0.5px] rounded-[14px] py-16 text-center" style={{ borderColor: 'var(--border-light)' }}>
          <Bot size={28} className="text-txt-muted mx-auto mb-2" />
          <p className="text-[13px] text-txt-muted">No AI activity yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const cfg = TYPE_CONFIG[log.type] ?? { label: log.type, color: 'bg-gray-100 text-gray-600', icon: Bot }
            const Icon = cfg.icon
            const isChat = log.type === 'assistant_chat'
            const isError = log.status === 'error'
            const isExpanded = expandedId === log.id

            return (
              <div key={log.id} className={`bg-white border-[0.5px] rounded-[14px] overflow-hidden transition-shadow ${isError ? 'border-red-200' : ''} ${isExpanded ? 'shadow-ds-float' : ''}`} style={{ borderColor: isError ? undefined : 'var(--border-light)' }}>
                {/* Row header */}
                <button onClick={() => loadDetail(log.id)} className="w-full text-left px-4 py-3 hover:bg-surface-secondary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Avatar / Icon */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isChat ? 'bg-blue-100' : 'bg-surface-tertiary'}`}>
                      {isChat ? <User size={14} className="text-blue-600" /> : <Icon size={14} className="text-txt-muted" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-semibold text-txt-primary">{log.userName ?? 'System'}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {isError && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Error</span>}
                        {log.pageContext && <span className="text-[9px] text-txt-muted">{log.pageContext}</span>}
                      </div>

                      {/* User message (input) */}
                      {isChat ? (
                        <p className="text-[12px] text-txt-primary leading-relaxed line-clamp-2">{log.inputSummary}</p>
                      ) : (
                        <p className="text-[11px] text-txt-secondary truncate">{log.inputSummary}</p>
                      )}

                      {/* AI response preview */}
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Bot size={11} className="text-txt-muted shrink-0 mt-0.5" />
                        <p className={`text-[11px] leading-relaxed line-clamp-2 ${isError ? 'text-red-600' : 'text-txt-muted'}`}>
                          {isError ? (log.errorMessage ?? 'Error occurred') : log.outputSummary}
                        </p>
                      </div>
                    </div>

                    {/* Right side meta */}
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-txt-muted">
                        {new Date(log.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CT })}
                      </p>
                      <div className="flex items-center gap-2 justify-end mt-0.5">
                        {log.durationMs != null && (
                          <span className="text-[9px] text-txt-muted flex items-center gap-0.5">
                            <Clock size={8} /> {(log.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                        {log.estimatedCost != null && log.estimatedCost > 0 && (
                          <span className="text-[9px] text-txt-muted">${log.estimatedCost.toFixed(3)}</span>
                        )}
                      </div>
                      {isExpanded ? <ChevronDown size={10} className="text-txt-muted ml-auto mt-1" /> : <ChevronRight size={10} className="text-txt-muted ml-auto mt-1" />}
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: 'var(--border-light)' }}>
                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 size={14} className="animate-spin text-txt-muted" />
                      </div>
                    ) : detail ? (
                      <>
                        {/* Error banner */}
                        {isError && log.errorMessage && (
                          <div className="bg-red-50 border border-red-200 rounded-[10px] p-3">
                            <p className="text-[10px] font-semibold text-red-700 uppercase mb-1">Error</p>
                            <p className="text-[12px] text-red-600">{log.errorMessage}</p>
                          </div>
                        )}

                        {/* Chat-style: user message */}
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <User size={12} className="text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-semibold text-txt-muted mb-1">{log.userName ?? 'System'}</p>
                            <div className="bg-blue-50 rounded-[10px] rounded-tl-[2px] px-3 py-2">
                              <p className="text-[12px] text-txt-primary leading-relaxed whitespace-pre-wrap">{detail.inputFull ?? log.inputSummary}</p>
                            </div>
                          </div>
                        </div>

                        {/* Chat-style: AI response */}
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-surface-tertiary flex items-center justify-center shrink-0">
                            <Bot size={12} className="text-txt-muted" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-semibold text-txt-muted mb-1">Gunner AI</p>
                            <div className={`rounded-[10px] rounded-tl-[2px] px-3 py-2 ${isError ? 'bg-red-50' : 'bg-surface-secondary'}`}>
                              <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${isError ? 'text-red-600' : 'text-txt-primary'}`}>
                                {detail.outputFull ?? log.outputSummary}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Tools called */}
                        {log.toolsCalled != null && (
                          <div className="ml-10">
                            <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">Tools Used</p>
                            <div className="flex flex-wrap gap-1">
                              {(Array.isArray(log.toolsCalled) ? log.toolsCalled : []).map((t: unknown, i: number) => {
                                const tool = t as { name?: string }
                                return (
                                  <span key={i} className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                                    {tool.name ?? String(t)}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Meta footer */}
                        <div className="ml-10 flex items-center gap-4 text-[9px] text-txt-muted pt-1">
                          {log.model && <span>{log.model}</span>}
                          {log.tokensIn != null && <span>{log.tokensIn.toLocaleString()} in</span>}
                          {log.tokensOut != null && <span>{log.tokensOut.toLocaleString()} out</span>}
                          {log.durationMs != null && <span>{(log.durationMs / 1000).toFixed(1)}s</span>}
                          {log.estimatedCost != null && <span>${log.estimatedCost.toFixed(4)}</span>}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-txt-muted">Showing {page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="text-[11px] px-3 py-1.5 rounded-[8px] bg-surface-secondary text-txt-secondary disabled:opacity-40 hover:bg-surface-tertiary transition-colors">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= total}
              className="text-[11px] px-3 py-1.5 rounded-[8px] bg-surface-secondary text-txt-secondary disabled:opacity-40 hover:bg-surface-tertiary transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border-[0.5px] rounded-[12px] p-4" style={{ borderColor: 'var(--border-light)' }}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-semibold text-txt-muted uppercase">{label}</span>
      </div>
      <p className="text-[20px] font-bold text-txt-primary">{value}</p>
      {sub && <p className="text-[9px] text-txt-muted">{sub}</p>}
    </div>
  )
}
