import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { isRoleAtLeast } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { redirect } from 'next/navigation'

export default async function HealthPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  if (!isRoleAtLeast(session.role as UserRole, 'ADMIN')) redirect(`/${params.tenant}/tasks`)

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const [
    webhooksToday, webhooksLastHour, webhooksLast5Min,
    callsToday, callsLastHour,
    callsWithNames, callsWithDuration, callsGraded, callsFailed,
    recentCalls, recentWebhooks,
    userCallCounts,
  ] = await Promise.all([
    db.auditLog.count({ where: { action: 'webhook.received', createdAt: { gte: todayStart } } }),
    db.auditLog.count({ where: { action: 'webhook.received', createdAt: { gte: oneHourAgo } } }),
    db.auditLog.count({ where: { action: 'webhook.received', createdAt: { gte: fiveMinAgo } } }),
    db.call.count({ where: { tenantId: session.tenantId, calledAt: { gte: todayStart } } }),
    db.call.count({ where: { tenantId: session.tenantId, calledAt: { gte: oneHourAgo } } }),
    db.call.count({ where: { tenantId: session.tenantId, calledAt: { gte: todayStart }, contactName: { not: null } } }),
    db.call.count({ where: { tenantId: session.tenantId, calledAt: { gte: todayStart }, durationSeconds: { not: null } } }),
    db.call.count({ where: { tenantId: session.tenantId, calledAt: { gte: todayStart }, gradingStatus: 'COMPLETED' } }),
    db.call.count({ where: { tenantId: session.tenantId, calledAt: { gte: todayStart }, gradingStatus: 'FAILED' } }),
    db.call.findMany({
      where: { tenantId: session.tenantId, calledAt: { gte: todayStart } },
      orderBy: { calledAt: 'desc' },
      take: 20,
      select: { contactName: true, durationSeconds: true, gradingStatus: true, callResult: true, direction: true, calledAt: true, recordingUrl: true, assignedTo: { select: { name: true } } },
    }),
    db.auditLog.findMany({
      where: { action: 'webhook.received', createdAt: { gte: oneHourAgo } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, payload: true },
    }),
    db.call.groupBy({
      by: ['assignedToId'],
      where: { tenantId: session.tenantId, calledAt: { gte: todayStart } },
      _count: true,
    }),
  ])

  // Get user names for counts
  const userIds = userCallCounts.map(u => u.assignedToId).filter(Boolean) as string[]
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const userMap = new Map(users.map(u => [u.id, u.name]))

  const nameRate = callsToday > 0 ? Math.round((callsWithNames / callsToday) * 100) : 0
  const durationRate = callsToday > 0 ? Math.round((callsWithDuration / callsToday) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-txt-primary">System Health</h1>
        <p className="text-[12px] text-txt-muted">Real-time status of call ingestion pipeline</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard
          label="Webhooks (5 min)"
          value={webhooksLast5Min}
          status={webhooksLast5Min > 0 ? 'good' : 'bad'}
          detail={webhooksLast5Min > 0 ? 'Receiving data from GHL' : 'No webhooks in last 5 minutes'}
        />
        <StatusCard
          label="Calls Today"
          value={callsToday}
          status={callsToday > 0 ? 'good' : 'warn'}
          detail={`${callsLastHour} in last hour`}
        />
        <StatusCard
          label="Contact Names"
          value={`${nameRate}%`}
          status={nameRate > 50 ? 'good' : nameRate > 0 ? 'warn' : 'bad'}
          detail={`${callsWithNames} of ${callsToday} have names`}
        />
        <StatusCard
          label="Graded"
          value={callsGraded}
          status={callsGraded > 0 ? 'good' : 'warn'}
          detail={`${callsFailed} failed/short`}
        />
      </div>

      {/* Per-User Breakdown */}
      <div className="bg-white border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
        <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider mb-3">Calls Per Rep Today</p>
        <div className="space-y-2">
          {userCallCounts.sort((a, b) => b._count - a._count).map(u => (
            <div key={u.assignedToId ?? 'none'} className="flex items-center justify-between">
              <span className="text-[13px] text-txt-primary">{userMap.get(u.assignedToId ?? '') ?? 'Unassigned'}</span>
              <span className="text-[13px] font-semibold text-txt-primary">{u._count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-white border-[0.5px] rounded-[14px] overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">Last 20 Calls</p>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-txt-muted uppercase border-b" style={{ borderColor: 'var(--border-light)' }}>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">Rep</th>
              <th className="px-4 py-2">Duration</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Recording</th>
            </tr>
          </thead>
          <tbody>
            {recentCalls.map((c, i) => (
              <tr key={i} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
                <td className="px-4 py-2 text-txt-muted">{c.calledAt?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) ?? '—'}</td>
                <td className="px-4 py-2 text-txt-primary font-medium">{c.contactName ?? '—'}</td>
                <td className="px-4 py-2 text-txt-secondary">{c.assignedTo?.name ?? '—'}</td>
                <td className="px-4 py-2 text-txt-secondary">{c.durationSeconds != null ? `${c.durationSeconds}s` : '—'}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    c.gradingStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                    c.callResult === 'short_call' ? 'bg-amber-100 text-amber-700' :
                    c.callResult === 'no_answer' ? 'bg-gray-100 text-gray-500' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {c.gradingStatus === 'COMPLETED' ? 'Graded' :
                     c.callResult === 'short_call' ? `Short` :
                     c.callResult === 'no_answer' ? 'No answer' : c.gradingStatus}
                  </span>
                </td>
                <td className="px-4 py-2">{c.recordingUrl ? '🎙' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent Webhook Events */}
      <div className="bg-white border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
        <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider mb-3">Last 10 Webhook Events (1 hour)</p>
        <div className="space-y-2">
          {recentWebhooks.map((w, i) => {
            const p = w.payload as Record<string, unknown> | null
            return (
              <div key={i} className="flex items-center gap-3 text-[11px]">
                <span className="text-txt-muted shrink-0">{w.createdAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  String(p?.messageType ?? '') === 'CALL' ? 'bg-green-100 text-green-700' :
                  String(p?.messageType ?? '') === 'SMS' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{String(p?.type ?? p?.messageType ?? 'event')}</span>
                <span className="text-txt-secondary truncate">{String(p?.contactId ?? '').slice(0, 12)}...</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatusCard({ label, value, status, detail }: { label: string; value: string | number; status: 'good' | 'warn' | 'bad'; detail: string }) {
  const colors = {
    good: 'bg-green-50 border-green-200',
    warn: 'bg-amber-50 border-amber-200',
    bad: 'bg-red-50 border-red-200',
  }
  const dots = { good: 'bg-green-500', warn: 'bg-amber-500', bad: 'bg-red-500' }
  return (
    <div className={`border-[0.5px] rounded-[12px] p-4 ${colors[status]}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${dots[status]}`} />
        <span className="text-[10px] font-semibold text-txt-muted uppercase">{label}</span>
      </div>
      <p className="text-[22px] font-bold text-txt-primary">{value}</p>
      <p className="text-[10px] text-txt-muted">{detail}</p>
    </div>
  )
}
