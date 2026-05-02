// app/api/diagnostics/high-stakes-audit/route.ts
//
// Token-gated diagnostic. Surfaces the audit_log evidence trail for the
// 6 high-stakes Role Assistant tools (and the underlying gate-library
// flow), so Blocker #2 verification — "production verification of the
// 6 high-stakes action types" — is a single curl, not a join across
// many ad-hoc SQL queries.
//
// What it returns:
//   - For each high-stakes tool: counts (24h / 7d / 30d) + last 5 rows
//     of `assistant.action.<tool>` (success) and `assistant.action.failed`
//     filtered to that tool by payload.type.
//   - For the gate library: counts + last 5 rows of `gate.<action>.pending`
//     and `gate.approved`. These come from
//     /api/properties/[propertyId]/blast and /api/blasts (the actual fire
//     paths after the assistant proposes a blast).
//   - Universal counts: total `assistant.action.failed` 24h, total
//     `assistant.action.*` 24h. Quick health view.
//
// Auth: Authorization: Bearer ${DIAGNOSTIC_TOKEN}. 401 when env unset
// (matches dial-counts pattern — fail closed when token missing).
//
// Use:
//   GET /api/diagnostics/high-stakes-audit?tenant=<slug>
//
// See docs/OPERATIONS.md "Diagnostic endpoints" + AUDIT_PLAN.md
// "Blocker #2 verification ritual" for caller workflow.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

// The 6 high-stakes Role Assistant tools per AGENTS.md "High-Stakes
// Action Gates" + execute-route case names. AGENTS.md lists 5
// categories; the assistant has additional finer-grained tools that
// fall under the same buckets.
const HIGH_STAKES_TOOLS = [
  'send_sms_blast',           // SMS blast — proposed in assistant, fired via /api/properties/[id]/blast
  'send_email_blast',         // Email blast — same flow as SMS
  'bulk_tag_contacts',        // Bulk GHL contact update (currently a stub in execute)
  'remove_contact_from_property',  // Record delete (PropertySeller link)
  'remove_team_member',       // Record delete (PropertyTeamMember link)
  'change_property_status',   // Bulk-impact status change
] as const

// Gate library actions (from lib/gates/requireApproval.ts GATE_RULES)
const GATE_ACTIONS = [
  'sms_blast',
  'email_blast',
  'bulk_status_change',
  'record_delete',
] as const

interface ToolEvidence {
  tool: string
  counts: { last24h: number; last7d: number; last30d: number; failures24h: number }
  recentSuccess: Array<{ id: string; createdAt: Date; userId: string | null; result: string | null; pageContext: string | null; wasEdited: boolean }>
  recentFailures: Array<{ id: string; createdAt: Date; userId: string | null; errorMessage: string | null; pageContext: string | null }>
}

interface GateEvidence {
  action: string
  pendingCount24h: number
  approvedCount24h: number
  recentPending: Array<{ id: string; createdAt: Date; userId: string | null; description: string | null; recipientCount: number | null }>
  recentApproved: Array<{ id: string; createdAt: Date; userId: string | null; gateId: string | null }>
}

