'use client'
// components/ai-coach/ai-coach-client.tsx

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Zap } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
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
  tenantSlug, userName, userRole,
}: {
  tenantSlug: string
  userName: string
  userRole: string
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
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-white/10 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
          <Bot size={18} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-white">Gunner AI Coach</h1>
          <p className="text-xs text-gray-400">Your personal wholesaling coach — knows your calls, your numbers, your game</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          Online
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {isEmpty ? (
          <div className="space-y-6">
            {/* Welcome */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-orange-400" />
              </div>
              <div className="bg-[#1a1d27] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg">
                <p className="text-sm text-white leading-relaxed">
                  What's up {userName.split(' ')[0]}. I'm Gunner — your AI wholesaling coach. I know your recent call scores, your pipeline, and what you need to work on. Ask me anything.
                </p>
              </div>
            </div>

            {/* Suggested prompts */}
            <div className="pl-11">
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Zap size={10} className="text-orange-500" /> Quick starts
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-colors text-left"
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
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} className="text-orange-400" />
            </div>
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 size={14} className="text-orange-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-4 border-t border-white/10">
        <div className="flex gap-3 items-end bg-[#1a1d27] border border-white/10 focus-within:border-orange-500/50 rounded-2xl px-4 py-3 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your calls, deals, scripts, or strategy…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none resize-none max-h-32 leading-relaxed"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 transition-colors"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end">
        <div className="bg-orange-500/20 border border-orange-500/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-lg">
          <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-gray-300" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={14} className="text-orange-400" />
      </div>
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg">
        <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}
