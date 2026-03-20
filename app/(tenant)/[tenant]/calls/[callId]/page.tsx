// app/(tenant)/[tenant]/calls/[callId]/page.tsx
// Call detail — full data query including transcript, recording, all AI fields
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect, notFound } from 'next/navigation'
import { CallDetailClient } from '@/components/calls/call-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function CallDetailPage({
  params,
}: {
  params: { tenant: string; callId: string }
}) {
  const session = await requireSession()

  const userId = session.userId
  const tenantId = session.tenantId
  const role = session.role as UserRole

  const call = await db.call.findUnique({
    where: { id: params.callId, tenantId },
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      property: {
        select: {
          id: true, address: true, city: true, state: true, status: true,
          sellers: { include: { seller: { select: { name: true, phone: true } } }, take: 1 },
        },
      },
    },
  })

  if (!call) notFound()

  const isOwn = call.assignedToId === userId
  const canSeeAll = hasPermission(role, 'calls.view.all')
  const canSeeTeam = hasPermission(role, 'calls.view.team')
  if (!isOwn && !canSeeAll && !canSeeTeam) redirect(`/${params.tenant}/calls`)

  const rubricScores = (call.rubricScores as Record<string, { score: number; maxScore: number; notes: string }> | null) ?? {}
  const coachingTips = (call.aiCoachingTips as string[] | null) ?? []
  const keyMoments = (call.keyMoments as Array<{ timestamp: string; type: string; description: string }> | null) ?? []
  const objections = (call.objections as Array<{ objection: string; response: string; handled: boolean }> | null) ?? []

  return (
    <CallDetailClient
      call={{
        id: call.id,
        score: call.score,
        gradingStatus: call.gradingStatus,
        callType: call.callType,
        callOutcome: call.callOutcome,
        direction: call.direction,
        durationSeconds: call.durationSeconds,
        calledAt: call.calledAt?.toISOString() ?? call.createdAt.toISOString(),
        recordingUrl: call.recordingUrl,
        transcript: call.transcript,
        aiSummary: call.aiSummary,
        aiFeedback: call.aiFeedback,
        sentiment: call.sentiment,
        sellerMotivation: call.sellerMotivation,
        talkRatio: call.talkRatio,
        nextBestAction: call.nextBestAction,
        keyMoments,
        objections,
        rubricScores,
        coachingTips,
        contactName: call.property?.sellers[0]?.seller.name ?? null,
        contactPhone: call.property?.sellers[0]?.seller.phone ?? null,
        assignedTo: call.assignedTo,
        property: call.property ? {
          id: call.property.id,
          address: call.property.address,
          city: call.property.city,
          state: call.property.state,
          status: call.property.status,
          sellerName: call.property.sellers[0]?.seller.name ?? null,
        } : null,
      }}
      tenantSlug={params.tenant}
      isOwn={isOwn}
    />
  )
}
