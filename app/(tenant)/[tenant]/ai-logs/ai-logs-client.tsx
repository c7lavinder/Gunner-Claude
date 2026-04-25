'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Search, ChevronDown, ChevronRight, Loader2, Bot, DollarSign, Clock, Zap, User, MessageSquare, Phone, FileText, Send, Sparkles, Wrench, Copy, Check } from 'lucide-react'

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

type TabId = 'chat' | 'background' | 'errors'

// Plain-English labels for every AI job type — readable by a 10-year-old
const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Bot }> = {
  assistant_chat: { label: 'Team Chat', color: 'bg-blue-100 text-blue-700', icon: MessageSquare },
  call_grading: { label: 'Graded a Call', color: 'bg-green-100 text-green-700', icon: Phone },
  deal_intel: { label: 'Found Deal Details', color: 'bg-purple-100 text-purple-700', icon: Sparkles },
  next_steps: { label: 'Suggested Next Steps', color: 'bg-amber-100 text-amber-700', icon: Zap },
  blast_gen: { label: 'Wrote a Text Blast', color: 'bg-teal-100 text-teal-700', icon: Send },
  buyer_scoring: { label: 'Ranked Buyers', color: 'bg-orange-100 text-orange-700', icon: FileText },
  property_enrich: { label: 'Looked Up a Property', color: 'bg-pink-100 text-pink-700', icon: FileText },
  action_execution: { label: 'Did a Task in GHL', color: 'bg-red-100 text-red-700', icon: Wrench },
}

const CT = 'America/Chicago'

const TABS: { id: TabId; label: string; hint: string; icon: typeof Bot }[] = [
  { id: 'chat', label: 'Team Chats', hint: 'What your team asked the AI', icon: MessageSquare },
  { id: 'background', label: 'AI Work', hint: 'Jobs the AI did on its own', icon: Bot },
  { id: 'errors', label: 'Problems', hint: 'Things that went wrong', icon: AlertTriangle },
]

function prettyPage(pageContext: string | null): string | null {
  if (!pageContext) return null
  // Turn "/new-again-houses/calls" into "Calls page"
  const parts = pageContext.split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last) return null
  const cleaned = last.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return `${cleaned} page`
}

