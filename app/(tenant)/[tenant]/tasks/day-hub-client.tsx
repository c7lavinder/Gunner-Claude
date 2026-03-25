'use client'
// app/(tenant)/[tenant]/tasks/day-hub-client.tsx
// Day Hub — full replication of getgunner.ai Day Hub page
// Two-column layout: main (65%) + AI Coach sidebar (35%)
// Sections: role tabs, KPI cards, inbox/appointments, tasks list

import { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Phone, MessageSquare, Calendar, Star, Target, FileText,
  Settings, RefreshCw, ChevronDown, ChevronLeft, ExternalLink,
  MapPin, User, Clock, Loader2, Send, Circle, CheckCircle,
  PhoneOff, MessageCircle,
} from 'lucide-react'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { useToast } from '@/components/ui/toaster'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(phone: string | null): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnrichedTask {
  id: string
  title: string
  body: string | null
  category: 'New Lead' | 'Reschedule' | 'Admin' | 'Follow-Up'
  score: number
  dueDate: string | null
  isOverdue: boolean
  isDueToday: boolean
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactAddress: string | null
  assignedToName: string | null
  amDone: boolean
  pmDone: boolean
}

interface KPIData {
  calls: { count: number; goal: number }
  convos: { count: number; goal: number }
  apts: { count: number; goal: number }
  offers: { count: number; goal: number }
  contracts: { count: number; goal: number }
}

interface InboxItem {
  id: string
  contactId: string
  contactName: string
  phone: string | null
  lastMessageBody: string
  dateUpdated: number
  type: 'missed_call' | 'message'
  unreadCount: number
  assignedTo: string | null
  propertyAddress: string | null
}

interface AppointmentItem {
  id: string
  title: string
  contactName: string
  startTime: string
  endTime: string
  status: string
  calendarName?: string
  assignedUserName?: string | null
}

type RoleTab = 'ADMIN' | 'LM' | 'AM' | 'DISPO'

const CATEGORY_BADGE: Record<string, { label: string; color: string }> = {
  'New Lead': { label: 'NEW LEAD', color: 'border-semantic-green text-semantic-green' },
  'Reschedule': { label: 'RESCHEDULE', color: 'border-semantic-amber text-semantic-amber' },
  'Follow-Up': { label: 'FOLLOW-UP', color: 'border-semantic-blue text-semantic-blue' },
  'Admin': { label: 'ADMIN', color: 'border-semantic-purple text-semantic-purple' },
  'CONTRACT': { label: 'CONTRACT', color: 'border-semantic-purple text-semantic-purple' },
}

// ─── Main component ─────────────────────────────────────────────────────────

