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
  Settings, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, ExternalLink,
  MapPin, User, Clock, Loader2, Send, Circle, CheckCircle,
  PhoneOff, MessageCircle, Pencil, Plus, Play, ClipboardList,
} from 'lucide-react'
import { format, formatDistanceToNow, differenceInDays, addDays, isToday } from 'date-fns'
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

function titleCase(name: string | null): string {
  if (!name) return ''
  return name.replace(/\b\w/g, c => c.toUpperCase())
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
  contactPhone: string
  contactAddress: string
  contactId: string
  startTime: string
  endTime: string
  durationMin: number
  status: string
  calendarName?: string
  assignedUserName?: string | null
}

type RoleTab = 'ADMIN' | 'LM' | 'AM' | 'DISPO'

// Appointment type colors — deterministic by calendar name
const APT_TYPE_COLORS = [
  { bg: 'bg-semantic-blue-bg', text: 'text-semantic-blue', bar: 'bg-semantic-blue' },
  { bg: 'bg-semantic-green-bg', text: 'text-semantic-green', bar: 'bg-semantic-green' },
  { bg: 'bg-semantic-purple-bg', text: 'text-semantic-purple', bar: 'bg-semantic-purple' },
  { bg: 'bg-semantic-amber-bg', text: 'text-semantic-amber', bar: 'bg-amber-500' },
  { bg: 'bg-semantic-red-bg', text: 'text-semantic-red', bar: 'bg-semantic-red' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', bar: 'bg-cyan-500' },
  { bg: 'bg-pink-50', text: 'text-pink-700', bar: 'bg-pink-500' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', bar: 'bg-indigo-500' },
]
function getAptTypeColor(calendarName: string, allNames: string[]) {
  const sorted = [...new Set(allNames)].sort()
  const idx = sorted.indexOf(calendarName)
  return APT_TYPE_COLORS[(idx >= 0 ? idx : 0) % APT_TYPE_COLORS.length]
}

const CATEGORY_BADGE: Record<string, { label: string; color: string }> = {
  'New Lead': { label: 'NEW LEAD', color: 'border-semantic-green text-semantic-green' },
  'Reschedule': { label: 'RESCHEDULE', color: 'border-semantic-amber text-semantic-amber' },
  'Follow-Up': { label: 'FOLLOW-UP', color: 'border-semantic-blue text-semantic-blue' },
  'Admin': { label: 'ADMIN', color: 'border-semantic-purple text-semantic-purple' },
  'CONTRACT': { label: 'CONTRACT', color: 'border-semantic-purple text-semantic-purple' },
}

// ─── Appointment List sub-component ──────────────────────────────────────────

const APT_STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-semantic-green-bg text-semantic-green',
  showed: 'bg-semantic-green-bg text-semantic-green',
  'no-show': 'bg-semantic-red-bg text-semantic-red',
  noshow: 'bg-semantic-red-bg text-semantic-red',
  cancelled: 'bg-surface-tertiary text-txt-muted',
}
const APT_STATUS_LABELS: { key: string; label: string }[] = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'showed', label: 'Showed' },
  { key: 'no-show', label: 'No Show' },
  { key: 'cancelled', label: 'Cancelled' },
]

