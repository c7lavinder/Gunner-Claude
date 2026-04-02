'use client'
// components/ui/coach-sidebar.tsx
// Role Assistant sidebar — the AI backbone of the entire site
// Dynamic name from user role. Daily persistent context. Full knowledge.
// Can execute actions via tool use with user approval.

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, Send, Sparkles, Zap, Loader2, X, CheckCircle, XCircle, Pencil } from 'lucide-react'

interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
}

interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'edited'
  result?: string
}

const ROLE_NAMES: Record<string, string> = {
  OWNER: 'Admin',
  ADMIN: 'Admin',
  TEAM_LEAD: 'Team Lead',
  LEAD_MANAGER: 'LM',
  ACQUISITION_MANAGER: 'AM',
  DISPOSITION_MANAGER: 'Dispo',
  LEAD_GENERATOR: 'LG',
}

export function CoachSidebar() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [loadedSession, setLoadedSession] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const roleName = ROLE_NAMES[userRole] ?? userRole?.replace(/_/g, ' ') ?? 'AI'
  const assistantName = `${roleName} Assistant`

  // Extract page context from URL
  const getPageContext = useCallback(() => {
    if (!pathname) return 'unknown'
    const parts = pathname.split('/')
    if (parts.includes('inventory') && parts.length > 3) return `property:${parts[parts.length - 1]}`
    if (parts.includes('calls') && parts.length > 3) return `call:${parts[parts.length - 1]}`
    if (parts.includes('tasks') || parts.includes('day-hub')) return 'dayhub'
    if (parts.includes('inventory')) return 'inventory'
    if (parts.includes('calls')) return 'calls'
    if (parts.includes('buyers')) return 'buyers'
    if (parts.includes('settings')) return 'settings'
    if (parts.includes('kpis')) return 'kpis'
    return 'dashboard'
  }, [pathname])

  // Load session messages (daily persistence)
  useEffect(() => {
    if (!open || loadedSession) return
    fetch('/api/ai/assistant/session')
      .then(r => r.json())
      .then(d => {
        if (d.messages?.length > 0) {
          setMessages(d.messages.map((m: { role: string; content: string; toolCalls?: ToolCall[] }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            toolCalls: m.toolCalls,
          })))
        }
        if (d.userRole) setUserRole(d.userRole)
        setLoadedSession(true)
      })
      .catch(() => setLoadedSession(true))
  }, [open, loadedSession])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const userMsg: AssistantMessage = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          pageContext: getPageContext(),
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          toolCalls: data.toolCalls,
        }])
      }
      if (data.userRole) setUserRole(data.userRole)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Try again.' }])
    }
    setLoading(false)
  }

  async function handleToolAction(msgIndex: number, toolId: string, action: 'approve' | 'reject') {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIndex || !m.toolCalls) return m
      return {
        ...m,
        toolCalls: m.toolCalls.map(tc =>
          tc.id === toolId ? { ...tc, status: action === 'approve' ? 'approved' : 'rejected' } : tc
        ),
      }
    }))

    if (action === 'approve') {
      try {
        const res = await fetch('/api/ai/assistant/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolCallId: toolId, pageContext: getPageContext() }),
        })
        const data = await res.json()

        setMessages(prev => prev.map((m, i) => {
          if (i !== msgIndex || !m.toolCalls) return m
          return {
            ...m,
            toolCalls: m.toolCalls.map(tc =>
              tc.id === toolId ? { ...tc, status: 'approved', result: data.result ?? 'Done' } : tc
            ),
          }
        }))
      } catch {
        setMessages(prev => prev.map((m, i) => {
          if (i !== msgIndex || !m.toolCalls) return m
          return {
            ...m,
            toolCalls: m.toolCalls.map(tc =>
              tc.id === toolId ? { ...tc, result: 'Failed to execute' } : tc
            ),
          }
        }))
      }
    }
  }

  const propertyIdMatch = pathname?.match(/\/inventory\/([^/]+)$/)
  const propertyId = propertyIdMatch ? propertyIdMatch[1] : null
  const callIdMatch = pathname?.match(/\/calls\/([^/]+)$/)
  const callId = callIdMatch ? callIdMatch[1] : null

  return (
    <>
      {/* Toggle button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 hidden lg:flex items-center gap-2 bg-semantic-purple text-white px-4 py-3 rounded-full shadow-lg hover:opacity-90 transition-all">
          <Bot size={16} />
          <span className="text-[13px] font-medium">{assistantName}</span>
        </button>
      )}

      {/* Sidebar panel */}
      {open && (
        <div className="fixed right-0 top-[52px] bottom-0 w-[360px] z-40 hidden lg:flex flex-col bg-surface-primary border-l shadow-lg" style={{ borderColor: 'var(--border-light)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
            <div className="w-8 h-8 rounded-[10px] bg-semantic-purple-bg flex items-center justify-center">
              <Bot size={16} className="text-semantic-purple" />
            </div>
            <div className="flex-1">
              <span className="text-[14px] font-semibold text-txt-primary">{assistantName}</span>
              <span className="text-[11px] font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full ml-2">&#x2726;</span>
            </div>
            <button onClick={() => { setMessages([]); setLoadedSession(false) }}
              className="p-1 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors text-[10px]">
              Clear
            </button>
            <button onClick={() => setOpen(false)}
              className="p-1 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center mt-6">
                <div className="w-12 h-12 rounded-full bg-semantic-purple-bg flex items-center justify-center mx-auto mb-3">
                  <Sparkles size={20} className="text-semantic-purple" />
                </div>
                <p className="text-[14px] font-semibold text-txt-primary mb-1">{assistantName}</p>
                <p className="text-[12px] text-txt-muted mb-4">Ask anything. I can see all your data and execute actions.</p>

                <div className="mt-4 text-left space-y-4">
                  <div>
                    <p className="text-[9px] font-semibold tracking-[0.08em] text-txt-muted uppercase mb-2">
                      {propertyId ? 'This Property' : callId ? 'This Call' : 'Quick Actions'}
                    </p>
                    <div className="space-y-1.5">
                      {(propertyId ? [
                        'Summarize this deal',
                        'What should my offer be?',
                        'Draft a follow-up SMS to the seller',
                        'Log an offer for this property',
                      ] : callId ? [
                        'How did this call go?',
                        'What should the next steps be?',
                        'Create a follow-up task',
                      ] : [
                        'What should I focus on today?',
                        'Send a follow-up text to my last contact',
                        'Create a task for tomorrow',
                        'How are my call scores trending?',
                      ]).map(q => (
                        <button key={q} onClick={() => send(q)}
                          className="w-full text-left px-3 py-2 rounded-[10px] border-[0.5px] text-[12px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-all flex items-center gap-2"
                          style={{ borderColor: 'var(--border-light)' }}>
                          <Zap size={10} className="text-semantic-purple shrink-0" />
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i}>
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gunner-red text-white rounded-br-md'
                          : 'bg-surface-secondary text-txt-primary rounded-bl-md'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>

                    {/* Action cards for tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-2 space-y-2 ml-2">
                        {msg.toolCalls.map(tc => (
                          <div key={tc.id} className="border-[0.5px] rounded-[10px] p-3 bg-white" style={{ borderColor: 'var(--border-light)' }}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <Zap size={10} className="text-semantic-purple" />
                              <span className="text-[10px] font-semibold text-txt-primary">
                                {tc.name.replace(/_/g, ' ')}
                              </span>
                              {tc.status === 'approved' && <span className="text-[9px] text-semantic-green font-medium ml-auto">Executed</span>}
                              {tc.status === 'rejected' && <span className="text-[9px] text-semantic-red font-medium ml-auto">Rejected</span>}
                            </div>

                            {/* Show tool inputs */}
                            <div className="space-y-1 mb-2">
                              {Object.entries(tc.input).filter(([, v]) => v != null && v !== '').map(([key, value]) => (
                                <div key={key} className="flex items-start gap-2">
                                  <span className="text-[9px] font-medium text-txt-muted uppercase w-20 shrink-0 pt-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  <span className="text-[10px] text-txt-primary flex-1">{String(value)}</span>
                                </div>
                              ))}
                            </div>

                            {tc.result && (
                              <p className="text-[10px] text-semantic-green italic">{tc.result}</p>
                            )}

                            {/* Approve / Reject buttons */}
                            {tc.status === 'pending' && (
                              <div className="flex gap-2 mt-2">
                                <button onClick={() => handleToolAction(i, tc.id, 'approve')}
                                  className="flex items-center gap-1 text-[10px] font-semibold text-white bg-semantic-green hover:opacity-90 px-3 py-1.5 rounded-[8px]">
                                  <CheckCircle size={10} /> Approve
                                </button>
                                <button onClick={() => handleToolAction(i, tc.id, 'reject')}
                                  className="flex items-center gap-1 text-[10px] font-medium text-txt-secondary hover:text-semantic-red px-3 py-1.5">
                                  <XCircle size={10} /> Reject
                                </button>
                                <button className="flex items-center gap-1 text-[10px] font-medium text-txt-muted px-2 py-1.5">
                                  <Pencil size={9} /> Edit
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-surface-secondary px-3 py-2 rounded-2xl rounded-bl-md">
                      <Loader2 size={14} className="animate-spin text-txt-muted" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t shrink-0" style={{ borderColor: 'var(--border-light)' }}>
            <div className="flex items-center gap-2">
              <input type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Ask ${assistantName}...`}
                className="flex-1 bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-semantic-purple"
                style={{ borderColor: 'var(--border-medium)' }} />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                className="p-2 rounded-[10px] bg-semantic-purple text-white hover:opacity-90 disabled:opacity-40 transition-all">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
