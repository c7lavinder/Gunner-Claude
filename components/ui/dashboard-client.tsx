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
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">
          {greeting}, {data.userName.split(' ')[0]}
        </h1>
        <p className="text-gray-400 text-sm mt-1">Here's your command center for today</p>
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
          color="orange"
        />
        <KpiCard
          icon={<Star size={16} />}
          label="Avg call score"
          value={`${data.kpis.avgScore}%`}
          color={data.kpis.avgScore >= 70 ? 'green' : data.kpis.avgScore >= 50 ? 'yellow' : 'red'}
        />
        <KpiCard
          icon={<CheckSquare size={16} />}
          label="Tasks done today"
          value={String(data.kpis.tasksCompleted)}
          color="blue"
        />
        <KpiCard
          icon={<Building2 size={16} />}
          label="Active properties"
          value={String(data.kpis.propertiesActive)}
          color="purple"
        />
      </div>

      {/* Score trend + Priority leads */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Score trend chart — last 7 days */}
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-green-400" />
            Call score trend — last 7 days
          </h2>
          {data.scoreTrend.some(d => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.scoreTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value: number) => [`${value}%`, 'Avg score']}
                />
                <Bar dataKey="avgScore" radius={[6, 6, 0, 0]} maxBarSize={32}>
                  {data.scoreTrend.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.avgScore >= 70 ? '#22c55e' : entry.avgScore >= 50 ? '#eab308' : entry.avgScore > 0 ? '#ef4444' : '#374151'}
                      fillOpacity={entry.count > 0 ? 0.8 : 0.2}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={<TrendingUp size={20} />} message="Score trend will appear once calls are graded this week" />
          )}
        </div>

        {/* Priority leads — TCP ranking */}
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <Target size={14} className="text-orange-400" />
              Priority leads
            </h2>
            <Link href={`/${tenantSlug}/inventory`} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
              All <ArrowUpRight size={11} />
            </Link>
          </div>
          {data.priorityLeads.length === 0 ? (
            <EmptyState icon={<Target size={20} />} message="Priority leads appear when properties have TCP scores calculated" />
          ) : (
            <div className="space-y-2">
              {data.priorityLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/${tenantSlug}/inventory/${lead.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-semibold shrink-0 bg-orange-500/10 text-orange-400">
                    {Math.round((lead.tcpScore ?? 0) * 100)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white truncate">{lead.address}</p>
                      {lead.buySignal && (
                        <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 shrink-0">
                          <Zap size={10} /> Buy signal
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{lead.sellerName} — {lead.callCount} calls</p>
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
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
              <Trophy size={14} className="text-yellow-400" />
              Leaderboard
            </h2>
            {data.leaderboard.length === 0 ? (
              <EmptyState icon={<Trophy size={20} />} message="XP leaderboard appears once calls are graded" />
            ) : (
              <div className="space-y-1.5">
                {data.leaderboard.slice(0, 8).map((entry) => (
                  <div key={entry.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      entry.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                      entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                      entry.rank === 3 ? 'bg-orange-700/20 text-orange-400' :
                      'bg-white/5 text-gray-500'
                    }`}>
                      {entry.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{entry.name}</p>
                      <p className="text-xs text-gray-600">Lv.{entry.level}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-orange-400">{entry.totalXp.toLocaleString()}</p>
                      <p className="text-xs text-gray-600">+{entry.weeklyXp} this week</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
              <Award size={14} className="text-purple-400" />
              Your badges
            </h2>
            {data.userBadges.length === 0 ? (
              <EmptyState icon={<Award size={20} />} message="Earn badges by grading calls, closing deals, and hitting streaks" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {data.userBadges.map((badge) => (
                  <div
                    key={badge.type}
                    className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                      <Award size={14} className="text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{badge.name}</p>
                      <p className="text-xs text-gray-600 truncate">{badge.description}</p>
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
        <div className="lg:col-span-2 bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <Phone size={14} className="text-orange-500" />
              Recent graded calls
            </h2>
            <Link href={`/${tenantSlug}/calls`} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
              View all <ArrowUpRight size={11} />
            </Link>
          </div>

          {data.recentCalls.length === 0 ? (
            <EmptyState icon={<Phone size={20} />} message="No graded calls yet — calls grade automatically when they end" />
          ) : (
            <div className="space-y-2">
              {data.recentCalls.map((call) => (
                <CallRow key={call.id} call={call} tenantSlug={tenantSlug} />
              ))}
            </div>
          )}
        </div>

        {/* Today's tasks */}
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <CheckSquare size={14} className="text-blue-400" />
              Today's tasks
            </h2>
            <Link href={`/${tenantSlug}/tasks`} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
              All <ArrowUpRight size={11} />
            </Link>
          </div>

          {data.todayTasks.length === 0 ? (
            <EmptyState icon={<CheckSquare size={20} />} message="No tasks due today" />
          ) : (
            <div className="space-y-2">
              {data.todayTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent properties */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white flex items-center gap-2">
            <Building2 size={14} className="text-purple-400" />
            Recent properties
          </h2>
          <Link href={`/${tenantSlug}/inventory`} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    orange: 'text-orange-400 bg-orange-500/10',
    green: 'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    red: 'text-red-400 bg-red-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  }
  const cls = colors[color] ?? colors.orange

  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${cls}`}>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function CallRow({ call, tenantSlug }: { call: CallSummary; tenantSlug: string }) {
  const score = call.score ?? 0
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const scoreBg = score >= 80 ? 'bg-green-500/10' : score >= 60 ? 'bg-yellow-500/10' : 'bg-red-500/10'

  return (
    <Link href={`/${tenantSlug}/calls/${call.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0 ${scoreBg} ${scoreColor}`}>
        {score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{call.property}</p>
        <p className="text-xs text-gray-500 truncate">{call.summary ?? 'Graded call'}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-500">{call.ago}</p>
      </div>
    </Link>
  )
}

function TaskRow({ task }: { task: TaskSummary }) {
  const priorityColors: Record<string, string> = {
    URGENT: 'bg-red-500/20 text-red-400',
    HIGH: 'bg-orange-500/20 text-orange-400',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400',
    LOW: 'bg-gray-500/20 text-gray-400',
  }

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
      <div className="w-4 h-4 rounded border border-white/20 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{task.title}</p>
        {task.category && <p className="text-xs text-gray-500">{task.category}</p>}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${priorityColors[task.priority] ?? priorityColors.MEDIUM}`}>
        {task.priority.toLowerCase()}
      </span>
    </div>
  )
}

function PropertyCard({ property, tenantSlug }: { property: PropertySummary; tenantSlug: string }) {
  const statusColors: Record<string, string> = {
    NEW_LEAD: 'bg-blue-500/15 text-blue-400',
    CONTACTED: 'bg-yellow-500/15 text-yellow-400',
    APPOINTMENT_SET: 'bg-orange-500/15 text-orange-400',
    UNDER_CONTRACT: 'bg-green-500/15 text-green-400',
    IN_DISPOSITION: 'bg-purple-500/15 text-purple-400',
    SOLD: 'bg-teal-500/15 text-teal-400',
    DEAD: 'bg-gray-500/15 text-gray-400',
  }

  return (
    <Link href={`/${tenantSlug}/inventory/${property.id}`} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-white truncate">{property.address}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusColors[property.status] ?? 'bg-gray-500/15 text-gray-400'}`}>
          {property.status.replace(/_/g, ' ').toLowerCase()}
        </span>
      </div>
      <p className="text-xs text-gray-500">{property.city}, {property.state}</p>
      <p className="text-xs text-gray-500 mt-1">Seller: {property.sellerName}</p>
      {property.askingPrice && (
        <p className="text-sm font-medium text-orange-400 mt-2">
          ${Number(property.askingPrice).toLocaleString()}
        </p>
      )}
    </Link>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-gray-600 mb-3">{icon}</div>
      <p className="text-xs text-gray-500 max-w-48">{message}</p>
    </div>
  )
}

// ─── Daily Entry Widget ────────────────────────────────────────────────────

const MILESTONE_BUTTONS = [
  { type: 'APPOINTMENT_SET', label: 'Appointment Set', icon: CalendarCheck, color: 'blue' },
  { type: 'OFFER_MADE', label: 'Offer Made', icon: FileSignature, color: 'orange' },
  { type: 'UNDER_CONTRACT', label: 'Under Contract', icon: Handshake, color: 'green' },
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
    blue: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20',
    orange: 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/20',
    green: 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20',
  }

  const activeColorMap: Record<string, string> = {
    blue: 'bg-blue-500 text-white border-blue-500',
    orange: 'bg-orange-500 text-white border-orange-500',
    green: 'bg-green-500 text-white border-green-500',
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
    <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Log today's activity</p>
      <div className="flex gap-2 flex-wrap">
        {MILESTONE_BUTTONS.map(btn => {
          const isActive = activeType === btn.type
          const Icon = btn.icon
          return (
            <button
              key={btn.type}
              onClick={() => setActiveType(isActive ? null : btn.type)}
              className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                isActive ? activeColorMap[btn.color] : colorMap[btn.color]
              }`}
            >
              <Icon size={14} /> {btn.label}
            </button>
          )
        })}
      </div>

      {activeType && (
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3">
          <select
            value={selectedProperty}
            onChange={e => setSelectedProperty(e.target.value)}
            className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
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
            className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!selectedProperty || submitting}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {submitting ? 'Logging...' : 'Submit'}
            </button>
            <button
              onClick={() => { setActiveType(null); setSelectedProperty(''); setNotes('') }}
              className="text-gray-400 hover:text-white text-sm px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