export function AiLogsClient({ tenantSlug: _tenantSlug }: { tenantSlug: string }) {
  const [tab, setTab] = useState<TabId>('chat')
  const [logs, setLogs] = useState<AiLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({
    chatsToday: 0,
    backgroundToday: 0,
    errorsToday: 0,
    weekErrorRate: 0,
    weekTotal: 0,
    weekErrors: 0,
    todayCost: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AiLogDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [page, setPage] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Reset page + filter when switching tabs
  useEffect(() => {
    setPage(0)
    setTypeFilter('')
    setSearch('')
    setExpandedId(null)
  }, [tab])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50), scope: tab })
    if (typeFilter) params.set('type', typeFilter)
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
  }, [tab, typeFilter, search, page])

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

  async function copyDiagnostics(log: AiLogEntry, d: AiLogDetail | null) {
    const lines = [
      `AI Log ID: ${log.id}`,
      `Type: ${TYPE_CONFIG[log.type]?.label ?? log.type}`,
      `Status: ${log.status}`,
      `When: ${new Date(log.createdAt).toLocaleString('en-US', { timeZone: CT })}`,
      `User: ${log.userName ?? 'System'}`,
      `Page: ${log.pageContext ?? 'n/a'}`,
      `Model: ${log.model ?? 'n/a'}`,
      `Tokens: ${log.tokensIn ?? 0} in / ${log.tokensOut ?? 0} out`,
      `Duration: ${log.durationMs != null ? (log.durationMs / 1000).toFixed(2) + 's' : 'n/a'}`,
      `Cost: ${log.estimatedCost != null ? '$' + log.estimatedCost.toFixed(4) : 'n/a'}`,
      log.errorMessage ? `Error: ${log.errorMessage}` : '',
      '',
      '--- Input ---',
      d?.inputFull ?? log.inputSummary,
      '',
      '--- Output ---',
      d?.outputFull ?? log.outputSummary,
    ].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setCopiedId(log.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  const activeTab = TABS.find(t => t.id === tab)!

  return (
    <div className="max-w-[1000px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-txt-primary">AI Activity</h1>
        <p className="text-[12px] text-txt-muted">See what the AI is doing and what your team is asking it.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<MessageSquare size={14} className="text-semantic-blue" />} label="Chats Today" value={stats.chatsToday} sub="Team asked the AI" />
        <StatCard icon={<Bot size={14} className="text-purple-600" />} label="Jobs Today" value={stats.backgroundToday} sub="AI did on its own" />
        <StatCard icon={<AlertTriangle size={14} className="text-semantic-red" />} label="Problems Today" value={stats.errorsToday} sub={`${stats.weekErrorRate}% of last 7 days`} />
        <StatCard icon={<DollarSign size={14} className="text-semantic-green" />} label="Money Spent Today" value={`$${stats.todayCost.toFixed(2)}`} sub="AI usage cost" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface-secondary rounded-[12px] p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          const count = t.id === 'chat' ? stats.chatsToday : t.id === 'background' ? stats.backgroundToday : stats.errorsToday
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-colors ${active ? 'bg-white text-txt-primary shadow-ds-float' : 'text-txt-muted hover:text-txt-secondary'}`}
            >
              <Icon size={13} className={active && t.id === 'errors' ? 'text-semantic-red' : ''} />
              <span>{t.label}</span>
              {count > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? (t.id === 'errors' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700') : 'bg-surface-tertiary text-txt-muted'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-txt-muted -mt-3">{activeTab.hint}.</p>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-white border-[0.5px] rounded-[10px] px-3 py-2" style={{ borderColor: 'var(--border-medium)' }}>
          <Search size={14} className="text-txt-muted" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder={tab === 'chat' ? 'Search what your team asked…' : tab === 'background' ? 'Search jobs…' : 'Search errors…'}
            className="flex-1 text-[12px] text-txt-primary bg-transparent focus:outline-none placeholder:text-txt-muted" />
        </div>
        {tab === 'background' && (
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
            className="bg-white border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary" style={{ borderColor: 'var(--border-medium)' }}>
            <option value="">All jobs</option>
            <option value="call_grading">Graded a Call</option>
            <option value="deal_intel">Found Deal Details</option>
            <option value="next_steps">Suggested Next Steps</option>
            <option value="blast_gen">Wrote a Text Blast</option>
            <option value="buyer_scoring">Ranked Buyers</option>
            <option value="property_enrich">Looked Up a Property</option>
            <option value="action_execution">Did a Task in GHL</option>
          </select>
        )}
      </div>

      {/* Log Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-txt-muted" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border-[0.5px] rounded-[14px] py-16 text-center" style={{ borderColor: 'var(--border-light)' }}>
          {tab === 'errors' ? (
            <>
              <Check size={28} className="text-semantic-green mx-auto mb-2" />
              <p className="text-[13px] text-txt-muted">No problems. The AI is running clean.</p>
            </>
          ) : (
            <>
              <Bot size={28} className="text-txt-muted mx-auto mb-2" />
              <p className="text-[13px] text-txt-muted">{tab === 'chat' ? 'Nobody has chatted with the AI yet.' : 'No AI jobs yet.'}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const cfg = TYPE_CONFIG[log.type] ?? { label: log.type, color: 'bg-gray-100 text-gray-600', icon: Bot }
            const Icon = cfg.icon
            const isChat = log.type === 'assistant_chat'
            const isError = log.status === 'error'
            const isExpanded = expandedId === log.id
            const pageLabel = prettyPage(log.pageContext)

            return (
              <div key={log.id} className={`bg-white border-[0.5px] rounded-[14px] overflow-hidden transition-shadow ${isError ? 'border-red-200' : ''} ${isExpanded ? 'shadow-ds-float' : ''}`} style={{ borderColor: isError ? undefined : 'var(--border-light)' }}>
                {/* Row header */}
                <button onClick={() => loadDetail(log.id)} className="w-full text-left px-4 py-3 hover:bg-surface-secondary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Avatar / Icon */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isChat ? 'bg-blue-100' : isError ? 'bg-red-100' : 'bg-surface-tertiary'}`}>
                      {isChat ? <User size={14} className="text-blue-600" /> : <Icon size={14} className={isError ? 'text-red-600' : 'text-txt-muted'} />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[12px] font-semibold text-txt-primary">{log.userName ?? 'Gunner AI'}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {isError && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Problem</span>}
                        {pageLabel && <span className="text-[9px] text-txt-muted">on {pageLabel}</span>}
                      </div>

                      {/* Input preview */}
                      {isChat ? (
                        <p className="text-[12px] text-txt-primary leading-relaxed line-clamp-2">
                          <span className="text-txt-muted">Asked: </span>
                          {log.inputSummary}
                        </p>
                      ) : (
                        <p className="text-[11px] text-txt-secondary truncate">{log.inputSummary}</p>
                      )}

                      {/* AI response / error preview */}
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Bot size={11} className={`shrink-0 mt-0.5 ${isError ? 'text-red-500' : 'text-txt-muted'}`} />
                        <p className={`text-[11px] leading-relaxed line-clamp-2 ${isError ? 'text-red-600' : 'text-txt-muted'}`}>
                          {isError ? (log.errorMessage ?? 'Something went wrong.') : log.outputSummary}
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
                        {/* Error banner — top-of-panel when there's a problem */}
                        {isError && log.errorMessage && (
                          <div className="bg-red-50 border border-red-200 rounded-[10px] p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertTriangle size={12} className="text-red-600" />
                              <p className="text-[10px] font-semibold text-red-700 uppercase">Problem</p>
                            </div>
                            <p className="text-[12px] text-red-600 font-mono">{log.errorMessage}</p>
                          </div>
                        )}

                        {/* User bubble */}
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <User size={12} className="text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-semibold text-txt-muted mb-1">
                              {isChat ? `${log.userName ?? 'Someone'} asked` : 'What the AI was given'}
                            </p>
                            <div className="bg-blue-50 rounded-[10px] rounded-tl-[2px] px-3 py-2">
                              <p className="text-[12px] text-txt-primary leading-relaxed whitespace-pre-wrap">{detail.inputFull ?? log.inputSummary}</p>
                            </div>
                          </div>
                        </div>

                        {/* AI bubble */}
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-surface-tertiary flex items-center justify-center shrink-0">
                            <Bot size={12} className="text-txt-muted" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-semibold text-txt-muted mb-1">
                              {isChat ? 'Gunner AI replied' : 'What the AI returned'}
                            </p>
                            <div className={`rounded-[10px] rounded-tl-[2px] px-3 py-2 ${isError ? 'bg-red-50' : 'bg-surface-secondary'}`}>
                              <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${isError ? 'text-red-600' : 'text-txt-primary'}`}>
                                {detail.outputFull ?? log.outputSummary}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Tools called */}
                        {Array.isArray(log.toolsCalled) && log.toolsCalled.length > 0 && (
                          <div className="ml-10">
                            <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">Tools the AI used</p>
                            <div className="flex flex-wrap gap-1">
                              {log.toolsCalled.map((t: unknown, i: number) => {
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

                        {/* Diagnostic panel — always visible when expanded */}
                        <div className="ml-10 bg-surface-secondary rounded-[10px] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-semibold text-txt-muted uppercase">Tech details (for fixing issues)</p>
                            <button
                              onClick={() => copyDiagnostics(log, detail)}
                              className="text-[9px] font-medium px-2 py-0.5 rounded-[6px] bg-white text-txt-secondary hover:text-txt-primary flex items-center gap-1 transition-colors"
                            >
                              {copiedId === log.id ? <><Check size={9} /> Copied</> : <><Copy size={9} /> Copy all</>}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                            <DiagRow label="Log ID" value={log.id} mono />
                            <DiagRow label="When" value={new Date(log.createdAt).toLocaleString('en-US', { timeZone: CT })} />
                            <DiagRow label="Model" value={log.model ?? '—'} mono />
                            <DiagRow label="Page" value={log.pageContext ?? '—'} mono />
                            <DiagRow label="Tokens in" value={log.tokensIn?.toLocaleString() ?? '—'} />
                            <DiagRow label="Tokens out" value={log.tokensOut?.toLocaleString() ?? '—'} />
                            <DiagRow label="Time taken" value={log.durationMs != null ? `${(log.durationMs / 1000).toFixed(2)}s` : '—'} />
                            <DiagRow label="Cost" value={log.estimatedCost != null ? `$${log.estimatedCost.toFixed(4)}` : '—'} />
                          </div>
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

function DiagRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-txt-muted">{label}</span>
      <span className={`text-txt-secondary truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
