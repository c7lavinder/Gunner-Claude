'use client'
// components/kpis/kpis-client.tsx

import { useState } from 'react'
import { Phone, Star, Calendar, FileSignature, Building2, CheckSquare, TrendingUp } from 'lucide-react'
import type { UserRole } from '@/types/roles'

type Period = 'today' | 'week' | 'month'

interface Metrics {
  calls: { today: number; week: number; month: number }
  avgScore: { today: number; week: number; month: number }
  appointments: { today: number; week: number; month: number }
  contracts: { month: number }
  properties: { active: number; newThisMonth: number; soldThisMonth: number }
  tasks: { completedToday: number; open: number }
}

export function KpisClient({ metrics, role, userName }: {
  metrics: Metrics
  role: UserRole
  userName: string
}) {
  const [period, setPeriod] = useState<Period>('week')

  const score = metrics.avgScore[period]
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const scoreBg = score >= 80 ? 'bg-green-500/10' : score >= 60 ? 'bg-yellow-500/10' : 'bg-red-500/10'

  const kpiCards = [
    {
      icon: <Phone size={16} />,
      label: 'Calls made',
      value: metrics.calls[period],
      color: 'orange',
      show: true,
    },
    {
      icon: <Star size={16} />,
      label: 'Avg call score',
      value: `${score}%`,
      color: score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red',
      show: true,
      note: score > 0 ? (score >= 80 ? 'Strong' : score >= 60 ? 'Room to grow' : 'Needs focus') : 'No graded calls',
    },
    {
      icon: <Calendar size={16} />,
      label: 'Appointments set',
      value: metrics.appointments[period],
      color: 'blue',
      show: ['LEAD_MANAGER', 'ACQUISITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
    },
    {
      icon: <FileSignature size={16} />,
      label: 'Contracts signed',
      value: metrics.contracts.month,
      color: 'green',
      show: ['ACQUISITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
      note: 'This month',
    },
    {
      icon: <Building2 size={16} />,
      label: 'Active properties',
      value: metrics.properties.active,
      color: 'purple',
      show: ['DISPOSITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
    },
    {
      icon: <TrendingUp size={16} />,
      label: 'Deals closed',
      value: metrics.properties.soldThisMonth,
      color: 'teal',
      show: ['DISPOSITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
      note: 'This month',
    },
    {
      icon: <CheckSquare size={16} />,
      label: 'Tasks completed',
      value: metrics.tasks.completedToday,
      color: 'blue',
      show: true,
      note: 'Today',
    },
  ].filter((k) => k.show)

  const colorMap: Record<string, { icon: string; card: string }> = {
    orange: { icon: 'text-orange-400', card: 'bg-orange-500/10' },
    green: { icon: 'text-green-400', card: 'bg-green-500/10' },
    yellow: { icon: 'text-yellow-400', card: 'bg-yellow-500/10' },
    red: { icon: 'text-red-400', card: 'bg-red-500/10' },
    blue: { icon: 'text-blue-400', card: 'bg-blue-500/10' },
    purple: { icon: 'text-purple-400', card: 'bg-purple-500/10' },
    teal: { icon: 'text-teal-400', card: 'bg-teal-500/10' },
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">KPIs</h1>
          <p className="text-sm text-gray-400 mt-0.5">{userName.split(' ')[0]}'s performance metrics</p>
        </div>

        {/* Period toggle */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => {
          const colors = colorMap[card.color] ?? colorMap.orange
          return (
            <div key={i} className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${colors.card}`}>
                <span className={colors.icon}>{card.icon}</span>
              </div>
              <p className="text-2xl font-semibold text-white">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.label}</p>
              {card.note && <p className="text-xs text-gray-600 mt-0.5">{card.note}</p>}
            </div>
          )
        })}
      </div>

      {/* Call score breakdown */}
      {metrics.avgScore.month > 0 && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <Star size={14} className="text-orange-500" />
            Call score trend
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Today', value: metrics.avgScore.today },
              { label: 'This week', value: metrics.avgScore.week },
              { label: 'This month', value: metrics.avgScore.month },
            ].map((item) => {
              const c = item.value >= 80 ? 'text-green-400' : item.value >= 60 ? 'text-yellow-400' : 'text-red-400'
              const bg = item.value >= 80 ? 'bg-green-500' : item.value >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              const pct = item.value
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">{item.label}</span>
                    <span className={`text-sm font-semibold ${c}`}>{item.value}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${bg} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Properties summary (disposition/leadership) */}
      {['DISPOSITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role) && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <Building2 size={14} className="text-purple-400" />
            Inventory snapshot — this month
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-2xl font-semibold text-white">{metrics.properties.newThisMonth}</p>
              <p className="text-xs text-gray-400 mt-1">New leads</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{metrics.properties.active}</p>
              <p className="text-xs text-gray-400 mt-1">Active</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-green-400">{metrics.properties.soldThisMonth}</p>
              <p className="text-xs text-gray-400 mt-1">Closed</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
