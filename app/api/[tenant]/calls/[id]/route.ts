// app/api/[tenant]/calls/[id]/route.ts
// DELETE a call and its dependent rows.
// Used when a call is clearly not useful (butt-dials, mis-logs, accidental entries).
//
// Cleanup order:
//   1. Supabase audio blob (if manualUpload)
//   2. RecordingFetchJob rows (no FK cascade)
//   3. The Call row itself (CallReclassification cascades automatically)
//
// WebhookLog.callId / ContactSuggestion.callId are plain strings (no FK),
// left untouched — they retain a historical reference to the now-deleted id.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { deleteCallAudio } from '@/lib/storage/supabase'

export const DELETE = withTenant<{ id: string }>(async (_req, ctx, params) => {
  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true, audioStoragePath: true, contactName: true, ghlCallId: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  if (call.audioStoragePath) {
    await deleteCallAudio(call.audioStoragePath).catch(err => {
      console.warn(`[delete-call] Storage delete failed for ${call.id}:`, err instanceof Error ? err.message : err)
    })
  }

  await db.recordingFetchJob.deleteMany({
    where: { callId: call.id, tenantId: ctx.tenantId },
  })

  await db.call.delete({
    where: { id: call.id },
  })

  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      action: 'call.deleted',
      resource: 'call',
      resourceId: call.id,
      source: 'USER',
      severity: 'INFO',
      userId: ctx.userId,
      payload: { contactName: call.contactName, ghlCallId: call.ghlCallId },
    },
  }).catch(() => {})

  return NextResponse.json({ success: true })
})
