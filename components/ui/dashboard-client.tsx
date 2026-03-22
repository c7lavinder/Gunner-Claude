'use client'
// components/ui/dashboard-client.tsx

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Phone, CheckSquare, Building2, TrendingUp, ArrowUpRight, Clock, Star, Zap, Target, Trophy, Award, CalendarCheck, FileSignature, Handshake } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useToast } from '@/components/ui/toaster'

interface DashboardData {
  userName: string
  role: string
  kpis: {
    callsToday: number; callsWeek: number; callsMonth: number
    avgScore: number; tasksCompleted: number; propertiesActive: number
  }
  scoreTrend: ScoreTrendPoint[]
  activeProperties: Array<{ id: string; address: string; city: string; state: string }>
  leaderboard: LeaderboardEntry[]
  userBadges: EarnedBadge[]
  priorityLeads: PriorityLead[]
  recentCalls: CallSummary[]
  todayTasks: TaskSummary[]
  recentProperties: PropertySummary[]
}

interface ScoreTrendPoint {
  date: string; avgScore: number; count: number
}
interface LeaderboardEntry {
  rank: number; userId: string; name: string; role: string
  totalXp: number; weeklyXp: number; level: number
}
interface EarnedBadge {
  type: string; name: string; description: string; earned: boolean; earnedAt: string | null
}
interface PriorityLead {
  id: string; address: string; city: string; state: string; status: string
  tcpScore: number | null; sellerName: string; callCount: number; buySignal: boolean
}
interface CallSummary {
  id: string; score: number | null; summary: string | null
  assignedTo: string; property: string; ago: string; direction: string
}
interface TaskSummary {
  id: string; title: string; category: string | null
  priority: string; status: string; dueAt: string | null
}
interface PropertySummary {
  id: string; address: string; city: string; state: string
  status: string; sellerName: string; arv: string | null; askingPrice: string | null
}

