'use client'
// components/ui/coach-sidebar.tsx
// Global AI Coach sidebar — persists across all tenant pages
// Renders as a collapsible right-side panel on lg+ screens, hidden on mobile

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Sparkles, Zap, Loader2, ChevronRight, X, MessageSquare } from 'lucide-react'

interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export function CoachSidebar() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const userMsg: CoachMessage = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Toggle button — fixed bottom-right, hidden when panel is open */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 hidden lg:flex items-center gap-2 bg-semantic-purple text-white px-4 py-3 rounded-full shadow-lg hover:opacity-90 transition-all"
        >
          <Bot size={16} />
          <span className="text-[13px] font-medium">AI Coach</span>
        </button>
      )}

      {/* Sidebar panel */}
      {open && (
        <div className="fixed right-0 top-[52px] bottom-0 w-[320px] z-40 hidden lg:flex flex-col bg-surface-primary border-l shadow-lg" style={{ borderColor: 'var(--border-light)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
            <div className="w-8 h-8 rounded-[10px] bg-semantic-purple-bg flex items-center justify-center">
              <Bot size={16} className="text-semantic-purple" />
            </div>
            <span className="text-[14px] font-medium text-txt-primary">AI Coach</span>
            <span className="text-[11px] font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full">&#x2726;</span>
            <button onClick={() => setOpen(false)} className="ml-auto p-1 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
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
                <p className="text-[13px] text-txt-secondary mb-1">Ask questions or give commands</p>

                <div className="mt-6 text-left">
                  <p className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-2">Coaching</p>
                  <div className="space-y-2">
                    {[
                      'How do I handle price objections?',
                      'Tips for building rapport quickly',
                      'What should I focus on this week?',
                    ].map(q => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="w-full text-left px-3 py-2.5 rounded-[10px] border-[0.5px] text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-all"
                        style={{ borderColor: 'var(--border-light)' }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 text-left">
                  <p className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-2">Actions</p>
                  <div className="space-y-2">
                    {[
                      'Send SMS to recent contact',
                      'Create follow-up task for tomorrow',
                      'Add note to last call contact',
                    ].map(a => (
                      <button
                        key={a}
                        onClick={() => send(a)}
                        className="w-full text-left flex items-start gap-2 px-3 py-2.5 rounded-[10px] border-[0.5px] text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-all"
                        style={{ borderColor: 'var(--border-light)' }}
                      >
                        <span className="text-semantic-purple shrink-0 mt-0.5"><Zap size={12} /></span>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gunner-red text-white rounded-br-md'
                        : 'bg-surface-secondary text-txt-primary rounded-bl-md'
                    }`}>
                      {msg.content}
                    </div>
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
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Ask AI Coach..."
                className="flex-1 bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-semantic-purple"
                style={{ borderColor: 'var(--border-medium)' }}
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="p-2 rounded-[10px] bg-semantic-purple text-white hover:opacity-90 disabled:opacity-40 transition-all"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
