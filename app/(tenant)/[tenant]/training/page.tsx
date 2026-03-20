// app/(tenant)/[tenant]/training/page.tsx
// Training Hub — turns graded calls into training material
// Call of the Week, review queue, top calls library
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { TrainingClient } from './training-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { subDays, startOfWeek } from 'date-fns'

export default async function TrainingPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId
  const role = session.role as UserRole
  const isManager = hasPermission(role, 'calls.view.team')
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })

  const [callOfTheWeek, topCalls, reviewQueue, totalGraded] = await Promise.all([
    // Call of the Week — highest score this week
    db.call.findFirst({
      where: {
        tenantId,
        gradingStatus: 'COMPLETED',
        score: { not: null },
        calledAt: { gte: weekStart },
      },
      orderBy: { score: 'desc' },
      include: {
        assignedTo: { select: { name: true, role: true } },
        property: { select: { address: true } },
      },
    }),

    // Top calls — best 10 calls all time (training library)
    db.call.findMany({
      where: {
        tenantId,
        gradingStatus: 'COMPLETED',
        score: { gte: 70 },
      },
      orderBy: { score: 'desc' },
      take: 10,
      include: {
        assignedTo: { select: { name: true, role: true } },
        property: { select: { address: true } },
      },
    }),

    // Review queue — calls below 50, managers only
    isManager ? db.call.findMany({
      where: {
        tenantId,
        gradingStatus: 'COMPLETED',
        score: { lt: 50, not: null },
      },
      orderBy: { calledAt: 'desc' },
      take: 15,
      include: {
        assignedTo: { select: { name: true, role: true } },
        property: { select: { address: true } },
      },
    }) : Promise.resolve([]),

    // Total graded calls count
    db.call.count({
      where: { tenantId, gradingStatus: 'COMPLETED' },
    }),
  ])

  return (
    <TrainingClient
      tenantSlug={params.tenant}
      isManager={isManager}
      callOfTheWeek={callOfTheWeek ? {
        id: callOfTheWeek.id,
        score: callOfTheWeek.score ?? 0,
        summary: callOfTheWeek.aiSummary,
        feedback: callOfTheWeek.aiFeedback,
        assignedTo: callOfTheWeek.assignedTo?.name ?? 'Unknown',
        assignedToRole: callOfTheWeek.assignedTo?.role ?? '',
        property: callOfTheWeek.property?.address ?? null,
        calledAt: callOfTheWeek.calledAt?.toISOString() ?? null,
        direction: callOfTheWeek.direction,
      } : null}
      topCalls={topCalls.map(c => ({
        id: c.id,
        score: c.score ?? 0,
        summary: c.aiSummary,
        assignedTo: c.assignedTo?.name ?? 'Unknown',
        property: c.property?.address ?? null,
        calledAt: c.calledAt?.toISOString() ?? null,
        direction: c.direction,
      }))}
      reviewQueue={reviewQueue.map(c => ({
        id: c.id,
        score: c.score ?? 0,
        summary: c.aiSummary,
        assignedTo: c.assignedTo?.name ?? 'Unknown',
        property: c.property?.address ?? null,
        calledAt: c.calledAt?.toISOString() ?? null,
        direction: c.direction,
      }))}
      totalGraded={totalGraded}
    />
  )
}
