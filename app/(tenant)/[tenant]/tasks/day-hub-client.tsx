'use client'
// app/(tenant)/[tenant]/tasks/day-hub-client.tsx
// Day Hub — full replication of getgunner.ai Day Hub page
// Two-column layout: main (65%) + AI Coach sidebar (35%)
// Sections: role tabs, KPI cards, inbox/appointments, tasks list

import { useState, useEffect, useCallback, useTransition } from 'react'
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
        setLoadingInbox(false)
      })
      .catch(() => setLoadingInbox(false))
  }, [tenantSlug])

  useEffect(() => { fetchInbox() }, [fetchInbox])

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

  async function sendReply(contactId: string, contactName: string) {
    if (!replyText.trim() || sendingReply) return
    setSendingReply(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/dayhub/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, message: replyText.trim() }),
      })
      if (res.ok) {
        toast(`SMS sent to ${contactName}`, 'success')
        setReplyText('')
        setSelectedContact(null)
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
          {/* ── INBOX PANELS (2/3) — two stacked boxes ────────── */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* UNREAD BOX */}
            <div className="bg-surface-primary border-[0.5px] rounded-[14px] flex flex-col h-[200px]" style={{ borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
                <MessageSquare size={13} className="text-semantic-red" />
                <span className="text-[13px] font-semibold text-txt-primary uppercase tracking-wide">Unread</span>
                {!loadingInbox && unreadInbox.length > 0 && (
                  <span className="bg-gunner-red text-white text-[11px] font-medium px-2 py-0.5 rounded-full">{unreadInbox.length}</span>
                )}
                <button onClick={() => fetchInbox()} className="ml-auto p-1 text-txt-muted hover:text-txt-primary">
                  <RefreshCw size={12} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {loadingInbox ? (
                  <div className="py-6 text-center"><Loader2 size={14} className="animate-spin text-txt-muted mx-auto" /></div>
                ) : unreadInbox.length === 0 ? (
                  <div className="py-6 text-center text-[13px] text-txt-muted">All caught up</div>
                ) : (
                  unreadInbox.map(item => (
                    <InboxRow key={item.id} item={item} onSelect={setSelectedContact} />
                  ))
                )}
              </div>
            </div>

            {/* NO RESPONSE BOX */}
            <div className="bg-surface-primary border-[0.5px] rounded-[14px] flex flex-col h-[200px]" style={{ borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
                <MessageSquare size={13} className="text-semantic-amber" />
                <span className="text-[13px] font-semibold text-txt-primary uppercase tracking-wide">Needs Reply</span>
                {!loadingInbox && noResponseInbox.length > 0 && (
                  <span className="bg-semantic-amber text-white text-[11px] font-medium px-2 py-0.5 rounded-full">{noResponseInbox.length}</span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {loadingInbox ? (
                  <div className="py-6 text-center"><Loader2 size={14} className="animate-spin text-txt-muted mx-auto" /></div>
                ) : noResponseInbox.length === 0 ? (
                  <div className="py-6 text-center text-[13px] text-txt-muted">All responded</div>
                ) : (
                  noResponseInbox.map(item => (
                    <InboxRow key={item.id} item={item} onSelect={setSelectedContact} />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Reply modal overlay — shows when a contact is selected */}
          {selectedContact && (
            <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setSelectedContact(null)}>
              <div className="bg-surface-primary rounded-[14px] border-[0.5px] w-full max-w-md mx-4 flex flex-col h-[400px]" style={{ borderColor: 'var(--border-light)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
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

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
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

                <div className="px-5 pb-4 pt-2 flex gap-2 shrink-0 border-t" style={{ borderColor: 'var(--border-light)' }}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(selectedContact.contactId, selectedContact.contactName) } }}
                    placeholder={`Reply to ${selectedContact.contactName}...`}
                    className="flex-1 bg-surface-secondary border rounded-[10px] px-4 py-2.5 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
                    style={{ borderColor: 'var(--border-medium)' }}
                    disabled={sendingReply}
                    autoFocus
                  />
                  <button
                    onClick={() => sendReply(selectedContact.contactId, selectedContact.contactName)}
                    disabled={!replyText.trim() || sendingReply}
                    className="p-2.5 rounded-[10px] bg-gunner-red text-white hover:bg-gunner-red-dark disabled:opacity-40 transition-colors shrink-0"
                  >
                    {sendingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

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
            <div className="flex-1 overflow-y-auto min-h-0 p-5">
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
          </div>
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
