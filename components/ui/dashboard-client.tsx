'use client'
// components/ui/dashboard-client.tsx

import Link from 'next/link'
import { Phone, CheckSquare, Building2, TrendingUp, ArrowUpRight, Clock, Star } from 'lucide-react'

interface DashboardData {
  userName: string
  role: string
  kpis: { callsToday: number; avgScore: number; tasksCompleted: number; propertiesActive: number }
  recentCalls: CallSummary[]
  todayTasks: TaskSummary[]
  recentProperties: PropertySummary[]
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Phone size={16} />}
          label="Calls today"
          value={String(data.kpis.callsToday)}
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

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
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
