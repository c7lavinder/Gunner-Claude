// app/(tenant)/[tenant]/calls/[callId]/page.tsx
// Call detail — uses cached contactName, no live GHL lookup
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect, notFound } from 'next/navigation'
import { CallDetailClient } from '@/components/calls/call-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { getSignedAudioUrl } from '@/lib/storage/supabase'

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
          id: true, address: true, city: true, state: true, status: true, ghlPipelineStage: true,
          sellers: { include: { seller: { select: { name: true, phone: true } } }, take: 1 },
        },
      },
    },
  })

  // All properties linked to this contact (not just the one linked to this call)
  // — powers the multi-property header pills.
  const relatedProperties = call?.ghlContactId
    ? await db.property.findMany({
        where: { tenantId, ghlContactId: call.ghlContactId },
        select: { id: true, address: true, city: true, state: true, status: true },
        orderBy: { createdAt: 'desc' },
      })
    : []

  // Safe-cast aiNextSteps from Json to typed array
  const aiNextSteps = (call?.aiNextSteps as Array<{ type: string; label: string; reasoning: string; status: string; pushedAt: string | null }> | null) ?? null

  if (!call) notFound()

  const isOwn = call.assignedToId === userId
  const canSeeAll = hasPermission(role, 'calls.view.all')
  const canSeeTeam = hasPermission(role, 'calls.view.team')
  if (!isOwn && !canSeeAll && !canSeeTeam) redirect(`/${params.tenant}/calls`)

  const rubricScores = (call.rubricScores as Record<string, { score: number; maxScore: number; notes: string }> | null) ?? {}
  const coachingTips = (call.aiCoachingTips as string[] | null) ?? []
  const keyMoments = (call.keyMoments as Array<{ timestamp: string; type: string; description: string }> | null) ?? []
  const objections = (call.objections as Array<{ objection: string; response: string; handled: boolean }> | null) ?? []

  // Parse structured coaching data from aiFeedback (new format stores JSON string)
  let coachingData: {
    strengths: string[]
    redFlags: string[]
    improvements: Array<{ what_went_wrong: string; call_example: string; coaching_tip: string }>
    objectionReplies: Array<{ objection_label: string; call_quote: string; suggested_responses: string[] }>
  } = { strengths: [], redFlags: [], improvements: [], objectionReplies: [] }

  if (call.aiFeedback) {
    try {
      const parsed = JSON.parse(call.aiFeedback)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.strengths)) {
        coachingData = parsed
      }
    } catch {
      // Old format — aiFeedback is a plain string. Extract strengths from it for backwards compat.
      const lines = call.aiFeedback.split(/\n+/).map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(s => s.length > 15)
      coachingData.strengths = lines.slice(0, 4)
    }
  }

  const contactName = call.contactName ?? call.property?.sellers[0]?.seller.name ?? null
  const contactPhone = call.property?.sellers[0]?.seller.phone ?? null

  // Manual uploads: resolve Supabase Storage path to a signed URL for playback
  let playbackUrl: string | null = call.recordingUrl
  if (!playbackUrl && call.audioStoragePath) {
    const signed = await getSignedAudioUrl(call.audioStoragePath, 3600)
    if (signed.status === 'success' && signed.url) playbackUrl = signed.url
  }

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
        recordingUrl: playbackUrl,
        transcript: call.transcript,
        aiSummary: call.aiSummary,
        aiFeedback: call.aiFeedback,
        coachingData,
        sentiment: call.sentiment,
        sellerMotivation: call.sellerMotivation,
        talkRatio: call.talkRatio,
        nextBestAction: call.nextBestAction,
        keyMoments,
        objections,
        rubricScores,
        coachingTips,
        contactName,
        contactPhone,
        assignedTo: call.assignedTo,
        property: call.property ? {
          id: call.property.id,
          address: call.property.address,
          city: call.property.city,
          state: call.property.state,
          status: call.property.status,
          ghlPipelineStage: call.property.ghlPipelineStage,
          sellerName: call.property.sellers[0]?.seller.name ?? null,
        } : null,
        relatedProperties,
        aiNextSteps,
        isCalibration: call.isCalibration,
        calibrationNotes: call.calibrationNotes,
      }}
      tenantSlug={params.tenant}
      isOwn={isOwn}
    />
  )
}