export function DashboardClient({ data, tenantSlug }: { data: DashboardData; tenantSlug: string }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-ds-page font-semibold text-txt-primary">
          {greeting}, {data.userName.split(' ')[0]}
        </h1>
        <p className="text-ds-body text-txt-secondary mt-1">Here&#39;s your command center for today</p>
      </div>

      {/* Daily entry widget */}
      {data.activeProperties.length > 0 && (
        <DailyEntryWidget activeProperties={data.activeProperties} />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Phone size={16} />}
          label="Calls today"
          value={String(data.kpis.callsToday)}
          sub={`${data.kpis.callsWeek} this week / ${data.kpis.callsMonth} this month`}
          semantic="red"
        />
        <KpiCard
          icon={<Star size={16} />}
          label="Avg call score"
          value={`${data.kpis.avgScore}%`}
          semantic={data.kpis.avgScore >= 70 ? 'green' : data.kpis.avgScore >= 50 ? 'amber' : 'red'}
        />
        <KpiCard
          icon={<CheckSquare size={16} />}
          label="Tasks done today"
          value={String(data.kpis.tasksCompleted)}
          semantic="blue"
        />
        <KpiCard
          icon={<Building2 size={16} />}
          label="Active properties"
          value={String(data.kpis.propertiesActive)}
          semantic="purple"
        />
      </div>

      {/* Score trend + Priority leads */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Score trend chart -- last 7 days */}
        <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
          <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-semantic-green" />
            Call score trend -- last 7 days
          </h2>
          {data.scoreTrend.some(d => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.scoreTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="date" tick={{ fill: '#9B9A94', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#9B9A94', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#FFFFFF', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 14, fontSize: 13 }}
                  labelStyle={{ color: '#6B6B66' }}
                  formatter={(value: number) => [`${value}%`, 'Avg score']}
                />
                <Bar dataKey="avgScore" radius={[6, 6, 0, 0]} maxBarSize={32}>
                  {data.scoreTrend.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.avgScore >= 70 ? '#1D9E75' : entry.avgScore >= 50 ? '#BA7517' : entry.avgScore > 0 ? '#A32D2D' : '#F0EEE9'}
                      fillOpacity={entry.count > 0 ? 0.85 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={<TrendingUp size={20} />} message="Score trend will appear once calls are graded this week" />
          )}
        </div>

        {/* Priority leads -- TCP ranking */}
        <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2">
              <Target size={14} className="text-gunner-red" />
              Priority leads
            </h2>
            <Link href={`/${tenantSlug}/inventory`} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark flex items-center gap-1">
              All <ArrowUpRight size={11} />
            </Link>
          </div>
          {data.priorityLeads.length === 0 ? (
            <EmptyState icon={<Target size={20} />} message="Priority leads appear when properties have TCP scores calculated" />
          ) : (
            <div className="space-y-1">
              {data.priorityLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/${tenantSlug}/inventory/${lead.id}`}
                  className="flex items-center gap-3 p-3 rounded-[10px] hover:bg-surface-secondary transition-colors"
                >
                  <ScoreCircle score={Math.round((lead.tcpScore ?? 0) * 100)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-ds-body text-txt-primary truncate">{lead.address}</p>
                      {lead.buySignal && (
                        <span className="flex items-center gap-0.5 text-ds-fine font-medium px-2 py-0.5 rounded-full bg-semantic-amber-bg text-semantic-amber shrink-0">
                          <Zap size={10} /> Buy signal
                        </span>
                      )}
                    </div>
                    <p className="text-ds-fine text-txt-muted">{lead.sellerName} -- {lead.callCount} calls</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard + Badges */}
      {(data.leaderboard.length > 0 || data.userBadges.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Leaderboard */}
          <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2 mb-4">
              <Trophy size={14} className="text-semantic-amber" />
              Leaderboard
            </h2>
            {data.leaderboard.length === 0 ? (
              <EmptyState icon={<Trophy size={20} />} message="XP leaderboard appears once calls are graded" />
            ) : (
              <div className="space-y-1">
                {data.leaderboard.slice(0, 8).map((entry) => (
                  <div key={entry.userId} className="flex items-center gap-3 px-3 py-2 rounded-[10px] hover:bg-surface-secondary transition-colors">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-ds-fine font-semibold shrink-0 ${
                      entry.rank === 1 ? 'bg-semantic-amber-bg text-semantic-amber' :
                      entry.rank === 2 ? 'bg-surface-tertiary text-txt-secondary' :
                      entry.rank === 3 ? 'bg-semantic-amber-bg text-semantic-amber' :
                      'bg-surface-secondary text-txt-muted'
                    }`}>
                      {entry.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ds-body text-txt-primary truncate">{entry.name}</p>
                      <p className="text-ds-fine text-txt-muted">Lv.{entry.level}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-ds-body font-semibold text-gunner-red">{entry.totalXp.toLocaleString()}</p>
                      <p className="text-ds-fine text-txt-muted">+{entry.weeklyXp} this week</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2 mb-4">
              <Award size={14} className="text-semantic-purple" />
              Your badges
            </h2>
            {data.userBadges.length === 0 ? (
              <EmptyState icon={<Award size={20} />} message="Earn badges by grading calls, closing deals, and hitting streaks" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {data.userBadges.map((badge) => (
                  <div
                    key={badge.type}
                    className="flex items-center gap-3 bg-surface-secondary border-[0.5px] border-[var(--border-light)] rounded-[14px] p-3"
                  >
                    <div className="w-8 h-8 rounded-[6px] bg-semantic-purple-bg flex items-center justify-center shrink-0">
                      <Award size={14} className="text-semantic-purple" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-ds-fine font-medium text-txt-primary truncate">{badge.name}</p>
                      <p className="text-ds-fine text-txt-muted truncate">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent call scores */}
        <div className="lg:col-span-2 bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2">
              <Phone size={14} className="text-gunner-red" />
              Recent graded calls
            </h2>
            <Link href={`/${tenantSlug}/calls`} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark flex items-center gap-1">
              View all <ArrowUpRight size={11} />
            </Link>
          </div>

          {data.recentCalls.length === 0 ? (
            <EmptyState icon={<Phone size={20} />} message="No graded calls yet -- calls grade automatically when they end" />
          ) : (
            <div className="space-y-1">
              {data.recentCalls.map((call) => (
                <CallRow key={call.id} call={call} tenantSlug={tenantSlug} />
              ))}
            </div>
          )}
        </div>

        {/* Today's tasks */}
        <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2">
              <CheckSquare size={14} className="text-semantic-blue" />
              Today&#39;s tasks
            </h2>
            <Link href={`/${tenantSlug}/tasks`} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark flex items-center gap-1">
              All <ArrowUpRight size={11} />
            </Link>
          </div>

          {data.todayTasks.length === 0 ? (
            <EmptyState icon={<CheckSquare size={20} />} message="No tasks due today" />
          ) : (
            <div className="space-y-1">
              {data.todayTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent properties */}
      <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2">
            <Building2 size={14} className="text-semantic-purple" />
            Recent properties
          </h2>
          <Link href={`/${tenantSlug}/inventory`} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark flex items-center gap-1">
            View inventory <ArrowUpRight size={11} />
          </Link>
        </div>

        {data.recentProperties.length === 0 ? (
          <EmptyState icon={<Building2 size={20} />} message="Properties appear here when contacts enter your trigger pipeline stage in GHL" />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.recentProperties.map((p) => (
              <PropertyCard key={p.id} property={p} tenantSlug={tenantSlug} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Sub-components ---

function KpiCard({ icon, label, value, sub, semantic }: { icon: React.ReactNode; label: string; value: string; sub?: string; semantic: string }) {
  const iconStyles: Record<string, string> = {
    red: 'text-gunner-red bg-gunner-red-light',
    green: 'text-semantic-green bg-semantic-green-bg',
    amber: 'text-semantic-amber bg-semantic-amber-bg',
    blue: 'text-semantic-blue bg-semantic-blue-bg',
    purple: 'text-semantic-purple bg-semantic-purple-bg',
  }
  const cls = iconStyles[semantic] ?? iconStyles.red

  return (
    <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-3 py-3 sm:px-5 sm:py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[var(--border-medium)]">
      <div className={`w-8 h-8 rounded-[6px] flex items-center justify-center mb-3 ${cls}`}>
        {icon}
      </div>
      <p className="text-ds-hero font-semibold text-txt-primary">{value}</p>
      <p className="text-ds-fine text-txt-secondary mt-1">{label}</p>
      {sub && <p className="text-ds-fine text-txt-muted mt-0.5 hidden sm:block">{sub}</p>}
    </div>
  )
}

function ScoreCircle({ score }: { score: number }) {
  const bg =
    score >= 90 ? 'bg-semantic-green' :
    score >= 80 ? 'bg-semantic-amber' :
    score >= 70 ? 'bg-semantic-blue' :
    'bg-semantic-red'

  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-ds-body font-semibold text-white shrink-0 ${bg}`}>
      {score}
    </div>
  )
}

function CallRow({ call, tenantSlug }: { call: CallSummary; tenantSlug: string }) {
  const score = call.score ?? 0

  return (
    <Link href={`/${tenantSlug}/calls/${call.id}`} className="flex items-center gap-3 p-3 rounded-[10px] hover:bg-surface-secondary transition-colors">
      <ScoreCircle score={score} />
      <div className="flex-1 min-w-0">
        <p className="text-ds-body text-txt-primary truncate">{call.property}</p>
        <p className="text-ds-fine text-txt-secondary truncate">{call.summary ?? 'Graded call'}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-ds-fine text-txt-muted">{call.ago}</p>
      </div>
    </Link>
  )
}

function TaskRow({ task }: { task: TaskSummary }) {
  const priorityColors: Record<string, string> = {
    URGENT: 'bg-semantic-red-bg text-semantic-red',
    HIGH: 'bg-semantic-amber-bg text-semantic-amber',
    MEDIUM: 'bg-semantic-amber-bg text-semantic-amber',
    LOW: 'bg-surface-tertiary text-txt-secondary',
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-[10px] hover:bg-surface-secondary transition-colors">
      <div className="w-4 h-4 rounded-[4px] border-[0.5px] border-[var(--border-medium)] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-ds-body text-txt-primary truncate">{task.title}</p>
        {task.category && <p className="text-ds-fine text-txt-muted">{task.category}</p>}
      </div>
      <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full shrink-0 ${priorityColors[task.priority] ?? priorityColors.MEDIUM}`}>
        {task.priority.toLowerCase()}
      </span>
    </div>
  )
}

function PropertyCard({ property, tenantSlug }: { property: PropertySummary; tenantSlug: string }) {
  const statusColors: Record<string, string> = {
    NEW_LEAD: 'bg-semantic-blue-bg text-semantic-blue',
    CONTACTED: 'bg-semantic-amber-bg text-semantic-amber',
    APPOINTMENT_SET: 'bg-semantic-amber-bg text-semantic-amber',
    UNDER_CONTRACT: 'bg-semantic-green-bg text-semantic-green',
    IN_DISPOSITION: 'bg-semantic-purple-bg text-semantic-purple',
    SOLD: 'bg-semantic-green-bg text-semantic-green',
    DEAD: 'bg-surface-tertiary text-txt-secondary',
  }

  return (
    <Link href={`/${tenantSlug}/inventory/${property.id}`} className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] p-4 hover:shadow-ds-float hover:border-[var(--border-medium)] transition-all duration-150">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-ds-label font-medium text-txt-primary truncate">{property.address}</p>
        <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full shrink-0 ${statusColors[property.status] ?? 'bg-surface-tertiary text-txt-secondary'}`}>
          {property.status.replace(/_/g, ' ').toLowerCase()}
        </span>
      </div>
      <p className="text-ds-fine text-txt-muted">{property.city}, {property.state}</p>
      <p className="text-ds-fine text-txt-muted mt-1">Seller: {property.sellerName}</p>
      {property.askingPrice && (
        <p className="text-ds-label font-semibold text-gunner-red mt-2">
          ${Number(property.askingPrice).toLocaleString()}
        </p>
      )}
    </Link>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-txt-muted mb-3">{icon}</div>
      <p className="text-ds-fine text-txt-muted max-w-48">{message}</p>
    </div>
  )
}

// --- Daily Entry Widget ---

const MILESTONE_BUTTONS = [
  { type: 'APPOINTMENT_SET', label: 'Appointment Set', icon: CalendarCheck, semantic: 'blue' },
  { type: 'OFFER_MADE', label: 'Offer Made', icon: FileSignature, semantic: 'amber' },
  { type: 'UNDER_CONTRACT', label: 'Under Contract', icon: Handshake, semantic: 'green' },
] as const

function DailyEntryWidget({ activeProperties }: {
  activeProperties: Array<{ id: string; address: string; city: string; state: string }>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { toast } = useToast()
  const [activeType, setActiveType] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const colorMap: Record<string, string> = {
    blue: 'bg-semantic-blue-bg text-semantic-blue hover:border-semantic-blue border-[0.5px] border-[var(--border-light)]',
    amber: 'bg-semantic-amber-bg text-semantic-amber hover:border-semantic-amber border-[0.5px] border-[var(--border-light)]',
    green: 'bg-semantic-green-bg text-semantic-green hover:border-semantic-green border-[0.5px] border-[var(--border-light)]',
  }

  const activeColorMap: Record<string, string> = {
    blue: 'bg-semantic-blue text-white border-[0.5px] border-semantic-blue',
    amber: 'bg-semantic-amber text-white border-[0.5px] border-semantic-amber',
    green: 'bg-semantic-green text-white border-[0.5px] border-semantic-green',
  }

  async function submit() {
    if (!selectedProperty || !activeType) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: selectedProperty, type: activeType, notes: notes || undefined }),
      })
      if (res.ok) {
        const label = MILESTONE_BUTTONS.find(b => b.type === activeType)?.label ?? 'Milestone'
        toast(`${label} logged!`, 'success')
        setActiveType(null)
        setSelectedProperty('')
        setNotes('')
        startTransition(() => router.refresh())
      } else {
        toast('Failed to log milestone', 'error')
      }
    } catch {
      toast('Failed to log milestone', 'error')
    }
    setSubmitting(false)
  }

  return (
    <div className="bg-surface-primary border-[0.5px] border-[var(--border-light)] rounded-[14px] px-5 py-4">
      <p className="text-ds-fine text-txt-muted uppercase tracking-wider mb-3">Log today&#39;s activity</p>
      <div className="flex gap-2 flex-wrap">
        {MILESTONE_BUTTONS.map(btn => {
          const isActive = activeType === btn.type
          const Icon = btn.icon
          return (
            <button
              key={btn.type}
              onClick={() => setActiveType(isActive ? null : btn.type)}
              className={`flex items-center gap-1.5 text-ds-body font-medium px-4 py-2 rounded-[10px] transition-all duration-150 ${
                isActive ? activeColorMap[btn.semantic] : colorMap[btn.semantic]
              }`}
            >
              <Icon size={14} /> {btn.label}
            </button>
          )
        })}
      </div>

      {activeType && (
        <div className="mt-4 pt-4 border-t border-[var(--border-light)] flex flex-col gap-3">
          <select
            value={selectedProperty}
            onChange={e => setSelectedProperty(e.target.value)}
            className="bg-surface-secondary border-[0.5px] border-[var(--border-medium)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none focus:border-gunner-red"
          >
            <option value="">Select property...</option>
            {activeProperties.map(p => (
              <option key={p.id} value={p.id}>{p.address}, {p.city} {p.state}</option>
            ))}
          </select>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="bg-surface-secondary border-[0.5px] border-[var(--border-medium)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!selectedProperty || submitting}
              className="bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-4 py-2 rounded-[10px] transition-colors"
            >
              {submitting ? 'Logging...' : 'Submit'}
            </button>
            <button
              onClick={() => { setActiveType(null); setSelectedProperty(''); setNotes('') }}
              className="text-txt-secondary hover:text-txt-primary text-ds-body px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
