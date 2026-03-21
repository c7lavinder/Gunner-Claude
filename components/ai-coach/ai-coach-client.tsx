'use client'
// components/ai-coach/ai-coach-client.tsx
// AI Coach panel — Design system: docs/DESIGN.md
// AI features: purple left border, purple section headers, purple badges

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Zap, AlertTriangle, PartyPopper, Lightbulb } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface CoachInsight {
  type: 'warning' | 'celebration' | 'tip'
  title: string
  detail: string
}

const SUGGESTED_PROMPTS = [
  'How do I handle a seller who says the price is too low?',
  'What should my opening script sound like for cold calls?',
  'Review my recent call performance and tell me what to focus on',
  'How do I calculate MAO on a wholesale deal?',
  'Give me tips for setting more appointments',
  'How do I build a strong buyer list for dispositions?',
]

export function AiCoachClient({
  tenantSlug, userName, userRole, insights = [],
}: {
  tenantSlug: string
  userName: string
  userRole: string
  insights?: CoachInsight[]
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const userMsg: Message = { role: 'user', content }
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
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, I had trouble connecting. Try again in a moment.',
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      {/* Header — purple AI border */}
      <div className="flex items-center gap-3 pb-4 border-b border-black/[0.08] shrink-0">
        <div className="w-10 h-10 rounded-[14px] bg-semantic-purple-bg flex items-center justify-center">
          <Bot size={18} className="text-semantic-purple" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-ds-card font-semibold text-txt-primary">Gunner AI Coach</h1>
            <span className="text-ds-fine font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full">
              &#x2726; AI
            </span>
          </div>
          <p className="text-ds-fine text-txt-secondary">Your personal wholesaling coach — knows your calls, your numbers, your game</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-ds-fine text-semantic-green bg-semantic-green-bg px-3 py-1 rounded-full font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-semantic-green" />
          Online
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {isEmpty ? (
          <div className="space-y-6">
            {/* Welcome */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-[10px] bg-semantic-purple-bg flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-semantic-purple" />
              </div>
              <div className="bg-surface-secondary border-[0.5px] border-black/[0.08] rounded-[14px] rounded-tl-sm px-4 py-3 max-w-lg">
                <p className="text-ds-body text-txt-primary leading-relaxed">
                  What&apos;s up {userName.split(' ')[0]}. I&apos;m Gunner — your AI wholesaling coach. I know your recent call scores, your pipeline, and what you need to work on. Ask me anything.
                </p>
              </div>
            </div>

            {/* Proactive insights */}
            {insights.length > 0 && (
              <div className="pl-11 space-y-2">
                {insights.map((insight, i) => {
                  const styles = {
                    warning: {
                      wrapper: 'bg-semantic-red-bg border-l-2 border-l-semantic-red border-[0.5px] border-black/[0.08]',
                      icon: <AlertTriangle size={14} className="text-semantic-red" />,
                      titleColor: 'text-semantic-red',
                    },
                    celebration: {
                      wrapper: 'bg-semantic-green-bg border-l-2 border-l-semantic-green border-[0.5px] border-black/[0.08]',
                      icon: <PartyPopper size={14} className="text-semantic-green" />,
                      titleColor: 'text-semantic-green',
                    },
                    tip: {
                      wrapper: 'bg-semantic-blue-bg border-l-2 border-l-semantic-blue border-[0.5px] border-black/[0.08]',
                      icon: <Lightbulb size={14} className="text-semantic-blue" />,
                      titleColor: 'text-semantic-blue',
                    },
                  }
                  const s = styles[insight.type]
                  return (
                    <button
                      key={i}
                      onClick={() => send(`Tell me more about: ${insight.title}`)}
                      className={`w-full text-left ${s.wrapper} rounded-[14px] p-3 hover:border-black/[0.14] hover:shadow-ds-float transition-all`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {s.icon}
                        <span className={`text-ds-fine font-medium ${s.titleColor}`}>{insight.title}</span>
                      </div>
                      <p className="text-ds-fine text-txt-secondary pl-5">{insight.detail}</p>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Suggested prompts */}
            <div className="pl-11">
              <p className="text-ds-fine text-txt-muted mb-2 flex items-center gap-1">
                <Zap size={10} className="text-semantic-purple" /> Quick starts
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    className="text-ds-fine bg-surface-secondary hover:bg-surface-tertiary border-[0.5px] border-black/[0.08] text-txt-secondary hover:text-txt-primary px-3 py-2 rounded-[10px] transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-[10px] bg-semantic-purple-bg flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} className="text-semantic-purple" />
            </div>
            <div className="bg-surface-secondary border-[0.5px] border-black/[0.08] rounded-[14px] rounded-tl-sm px-4 py-3">
              <Loader2 size={14} className="text-semantic-purple animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-4 border-t border-black/[0.08]">
        <div className="flex gap-3 items-end bg-surface-primary border-[0.5px] border-black/[0.08] focus-within:border-semantic-purple rounded-[14px] px-4 py-3 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your calls, deals, scripts, or strategy..."
            rows={1}
            className="flex-1 bg-transparent text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none resize-none max-h-32 leading-relaxed"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-[10px] bg-semantic-purple hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 transition-opacity"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
        <p className="text-ds-fine text-txt-muted mt-2 text-left">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end">
        <div className="bg-surface-tertiary border-[0.5px] border-black/[0.08] rounded-[14px] rounded-tr-sm px-4 py-3 max-w-lg">
          <p className="text-ds-body text-txt-primary leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="w-8 h-8 rounded-[10px] bg-surface-tertiary flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-txt-secondary" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-[10px] bg-semantic-purple-bg flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={14} className="text-semantic-purple" />
      </div>
      <div className="bg-surface-secondary border-[0.5px] border-black/[0.08] rounded-[14px] rounded-tl-sm px-4 py-3 max-w-lg">
        <p className="text-ds-body text-txt-primary leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}
