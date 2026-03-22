'use client'
// app/(tenant)/[tenant]/tasks/day-hub-client.tsx
// Day Hub — full replication of getgunner.ai Day Hub page
// Two-column layout: main (65%) + AI Coach sidebar (35%)
// Sections: role tabs, KPI cards, inbox/appointments, tasks list

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Phone, MessageSquare, Calendar, Star, Target, FileText,
  Settings, RefreshCw, ChevronDown, ChevronLeft, ExternalLink,
  MapPin, User, Clock, Loader2, Bot, Send, Sparkles, Circle,
  PhoneOff, MessageCircle,
} from 'lucide-react'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { useToast } from '@/components/ui/toaster'

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
}

interface AppointmentItem {
  id: string
  title: string
  contactName: string
  startTime: string
  endTime: string
  status: string
}

interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

type RoleTab = 'ADMIN' | 'LM' | 'AM' | 'DISPO'
type InboxTab = 'inbox' | 'appointments'
type InboxFilter = 'all' | 'missed' | 'msgs'

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
  const [inboxTab, setInboxTab] = useState<InboxTab>('inbox')
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [visibleTaskCount, setVisibleTaskCount] = useState(50)

  // Data state
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [inboxTotal, setInboxTotal] = useState(0)
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingAppts, setLoadingAppts] = useState(true)

  // Inbox thread
  const [selectedContact, setSelectedContact] = useState<InboxItem | null>(null)

  // AI Coach
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([])
  const [coachInput, setCoachInput] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)
  const coachBottomRef = useRef<HTMLDivElement>(null)

  // Fetch KPIs
  useEffect(() => {
    setLoadingKpis(true)
    fetch(`/api/${tenantSlug}/dayhub/kpis`)
      .then(r => r.json())
      .then(d => { setKpis(d); setLoadingKpis(false) })
      .catch(() => setLoadingKpis(false))
  }, [tenantSlug])

  // Fetch inbox
  const fetchInbox = useCallback((filter: InboxFilter) => {
    setLoadingInbox(true)
    fetch(`/api/${tenantSlug}/dayhub/inbox?filter=${filter}`)
      .then(r => r.json())
      .then(d => { setInbox(d.items ?? []); setInboxTotal(d.total ?? 0); setLoadingInbox(false) })
      .catch(() => setLoadingInbox(false))
  }, [tenantSlug])

  useEffect(() => { fetchInbox(inboxFilter) }, [fetchInbox, inboxFilter])

  // Fetch appointments
  useEffect(() => {
    setLoadingAppts(true)
    fetch(`/api/${tenantSlug}/dayhub/appointments`)
      .then(r => r.json())
      .then(d => { setAppointments(d.appointments ?? []); setLoadingAppts(false) })
      .catch(() => setLoadingAppts(false))
  }, [tenantSlug])

  // Scroll coach
  useEffect(() => {
    coachBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [coachMessages])

  // Filter tasks
  const assignedNames = [...new Set(tasks.map(t => t.assignedToName).filter(Boolean))] as string[]
  let filteredTasks = tasks
  if (categoryFilter) filteredTasks = filteredTasks.filter(t => t.category === categoryFilter)
  if (teamFilter) filteredTasks = filteredTasks.filter(t => t.assignedToName === teamFilter)
  const overdueCount = filteredTasks.filter(t => t.isOverdue).length
  const visibleTasks = filteredTasks.slice(0, visibleTaskCount)
  const remaining = filteredTasks.length - visibleTaskCount

  // Inbox counts
  const missedCount = inbox.filter(i => i.type === 'missed_call').length
  const msgsCount = inbox.filter(i => i.type === 'message').length

  // Coach send
  async function sendCoachMessage(text?: string) {
    const content = (text ?? coachInput).trim()
    if (!content || coachLoading) return
    const userMsg: CoachMessage = { role: 'user', content }
    const newMessages = [...coachMessages, userMsg]
    setCoachMessages(newMessages)
    setCoachInput('')
    setCoachLoading(true)
    try {
      const res = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (data.reply) {
        setCoachMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setCoachMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Try again.' }])
    }
    setCoachLoading(false)
  }

  function refresh() {
    startTransition(() => router.refresh())
    fetchInbox(inboxFilter)
    setLoadingKpis(true)
    fetch(`/api/${tenantSlug}/dayhub/kpis`)
      .then(r => r.json())
      .then(d => { setKpis(d); setLoadingKpis(false) })
      .catch(() => setLoadingKpis(false))
  }

  return (
    <div className="flex gap-6 -mx-4 md:-mx-8 -my-4 md:-my-6 min-h-[calc(100vh-52px)]">
      {/* ── LEFT COLUMN (main) ─────────────────────────────────────── */}
      <div className="flex-1 px-4 md:px-8 py-4 md:py-6 overflow-y-auto space-y-6">

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

        {/* INBOX / APPOINTMENTS TABS */}
        <div className="bg-surface-primary border-[0.5px] rounded-[14px]" style={{ borderColor: 'var(--border-light)' }}>
          {/* Tab bar */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
            <button
              onClick={() => { setInboxTab('inbox'); setSelectedContact(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                inboxTab === 'inbox' ? 'bg-gunner-red text-white' : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              <MessageSquare size={13} /> INBOX
            </button>
            <button
              onClick={() => setInboxTab('appointments')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                inboxTab === 'appointments' ? 'bg-gunner-red text-white' : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              <Calendar size={13} /> APPOINTMENTS
            </button>
          </div>

          {/* INBOX tab content */}
          {inboxTab === 'inbox' && !selectedContact && (
            <div>
              {/* Inbox header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
                <span className="text-[13px] font-semibold text-txt-primary uppercase tracking-wide">Inbox</span>
                <span className="bg-gunner-red text-white text-[11px] font-medium px-2 py-0.5 rounded-full">{inboxTotal}</span>
                <div className="flex gap-1 ml-auto">
                  {[
                    { id: 'all' as InboxFilter, label: `All (${inboxTotal})` },
                    { id: 'missed' as InboxFilter, label: `Missed (${missedCount})` },
                    { id: 'msgs' as InboxFilter, label: `Msgs (${msgsCount})` },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setInboxFilter(f.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                        inboxFilter === f.id ? 'bg-gunner-red text-white' : 'text-txt-secondary hover:text-txt-primary'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                  <button onClick={() => fetchInbox(inboxFilter)} className="p-1 text-txt-muted hover:text-txt-primary">
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              {/* Inbox rows */}
              {loadingInbox ? (
                <div className="py-8 text-center">
                  <Loader2 size={16} className="animate-spin text-txt-muted mx-auto" />
                </div>
              ) : inbox.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-txt-muted">No conversations</div>
              ) : (
                <div className="max-h-[350px] overflow-y-auto">
                  {inbox.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedContact(item)}
                      className="w-full text-left flex items-start gap-3 px-5 py-3 hover:bg-surface-secondary transition-colors border-b last:border-b-0"
                      style={{ borderColor: 'var(--border-light)' }}
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        item.type === 'missed_call' ? 'bg-semantic-red-bg' : 'bg-semantic-blue-bg'
                      }`}>
                        {item.type === 'missed_call'
                          ? <PhoneOff size={14} className="text-semantic-red" />
                          : <MessageCircle size={14} className="text-semantic-blue" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-txt-primary truncate">{item.contactName}</p>
                        <p className="text-[11px] text-txt-muted truncate mt-0.5">
                          {item.type === 'missed_call' ? 'Missed call.' : item.lastMessageBody}
                        </p>
                      </div>
                      <span className="text-[11px] text-txt-muted shrink-0">
                        {formatDistanceToNow(new Date(item.dateUpdated), { addSuffix: false })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inline conversation thread */}
          {inboxTab === 'inbox' && selectedContact && (
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setSelectedContact(null)} className="p-1.5 rounded-[10px] hover:bg-surface-secondary text-txt-secondary">
                  <ChevronLeft size={16} />
                </button>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  selectedContact.type === 'missed_call' ? 'bg-semantic-red-bg' : 'bg-semantic-blue-bg'
                }`}>
                  {selectedContact.type === 'missed_call'
                    ? <PhoneOff size={14} className="text-semantic-red" />
                    : <MessageCircle size={14} className="text-semantic-blue" />
                  }
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-medium text-txt-primary">{selectedContact.contactName}</p>
                  {selectedContact.phone && <p className="text-[11px] text-txt-muted">{selectedContact.phone}</p>}
                </div>
                <button className="p-1.5 rounded-[10px] hover:bg-surface-secondary text-txt-muted">
                  <ExternalLink size={14} />
                </button>
              </div>

              {/* Conversation events */}
              <div className="space-y-3 py-4">
                <div className="text-center text-[11px] text-txt-muted">Today</div>
                {selectedContact.type === 'missed_call' ? (
                  <div className="flex justify-center">
                    <span className="border border-gunner-red text-gunner-red text-[12px] font-medium px-4 py-2 rounded-full flex items-center gap-2">
                      <PhoneOff size={12} /> Missed Call
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="bg-gunner-red text-white text-[13px] px-4 py-2 rounded-2xl rounded-br-md max-w-[80%]">
                      {selectedContact.lastMessageBody}
                    </div>
                  </div>
                )}
                <div className="text-center text-[11px] text-txt-muted">
                  {format(new Date(selectedContact.dateUpdated), 'h:mm a')}
                </div>
              </div>

              {/* Reply input */}
              <div className="mt-4">
                <input
                  type="text"
                  placeholder={`Reply to ${selectedContact.contactName}...`}
                  className="w-full bg-surface-secondary border rounded-[10px] px-4 py-2.5 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
                  style={{ borderColor: 'var(--border-medium)' }}
                />
              </div>
            </div>
          )}

          {/* APPOINTMENTS tab content */}
          {inboxTab === 'appointments' && (
            <div className="p-5">
              <p className="text-[14px] font-medium text-txt-primary mb-3">Today&apos;s Appointments</p>
              {loadingAppts ? (
                <div className="py-8 text-center">
                  <Loader2 size={16} className="animate-spin text-txt-muted mx-auto" />
                </div>
              ) : appointments.length === 0 ? (
                <div className="py-8 text-center">
                  <Calendar size={24} className="text-txt-muted mx-auto mb-2" />
                  <p className="text-[13px] text-txt-muted">No appointments today</p>
                  <p className="text-[11px] text-txt-muted mt-1">Appointments from your CRM calendar will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {appointments.map(appt => (
                    <div key={appt.id} className="bg-surface-secondary rounded-[10px] px-4 py-3">
                      <p className="text-[14px] font-medium text-txt-primary">{appt.contactName || appt.title}</p>
                      <p className="text-[11px] text-txt-muted mt-0.5">
                        {appt.startTime ? format(new Date(appt.startTime), 'h:mm a') : ''} — {appt.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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
                <TaskRow key={task.id} task={task} index={i + 1} tenantSlug={tenantSlug} />
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

      {/* ── RIGHT COLUMN — AI COACH ───────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[320px] shrink-0 bg-surface-primary border-l sticky top-[52px] h-[calc(100vh-52px)]" style={{ borderColor: 'var(--border-light)' }}>
        {/* Coach header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <div className="w-8 h-8 rounded-[10px] bg-semantic-purple-bg flex items-center justify-center">
            <Bot size={16} className="text-semantic-purple" />
          </div>
          <span className="text-[14px] font-medium text-txt-primary">AI Coach</span>
          <span className="text-[11px] font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full">&#x2726;</span>
          <button className="ml-auto p-1 text-txt-muted hover:text-txt-primary">
            <Sparkles size={14} />
          </button>
        </div>

        {/* Coach body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {coachMessages.length === 0 ? (
            <div className="text-center mt-8">
              <div className="w-14 h-14 rounded-full bg-gunner-red-light flex items-center justify-center mx-auto mb-4">
                <Bot size={24} className="text-gunner-red" />
              </div>
              <p className="text-[13px] text-txt-secondary">
                Ask questions or give commands —<br />
                send SMS, add notes, create tasks, and more.
              </p>
              <div className="space-y-2 mt-6">
                {[
                  { icon: <Target size={13} />, text: 'What should I focus on?' },
                  { icon: <MessageSquare size={13} />, text: 'Send an SMS to...' },
                  { icon: <FileText size={13} />, text: 'Add a note for...' },
                ].map(chip => (
                  <button
                    key={chip.text}
                    onClick={() => sendCoachMessage(chip.text)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-[10px] border-[0.5px] text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-all"
                    style={{ borderColor: 'var(--border-light)' }}
                  >
                    {chip.icon} {chip.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {coachMessages.map((msg, i) => (
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
              {coachLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface-secondary px-3 py-2 rounded-2xl rounded-bl-md">
                    <Loader2 size={14} className="animate-spin text-txt-muted" />
                  </div>
                </div>
              )}
              <div ref={coachBottomRef} />
            </div>
          )}
        </div>

        {/* Coach input */}
        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={coachInput}
              onChange={e => setCoachInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoachMessage() } }}
              placeholder="Ask AI Coach..."
              className="flex-1 bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-semantic-purple"
              style={{ borderColor: 'var(--border-medium)' }}
            />
            <button
              onClick={() => sendCoachMessage()}
              disabled={coachLoading || !coachInput.trim()}
              className="p-2 rounded-[10px] bg-semantic-purple text-white hover:opacity-90 disabled:opacity-40 transition-all"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({ task, index, tenantSlug }: {
  task: EnrichedTask
  index: number
  tenantSlug: string
}) {
  const daysOverdue = task.dueDate && task.isOverdue
    ? differenceInDays(new Date(), new Date(task.dueDate))
    : 0

  const catBadge = CATEGORY_BADGE[task.category] ?? CATEGORY_BADGE['Follow-Up']

  return (
    <div className={`flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary transition-colors ${
      task.isOverdue ? 'bg-semantic-red-bg/30' : ''
    }`}>
      {/* Row number */}
      <span className="text-[11px] text-txt-muted w-5 text-right shrink-0">{index}</span>

      {/* Checkbox circle */}
      <button className="shrink-0 text-txt-muted hover:text-gunner-red transition-colors">
        <Circle size={16} />
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
