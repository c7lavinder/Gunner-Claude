'use client'
// components/inbox/inbox-client.tsx

import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, Phone, Mail, AlertCircle } from 'lucide-react'

interface ConversationItem {
  id: string
  contactId: string
  unreadCount: number
  lastMessage: string
  lastMessageType: string
  updatedAt: string
}

export function InboxClient({ conversations, fetchError, tenantSlug }: {
  conversations: ConversationItem[]
  fetchError: boolean
  tenantSlug: string
}) {
  const unreadTotal = conversations.reduce((s, c) => s + c.unreadCount, 0)
  const unread = conversations.filter((c) => c.unreadCount > 0)
  const read = conversations.filter((c) => c.unreadCount === 0)

  const typeIcon = (type: string) => {
    if (type === 'SMS') return <MessageSquare size={14} className="text-blue-400" />
    if (type === 'Call') return <Phone size={14} className="text-orange-400" />
    return <Mail size={14} className="text-gray-400" />
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Inbox</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {unreadTotal > 0 ? `${unreadTotal} unread messages` : 'All caught up'}
        </p>
      </div>

      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} />
          Could not connect to Go High Level. Check your GHL connection in Settings.
        </div>
      )}

      {!fetchError && conversations.length === 0 && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl py-16 text-center">
          <MessageSquare size={24} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No conversations found</p>
        </div>
      )}

      {unread.length > 0 && (
        <div>
          <p className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-2">
            Unread ({unread.length})
          </p>
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
            {unread.map((c) => (
              <ConversationRow key={c.id} conversation={c} typeIcon={typeIcon(c.lastMessageType)} />
            ))}
          </div>
        </div>
      )}

      {read.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Recent ({read.length})
          </p>
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
            {read.map((c) => (
              <ConversationRow key={c.id} conversation={c} typeIcon={typeIcon(c.lastMessageType)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ConversationRow({ conversation: c, typeIcon }: {
  conversation: ConversationItem
  typeIcon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors cursor-pointer">
      {/* Avatar placeholder */}
      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-sm text-gray-400 font-medium">
        ?
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">Contact</p>
          <span className="shrink-0">{typeIcon}</span>
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{c.lastMessage || 'No message'}</p>
      </div>

      <div className="text-right shrink-0 space-y-1">
        {c.unreadCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold">
            {c.unreadCount}
          </span>
        )}
        <p className="text-xs text-gray-600">
          {(() => {
            try {
              const d = new Date(c.updatedAt)
              if (isNaN(d.getTime())) return ''
              return formatDistanceToNow(d, { addSuffix: true })
            } catch { return '' }
          })()}
        </p>
      </div>
    </div>
  )
}
