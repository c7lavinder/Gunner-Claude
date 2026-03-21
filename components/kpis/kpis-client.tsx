'use client'
// components/kpis/kpis-client.tsx
// KPIs dashboard — Design system: docs/DESIGN.md
// Layout: [Date filters] [4 stat cards] [Charts row] [Team leaderboard]

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

// ─── Helpers ──────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return 'text-semantic-green'
  if (score >= 80) return 'text-semantic-amber'
  if (score >= 70) return 'text-semantic-blue'
  return 'text-semantic-red'
}

function scoreBarBg(score: number): string {
  if (score >= 90) return 'bg-semantic-green'
  if (score >= 80) return 'bg-semantic-amber'
  if (score >= 70) return 'bg-semantic-blue'
  return 'bg-semantic-red'
}

function scoreBadgeBg(score: number): string {
  if (score >= 90) return 'bg-semantic-green-bg text-semantic-green'
  if (score >= 80) return 'bg-semantic-amber-bg text-semantic-amber'
  if (score >= 70) return 'bg-semantic-blue-bg text-semantic-blue'
  return 'bg-semantic-red-bg text-semantic-red'
}

function chartBarFill(index: number): string {
  // Score distribution: low (red) -> mid (amber) -> high (green)
  if (index >= 4) return '#1D9E75'   // semantic green
  if (index >= 3) return '#BA7517'   // semantic amber
  if (index >= 2) return '#185FA5'   // semantic blue
  return '#A32D2D'                   // semantic red
}

// ─── Component ────────────────────────────────────────────────────────────

