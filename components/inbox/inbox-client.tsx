'use client'
// components/inbox/inbox-client.tsx

import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, Phone, Mail, AlertCircle } from 'lucide-react'

interface ConversationItem {
  id: string
  contactId: string
  contactName: string
  phone: string
  unreadCount: number
  lastMessage: string
  lastMessageType: string
  updatedAt: string
  toUserName: string | null
  propertyAddress: string | null
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
    if (type === 'SMS') return <MessageSquare size={14} className="text-semantic-blue" />
    if (type === 'Call') return <Phone size={14} className="text-gunner-red" />
    return <Mail size={14} className="text-txt-muted" />
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-ds-page font-semibold text-txt-primary">Inbox</h1>
        <p className="text-ds-body text-txt-secondary mt-1">
          {unreadTotal > 0 ? `${unreadTotal} unread messages` : 'All caught up'}
        </p>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="bg-semantic-red-bg border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] px-4 py-3 flex items-center gap-2 text-semantic-red text-ds-body">
          <AlertCircle size={14} />
          Could not connect to Go High Level. Check your GHL connection in Settings.
        </div>
      )}

      {/* Empty state */}
      {!fetchError && conversations.length === 0 && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] py-16 text-center">
          <MessageSquare size={24} className="text-txt-muted mx-auto mb-3" />
          <p className="text-txt-secondary text-ds-body">No conversations found</p>
        </div>
      )}

      {/* Unread section */}
      {unread.length > 0 && (
        <div>
          <p className="text-ds-fine font-medium text-gunner-red tracking-wider mb-2">
            Unread ({unread.length})
          </p>
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
            {unread.map((c) => (
              <ConversationRow key={c.id} conversation={c} typeIcon={typeIcon(c.lastMessageType)} />
            ))}
          </div>
        </div>
      )}

      {/* Read / recent section */}
      {read.length > 0 && (
        <div>
          <p className="text-ds-fine font-medium text-txt-muted tracking-wider mb-2">
            Recent ({read.length})
          </p>
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
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
    <a
      href={`https://app.gohighlevel.com/conversations/${c.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-secondary transition-colors block"
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-surface-tertiary flex items-center justify-center shrink-0 text-ds-body text-txt-secondary font-medium">
        {c.contactName?.[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-ds-body font-medium text-txt-primary truncate">{c.contactName || c.phone || 'Unknown'}</p>
          {c.toUserName && (
            <span className="text-ds-fine text-semantic-blue">→ {c.toUserName}</span>
          )}
          <span className="shrink-0">{typeIcon}</span>
        </div>
        <p className="text-ds-fine text-txt-secondary truncate mt-0.5">{c.lastMessage || c.phone || 'No message'}</p>
        {c.propertyAddress && (
          <p className="text-ds-fine text-semantic-purple truncate mt-0.5">{c.propertyAddress}</p>
        )}
      </div>

      {/* Right side — badge + timestamp */}
      <div className="text-right shrink-0 space-y-1">
        {c.unreadCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gunner-red text-white text-ds-fine font-semibold">
            {c.unreadCount}
          </span>
        )}
        <p className="text-ds-fine text-txt-muted">
          {(() => {
            try {
              const d = new Date(c.updatedAt)
              if (isNaN(d.getTime())) return ''
              return formatDistanceToNow(d, { addSuffix: true })
            } catch { return '' }
          })()}
        </p>
      </div>
    </a>
  )
}
