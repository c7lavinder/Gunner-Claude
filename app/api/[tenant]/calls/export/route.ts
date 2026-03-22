// app/api/[tenant]/calls/export/route.ts
// CSV export of all graded calls
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { CALL_TYPES, RESULT_NAMES } from '@/lib/call-types'

const CALL_TYPE_NAMES: Record<string, string> = Object.fromEntries(
  CALL_TYPES.map(ct => [ct.id, ct.name])
)

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const role = session.role as UserRole
  const canViewAll = hasPermission(role, 'calls.view.all')
  const canViewTeam = hasPermission(role, 'calls.view.team')

  const where: Prisma.CallWhereInput = canViewAll
    ? { tenantId: session.tenantId, gradingStatus: 'COMPLETED' }
    : canViewTeam
    ? { tenantId: session.tenantId, gradingStatus: 'COMPLETED', assignedTo: { OR: [{ id: session.userId }, { reportsTo: session.userId }] } }
    : { tenantId: session.tenantId, gradingStatus: 'COMPLETED', assignedToId: session.userId }

  const calls = await db.call.findMany({
    where,
    orderBy: { calledAt: 'desc' },
    take: 2000,
    include: {
      assignedTo: { select: { name: true } },
      property: { select: { address: true, city: true, state: true } },
    },
  })

  const headers = ['Date', 'Contact', 'Rep', 'Call Type', 'Outcome', 'Score', 'Duration (s)', 'Direction', 'Property', 'Summary']
  const rows = calls.map(c => [
    c.calledAt ? new Date(c.calledAt).toISOString() : '',
    c.contactName ?? '',
    c.assignedTo?.name ?? '',
    c.callType ? (CALL_TYPE_NAMES[c.callType] ?? c.callType) : '',
    c.callOutcome ? (RESULT_NAMES[c.callOutcome] ?? c.callOutcome) : '',
    c.score !== null ? String(c.score) : '',
    c.durationSeconds !== null ? String(c.durationSeconds) : '',
    c.direction ?? '',
    c.property ? `${c.property.address}, ${c.property.city} ${c.property.state}` : '',
    c.aiSummary ?? '',
  ])

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(',')),
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gunner-calls-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
