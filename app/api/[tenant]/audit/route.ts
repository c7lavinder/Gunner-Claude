// app/api/[tenant]/audit/route.ts
// Audit page API — reads from calls, properties, and webhook_logs
// Owner/admin only. No GHL API calls — all data from local DB.

import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { isRoleAtLeast } from '@/types/roles'
import type { UserRole } from '@/types/roles'

const VALID_TABS = ['dials', 'leads', 'appointments', 'messages', 'tasks', 'stages'] as const
type AuditTab = typeof VALID_TABS[number]

export const GET = withTenant(async (req: NextRequest, ctx) => {
  if (!isRoleAtLeast(ctx.userRole as UserRole, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden — owner or admin only' }, { status: 403 })
  }

  const url = new URL(req.url)
  const tab = (url.searchParams.get('tab') ?? 'dials') as AuditTab
  const dateStr = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const sourceFilter = url.searchParams.get('source') // 'webhook' | 'poll' | null (all)

  if (!VALID_TABS.includes(tab)) {
    return NextResponse.json({ error: `Invalid tab: ${tab}` }, { status: 400 })
  }

  const startOfDay = new Date(`${dateStr}T00:00:00Z`)
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)
  const { tenantId } = ctx

  // Fetch tab-specific data
  let rows: unknown[] = []

  switch (tab) {
    case 'dials': {
      const calls = await db.call.findMany({
        where: {
          tenantId,
          createdAt: { gte: startOfDay, lte: endOfDay },
          ...(sourceFilter === 'webhook' ? { source: { startsWith: 'webhook' } }
            : sourceFilter === 'poll' ? { source: 'poll' }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true, createdAt: true, durationSeconds: true, score: true,
          gradingStatus: true, callResult: true, aiSummary: true,
          ghlContactId: true, contactName: true, direction: true, source: true,
          assignedTo: { select: { name: true } },
        },
      })
      rows = calls.map(c => ({
        id: c.id,
        createdAt: c.createdAt,
        durationSeconds: c.durationSeconds,
        score: c.score,
        gradingStatus: c.gradingStatus,
        callResult: c.callResult,
        aiSummary: c.aiSummary,
        ghlContactId: c.ghlContactId,
        contactName: c.contactName,
        direction: c.direction,
        source: c.source ?? 'unknown',
        teamMemberName: c.assignedTo?.name ?? null,
      }))
      break
    }

    case 'leads': {
      const props = await db.property.findMany({
        where: { tenantId, createdAt: { gte: startOfDay, lte: endOfDay } },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true, createdAt: true, address: true, city: true, state: true,
          leadSource: true, status: true, tcpScore: true,
          ghlPipelineStage: true,
          market: { select: { name: true } },
          sellers: { select: { seller: { select: { name: true } } }, take: 1 },
        },
      })
      rows = props.map(p => ({
        id: p.id,
        createdAt: p.createdAt,
        address: [p.address, p.city, p.state].filter(Boolean).join(', '),
        leadSource: p.leadSource,
        status: p.status,
        tcpScore: p.tcpScore,
        ghlStage: p.ghlPipelineStage,
        market: p.market?.name ?? null,
        sellerName: p.sellers[0]?.seller?.name ?? null,
      }))
      break
    }

    case 'appointments': {
      rows = await db.webhookLog.findMany({
        where: {
          tenantId,
          eventType: { in: ['AppointmentCreated', 'AppointmentCreate', 'appointment.created'] },
          receivedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { receivedAt: 'desc' },
        take: 500,
        select: { id: true, receivedAt: true, eventType: true, status: true, rawPayload: true, errorReason: true, webhookSource: true },
      })
      break
    }

    case 'messages': {
      rows = await db.webhookLog.findMany({
        where: {
          tenantId,
          eventType: { in: ['InboundMessage', 'OutboundMessage', 'ConversationUnread'] },
          receivedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { receivedAt: 'desc' },
        take: 500,
        select: { id: true, receivedAt: true, eventType: true, status: true, rawPayload: true, errorReason: true, webhookSource: true },
      })
      break
    }

    case 'tasks': {
      rows = await db.webhookLog.findMany({
        where: {
          tenantId,
          eventType: { in: ['TaskCompleted', 'TaskComplete', 'task.completed', 'TaskCreate', 'TaskUpdate'] },
          receivedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { receivedAt: 'desc' },
        take: 500,
        select: { id: true, receivedAt: true, eventType: true, status: true, rawPayload: true, errorReason: true, webhookSource: true },
      })
      break
    }

    case 'stages': {
      rows = await db.webhookLog.findMany({
        where: {
          tenantId,
          eventType: { in: ['OpportunityStageChanged', 'OpportunityStageUpdate', 'OpportunityUpdate', 'OpportunityCreate', 'opportunity.stageChanged'] },
          receivedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { receivedAt: 'desc' },
        take: 500,
        select: { id: true, receivedAt: true, eventType: true, status: true, rawPayload: true, errorReason: true, webhookSource: true },
      })
      break
    }
  }

  // Summary counts — all tabs for the selected date
  const [dialCount, leadCount, appointmentCount, messageCount, taskCount, stageCount, failedCount, lastWebhook] = await Promise.all([
    db.call.count({ where: { tenantId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    db.property.count({ where: { tenantId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['AppointmentCreated', 'AppointmentCreate', 'appointment.created'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['InboundMessage', 'OutboundMessage', 'ConversationUnread'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['TaskCompleted', 'TaskComplete', 'task.completed', 'TaskCreate', 'TaskUpdate'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['OpportunityStageChanged', 'OpportunityStageUpdate', 'OpportunityUpdate', 'OpportunityCreate', 'opportunity.stageChanged'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, status: 'failed', receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.findFirst({ where: { tenantId }, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
  ])

  // ── Pipeline health — are calls making it all the way through? ──────
  const [stuckPending, stuckRecordings, gradedToday, gradeableTodayCount, gradeTimes] = await Promise.all([
    // Calls stuck in PENDING > 30 min (should have been graded by now)
    db.call.count({
      where: {
        tenantId,
        gradingStatus: 'PENDING',
        createdAt: { gte: startOfDay, lte: endOfDay, lt: new Date(Date.now() - 30 * 60_000) },
      },
    }),
    // Recording fetch jobs stuck
    db.recordingFetchJob.count({
      where: { tenantId, status: { in: ['PENDING', 'FAILED'] }, createdAt: { gte: startOfDay, lte: endOfDay } },
    }),
    // Successfully graded today
    db.call.count({
      where: { tenantId, gradingStatus: 'COMPLETED', createdAt: { gte: startOfDay, lte: endOfDay } },
    }),
    // Total gradeable (not no_answer, not short_call)
    db.call.count({
      where: {
        tenantId,
        createdAt: { gte: startOfDay, lte: endOfDay },
        callResult: null, // null = not no_answer or short_call
      },
    }),
    // Average grading time (created → graded) for completed calls today
    db.call.findMany({
      where: { tenantId, gradingStatus: 'COMPLETED', createdAt: { gte: startOfDay, lte: endOfDay }, gradedAt: { not: null } },
      select: { createdAt: true, gradedAt: true },
    }),
  ])

  const avgGradeTimeSec = gradeTimes.length > 0
    ? Math.round(gradeTimes.reduce((sum, c) => sum + (c.gradedAt!.getTime() - c.createdAt.getTime()) / 1000, 0) / gradeTimes.length)
    : null

  const pipelineHealth = {
    stuckPending,
    stuckRecordings,
    gradedToday,
    gradeableToday: gradeableTodayCount,
    gradingRate: gradeableTodayCount > 0 ? Math.round((gradedToday / gradeableTodayCount) * 100) : null,
    avgGradeTimeSec,
  }

  // ── Hourly webhook vs poll comparison + dial breakdown (Dials tab) ──
  let hourly: { hour: number; webhook: number; poll: number }[] | null = null
  let dialBreakdown: { total: number; webhookCount: number; pollCount: number; noAnswer: number; graded: number; pending: number; failed: number } | null = null
  if (tab === 'dials') {
    const allCallsToday = await db.call.findMany({
      where: { tenantId, createdAt: { gte: startOfDay, lte: endOfDay } },
      select: { createdAt: true, source: true, gradingStatus: true, callResult: true },
    })
    const hours: Record<number, { webhook: number; poll: number }> = {}
    for (let h = 0; h < 24; h++) hours[h] = { webhook: 0, poll: 0 }
    let wc = 0, pc = 0, na = 0, gr = 0, pe = 0, fa = 0
    for (const c of allCallsToday) {
      const h = new Date(c.createdAt).getUTCHours()
      const src = c.source ?? ''
      if (src.startsWith('webhook')) { hours[h].webhook++; wc++ }
      else if (src === 'poll') { hours[h].poll++; pc++ }
      else { hours[h].webhook++; hours[h].poll++ }
      if (c.callResult === 'no_answer') na++
      if (c.gradingStatus === 'COMPLETED') gr++
      else if (c.gradingStatus === 'PENDING') pe++
      else if (c.gradingStatus === 'FAILED') fa++
      else if (c.gradingStatus === 'SKIPPED') na++ // count SKIPPED with no_answer bucket
    }
    hourly = Object.entries(hours).map(([h, counts]) => ({ hour: Number(h), ...counts }))
    dialBreakdown = { total: allCallsToday.length, webhookCount: wc, pollCount: pc, noAnswer: na, graded: gr, pending: pe, failed: fa }
  }

  const summary = {
    totalToday: dialCount + leadCount + appointmentCount + messageCount + taskCount + stageCount,
    counts: { dials: dialCount, leads: leadCount, appointments: appointmentCount, messages: messageCount, tasks: taskCount, stages: stageCount },
    failedCount,
    lastWebhookAt: lastWebhook?.receivedAt ?? null,
  }

  // User map — resolve GHL user IDs to names for display
  const users = await db.user.findMany({
    where: { tenantId, ghlUserId: { not: null } },
    select: { name: true, ghlUserId: true },
  })
  const userMap: Record<string, string> = {}
  for (const u of users) { if (u.ghlUserId) userMap[u.ghlUserId] = u.name }

  return NextResponse.json({ tab, date: dateStr, rows, summary, pipelineHealth, hourly, dialBreakdown, userMap })
})
