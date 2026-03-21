'use client'
// components/kpis/kpis-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import { Phone, Star, Calendar, FileSignature, Building2, CheckSquare, TrendingUp, Target, DollarSign, FileText } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { UserRole } from '@/types/roles'

type Period = 'today' | 'week' | 'month'

interface Metrics {
  calls: { today: number; week: number; month: number }
  avgScore: { today: number; week: number; month: number }
  appointments: { today: number; week: number; month: number }
  offers: { month: number }
  contracts: { month: number }
  closed: { month: number }
  properties: { active: number; newThisMonth: number }
  tasks: { completedToday: number; open: number }
  scoreDistribution: Array<{ range: string; count: number }>
  tcpLeads: Array<{ id: string; address: string; tcpScore: number; status: string }>
}

export function KpisClient({ metrics, role, userName, tenantSlug }: {
  metrics: Metrics
  role: UserRole
  userName: string
  tenantSlug: string
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
      icon: <FileText size={16} />,
      label: 'Offers made',
      value: metrics.offers.month,
      color: 'purple',
      show: ['ACQUISITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
      note: 'This month',
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
      icon: <DollarSign size={16} />,
      label: 'Deals closed',
      value: metrics.closed.month,
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

      {/* Score distribution chart */}
      {metrics.scoreDistribution.some(d => d.count > 0) && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-blue-400" />
            Score distribution — all graded calls
          </h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={metrics.scoreDistribution} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="range" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                formatter={(value: number) => [`${value} calls`, 'Count']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {metrics.scoreDistribution.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={i >= 4 ? '#22c55e' : i >= 3 ? '#eab308' : i >= 2 ? '#f97316' : '#ef4444'}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between px-2 mt-2">
            <span className="text-xs text-red-400">Needs work</span>
            <span className="text-xs text-green-400">Excellent</span>
          </div>
        </div>
      )}

      {/* TCP Lead Ranking */}
      {metrics.tcpLeads.length > 0 && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <Target size={14} className="text-orange-400" />
            TCP lead ranking — conversion probability
          </h2>
          <div className="space-y-1.5">
            {metrics.tcpLeads.map((lead, i) => {
              const pct = Math.round(lead.tcpScore * 100)
              const color = pct >= 50 ? 'text-green-400' : pct >= 30 ? 'text-yellow-400' : 'text-gray-400'
              const bg = pct >= 50 ? 'bg-green-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-gray-500'
              return (
                <Link
                  key={lead.id}
                  href={`/${tenantSlug}/inventory/${lead.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs text-gray-600 w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{lead.address}</p>
                    <div className="h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${color}`}>{pct}%</span>
                </Link>
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
              <p className="text-2xl font-semibold text-green-400">{metrics.closed.month}</p>
              <p className="text-xs text-gray-400 mt-1">Closed</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