export function KpisClient({ metrics, role, userName, tenantSlug }: {
  metrics: Metrics
  role: UserRole
  userName: string
  tenantSlug: string
}) {
  const [period, setPeriod] = useState<Period>('week')

  const score = metrics.avgScore[period]

  const kpiCards = [
    {
      icon: <Phone size={16} />,
      label: 'Calls made',
      value: metrics.calls[period],
      semantic: 'blue' as const,
      show: true,
    },
    {
      icon: <Star size={16} />,
      label: 'Avg call score',
      value: `${score}%`,
      semantic: (score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red') as 'green' | 'amber' | 'red',
      show: true,
      note: score > 0 ? (score >= 80 ? 'Strong' : score >= 60 ? 'Room to grow' : 'Needs focus') : 'No graded calls',
    },
    {
      icon: <Calendar size={16} />,
      label: 'Appointments set',
      value: metrics.appointments[period],
      semantic: 'green' as const,
      show: ['LEAD_MANAGER', 'ACQUISITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
    },
    {
      icon: <FileText size={16} />,
      label: 'Offers made',
      value: metrics.offers.month,
      semantic: 'purple' as const,
      show: ['ACQUISITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
      note: 'This month',
    },
    {
      icon: <FileSignature size={16} />,
      label: 'Contracts signed',
      value: metrics.contracts.month,
      semantic: 'green' as const,
      show: ['ACQUISITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
      note: 'This month',
    },
    {
      icon: <Building2 size={16} />,
      label: 'Active properties',
      value: metrics.properties.active,
      semantic: 'blue' as const,
      show: ['DISPOSITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
    },
    {
      icon: <DollarSign size={16} />,
      label: 'Deals closed',
      value: metrics.closed.month,
      semantic: 'green' as const,
      show: ['DISPOSITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role),
      note: 'This month',
    },
    {
      icon: <CheckSquare size={16} />,
      label: 'Tasks completed',
      value: metrics.tasks.completedToday,
      semantic: 'amber' as const,
      show: true,
      note: 'Today',
    },
  ].filter((k) => k.show)

  const iconColorMap: Record<string, string> = {
    green: 'text-semantic-green',
    amber: 'text-semantic-amber',
    red: 'text-semantic-red',
    blue: 'text-semantic-blue',
    purple: 'text-semantic-purple',
  }

  const iconBgMap: Record<string, string> = {
    green: 'bg-semantic-green-bg',
    amber: 'bg-semantic-amber-bg',
    red: 'bg-semantic-red-bg',
    blue: 'bg-semantic-blue-bg',
    purple: 'bg-semantic-purple-bg',
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary">KPIs</h1>
          <p className="text-ds-body text-txt-secondary mt-1">{userName.split(' ')[0]}&apos;s performance metrics</p>
        </div>

        {/* Period toggle — tab bar style */}
        <div className="flex items-center gap-1 bg-surface-tertiary rounded-[14px] p-1">
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-[10px] text-ds-body font-medium transition-all ${
                period === p
                  ? 'bg-surface-primary text-txt-primary shadow-ds-float'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <div
            key={i}
            className="bg-surface-primary border-[0.5px] border-black/[0.08] rounded-[14px] p-4 hover:border-black/[0.14] hover:shadow-ds-float transition-all"
          >
            <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center mb-3 ${iconBgMap[card.semantic]}`}>
              <span className={iconColorMap[card.semantic]}>{card.icon}</span>
            </div>
            <p className="text-ds-hero font-semibold text-txt-primary">{card.value}</p>
            <p className="text-ds-body text-txt-secondary mt-1">{card.label}</p>
            {card.note && <p className="text-ds-fine text-txt-muted mt-0.5">{card.note}</p>}
          </div>
        ))}
      </div>

      {/* Call score trend */}
      {metrics.avgScore.month > 0 && (
        <div className="bg-surface-primary border-[0.5px] border-black/[0.08] rounded-[14px] p-5 hover:border-black/[0.14] hover:shadow-ds-float transition-all">
          <h2 className="text-ds-label font-medium text-txt-primary mb-4 flex items-center gap-2">
            <Star size={14} className="text-semantic-amber" />
            Call score trend
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Today', value: metrics.avgScore.today },
              { label: 'This week', value: metrics.avgScore.week },
              { label: 'This month', value: metrics.avgScore.month },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-ds-fine text-txt-secondary">{item.label}</span>
                  <span className={`text-ds-body font-semibold ${scoreColor(item.value)}`}>{item.value}%</span>
                </div>
                <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scoreBarBg(item.value)} transition-all duration-500`}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score distribution chart */}
      {metrics.scoreDistribution.some(d => d.count > 0) && (
        <div className="bg-surface-primary border-[0.5px] border-black/[0.08] rounded-[14px] p-5 hover:border-black/[0.14] hover:shadow-ds-float transition-all">
          <h2 className="text-ds-label font-medium text-txt-primary mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-semantic-blue" />
            Score distribution — all graded calls
          </h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={metrics.scoreDistribution} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="range" tick={{ fill: '#6B6B66', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B6B66', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '0.5px solid rgba(0,0,0,0.08)',
                  borderRadius: 14,
                  fontSize: 13,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
                formatter={(value: number) => [`${value} calls`, 'Count']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {metrics.scoreDistribution.map((_entry, i) => (
                  <Cell key={i} fill={chartBarFill(i)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between px-2 mt-2">
            <span className="text-ds-fine text-semantic-red">Needs work</span>
            <span className="text-ds-fine text-semantic-green">Excellent</span>
          </div>
        </div>
      )}

      {/* TCP Lead Ranking */}
      {metrics.tcpLeads.length > 0 && (
        <div className="bg-surface-primary border-[0.5px] border-black/[0.08] rounded-[14px] p-5 hover:border-black/[0.14] hover:shadow-ds-float transition-all">
          <h2 className="text-ds-label font-medium text-txt-primary mb-4 flex items-center gap-2">
            <Target size={14} className="text-semantic-purple" />
            TCP lead ranking — conversion probability
          </h2>
          <div className="space-y-1">
            {metrics.tcpLeads.map((lead, i) => {
              const pct = Math.round(lead.tcpScore * 100)
              return (
                <Link
                  key={lead.id}
                  href={`/${tenantSlug}/inventory/${lead.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-[10px] hover:bg-surface-secondary transition-colors"
                >
                  <span className="text-ds-fine text-txt-muted w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ds-body text-txt-primary truncate">{lead.address}</p>
                    <div className="h-1 bg-surface-tertiary rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreBarBg(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-ds-body font-semibold shrink-0 ${scoreColor(pct)}`}>{pct}%</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Properties summary (disposition/leadership) */}
      {['DISPOSITION_MANAGER', 'TEAM_LEAD', 'ADMIN', 'OWNER'].includes(role) && (
        <div className="bg-surface-primary border-[0.5px] border-black/[0.08] rounded-[14px] p-5 hover:border-black/[0.14] hover:shadow-ds-float transition-all">
          <h2 className="text-ds-label font-medium text-txt-primary mb-4 flex items-center gap-2">
            <Building2 size={14} className="text-semantic-purple" />
            Inventory snapshot — this month
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-ds-hero font-semibold text-txt-primary">{metrics.properties.newThisMonth}</p>
              <p className="text-ds-body text-txt-secondary mt-1">New leads</p>
            </div>
            <div>
              <p className="text-ds-hero font-semibold text-txt-primary">{metrics.properties.active}</p>
              <p className="text-ds-body text-txt-secondary mt-1">Active</p>
            </div>
            <div>
              <p className="text-ds-hero font-semibold text-semantic-green">{metrics.closed.month}</p>
              <p className="text-ds-body text-txt-secondary mt-1">Closed</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