export async function GET(req: Request) {
  const token = process.env.DIAGNOSTIC_TOKEN
  const auth = req.headers.get('authorization') ?? ''
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const tenantSlug = url.searchParams.get('tenant')
  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenant query param required' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: `tenant ${tenantSlug} not found` }, { status: 404 })
  }

  const now = new Date()
  const t24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const t7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const t30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Per-tool evidence
  const toolEvidence: ToolEvidence[] = []
  for (const tool of HIGH_STAKES_TOOLS) {
    const successAction = `assistant.action.${tool}`
    const [c24, c7d, c30d, failures24h, recentSuccess, recentFailures] = await Promise.all([
      db.auditLog.count({ where: { tenantId: tenant.id, action: successAction, createdAt: { gte: t24 } } }),
      db.auditLog.count({ where: { tenantId: tenant.id, action: successAction, createdAt: { gte: t7d } } }),
      db.auditLog.count({ where: { tenantId: tenant.id, action: successAction, createdAt: { gte: t30d } } }),
      db.auditLog.count({
        where: {
          tenantId: tenant.id,
          action: 'assistant.action.failed',
          createdAt: { gte: t24 },
          // Filter by payload.type === <tool> via JSON path
          payload: { path: ['type'], equals: tool },
        },
      }),
      db.auditLog.findMany({
        where: { tenantId: tenant.id, action: successAction },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, createdAt: true, userId: true, payload: true },
      }),
      db.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          action: 'assistant.action.failed',
          payload: { path: ['type'], equals: tool },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, createdAt: true, userId: true, payload: true },
      }),
    ])

    toolEvidence.push({
      tool,
      counts: { last24h: c24, last7d: c7d, last30d: c30d, failures24h },
      recentSuccess: recentSuccess.map(r => {
        const p = (r.payload ?? {}) as Record<string, unknown>
        return {
          id: r.id,
          createdAt: r.createdAt,
          userId: r.userId,
          result: typeof p.result === 'string' ? p.result : null,
          pageContext: typeof p.pageContext === 'string' ? p.pageContext : null,
          wasEdited: Boolean(p.wasEdited),
        }
      }),
      recentFailures: recentFailures.map(r => {
        const p = (r.payload ?? {}) as Record<string, unknown>
        return {
          id: r.id,
          createdAt: r.createdAt,
          userId: r.userId,
          errorMessage: typeof p.errorMessage === 'string' ? p.errorMessage : null,
          pageContext: typeof p.pageContext === 'string' ? p.pageContext : null,
        }
      }),
    })
  }

  // Gate-library evidence (lib/gates/requireApproval.ts → blast routes)
  const gateEvidence: GateEvidence[] = []
  for (const gateAction of GATE_ACTIONS) {
    const pendingAction = `gate.${gateAction}.pending`
    const [pendingCount24h, recentPending, approvedCount24h, recentApproved] = await Promise.all([
      db.auditLog.count({ where: { tenantId: tenant.id, action: pendingAction, createdAt: { gte: t24 } } }),
      db.auditLog.findMany({
        where: { tenantId: tenant.id, action: pendingAction },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, createdAt: true, userId: true, payload: true },
      }),
      // gate.approved is universal across action types — filter to ones whose
      // resourceId came from a recent gate.<action>.pending. Cheaper to just
      // count gate.approved 24h for now and trust the chronological pairing.
      db.auditLog.count({ where: { tenantId: tenant.id, action: 'gate.approved', createdAt: { gte: t24 } } }),
      db.auditLog.findMany({
        where: { tenantId: tenant.id, action: 'gate.approved' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, createdAt: true, userId: true, payload: true },
      }),
    ])

    gateEvidence.push({
      action: gateAction,
      pendingCount24h,
      approvedCount24h,
      recentPending: recentPending.map(r => {
        const p = (r.payload ?? {}) as Record<string, unknown>
        const data = (p.data ?? {}) as Record<string, unknown>
        const recipientCount = typeof data.count === 'number'
          ? data.count
          : typeof data.recipientCount === 'number' ? data.recipientCount : null
        return {
          id: r.id,
          createdAt: r.createdAt,
          userId: r.userId,
          description: typeof p.description === 'string' ? p.description : null,
          recipientCount,
        }
      }),
      recentApproved: recentApproved.map(r => {
        const p = (r.payload ?? {}) as Record<string, unknown>
        return {
          id: r.id,
          createdAt: r.createdAt,
          userId: r.userId,
          gateId: typeof p.gateId === 'string' ? p.gateId : null,
        }
      }),
    })
  }

  // Universal totals
  const [totalAssistantActions24h, totalAssistantFailures24h] = await Promise.all([
    db.auditLog.count({
      where: {
        tenantId: tenant.id,
        action: { startsWith: 'assistant.action.' },
        createdAt: { gte: t24 },
      },
    }),
    db.auditLog.count({
      where: {
        tenantId: tenant.id,
        action: 'assistant.action.failed',
        createdAt: { gte: t24 },
      },
    }),
  ])

  return NextResponse.json({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    generatedAt: now.toISOString(),
    universal: {
      totalAssistantActions24h,
      totalAssistantFailures24h,
      failureRate24h: totalAssistantActions24h > 0
        ? +(totalAssistantFailures24h / totalAssistantActions24h * 100).toFixed(2)
        : 0,
    },
    tools: toolEvidence,
    gates: gateEvidence,
    notes: {
      sources: [
        'app/api/ai/assistant/execute/route.ts:976-994 — universal success audit row (assistant.action.<tool>)',
        'app/api/ai/assistant/execute/route.ts:1010-1031 — universal failure audit row (assistant.action.failed)',
        'lib/gates/requireApproval.ts:47-69 — gate.<action>.pending row',
        'lib/gates/requireApproval.ts:78-89 — gate.approved row',
      ],
      verificationRitual: 'docs/AUDIT_PLAN.md — "Blocker #2 verification ritual"',
    },
  })
}
