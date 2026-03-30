'use client'
// app/(tenant)/[tenant]/day-hub/day-hub-client.tsx
// Day Hub — morning planner with role-based KPI cards, pipeline strip, tasks

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sun, AlertTriangle, CheckCircle2, Circle, Clock, ChevronRight, ChevronLeft, Zap, Calendar, Plus, Target, FileText, Handshake, X, Phone, MessageSquare, Send } from 'lucide-react'
import { format, subDays, addDays } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import type { UserRole } from '@/types/roles'

interface TaskEntry {
  id: string; title: string; description: string | null
  category: string | null; status: string; priority: string
  dueAt: string | null
  property: { id: string; address: string } | null
}

interface MilestoneCounts {
  lead: number; aptSet: number; offer: number; contract: number
  pushed: number; dispoOffer: number; dispoContract: number
}

export function DayHubClient({
  tenantSlug, userName, userRole, todayTasks, tomorrowTasks, overdueTasks,
  categories, completedToday, xp, milestones, calls, properties,
}: {
  tenantSlug: string
  userName: string
  userRole: UserRole
  todayTasks: TaskEntry[]
  tomorrowTasks: TaskEntry[]
  overdueTasks: TaskEntry[]
  categories: string[]
  completedToday: number
  xp: { level: number; weeklyXp: number } | null
  milestones: MilestoneCounts
  calls: { calls: number; convos: number }
  properties: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { toast } = useToast()
  const [completing, setCompleting] = useState<string | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const firstName = userName.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  async function completeTask(taskId: string) {
    setCompleting(taskId)
    // Optimistic: immediately mark as completed visually
    setCompletedIds(prev => new Set(prev).add(taskId))
    try {
      const res = await fetch(`/api/tasks/${taskId}/complete`, { method: 'POST' })
      if (res.ok) {
        toast('Task completed! +XP earned', 'success')
        startTransition(() => router.refresh())
      } else {
        // Rollback optimistic state
        setCompletedIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
        toast('Failed to complete task', 'error')
      }
    } catch {
      setCompletedIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
      toast('Failed to complete task', 'error')
    }
    setCompleting(null)
  }

  // Filter out optimistically-completed tasks
  const visibleTodayTasks = todayTasks.filter(t => !completedIds.has(t.id))
  const visibleOverdueTasks = overdueTasks.filter(t => !completedIds.has(t.id))
  const totalToday = visibleTodayTasks.length + visibleOverdueTasks.length

  // Group today's tasks by category
  const grouped = new Map<string, TaskEntry[]>()
  for (const cat of categories) grouped.set(cat, [])
  grouped.set('Other', [])

  for (const task of visibleTodayTasks) {
    const cat = task.category && categories.includes(task.category) ? task.category : 'Other'
    grouped.get(cat)!.push(task)
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary flex items-center gap-2">
            <Sun size={20} className="text-semantic-amber" />
            {greeting}, {firstName}
          </h1>
          <p className="text-ds-body text-txt-secondary mt-1">
            {totalToday === 0 && completedToday === 0
              ? 'No tasks scheduled today. Time to prospect.'
              : `${completedToday} done today · ${totalToday} remaining`}
          </p>
        </div>
        {xp && (
          <div className="text-right">
            <p className="text-ds-body font-semibold text-gunner-red">Lv.{xp.level}</p>
            <p className="text-ds-fine text-txt-muted">+{xp.weeklyXp} XP this week</p>
          </div>
        )}
      </div>

      {/* Row 1: Role-based KPI Cards (3 big cards) */}
      <RoleKpiCards
        userRole={userRole}
        milestones={milestones}
        calls={calls}
        properties={properties}
        tenantSlug={tenantSlug}
      />

      {/* Row 2: Pipeline Strip (7 compact pills) */}
      <PipelineStrip
        milestones={milestones}
        properties={properties}
        tenantSlug={tenantSlug}
      />

      {/* Overdue alert */}
      {visibleOverdueTasks.length > 0 && (
        <div className="bg-semantic-red-bg border-[0.5px] border-semantic-red/20 rounded-[14px] px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-semantic-red" />
            <h2 className="text-ds-label font-medium text-semantic-red">Overdue ({visibleOverdueTasks.length})</h2>
          </div>
          <div className="space-y-1">
            {visibleOverdueTasks.map(task => (
              <TaskRow key={task.id} task={task} tenantSlug={tenantSlug} onComplete={completeTask} completing={completing} isOverdue />
            ))}
          </div>
        </div>
      )}

      {/* Today's tasks by category */}
      {visibleTodayTasks.length > 0 ? (
        <div className="space-y-4">
          {Array.from(grouped.entries())
            .filter(([, tasks]) => tasks.length > 0)
            .map(([category, tasks]) => (
              <div key={category} className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-ds-label font-medium text-txt-primary">{category}</h2>
                  <span className="text-ds-fine text-txt-muted">{tasks.length}</span>
                </div>
                <div className="space-y-1">
                  {tasks.map(task => (
                    <TaskRow key={task.id} task={task} tenantSlug={tenantSlug} onComplete={completeTask} completing={completing} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : visibleOverdueTasks.length === 0 ? (
        <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-8 text-center">
          <CheckCircle2 size={24} className="text-semantic-green mx-auto mb-3" />
          <p className="text-ds-label font-medium text-txt-primary">All clear for today</p>
          <p className="text-ds-fine text-txt-secondary mt-1">No pending tasks. Check your calls or prospect new leads.</p>
          <div className="flex gap-4 justify-center mt-4">
            <Link href={`/${tenantSlug}/calls`} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark flex items-center gap-1">
              View calls <ChevronRight size={10} />
            </Link>
            <Link href={`/${tenantSlug}/inventory`} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark flex items-center gap-1">
              View inventory <ChevronRight size={10} />
            </Link>
          </div>
        </div>
      ) : null}

      {/* Tomorrow preview */}
      {tomorrowTasks.length > 0 && (
        <div className="bg-surface-secondary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-txt-muted" />
            <h2 className="text-ds-label font-medium text-txt-secondary">Tomorrow ({tomorrowTasks.length})</h2>
          </div>
          <div className="space-y-1">
            {tomorrowTasks.slice(0, 5).map(task => (
              <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded-[10px]">
                <Circle size={14} className="text-txt-muted shrink-0" />
                <span className="text-ds-body text-txt-secondary flex-1 truncate">{task.title}</span>
                {task.category && <span className="text-ds-fine text-txt-muted">{task.category}</span>}
              </div>
            ))}
            {tomorrowTasks.length > 5 && (
              <p className="text-ds-fine text-txt-muted pl-8">+{tomorrowTasks.length - 5} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task, tenantSlug, onComplete, completing, isOverdue,
}: {
  task: TaskEntry; tenantSlug: string
  onComplete: (id: string) => void; completing: string | null
  isOverdue?: boolean
}) {
  const priorityColors: Record<string, string> = {
    URGENT: 'bg-semantic-red-bg text-semantic-red',
    HIGH: 'bg-semantic-amber-bg text-semantic-amber',
    MEDIUM: 'bg-semantic-amber-bg text-semantic-amber',
    LOW: 'bg-surface-tertiary text-txt-secondary',
  }

  const dueTime = task.dueAt ? new Date(task.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-[10px] hover:bg-surface-secondary transition-colors group">
      <button
        onClick={() => onComplete(task.id)}
        disabled={completing === task.id}
        className="shrink-0"
      >
        {completing === task.id ? (
          <CheckCircle2 size={16} className="text-semantic-green animate-pulse" />
        ) : (
          <Circle size={16} className={`${isOverdue ? 'text-semantic-red' : 'text-txt-muted'} group-hover:text-gunner-red transition-colors`} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-ds-body truncate ${isOverdue ? 'text-semantic-red' : 'text-txt-primary'}`}>{task.title}</p>
        {task.property && (
          <Link href={`/${tenantSlug}/inventory/${task.property.id}`} className="text-ds-fine text-txt-muted hover:text-txt-secondary truncate block">
            {task.property.address}
          </Link>
        )}
      </div>
      {dueTime && (
        <span className="text-ds-fine text-txt-muted flex items-center gap-1 shrink-0">
          <Clock size={10} /> {dueTime}
        </span>
      )}
      <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full shrink-0 ${priorityColors[task.priority] ?? priorityColors.MEDIUM}`}>
        {task.priority.toLowerCase()}
      </span>
    </div>
  )
}

// ─── Role-Based KPI Cards (Row 1) ────────────────────────────────────────────
// Lead Manager: Calls Made, Convos, Apts Set
// Acq Manager:  Calls, Offers Made, Contracts
// Dispo Manager: Pushed, Offers Received, Contracted
// Admin/Owner:  All 3 acq cards (uses View As to see other roles)

interface CardDef {
  key: string
  label: string
  value: number
  icon: typeof Phone
  color: string
  bgColor: string
  milestoneType?: string // if set, clicking + logs this milestone
}

function getCardsForRole(
  role: UserRole,
  milestones: MilestoneCounts,
  calls: { calls: number; convos: number },
): CardDef[] {
  switch (role) {
    case 'LEAD_MANAGER':
      return [
        { key: 'calls', label: 'Calls Made', value: calls.calls, icon: Phone, color: 'text-blue-600', bgColor: 'bg-blue-50' },
        { key: 'convos', label: 'Convos', value: calls.convos, icon: MessageSquare, color: 'text-teal-600', bgColor: 'bg-teal-50' },
        { key: 'aptSet', label: 'Apts Set', value: milestones.aptSet, icon: Calendar, color: 'text-semantic-amber', bgColor: 'bg-semantic-amber-bg', milestoneType: 'APPOINTMENT_SET' },
      ]
    case 'DISPOSITION_MANAGER':
      return [
        { key: 'pushed', label: 'Pushed', value: milestones.pushed, icon: Send, color: 'text-blue-600', bgColor: 'bg-blue-50', milestoneType: 'DISPO_PUSHED' },
        { key: 'dispoOffer', label: 'Offers Received', value: milestones.dispoOffer, icon: FileText, color: 'text-purple-600', bgColor: 'bg-purple-50', milestoneType: 'DISPO_OFFER_RECEIVED' },
        { key: 'dispoContract', label: 'Contracted', value: milestones.dispoContract, icon: Handshake, color: 'text-semantic-green', bgColor: 'bg-semantic-green-bg', milestoneType: 'DISPO_CONTRACTED' },
      ]
    // ACQUISITION_MANAGER, TEAM_LEAD, ADMIN, OWNER
    default:
      return [
        { key: 'calls', label: 'Calls', value: calls.calls, icon: Phone, color: 'text-blue-600', bgColor: 'bg-blue-50' },
        { key: 'offer', label: 'Offers Made', value: milestones.offer, icon: FileText, color: 'text-purple-600', bgColor: 'bg-purple-50', milestoneType: 'OFFER_MADE' },
        { key: 'contract', label: 'Contracts', value: milestones.contract, icon: Handshake, color: 'text-semantic-green', bgColor: 'bg-semantic-green-bg', milestoneType: 'UNDER_CONTRACT' },
      ]
  }
}

function RoleKpiCards({ userRole, milestones, calls, properties, tenantSlug }: {
  userRole: UserRole
  milestones: MilestoneCounts
  calls: { calls: number; convos: number }
  properties: Array<{ id: string; label: string }>
  tenantSlug: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [, startTransition] = useTransition()
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formProperty, setFormProperty] = useState('')
  const [formNotes, setFormNotes] = useState('')

  const cards = getCardsForRole(userRole, milestones, calls)

  async function logMilestone(milestoneType: string) {
    if (!formProperty) {
      toast('Select a property first', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: formProperty,
          type: milestoneType,
          notes: formNotes || undefined,
        }),
      })
      if (res.ok) {
        toast('Milestone logged', 'success')
        setFormProperty('')
        setFormNotes('')
        setExpandedCard(null)
        startTransition(() => router.refresh())
      } else {
        toast('Failed to log milestone', 'error')
      }
    } catch {
      toast('Failed to log milestone', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target size={14} className="text-gunner-red" />
        <h2 className="text-ds-label font-medium text-txt-primary">My KPIs</h2>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((card) => {
          const isExpanded = expandedCard === card.key
          const Icon = card.icon
          const canLog = !!card.milestoneType
          return (
            <div key={card.key} className="space-y-2">
              <div className={`${card.bgColor} border-[0.5px] border-[var(--border-light)] rounded-[12px] px-4 py-3 transition-all hover:shadow-ds-float`}>
                <div className="flex items-center justify-between mb-1">
                  <Icon size={14} className={card.color} />
                  {canLog && (
                    <button
                      onClick={() => { setExpandedCard(isExpanded ? null : card.key); setFormProperty(''); setFormNotes('') }}
                      className="text-txt-muted hover:text-gunner-red"
                    >
                      {isExpanded ? <X size={12} /> : <Plus size={12} />}
                    </button>
                  )}
                </div>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                <p className="text-ds-fine text-txt-muted">{card.label}</p>
              </div>
              {/* Entry form */}
              {isExpanded && card.milestoneType && (
                <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[10px] px-3 py-2 space-y-1.5">
                  <p className="text-[9px] font-semibold text-txt-secondary">Log {card.label}</p>
                  <select
                    value={formProperty}
                    onChange={e => setFormProperty(e.target.value)}
                    className="w-full text-[10px] px-2 py-1.5 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                  >
                    <option value="">Select property...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full text-[10px] px-2 py-1.5 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                    onKeyDown={e => { if (e.key === 'Enter') logMilestone(card.milestoneType!) }}
                  />
                  <button
                    onClick={() => logMilestone(card.milestoneType!)}
                    disabled={saving || !formProperty}
                    className="w-full text-[10px] font-medium text-white bg-gunner-red hover:bg-gunner-red-dark px-3 py-1.5 rounded disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : `Log ${card.label}`}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Pipeline Strip (Row 2) ──────────────────────────────────────────────────
// 7 compact pills: Lead | Apt Set | Offer | Contract | Pushed | Dispo Offers | Dispo Contracted
// Each shows today's count, clickable to expand and log

const PIPELINE_PILLS = [
  { key: 'lead', label: 'Lead', milestoneType: 'LEAD', countKey: 'lead' as const },
  { key: 'aptSet', label: 'Apt Set', milestoneType: 'APPOINTMENT_SET', countKey: 'aptSet' as const },
  { key: 'offer', label: 'Offer', milestoneType: 'OFFER_MADE', countKey: 'offer' as const },
  { key: 'contract', label: 'Contract', milestoneType: 'UNDER_CONTRACT', countKey: 'contract' as const },
  { key: 'pushed', label: 'Pushed', milestoneType: 'DISPO_PUSHED', countKey: 'pushed' as const },
  { key: 'dispoOffer', label: 'Dispo Offers', milestoneType: 'DISPO_OFFER_RECEIVED', countKey: 'dispoOffer' as const },
  { key: 'dispoContract', label: 'Dispo Contract', milestoneType: 'DISPO_CONTRACTED', countKey: 'dispoContract' as const },
]

function PipelineStrip({ milestones, properties, tenantSlug }: {
  milestones: MilestoneCounts
  properties: Array<{ id: string; label: string }>
  tenantSlug: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [, startTransition] = useTransition()
  const [expandedPill, setExpandedPill] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formProperty, setFormProperty] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formDate, setFormDate] = useState('')

  async function logMilestone(milestoneType: string) {
    if (!formProperty) {
      toast('Select a property first', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: formProperty,
          type: milestoneType,
          notes: formNotes || undefined,
          date: formDate || undefined,
        }),
      })
      if (res.ok) {
        toast('Milestone logged', 'success')
        setFormProperty('')
        setFormNotes('')
        setFormDate('')
        setExpandedPill(null)
        startTransition(() => router.refresh())
      } else {
        toast('Failed to log milestone', 'error')
      }
    } catch {
      toast('Failed to log milestone', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-2">
      <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Pipeline Activity — Today</p>
      <div className="flex gap-1.5 flex-wrap">
        {PIPELINE_PILLS.map((pill) => {
          const count = milestones[pill.countKey]
          const isExpanded = expandedPill === pill.key
          const isAcq = ['lead', 'aptSet', 'offer', 'contract'].includes(pill.key)
          return (
            <div key={pill.key} className="relative">
              <button
                onClick={() => { setExpandedPill(isExpanded ? null : pill.key); setFormProperty(''); setFormNotes(''); setFormDate('') }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border-[0.5px] transition-all hover:shadow-sm ${
                  count > 0
                    ? isAcq
                      ? 'bg-gunner-red/10 border-gunner-red/20 text-gunner-red'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-surface-secondary border-[var(--border-light)] text-txt-muted hover:border-[var(--border-medium)]'
                } ${isExpanded ? 'ring-1 ring-gunner-red/30' : ''}`}
              >
                <span className={`font-bold ${count > 0 ? '' : 'text-txt-muted'}`}>{count}</span>
                <span>{pill.label}</span>
              </button>
              {/* Expanded entry form */}
              {isExpanded && (
                <div className="absolute top-full left-0 mt-1 z-20 w-56 bg-surface-primary border-[0.5px] border-[var(--border-medium)] rounded-[10px] px-3 py-2 space-y-1.5 shadow-ds-float">
                  <p className="text-[9px] font-semibold text-txt-secondary">Log {pill.label}</p>
                  <select
                    value={formProperty}
                    onChange={e => setFormProperty(e.target.value)}
                    className="w-full text-[10px] px-2 py-1.5 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                  >
                    <option value="">Select property...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full text-[10px] px-2 py-1.5 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                  />
                  <input
                    type="text"
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full text-[10px] px-2 py-1.5 rounded border border-[rgba(0,0,0,0.1)] bg-white"
                    onKeyDown={e => { if (e.key === 'Enter') logMilestone(pill.milestoneType) }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => logMilestone(pill.milestoneType)}
                      disabled={saving || !formProperty}
                      className="flex-1 text-[10px] font-medium text-white bg-gunner-red hover:bg-gunner-red-dark px-3 py-1.5 rounded disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Log'}
                    </button>
                    <button
                      onClick={() => setExpandedPill(null)}
                      className="text-[10px] text-txt-muted hover:text-txt-primary px-2 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
