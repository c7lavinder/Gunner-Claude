import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { isRoleAtLeast } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { redirect } from 'next/navigation'
import { getGHLClient } from '@/lib/ghl/client'

const CT = 'America/Chicago'
const fmt = (d: Date | null) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CT }) : '—'
const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: CT }) + ' ' + fmt(d) : '—'

export default async function HealthPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  if (!isRoleAtLeast(session.role as UserRole, 'ADMIN')) redirect(`/${params.tenant}/day-hub`)

  const tenantId = session.tenantId
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // ── Parallel data fetch ──
  const [
    webhooksToday, webhooksLast5Min,
    callsToday, callsLastHour, callsWithNames, callsWithDuration, callsGraded,
    recentCalls, userCallCounts,
    tasksOpen, tasksCompletedToday, tasksOverdue, recentTasks,
    propertiesActive, recentStageChanges,
    recentMessages,
    aiCallsToday, aiErrorsToday,
    knowledgeDocs, userProfiles,
  ] = await Promise.all([
    // Webhooks
    db.auditLog.count({ where: { action: 'webhook.received', createdAt: { gte: todayStart } } }),
    db.auditLog.count({ where: { action: 'webhook.received', createdAt: { gte: fiveMinAgo } } }),
    // Calls
    db.call.count({ where: { tenantId, calledAt: { gte: todayStart } } }),
    db.call.count({ where: { tenantId, calledAt: { gte: oneHourAgo } } }),
    db.call.count({ where: { tenantId, calledAt: { gte: todayStart }, contactName: { not: null } } }),
    db.call.count({ where: { tenantId, calledAt: { gte: todayStart }, durationSeconds: { not: null } } }),
    db.call.count({ where: { tenantId, calledAt: { gte: todayStart }, gradingStatus: 'COMPLETED' } }),
    db.call.findMany({
      where: { tenantId, calledAt: { gte: todayStart } },
      orderBy: { calledAt: 'desc' }, take: 20,
      select: { contactName: true, durationSeconds: true, gradingStatus: true, callResult: true, direction: true, calledAt: true, recordingUrl: true, assignedTo: { select: { name: true } } },
    }),
    db.call.groupBy({ by: ['assignedToId'], where: { tenantId, calledAt: { gte: todayStart } }, _count: true }),
    // Tasks
    db.task.count({ where: { tenantId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    db.task.count({ where: { tenantId, status: 'COMPLETED', completedAt: { gte: todayStart } } }),
    db.task.count({ where: { tenantId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } } }),
    db.task.findMany({
      where: { tenantId, OR: [{ completedAt: { gte: todayStart } }, { createdAt: { gte: todayStart } }] },
      orderBy: { createdAt: 'desc' }, take: 10,
      select: { title: true, status: true, category: true, createdAt: true, completedAt: true, assignedTo: { select: { name: true } } },
    }),
    // Properties / Pipeline
    db.property.count({ where: { tenantId, acqStatus: { not: 'CLOSED' }, dispoStatus: { not: 'CLOSED' }, longtermStatus: { not: 'DEAD' } } }),
    db.auditLog.findMany({
      where: { tenantId, action: { in: ['property.status_changed', 'call.graded', 'milestone.created', 'property.created'] }, createdAt: { gte: todayStart } },
      orderBy: { createdAt: 'desc' }, take: 15,
      select: { action: true, resource: true, resourceId: true, createdAt: true, payload: true },
    }),
    // Inbox / Messages (from webhook log)
    db.auditLog.findMany({
      where: { tenantId, action: 'webhook.received', createdAt: { gte: oneHourAgo } },
      orderBy: { createdAt: 'desc' }, take: 30,
      select: { createdAt: true, payload: true },
    }),
    // AI
    db.aiLog.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
    db.aiLog.count({ where: { tenantId, createdAt: { gte: todayStart }, status: 'error' } }),
    // Knowledge
    db.knowledgeDocument.count({ where: { tenantId, isActive: true } }),
    db.userProfile.count({ where: { tenantId } }),
  ])

  // Get GHL appointments
  let appointments: Array<{ title: string; contactName: string; time: string; status: string }> = []
  try {
    const ghl = await getGHLClient(tenantId)
    const now = new Date()
    const endOfWeek = new Date(now.getTime() + 7 * 86400000)
    const apptData = await ghl.getAppointments({ startDate: now.getTime().toString(), endDate: endOfWeek.getTime().toString() })
    const events = (apptData as { events?: Array<{ title?: string; contactId?: string; startTime?: string; status?: string }> }).events ?? []
    appointments = events.slice(0, 10).map(e => ({
      title: e.title ?? 'Appointment',
      contactName: e.contactId ?? '',
      time: e.startTime ? fmtDate(new Date(e.startTime)) : '—',
      status: e.status ?? 'pending',
    }))
  } catch {}

  // User name lookup
  const userIds = userCallCounts.map(u => u.assignedToId).filter(Boolean) as string[]
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const userMap = new Map(users.map(u => [u.id, u.name]))

  // Parse message types from webhook log
  const msgTypes = { calls: 0, sms: 0, email: 0, other: 0 }
  for (const m of recentMessages) {
    const p = m.payload as Record<string, unknown> | null
    const mt = String(p?.messageType ?? '').toUpperCase()
    if (mt === 'CALL') msgTypes.calls++
    else if (mt === 'SMS') msgTypes.sms++
    else if (mt === 'EMAIL' || String(p?.type ?? '').includes('email')) msgTypes.email++
    else msgTypes.other++
  }

  const nameRate = callsToday > 0 ? Math.round((callsWithNames / callsToday) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-txt-primary">System Health</h1>
        <p className="text-[12px] text-txt-muted">All systems — real-time. Refresh to update.</p>
      </div>

      {/* ═══ TOP STATUS CARDS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SC label="Webhooks (5 min)" value={webhooksLast5Min} status={webhooksLast5Min > 0 ? 'good' : 'bad'} detail={webhooksLast5Min > 0 ? 'GHL connected' : 'No data from GHL'} />
        <SC label="Calls Today" value={callsToday} status={callsToday > 0 ? 'good' : 'warn'} detail={`${callsLastHour} in last hour`} />
        <SC label="Graded" value={callsGraded} status={callsGraded > 0 ? 'good' : 'warn'} detail={`of ${callsToday} total calls`} />
        <SC label="Contact Names" value={`${nameRate}%`} status={nameRate > 50 ? 'good' : nameRate > 0 ? 'warn' : 'bad'} detail={`${callsWithNames} of ${callsToday}`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SC label="Open Tasks" value={tasksOpen} status={tasksOverdue > 0 ? 'warn' : 'good'} detail={`${tasksOverdue} overdue · ${tasksCompletedToday} done today`} />
        <SC label="Active Properties" value={propertiesActive} status="good" detail="In pipeline" />
        <SC label="AI Calls Today" value={aiCallsToday} status={aiErrorsToday > 0 ? 'warn' : 'good'} detail={aiErrorsToday > 0 ? `${aiErrorsToday} errors` : 'No errors'} />
        <SC label="Knowledge" value={knowledgeDocs} status={knowledgeDocs > 0 ? 'good' : 'bad'} detail={`${userProfiles} user profiles`} />
      </div>

      {/* ═══ CALLS PER REP ═══ */}
      <Section title="Calls Per Rep Today">
        <div className="space-y-2">
          {userCallCounts.sort((a, b) => b._count - a._count).map(u => (
            <div key={u.assignedToId ?? 'none'} className="flex items-center justify-between">
              <span className="text-[13px] text-txt-primary">{userMap.get(u.assignedToId ?? '') ?? 'Unassigned'}</span>
              <span className="text-[13px] font-semibold text-txt-primary">{u._count}</span>
            </div>
          ))}
          {userCallCounts.length === 0 && <p className="text-[12px] text-txt-muted">No calls yet today</p>}
        </div>
      </Section>

      {/* ═══ RECENT CALLS ═══ */}
      <Section title="Last 20 Calls">
        <Table headers={['Time', 'Contact', 'Rep', 'Duration', 'Status', 'Rec']}>
          {recentCalls.map((c, i) => (
            <tr key={i} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
              <td className="px-4 py-2 text-txt-muted">{fmt(c.calledAt)}</td>
              <td className="px-4 py-2 text-txt-primary font-medium">{c.contactName ?? '—'}</td>
              <td className="px-4 py-2 text-txt-secondary">{c.assignedTo?.name ?? '—'}</td>
              <td className="px-4 py-2 text-txt-secondary">{c.durationSeconds != null ? `${c.durationSeconds}s` : '—'}</td>
              <td className="px-4 py-2"><Badge status={c.gradingStatus === 'COMPLETED' ? 'graded' : c.gradingStatus === 'SKIPPED' ? 'short' : c.callResult === 'no_answer' ? 'no_answer' : c.callResult === 'short_call' ? 'short' : 'other'} /></td>
              <td className="px-4 py-2 text-center">{c.recordingUrl ? '🎙' : '—'}</td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* ═══ TASKS ═══ */}
      <Section title="Tasks — Recent Activity">
        <Table headers={['Time', 'Task', 'Rep', 'Status']}>
          {recentTasks.map((t, i) => (
            <tr key={i} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
              <td className="px-4 py-2 text-txt-muted">{fmt(t.completedAt ?? t.createdAt)}</td>
              <td className="px-4 py-2 text-txt-primary font-medium truncate max-w-[250px]">{t.title}</td>
              <td className="px-4 py-2 text-txt-secondary">{t.assignedTo?.name ?? '—'}</td>
              <td className="px-4 py-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                  t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{t.status === 'COMPLETED' ? 'Done' : t.status === 'IN_PROGRESS' ? 'In Progress' : 'Pending'}</span>
              </td>
            </tr>
          ))}
          {recentTasks.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-txt-muted text-[12px]">No task activity today</td></tr>}
        </Table>
      </Section>

      {/* ═══ PIPELINE ACTIVITY ═══ */}
      <Section title="Pipeline Activity Today">
        <div className="space-y-2">
          {recentStageChanges.map((e, i) => {
            const p = e.payload as Record<string, unknown> | null
            return (
              <div key={i} className="flex items-center gap-3 text-[12px]">
                <span className="text-txt-muted shrink-0 w-16">{fmt(e.createdAt)}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                  e.action.includes('graded') ? 'bg-green-100 text-green-700' :
                  e.action.includes('created') ? 'bg-blue-100 text-blue-700' :
                  e.action.includes('milestone') ? 'bg-purple-100 text-purple-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{e.action.replace('property.', '').replace('call.', '').replace('milestone.', '')}</span>
                <span className="text-txt-secondary truncate">{String(p?.score ? `Score: ${p.score}` : p?.type ?? p?.status ?? e.resourceId ?? '').slice(0, 60)}</span>
              </div>
            )
          })}
          {recentStageChanges.length === 0 && <p className="text-[12px] text-txt-muted">No pipeline activity today</p>}
        </div>
      </Section>

      {/* ═══ INBOX / MESSAGES ═══ */}
      <Section title="Inbox — Last Hour">
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="text-center"><p className="text-[18px] font-bold text-green-600">{msgTypes.calls}</p><p className="text-[10px] text-txt-muted">Calls</p></div>
          <div className="text-center"><p className="text-[18px] font-bold text-blue-600">{msgTypes.sms}</p><p className="text-[10px] text-txt-muted">SMS</p></div>
          <div className="text-center"><p className="text-[18px] font-bold text-purple-600">{msgTypes.email}</p><p className="text-[10px] text-txt-muted">Email</p></div>
          <div className="text-center"><p className="text-[18px] font-bold text-gray-600">{msgTypes.other}</p><p className="text-[10px] text-txt-muted">Other</p></div>
        </div>
        <p className="text-[11px] text-txt-muted">{webhooksToday} total webhook events today</p>
      </Section>

      {/* ═══ APPOINTMENTS ═══ */}
      <Section title="Upcoming Appointments (7 days)">
        {appointments.length > 0 ? (
          <div className="space-y-2">
            {appointments.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[12px]">
                <div>
                  <span className="text-txt-primary font-medium">{a.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-txt-muted">{a.time}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    a.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>{a.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-txt-muted">No appointments found — GHL calendar may need scope update</p>
        )}
      </Section>

      {/* ═══ WEBHOOK RAW FEED ═══ */}
      <Section title="Webhook Feed (Last Hour)">
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {recentMessages.slice(0, 15).map((w, i) => {
            const p = w.payload as Record<string, unknown> | null
            return (
              <div key={i} className="flex items-center gap-3 text-[11px]">
                <span className="text-txt-muted shrink-0">{fmt(w.createdAt)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                  String(p?.messageType ?? '') === 'CALL' ? 'bg-green-100 text-green-700' :
                  String(p?.messageType ?? '') === 'SMS' ? 'bg-blue-100 text-blue-700' :
                  String(p?.messageType ?? '').includes('Email') ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{String(p?.type ?? p?.messageType ?? 'event')}</span>
                <span className="text-txt-secondary truncate">{String(p?.direction ?? '')} {String(p?.contactId ?? '').slice(0, 10)}</span>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

function SC({ label, value, status, detail }: { label: string; value: string | number; status: 'good' | 'warn' | 'bad'; detail: string }) {
  const c = { good: 'bg-green-50 border-green-200', warn: 'bg-amber-50 border-amber-200', bad: 'bg-red-50 border-red-200' }
  const d = { good: 'bg-green-500', warn: 'bg-amber-500', bad: 'bg-red-500' }
  return (
    <div className={`border-[0.5px] rounded-[12px] p-4 ${c[status]}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${d[status]}`} />
        <span className="text-[10px] font-semibold text-txt-muted uppercase">{label}</span>
      </div>
      <p className="text-[22px] font-bold text-txt-primary">{value}</p>
      <p className="text-[10px] text-txt-muted">{detail}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border-[0.5px] rounded-[14px] overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
        <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="-m-5">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold text-txt-muted uppercase border-b" style={{ borderColor: 'var(--border-light)' }}>
            {headers.map(h => <th key={h} className="px-4 py-2">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Badge({ status }: { status: 'graded' | 'short' | 'no_answer' | 'other' }) {
  const cfg = {
    graded: { label: 'Graded', cls: 'bg-green-100 text-green-700' },
    short: { label: 'Short', cls: 'bg-amber-100 text-amber-700' },
    no_answer: { label: 'No answer', cls: 'bg-gray-100 text-gray-500' },
    other: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
  }
  const c = cfg[status]
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>
}
