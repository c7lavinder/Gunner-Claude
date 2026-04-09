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
          ...(sourceFilter ? { source: sourceFilter } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
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
        take: 200,
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
          eventType: { in: ['AppointmentCreated', 'appointment.created'] },
          receivedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { receivedAt: 'desc' },
        take: 200,
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
        take: 200,
        select: { id: true, receivedAt: true, eventType: true, status: true, rawPayload: true, errorReason: true, webhookSource: true },
      })
      break
    }

    case 'tasks': {
      rows = await db.webhookLog.findMany({
        where: {
          tenantId,
          eventType: { in: ['TaskCompleted', 'task.completed', 'TaskCreate', 'TaskUpdate'] },
          receivedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { receivedAt: 'desc' },
        take: 200,
        select: { id: true, receivedAt: true, eventType: true, status: true, rawPayload: true, errorReason: true, webhookSource: true },
      })
      break
    }

    case 'stages': {
      rows = await db.webhookLog.findMany({
        where: {
          tenantId,
          eventType: { in: ['OpportunityStageChanged', 'OpportunityUpdate', 'opportunity.stageChanged'] },
          receivedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { receivedAt: 'desc' },
        take: 200,
        select: { id: true, receivedAt: true, eventType: true, status: true, rawPayload: true, errorReason: true, webhookSource: true },
      })
      break
    }
  }

  // Summary counts — all tabs for the selected date
  const [dialCount, leadCount, appointmentCount, messageCount, taskCount, stageCount, failedCount, lastWebhook] = await Promise.all([
    db.call.count({ where: { tenantId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    db.property.count({ where: { tenantId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['AppointmentCreated', 'appointment.created'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['InboundMessage', 'OutboundMessage', 'ConversationUnread'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['TaskCompleted', 'task.completed', 'TaskCreate', 'TaskUpdate'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, eventType: { in: ['OpportunityStageChanged', 'OpportunityUpdate', 'opportunity.stageChanged'] }, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.count({ where: { tenantId, status: 'failed', receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    db.webhookLog.findFirst({ where: { tenantId }, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
  ])

  const summary = {
    totalToday: dialCount + leadCount + appointmentCount + messageCount + taskCount + stageCount,
    counts: { dials: dialCount, leads: leadCount, appointments: appointmentCount, messages: messageCount, tasks: taskCount, stages: stageCount },
    failedCount,
    lastWebhookAt: lastWebhook?.receivedAt ?? null,
  }

  return NextResponse.json({ tab, date: dateStr, rows, summary })
})