function ApptList({ appointments, loading, expandedAppt, setExpandedAppt, apptDate, fetchAppts, apptLocationId, tenantSlug, toast, onSMS }: {
  appointments: AppointmentItem[]
  loading: boolean
  expandedAppt: string | null
  setExpandedAppt: (id: string | null) => void
  apptDate: Date
  fetchAppts: (d: Date) => void
  apptLocationId: string
  tenantSlug: string
  toast: (msg: string, type: 'success' | 'error') => void
  onSMS: (appt: AppointmentItem) => void
}) {
  if (loading) return <div className="flex-1 py-6 text-center"><Loader2 size={12} className="animate-spin text-txt-muted mx-auto" /></div>
  if (appointments.length === 0) return (
    <div className="flex-1 py-6 text-center">
      <Calendar size={16} className="text-txt-muted mx-auto mb-1" />
      <p className="text-[9px] text-txt-muted">No appointments this day</p>
    </div>
  )

  const calendarNames = appointments.map(a => a.calendarName ?? 'Other')

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {appointments.map(appt => {
        const isExpanded = expandedAppt === appt.id
        const typeColor = getAptTypeColor(appt.calendarName ?? 'Other', calendarNames)
        return (
          <div key={appt.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
            <button
              onClick={() => setExpandedAppt(isExpanded ? null : appt.id)}
              className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-surface-secondary transition-colors"
            >
              <span className="text-[9px] text-txt-muted w-[45px] shrink-0 text-right">{appt.startTime ? format(new Date(appt.startTime), 'h:mm a') : ''}</span>
              <div className={`w-[3px] h-7 rounded-full shrink-0 ${typeColor.bar}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-txt-primary truncate">{appt.contactName || appt.title}</p>
                <span className={`inline-block text-[7px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${typeColor.bg} ${typeColor.text}`}>{appt.calendarName ?? 'Appointment'}</span>
              </div>
              <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${APT_STATUS_COLORS[appt.status] ?? 'bg-surface-tertiary text-txt-muted'}`}>{appt.status}</span>
            </button>

            {isExpanded && (
              <div className="px-3 pb-2 space-y-1.5">
                <div className="bg-surface-secondary rounded-[8px] p-2 space-y-1">
                  {appt.contactPhone && <p className="text-[9px] text-txt-secondary"><span className="text-txt-muted">Phone:</span> {formatPhone(appt.contactPhone)}</p>}
                  {appt.contactAddress && <p className="text-[9px] text-txt-secondary"><span className="text-txt-muted">Address:</span> {appt.contactAddress}</p>}
                  <p className="text-[9px] text-txt-secondary"><span className="text-txt-muted">Duration:</span> {appt.durationMin} min</p>
                  <p className="text-[9px] text-txt-secondary"><span className="text-txt-muted">Type:</span> {appt.calendarName}</p>
                  {appt.assignedUserName && <p className="text-[9px] text-txt-secondary"><span className="text-txt-muted">Assigned:</span> {appt.assignedUserName}</p>}
                  <p className="text-[9px] text-txt-secondary"><span className="text-txt-muted">Time:</span> {appt.startTime ? format(new Date(appt.startTime), 'h:mm a') : ''} – {appt.endTime ? format(new Date(appt.endTime), 'h:mm a') : ''}</p>
                </div>
                {/* Status actions */}
                <div className="flex gap-1 flex-wrap">
                  {APT_STATUS_LABELS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        fetch(`/api/${tenantSlug}/dayhub/appointments`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ appointmentId: appt.id, status: key }),
                        }).then(() => { fetchAppts(apptDate); toast(`Marked ${label}`, 'success') })
                          .catch(() => toast('Failed to update', 'error'))
                      }}
                      className={`text-[8px] font-medium px-2 py-1 rounded-full border transition-colors ${
                        appt.status === key
                          ? (APT_STATUS_COLORS[key] ?? 'bg-surface-tertiary text-txt-muted') + ' border-transparent'
                          : 'border-[rgba(0,0,0,0.08)] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Quick actions */}
                <div className="flex gap-2 pt-0.5">
                  {appt.contactPhone && (
                    <button
                      onClick={() => onSMS(appt)}
                      className="text-[8px] text-white bg-gunner-red hover:bg-gunner-red-dark font-medium flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
                    >
                      <Send size={8} /> Send SMS
                    </button>
                  )}
                  <a
                    href={`https://app.gohighlevel.com/v2/location/${apptLocationId}/contacts/detail/${appt.contactId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[8px] text-txt-secondary hover:text-txt-primary font-medium flex items-center gap-1 px-2 py-1 rounded-full border border-[rgba(0,0,0,0.08)] hover:bg-surface-secondary transition-colors"
                  >
                    <ExternalLink size={8} /> Open GHL
                  </a>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
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
  const [apptDate, setApptDate] = useState(new Date())
  const [expandedAppt, setExpandedAppt] = useState<string | null>(null)
  const [apptLocationId, setApptLocationId] = useState('')
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingAppts, setLoadingAppts] = useState(true)

  // Task completion + expansion
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  // Activity from GHL — fetched sequentially on page load for all contacts
  const [activityMap, setActivityMap] = useState<Record<string, ContactActivity>>({})


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

  // Fetch appointments for selected date
  const fetchAppts = useCallback((date: Date) => {
    setLoadingAppts(true)
    const dateStr = date.toISOString().slice(0, 10)
    fetch(`/api/${tenantSlug}/dayhub/appointments?date=${dateStr}`)
      .then(r => r.json())
      .then(d => {
        setAppointments(d.appointments ?? [])
        if (d.locationId) setApptLocationId(d.locationId)
        setLoadingAppts(false)
      })
      .catch(() => setLoadingAppts(false))
  }, [tenantSlug])

  useEffect(() => { fetchAppts(apptDate) }, [fetchAppts, apptDate])

  // Fetch activity for all task contacts sequentially on page load
  // One at a time so we don't overwhelm GHL rate limits
  // Labels light up progressively as each response comes in
  useEffect(() => {
    if (tasks.length === 0) return
    const contactIds = [...new Set(tasks.map(t => t.contactId).filter(Boolean))]
    let cancelled = false
    async function run() {
      for (const cid of contactIds) {
        if (cancelled) return
        try {
          const res = await fetch(`/api/${tenantSlug}/dayhub/contact-activity?contactId=${cid}`)
          if (!res.ok) continue
          const data = await res.json()
          if (!cancelled) {
            setActivityMap(prev => ({ ...prev, [cid]: data }))
          }
        } catch { /* continue to next */ }
      }
    }
    run()
    return () => { cancelled = true }
  }, [tasks, tenantSlug])

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
            {/* Header with day nav */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
              <Calendar size={12} className="text-gunner-red" />
              <button onClick={() => setApptDate(d => addDays(d, -1))} className="p-0.5 text-txt-muted hover:text-txt-primary"><ChevronLeft size={12} /></button>
              <span className="text-[10px] font-semibold text-txt-primary flex-1 text-center">
                {isToday(apptDate) ? 'Today' : format(apptDate, 'EEE, MMM d')}
              </span>
              <button onClick={() => setApptDate(d => addDays(d, 1))} className="p-0.5 text-txt-muted hover:text-txt-primary"><ChevronDown size={12} className="rotate-[-90deg]" /></button>
              {!loadingAppts && appointments.length > 0 && (
                <span className="bg-gunner-red text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">{appointments.length}</span>
              )}
            </div>

            {/* Appointments body */}
            <ApptList
              appointments={appointments}
              loading={loadingAppts}
              expandedAppt={expandedAppt}
              setExpandedAppt={setExpandedAppt}
              apptDate={apptDate}
              fetchAppts={fetchAppts}
              apptLocationId={apptLocationId}
              tenantSlug={tenantSlug}
              toast={toast}
              onSMS={(appt) => {
                setSelectedContact({
                  id: '', contactId: appt.contactId, contactName: appt.contactName,
                  phone: appt.contactPhone, lastMessageBody: '', dateUpdated: Date.now(),
                  type: 'message', unreadCount: 0, assignedTo: appt.assignedUserName ?? null,
                  propertyAddress: appt.contactAddress,
                } as InboxItem)
                setShowSendConfirm(false)
                setReplyText('')
              }}
            />
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
          <div className="space-y-2">
            {visibleTasks.length === 0 ? (
              <div className="bg-surface-primary border-[0.5px] rounded-[14px] py-12 text-center text-[13px] text-txt-muted" style={{ borderColor: 'var(--border-light)' }}>No tasks to show</div>
            ) : (
              visibleTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  tenantSlug={tenantSlug}
                  onComplete={completeTask}
                  completing={completingTask}
                  isExpanded={expandedTask === task.id}
                  onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  ghlLocationId={ghlLocationId}
                  preloadedActivity={activityMap[task.contactId] ?? null}
                  onSMS={(t) => {
                    setSelectedContact({
                      id: '', contactId: t.contactId, contactName: t.contactName ?? t.title,
                      phone: t.contactPhone, lastMessageBody: '', dateUpdated: Date.now(),
                      type: 'message', unreadCount: 0, assignedTo: t.assignedToName,
                      propertyAddress: t.contactAddress,
                    } as InboxItem)
                    setShowSendConfirm(false)
                    setReplyText('')
                  }}
                />
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

interface ContactActivity {
  todayCalls: Array<{ id: string; direction: string; duration: number | null; time: string }>
  todayTexts: Array<{ id: string; body: string; direction: string; time: string }>
  todayEmails?: Array<{ id: string; body: string; direction: string; time: string }>
  gradedCalls: Array<{ id: string; calledAt: string | null; callType: string | null; callOutcome: string | null; score: number | null; aiSummary: string | null; durationSeconds: number | null; assignedToName: string | null }>
  notes: Array<{ id: string; body: string; dateAdded: string }>
  hasAm: boolean
  hasPm: boolean
}

function TaskRow({ task, tenantSlug, onComplete, completing, isExpanded, onToggle, ghlLocationId, preloadedActivity, onSMS }: {
  task: EnrichedTask
  tenantSlug: string
  onComplete: (taskId: string, contactId: string) => void
  completing: string | null
  isExpanded: boolean
  onToggle: () => void
  ghlLocationId: string
  preloadedActivity: ContactActivity | null
  onSMS: (task: EnrichedTask) => void
}) {
  const [activityTab, setActivityTab] = useState<'activity' | 'notes'>('activity')
  const activity = preloadedActivity
  const loadingActivity = isExpanded && !activity

  const daysOverdue = task.dueDate && task.isOverdue
    ? differenceInDays(new Date(), new Date(task.dueDate))
    : 0

  const catBadge = CATEGORY_BADGE[task.category] ?? CATEGORY_BADGE['Follow-Up']
  const isCompleting = completing === task.id

  return (
    <div className={`bg-surface-primary border-[0.5px] rounded-[14px] overflow-hidden transition-shadow ${
      isExpanded ? 'shadow-md ring-1 ring-gunner-red/10' : ''
    } ${task.isOverdue ? 'border-semantic-red/30' : ''}`} style={{ borderColor: task.isOverdue ? undefined : 'var(--border-light)' }}>
      {/* Card header — clickable */}
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors"
      >
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(task.id, task.contactId) }}
          disabled={isCompleting}
          className="shrink-0 text-txt-muted hover:text-gunner-red transition-colors"
        >
          {isCompleting
            ? <CheckCircle size={18} className="text-semantic-green animate-pulse" />
            : <Circle size={18} />
          }
        </button>

        {/* Category badge */}
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border shrink-0 ${catBadge.color}`}>
          {task.category === 'New Lead' ? '⭐ ' : ''}{catBadge.label}
        </span>

        {/* Name + details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-txt-primary truncate">{titleCase(task.contactName) || task.title}</span>
            {task.assignedToName && (
              <span className="text-[10px] text-semantic-blue shrink-0">
                <User size={9} className="inline -mt-0.5" /> {titleCase(task.assignedToName)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-txt-secondary truncate">{task.title}</span>
            {task.contactAddress && (
              <span className="text-[10px] text-semantic-purple truncate hidden md:inline">
                <MapPin size={8} className="inline -mt-0.5" /> {task.contactAddress}
              </span>
            )}
          </div>
        </div>

        {/* AM/PM glow — activity is source of truth, server DB as fallback */}
        <div className="flex gap-1 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] transition-all ${
            (activity ? activity.hasAm : task.amDone)
              ? 'bg-semantic-green text-white shadow-[0_0_8px_rgba(34,197,94,0.5)]'
              : 'bg-surface-tertiary text-txt-muted'
          }`}>AM</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] transition-all ${
            (activity ? activity.hasPm : task.pmDone)
              ? 'bg-semantic-green text-white shadow-[0_0_8px_rgba(34,197,94,0.5)]'
              : 'bg-surface-tertiary text-txt-muted'
          }`}>PM</span>
        </div>

        {/* Due status */}
        <span className={`text-[11px] font-semibold shrink-0 w-20 text-right ${
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

        <ChevronRight size={14} className={`text-txt-muted shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t px-4 pb-3 pt-2" style={{ borderColor: 'var(--border-light)' }}>
          {/* Task summary */}
          <div className="bg-surface-secondary rounded-[8px] p-3 mb-3 space-y-1">
            <p className="text-[12px] font-semibold text-txt-primary">{task.title}</p>
            {task.body && <p className="text-[11px] text-txt-secondary">{task.body}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-txt-muted pt-1">
              {task.contactPhone && <span><Phone size={9} className="inline -mt-0.5" /> {formatPhone(task.contactPhone)}</span>}
              {task.contactAddress && <span><MapPin size={9} className="inline -mt-0.5" /> {task.contactAddress}</span>}
              {task.assignedToName && <span><User size={9} className="inline -mt-0.5" /> {titleCase(task.assignedToName)}</span>}
              {task.dueDate && <span><Clock size={9} className="inline -mt-0.5" /> Due {format(new Date(task.dueDate), 'MMM d, yyyy')}</span>}
            </div>
          </div>

          {/* Quick action bar */}
          <div className="flex gap-1.5 flex-wrap mb-3">
            {task.contactPhone && (
              <a href={`tel:${task.contactPhone}`} className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-full bg-semantic-green-bg text-semantic-green hover:bg-semantic-green/10 transition-colors">
                <Phone size={10} /> Call
              </a>
            )}
            {task.contactPhone && (
              <button onClick={() => onSMS(task)} className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-full bg-semantic-blue-bg text-semantic-blue hover:bg-semantic-blue/10 transition-colors">
                <Send size={10} /> Text
              </button>
            )}
            <a
              href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${task.contactId}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-full bg-surface-tertiary text-txt-secondary hover:text-txt-primary transition-colors"
            >
              <ExternalLink size={10} /> View in CRM
            </a>
            <a
              href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${task.contactId}?tab=appointments`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-full bg-surface-tertiary text-txt-secondary hover:text-txt-primary transition-colors"
            >
              <Calendar size={10} /> Create Apt
            </a>
            <a
              href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${task.contactId}?tab=notes`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-full bg-surface-tertiary text-txt-secondary hover:text-txt-primary transition-colors"
            >
              <Pencil size={10} /> Add Note
            </a>
            <a
              href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${task.contactId}?tab=workflow`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-full bg-surface-tertiary text-txt-secondary hover:text-txt-primary transition-colors"
            >
              <Play size={10} /> Workflow
            </a>
            <a
              href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${task.contactId}?tab=tasks`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-full bg-surface-tertiary text-txt-secondary hover:text-txt-primary transition-colors"
            >
              <ClipboardList size={10} /> Update Task
            </a>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 border-b mb-2" style={{ borderColor: 'var(--border-light)' }}>
            <button
              onClick={() => setActivityTab('activity')}
              className={`text-[11px] font-semibold px-3 py-1.5 border-b-2 transition-colors ${
                activityTab === 'activity'
                  ? 'border-gunner-red text-gunner-red'
                  : 'border-transparent text-txt-muted hover:text-txt-secondary'
              }`}
            >
              Activity Today
            </button>
            <button
              onClick={() => setActivityTab('notes')}
              className={`text-[11px] font-semibold px-3 py-1.5 border-b-2 transition-colors ${
                activityTab === 'notes'
                  ? 'border-gunner-red text-gunner-red'
                  : 'border-transparent text-txt-muted hover:text-txt-secondary'
              }`}
            >
              Notes & Grades
            </button>
          </div>

          {/* Tab content */}
          {loadingActivity ? (
            <div className="py-4 text-center"><Loader2 size={14} className="animate-spin text-txt-muted mx-auto" /></div>
          ) : activityTab === 'activity' ? (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {(!activity?.todayCalls?.length && !activity?.todayTexts?.length && !activity?.todayEmails?.length) ? (
                <p className="text-[11px] text-txt-muted py-3 text-center">No activity today</p>
              ) : (
                <>
                  {activity?.todayCalls?.map(c => (
                    <div key={c.id} className="flex items-center gap-2 bg-surface-secondary rounded-[8px] px-3 py-2">
                      <Phone size={11} className={c.direction === 'outbound' ? 'text-semantic-green' : 'text-semantic-blue'} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-medium text-txt-primary">
                          {c.direction === 'outbound' ? 'Outbound' : 'Inbound'} Call
                        </span>
                      </div>
                      <span className="text-[10px] text-txt-muted">{c.duration ? `${Math.round(c.duration / 60)}m` : ''}</span>
                      <span className="text-[10px] text-txt-muted">{c.time ? format(new Date(c.time), 'h:mm a') : ''}</span>
                    </div>
                  ))}
                  {activity?.todayTexts?.map(t => (
                    <div key={t.id} className="flex items-start gap-2 bg-surface-secondary rounded-[8px] px-3 py-2">
                      <MessageSquare size={11} className={t.direction === 'outbound' ? 'text-semantic-green mt-0.5' : 'text-semantic-blue mt-0.5'} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-medium text-txt-primary">{t.direction === 'outbound' ? 'Sent SMS' : 'Received SMS'}</span>
                        <p className="text-[10px] text-txt-secondary truncate">{t.body}</p>
                      </div>
                      <span className="text-[10px] text-txt-muted shrink-0">{t.time ? format(new Date(t.time), 'h:mm a') : ''}</span>
                    </div>
                  ))}
                  {activity?.todayEmails?.map(e => (
                    <div key={e.id} className="flex items-start gap-2 bg-surface-secondary rounded-[8px] px-3 py-2">
                      <FileText size={11} className={e.direction === 'outbound' ? 'text-semantic-purple mt-0.5' : 'text-semantic-amber mt-0.5'} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-medium text-txt-primary">{e.direction === 'outbound' ? 'Sent Email' : 'Received Email'}</span>
                        <p className="text-[10px] text-txt-secondary truncate">{e.body}</p>
                      </div>
                      <span className="text-[10px] text-txt-muted shrink-0">{e.time ? format(new Date(e.time), 'h:mm a') : ''}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {(!activity?.gradedCalls?.length && !activity?.notes?.length) ? (
                <p className="text-[11px] text-txt-muted py-3 text-center">No notes or graded calls</p>
              ) : (
                <>
                  {activity?.gradedCalls?.map(c => (
                    <a key={c.id} href={`/${tenantSlug}/calls/${c.id}`} className="flex items-center gap-2 bg-surface-secondary rounded-[8px] px-3 py-2 hover:bg-surface-tertiary transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        (c.score ?? 0) >= 80 ? 'bg-semantic-green-bg text-semantic-green'
                        : (c.score ?? 0) >= 60 ? 'bg-semantic-amber-bg text-semantic-amber'
                        : 'bg-semantic-red-bg text-semantic-red'
                      }`}>
                        {c.score != null ? Math.round(c.score) : '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-txt-primary">{c.callType ?? 'Call'}</span>
                          {c.callOutcome && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-txt-muted">{c.callOutcome}</span>}
                        </div>
                        {c.aiSummary && <p className="text-[10px] text-txt-secondary truncate mt-0.5">{c.aiSummary}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-txt-muted block">{c.calledAt ? format(new Date(c.calledAt), 'MMM d') : ''}</span>
                        {c.assignedToName && <span className="text-[9px] text-semantic-blue">{titleCase(c.assignedToName)}</span>}
                      </div>
                    </a>
                  ))}
                  {activity?.notes?.map(n => (
                    <div key={n.id} className="bg-surface-secondary rounded-[8px] px-3 py-2">
                      <p className="text-[10px] text-txt-secondary">{n.body}</p>
                      <span className="text-[9px] text-txt-muted">{n.dateAdded ? format(new Date(n.dateAdded), 'MMM d, h:mm a') : ''}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