export function DayHubClient({ tasks, isAdmin, tenantSlug, fetchError }: {
  tasks: EnrichedTask[]
  isAdmin: boolean
  tenantSlug: string
  fetchError?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { toast } = useToast()

  // State
  const [roleTab, setRoleTab] = useState<RoleTab>('ADMIN')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [visibleTaskCount, setVisibleTaskCount] = useState(50)

  // Data state
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [unreadInbox, setUnreadInbox] = useState<InboxItem[]>([])
  const [noResponseInbox, setNoResponseInbox] = useState<InboxItem[]>([])
  const [ghlLocationId, setGhlLocationId] = useState('')
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingAppts, setLoadingAppts] = useState(true)

  // Task completion
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())

  // Inbox thread
  const [selectedContact, setSelectedContact] = useState<InboxItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [threadMessages, setThreadMessages] = useState<Array<{ id: string; body: string; direction: string; type: string; time: string; senderName?: string | null }>>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const threadBottomRef = useRef<HTMLDivElement>(null)

  // SMS confirm modal
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [teamMembers, setTeamMembers] = useState<Array<{ name: string; id: string }>>([])
  const [selectedFromUser, setSelectedFromUser] = useState('')
  const [fromSearch, setFromSearch] = useState('')
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false)


  // Fetch KPIs
  useEffect(() => {
    setLoadingKpis(true)
    fetch(`/api/${tenantSlug}/dayhub/kpis`)
      .then(r => r.json())
      .then(d => { setKpis(d); setLoadingKpis(false) })
      .catch(() => setLoadingKpis(false))
  }, [tenantSlug])

  // Fetch inbox
  const fetchInbox = useCallback(() => {
    setLoadingInbox(true)
    fetch(`/api/${tenantSlug}/dayhub/inbox`)
      .then(r => r.json())
      .then(d => {
        setUnreadInbox(d.unread ?? [])
        setNoResponseInbox(d.noResponse ?? [])
        if (d.locationId) setGhlLocationId(d.locationId)
        setLoadingInbox(false)
      })
      .catch(() => setLoadingInbox(false))
  }, [tenantSlug])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  // Fetch team members for "send as" dropdown
  useEffect(() => {
    fetch(`/api/${tenantSlug}/dayhub/team-numbers`)
      .then(r => r.json())
      .then(d => {
        const members = (d.numbers ?? []).map((n: { name: string; phone: string }) => ({ name: n.name, id: n.phone }))
        setTeamMembers(members)
      })
      .catch(() => {})
  }, [tenantSlug])

  // Fetch appointments
  useEffect(() => {
    setLoadingAppts(true)
    fetch(`/api/${tenantSlug}/dayhub/appointments`)
      .then(r => r.json())
      .then(d => { setAppointments(d.appointments ?? []); setLoadingAppts(false) })
      .catch(() => setLoadingAppts(false))
  }, [tenantSlug])


  // Filter tasks (exclude optimistically completed)
  const assignedNames = [...new Set(tasks.map(t => t.assignedToName).filter(Boolean))] as string[]
  let filteredTasks = tasks.filter(t => !completedTaskIds.has(t.id))
  if (categoryFilter) filteredTasks = filteredTasks.filter(t => t.category === categoryFilter)
  if (teamFilter) filteredTasks = filteredTasks.filter(t => t.assignedToName === teamFilter)
  const overdueCount = filteredTasks.filter(t => t.isOverdue).length
  const visibleTasks = filteredTasks.slice(0, visibleTaskCount)
  const remaining = filteredTasks.length - visibleTaskCount

  // Inbox counts

  async function completeTask(taskId: string, contactId: string) {
    setCompletingTask(taskId)
    setCompletedTaskIds(prev => new Set(prev).add(taskId))
    try {
      const res = await fetch(`/api/${tenantSlug}/dayhub/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', taskId, contactId }),
      })
      if (res.ok) {
        toast('Task completed!', 'success')
        startTransition(() => router.refresh())
      } else {
        setCompletedTaskIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
        toast('Failed to complete task', 'error')
      }
    } catch {
      setCompletedTaskIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
      toast('Failed to complete task', 'error')
    }
    setCompletingTask(null)
  }

  function selectContact(item: InboxItem) {
    setSelectedContact(item)
    setReplyText('')
    setThreadMessages([])
    setLoadingThread(true)
    fetch(`/api/${tenantSlug}/dayhub/messages?conversationId=${item.id}`)
      .then(r => r.json())
      .then(d => {
        setThreadMessages(d.messages ?? [])
        setLoadingThread(false)
        // Auto-scroll to bottom after messages render
        requestAnimationFrame(() => {
          const el = document.getElementById('inbox-thread-scroll')
          if (el) el.scrollTop = el.scrollHeight
        })
      })
      .catch(() => setLoadingThread(false))
  }

  function promptSendReply() {
    if (!replyText.trim() || !selectedContact) return
    // Default "from" to the assigned team member
    const assigned = selectedContact.assignedTo ?? ''
    const match = teamMembers.find(m => m.name === assigned)
    setSelectedFromUser(match?.name ?? teamMembers[0]?.name ?? '')
    setFromSearch('')
    setFromDropdownOpen(false)
    setShowSendConfirm(true)
  }

  async function confirmSendReply() {
    if (!selectedContact || !replyText.trim() || sendingReply) return
    setSendingReply(true)
    setShowSendConfirm(false)
    try {
      const res = await fetch(`/api/${tenantSlug}/dayhub/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact.contactId,
          message: replyText.trim(),
        }),
      })
      if (res.ok) {
        toast(`SMS sent to ${selectedContact.contactName}`, 'success')
        setReplyText('')
        // Refresh thread
        selectContact(selectedContact)
        fetchInbox()
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to send SMS', 'error')
      }
    } catch {
      toast('Failed to send SMS', 'error')
    }
    setSendingReply(false)
  }

  function refresh() {
    startTransition(() => router.refresh())
    fetchInbox()
    setLoadingKpis(true)
    fetch(`/api/${tenantSlug}/dayhub/kpis`)
      .then(r => r.json())
      .then(d => { setKpis(d); setLoadingKpis(false) })
      .catch(() => setLoadingKpis(false))
  }

  return (
    <div className="space-y-6">

        {/* PAGE HEADER */}
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-[24px] font-semibold text-txt-primary flex items-center gap-2">
            <span className="text-[20px]">🔥</span> Day Hub
          </h1>

          {/* Role tabs */}
          <div className="flex gap-1">
            {(['ADMIN', 'LM', 'AM', 'DISPO'] as RoleTab[]).map(r => (
              <button
                key={r}
                onClick={() => setRoleTab(r)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wide transition-all ${
                  roleTab === r
                    ? 'bg-gunner-red text-white'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <span className="text-[13px] text-txt-muted hidden md:inline">
            {roleTab === 'ADMIN' ? 'Full team overview — all tasks, KPIs, and inbox'
              : roleTab === 'LM' ? 'Land Manager view'
              : roleTab === 'AM' ? 'Acquisitions Manager view'
              : 'Disposition view'}
          </span>

          <div className="flex gap-2 ml-auto">
            <Link href={`/${tenantSlug}/settings`} className="p-2 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
              <Settings size={16} />
            </Link>
            <button onClick={refresh} className="p-2 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* KPI STAT CARDS */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { icon: <Phone size={16} />, label: 'CALLS', data: kpis?.calls },
            { icon: <MessageSquare size={16} />, label: 'CONVOS', data: kpis?.convos },
            { icon: <Calendar size={16} />, label: 'APTS', data: kpis?.apts },
            { icon: <Target size={16} />, label: 'OFFERS', data: kpis?.offers },
            { icon: <FileText size={16} />, label: 'CONTRACTS', data: kpis?.contracts },
          ].map(kpi => (
            <div key={kpi.label} className="bg-surface-primary border-[0.5px] rounded-[14px] p-4 transition-all hover:shadow-ds-float" style={{ borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-gunner-red">{kpi.icon}</span>
                <span className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase">{kpi.label}</span>
              </div>
              {loadingKpis ? (
                <Loader2 size={14} className="animate-spin text-txt-muted" />
              ) : (
                <>
                  <p className="text-[24px] font-semibold text-txt-primary leading-tight">
                    {kpi.data?.count ?? 0}
                    <span className="text-[13px] font-normal text-txt-muted"> / {kpi.data?.goal ?? 0}</span>
                  </p>
                  <div className="h-[3px] bg-surface-tertiary rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-gunner-red rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(((kpi.data?.count ?? 0) / Math.max(kpi.data?.goal ?? 1, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* INBOX + APPOINTMENTS — side by side, fixed height */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── INBOX PANEL (2/3) — split view: contacts left, thread right ── */}
          <div className="lg:col-span-2 bg-surface-primary border-[0.5px] rounded-[14px] flex flex-col h-[420px]" style={{ borderColor: 'var(--border-light)' }}>
            {/* Inbox header */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
              <MessageSquare size={12} className="text-gunner-red" />
              <span className="text-[11px] font-semibold text-txt-primary uppercase tracking-wide">Inbox</span>
              {!loadingInbox && (unreadInbox.length + noResponseInbox.length) > 0 && (
                <span className="bg-gunner-red text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">{unreadInbox.length + noResponseInbox.length}</span>
              )}
              <button onClick={() => fetchInbox()} className="ml-auto p-1 text-txt-muted hover:text-txt-primary">
                <RefreshCw size={11} />
              </button>
            </div>

            {/* Split view body */}
            <div className="flex-1 flex min-h-0">
              {/* LEFT: Contact list — always visible */}
              <div className="w-[220px] shrink-0 border-r overflow-y-auto" style={{ borderColor: 'var(--border-light)' }}>
                {loadingInbox ? (
                  <div className="py-6 text-center"><Loader2 size={12} className="animate-spin text-txt-muted mx-auto" /></div>
                ) : (unreadInbox.length + noResponseInbox.length) === 0 ? (
                  <div className="py-6 text-center text-[10px] text-txt-muted">All caught up</div>
                ) : (
                  <>
                    {unreadInbox.length > 0 && (
                      <>
                        <div className="px-3 pt-2 pb-0.5">
                          <span className="text-[9px] font-medium tracking-[0.08em] text-semantic-red uppercase">Unread ({unreadInbox.length})</span>
                        </div>
                        {unreadInbox.map(item => (
                          <button
                            key={item.id}
                            onClick={() => selectContact(item)}
                            className={`w-full text-left px-3 py-2 hover:bg-surface-secondary transition-colors border-b last:border-b-0 ${selectedContact?.id === item.id ? 'bg-surface-secondary' : ''}`}
                            style={{ borderColor: 'var(--border-light)' }}
                          >
                            <p className="text-[11px] font-medium text-txt-primary truncate">{item.contactName}</p>
                            {item.propertyAddress && <p className="text-[9px] text-semantic-purple truncate">{item.propertyAddress}</p>}
                            <p className="text-[9px] text-txt-muted truncate">{item.type === 'missed_call' ? 'Missed call' : item.lastMessageBody}</p>
                          </button>
                        ))}
                      </>
                    )}
                    {noResponseInbox.length > 0 && (
                      <>
                        <div className="px-3 pt-2 pb-0.5">
                          <span className="text-[9px] font-medium tracking-[0.08em] text-semantic-amber uppercase">Needs Reply ({noResponseInbox.length})</span>
                        </div>
                        {noResponseInbox.map(item => (
                          <button
                            key={item.id}
                            onClick={() => selectContact(item)}
                            className={`w-full text-left px-3 py-2 hover:bg-surface-secondary transition-colors border-b last:border-b-0 ${selectedContact?.id === item.id ? 'bg-surface-secondary' : ''}`}
                            style={{ borderColor: 'var(--border-light)' }}
                          >
                            <p className="text-[11px] font-medium text-txt-primary truncate">{item.contactName}</p>
                            {item.propertyAddress && <p className="text-[9px] text-semantic-purple truncate">{item.propertyAddress}</p>}
                            <p className="text-[9px] text-txt-muted truncate">{item.type === 'missed_call' ? 'Missed call' : item.lastMessageBody}</p>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* RIGHT: Conversation thread */}
              <div className="flex-1 flex flex-col min-w-0">
                {!selectedContact ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-[10px] text-txt-muted">Select a conversation</p>
                  </div>
                ) : (
                  <>
                    {/* Thread header */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-txt-primary truncate">{selectedContact.contactName}</p>
                        <div className="flex items-center gap-2">
                          {selectedContact.phone && <span className="text-[9px] text-txt-muted">{formatPhone(selectedContact.phone)}</span>}
                          {selectedContact.assignedTo && <span className="text-[9px] text-semantic-blue">→ {selectedContact.assignedTo}</span>}
                        </div>
                      </div>
                      <a
                        href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/conversations/${selectedContact.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-[6px] hover:bg-surface-secondary text-txt-muted hover:text-txt-primary transition-colors"
                        title="Open in GHL"
                      >
                        <ExternalLink size={11} />
                      </a>
                    </div>

                    {/* Messages */}
                    <div id="inbox-thread-scroll" className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
                      {loadingThread ? (
                        <div className="py-6 text-center"><Loader2 size={12} className="animate-spin text-txt-muted mx-auto" /></div>
                      ) : threadMessages.length === 0 ? (
                        <div className="py-6 text-center text-[10px] text-txt-muted">No messages</div>
                      ) : (
                        threadMessages.map((msg, i) => {
                          // Date separator: show when day changes between messages
                          let dateSep: string | null = null
                          if (msg.time) {
                            const msgDate = new Date(msg.time)
                            const prevTime = i > 0 ? threadMessages[i - 1].time : null
                            const prevDate = prevTime ? new Date(prevTime) : null
                            if (!prevDate || msgDate.toDateString() !== prevDate.toDateString()) {
                              const today = new Date()
                              dateSep = msgDate.toDateString() === today.toDateString()
                                ? 'Today'
                                : format(msgDate, 'MMM d, yyyy')
                            }
                          }

                          return (
                            <div key={msg.id}>
                              {dateSep && (
                                <div className="text-center my-2">
                                  <span className="text-[8px] text-txt-muted bg-surface-secondary px-2 py-0.5 rounded-full">{dateSep}</span>
                                </div>
                              )}
                              {/* Sender label for outbound */}
                              {msg.direction === 'outbound' && msg.senderName && (
                                <p className="text-[8px] text-txt-muted text-right mr-1 mb-0.5">{msg.senderName}</p>
                              )}
                              <div className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] px-2.5 py-1.5 rounded-xl text-[10px] leading-relaxed ${
                                  msg.direction === 'outbound'
                                    ? 'bg-gunner-red text-white rounded-br-sm'
                                    : 'bg-surface-tertiary text-txt-primary rounded-bl-sm'
                                }`}>
                                  {msg.body}
                                  <div className={`text-[8px] mt-0.5 ${msg.direction === 'outbound' ? 'text-white/60' : 'text-txt-muted'}`}>
                                    {msg.time ? format(new Date(msg.time), 'h:mm a') : ''}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                      <div ref={threadBottomRef} />
                    </div>

                    {/* Reply input */}
                    <div className="px-3 pb-2 pt-1 flex gap-1.5 shrink-0 border-t" style={{ borderColor: 'var(--border-light)' }}>
                      <input
                        type="text"
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); promptSendReply() } }}
                        placeholder="Reply..."
                        className="flex-1 bg-surface-secondary border rounded-[8px] px-2.5 py-1.5 text-[10px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
                        style={{ borderColor: 'var(--border-medium)' }}
                        disabled={sendingReply}
                      />
                      <button
                        onClick={() => promptSendReply()}
                        disabled={!replyText.trim() || sendingReply}
                        className="p-1.5 rounded-[8px] bg-gunner-red text-white hover:bg-gunner-red-dark disabled:opacity-40 transition-colors shrink-0"
                      >
                        {sendingReply ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── APPOINTMENTS PANEL ──────────────────────────────── */}
          <div className="bg-surface-primary border-[0.5px] rounded-[14px] flex flex-col h-[420px]" style={{ borderColor: 'var(--border-light)' }}>
            {/* Appointments header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
              <Calendar size={13} className="text-gunner-red" />
              <span className="text-[13px] font-semibold text-txt-primary uppercase tracking-wide">Appointments</span>
              {!loadingAppts && appointments.length > 0 && (
                <span className="bg-gunner-red text-white text-[11px] font-medium px-2 py-0.5 rounded-full">{appointments.length}</span>
              )}
            </div>

            {/* Appointments body — scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2">
              {loadingAppts ? (
                <div className="py-6 text-center">
                  <Loader2 size={12} className="animate-spin text-txt-muted mx-auto" />
                </div>
              ) : appointments.length === 0 ? (
                <div className="py-6 text-center">
                  <Calendar size={20} className="text-txt-muted mx-auto mb-2" />
                  <p className="text-[10px] text-txt-muted">No upcoming appointments</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {appointments.map((appt, i) => {
                    // Date separator
                    let dateSep: string | null = null
                    if (appt.startTime) {
                      const d = new Date(appt.startTime)
                      const prev = i > 0 ? new Date(appointments[i - 1].startTime) : null
                      if (!prev || d.toDateString() !== prev.toDateString()) {
                        const today = new Date()
                        dateSep = d.toDateString() === today.toDateString() ? 'Today' : format(d, 'EEE, MMM d')
                      }
                    }
                    return (
                      <div key={appt.id}>
                        {dateSep && (
                          <p className="text-[9px] font-medium text-txt-muted uppercase tracking-wide px-2 pt-2 pb-0.5">{dateSep}</p>
                        )}
                        <div className="flex items-start gap-2 px-2 py-1.5 rounded-[8px] hover:bg-surface-secondary transition-colors">
                          <div className="text-[10px] text-txt-muted w-[50px] shrink-0 pt-0.5 text-right">
                            {appt.startTime ? format(new Date(appt.startTime), 'h:mm a') : ''}
                          </div>
                          <div className="w-px h-8 bg-gunner-red/30 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-medium text-txt-primary truncate">{appt.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {appt.calendarName && <span className="text-[8px] text-semantic-purple truncate">{appt.calendarName}</span>}
                              {appt.assignedUserName && <span className="text-[8px] text-semantic-blue">• {appt.assignedUserName}</span>}
                              <span className={`text-[8px] font-medium ${appt.status === 'confirmed' ? 'text-semantic-green' : 'text-txt-muted'}`}>{appt.status}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SMS SEND CONFIRMATION MODAL */}
        {showSendConfirm && selectedContact && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowSendConfirm(false)}>
            <div className="bg-surface-primary rounded-[14px] border-[0.5px] w-full max-w-sm mx-4 p-5" style={{ borderColor: 'var(--border-light)' }} onClick={e => e.stopPropagation()}>
              <h3 className="text-[13px] font-semibold text-txt-primary mb-4">Confirm SMS</h3>

              {/* FROM — searchable team member dropdown */}
              <div className="mb-3">
                <label className="text-[10px] font-medium text-txt-muted uppercase tracking-wide block mb-1">Send as</label>
                <div className="relative">
                  <input
                    type="text"
                    value={fromDropdownOpen ? fromSearch : selectedFromUser}
                    onChange={e => { setFromSearch(e.target.value); setFromDropdownOpen(true) }}
                    onFocus={() => { setFromDropdownOpen(true); setFromSearch('') }}
                    onBlur={() => setTimeout(() => setFromDropdownOpen(false), 150)}
                    placeholder="Search team member..."
                    className="w-full bg-surface-secondary border rounded-[8px] px-2.5 py-1.5 text-[11px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
                    style={{ borderColor: 'var(--border-medium)' }}
                  />
                  {fromDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-primary border rounded-[8px] shadow-ds-float max-h-[120px] overflow-y-auto z-10" style={{ borderColor: 'var(--border-medium)' }}>
                      {teamMembers
                        .filter(m => !fromSearch || m.name.toLowerCase().includes(fromSearch.toLowerCase()))
                        .map(m => (
                          <button
                            key={m.id}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setSelectedFromUser(m.name); setFromSearch(''); setFromDropdownOpen(false) }}
                            className={`w-full text-left px-2.5 py-1.5 text-[10px] hover:bg-surface-secondary ${selectedFromUser === m.name ? 'text-gunner-red font-medium' : 'text-txt-primary'}`}
                          >
                            {m.name}
                          </button>
                        ))}
                      {teamMembers.filter(m => !fromSearch || m.name.toLowerCase().includes(fromSearch.toLowerCase())).length === 0 && (
                        <p className="px-2.5 py-1.5 text-[10px] text-txt-muted">No matches</p>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-txt-muted mt-0.5">GHL routes to the number used in this conversation</p>
              </div>

              {/* TO */}
              <div className="mb-3">
                <label className="text-[10px] font-medium text-txt-muted uppercase tracking-wide block mb-1">To</label>
                <p className="text-[11px] text-txt-primary">{selectedContact.contactName} <span className="text-txt-muted">— {formatPhone(selectedContact.phone)}</span></p>
              </div>

              {/* MESSAGE */}
              <div className="mb-4">
                <label className="text-[10px] font-medium text-txt-muted uppercase tracking-wide block mb-1">Message</label>
                <div className="bg-surface-secondary rounded-[8px] px-2.5 py-2 text-[11px] text-txt-primary leading-relaxed">
                  {replyText}
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex gap-2">
                <button
                  onClick={confirmSendReply}
                  disabled={sendingReply}
                  className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-[11px] font-semibold py-2 rounded-[8px] transition-colors"
                >
                  {sendingReply ? 'Sending...' : 'Send SMS'}
                </button>
                <button
                  onClick={() => setShowSendConfirm(false)}
                  className="px-4 py-2 text-[11px] text-txt-secondary hover:text-txt-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TASKS SECTION */}
        <div>
          {/* Tasks header */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-secondary focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              <option value="">Categories</option>
              <option value="New Lead">New Lead</option>
              <option value="Reschedule">Reschedule</option>
              <option value="Follow-Up">Follow-Up</option>
              <option value="Admin">Admin</option>
            </select>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-secondary focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              <option value="">Team Members</option>
              {assignedNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-[13px] text-txt-muted ml-auto">{filteredTasks.length} tasks</span>
            {overdueCount > 0 && (
              <span className="bg-gunner-red text-white text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                🔥 {overdueCount} overdue
              </span>
            )}
          </div>

          {/* GHL error */}
          {fetchError && (
            <div className="bg-semantic-amber-bg border-[0.5px] rounded-[14px] px-5 py-4 mb-4" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
              <p className="text-[13px] text-semantic-amber font-medium">Could not load tasks from Go High Level</p>
              <p className="text-[11px] text-txt-secondary mt-1">Check Settings &rarr; Integrations to reconnect.</p>
            </div>
          )}

          {/* Task rows */}
          <div className="bg-surface-primary border-[0.5px] rounded-[14px] divide-y divide-[rgba(0,0,0,0.08)]" style={{ borderColor: 'var(--border-light)' }}>
            {visibleTasks.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-txt-muted">No tasks to show</div>
            ) : (
              visibleTasks.map((task, i) => (
                <TaskRow key={task.id} task={task} index={i + 1} tenantSlug={tenantSlug} onComplete={completeTask} completing={completingTask} />
              ))
            )}
          </div>

          {/* View more */}
          {remaining > 0 && (
            <button
              onClick={() => setVisibleTaskCount(v => v + 50)}
              className="w-full text-center text-[13px] text-gunner-red hover:text-gunner-red-dark font-medium py-3 mt-2"
            >
              View More ({remaining} remaining)
            </button>
          )}
        </div>
    </div>
  )
}

// ─── Inbox Row ──────────────────────────────────────────────────────────────

function InboxRow({ item, onSelect }: { item: InboxItem; onSelect: (item: InboxItem) => void }) {
  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full text-left flex items-start gap-3 px-5 py-2.5 hover:bg-surface-secondary transition-colors border-b last:border-b-0"
      style={{ borderColor: 'var(--border-light)' }}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        item.type === 'missed_call' ? 'bg-semantic-red-bg' : 'bg-semantic-blue-bg'
      }`}>
        {item.type === 'missed_call'
          ? <PhoneOff size={12} className="text-semantic-red" />
          : <MessageCircle size={12} className="text-semantic-blue" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-txt-primary truncate">{item.contactName}</p>
          {item.assignedTo && (
            <span className="text-[10px] text-semantic-blue shrink-0">→ {item.assignedTo}</span>
          )}
        </div>
        {item.propertyAddress && (
          <p className="text-[10px] text-semantic-purple truncate">{item.propertyAddress}</p>
        )}
        <p className="text-[10px] text-txt-muted truncate">
          {item.type === 'missed_call' ? 'Missed call' : item.lastMessageBody}
        </p>
      </div>
      <span className="text-[10px] text-txt-muted shrink-0 mt-0.5">
        {format(new Date(item.dateUpdated), 'h:mm a')}
      </span>
    </button>
  )
}

// ─── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({ task, index, tenantSlug, onComplete, completing }: {
  task: EnrichedTask
  index: number
  tenantSlug: string
  onComplete: (taskId: string, contactId: string) => void
  completing: string | null
}) {
  const daysOverdue = task.dueDate && task.isOverdue
    ? differenceInDays(new Date(), new Date(task.dueDate))
    : 0

  const catBadge = CATEGORY_BADGE[task.category] ?? CATEGORY_BADGE['Follow-Up']
  const isCompleting = completing === task.id

  return (
    <div className={`flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary transition-colors ${
      task.isOverdue ? 'bg-semantic-red-bg/30' : ''
    }`}>
      {/* Row number */}
      <span className="text-[11px] text-txt-muted w-5 text-right shrink-0">{index}</span>

      {/* Checkbox circle */}
      <button
        onClick={() => onComplete(task.id, task.contactId)}
        disabled={isCompleting}
        className="shrink-0 text-txt-muted hover:text-gunner-red transition-colors"
      >
        {isCompleting
          ? <CheckCircle size={16} className="text-semantic-green animate-pulse" />
          : <Circle size={16} />
        }
      </button>

      {/* Category badge */}
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${catBadge.color}`}>
        {task.category === 'New Lead' ? '⭐ ' : ''}{catBadge.label}
      </span>

      {/* Task name + contact */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span className="text-[13px] font-medium text-txt-primary truncate">{task.title}</span>
        {task.contactName && (
          <span className="text-[13px] text-txt-secondary truncate hidden sm:inline">{task.contactName}</span>
        )}
      </div>

      {/* Address + rep */}
      <div className="hidden md:flex items-center gap-2 text-[11px] text-txt-muted shrink-0">
        {task.contactAddress && (
          <span className="truncate max-w-[180px]">{task.contactAddress}</span>
        )}
        {task.assignedToName && (
          <span className="flex items-center gap-1">
            <User size={9} /> {task.assignedToName}
          </span>
        )}
      </div>

      {/* AM/PM pills */}
      <div className="flex gap-1 shrink-0">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] ${
          task.amDone ? 'bg-semantic-green-bg text-semantic-green' : 'bg-surface-tertiary text-txt-muted'
        }`}>AM</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] ${
          task.pmDone ? 'bg-semantic-green-bg text-semantic-green' : 'bg-surface-tertiary text-txt-muted'
        }`}>PM</span>
      </div>

      {/* Due status */}
      <span className={`text-[11px] font-medium shrink-0 w-20 text-right ${
        task.isOverdue ? 'text-semantic-red'
        : task.isDueToday ? 'text-semantic-amber'
        : 'text-txt-muted'
      }`}>
        {task.isOverdue
          ? `${daysOverdue}d overdue`
          : task.isDueToday
          ? 'Due Today'
          : task.dueDate
          ? format(new Date(task.dueDate), 'MMM d')
          : 'Upcoming'}
      </span>
    </div>
  )
}
