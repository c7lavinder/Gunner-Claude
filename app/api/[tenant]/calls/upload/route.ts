// app/api/[tenant]/calls/upload/route.ts
// Manual call upload — audio file (MP3/MP4/M4A/WAV) or pasted transcript.
// Linked to a GHL contact, grading fires after creation.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { gradeCall } from '@/lib/ai/grading'
import { transcribeBuffer } from '@/lib/ai/transcribe'
import { uploadCallAudio } from '@/lib/storage/supabase'
import { logFailure } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_FILE_BYTES = 100 * 1024 * 1024 // 100 MB
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_PER_WINDOW = 3     // 3 uploads per user per minute

// Best-effort in-memory limiter. Resets on restart; per-instance if scaled.
const uploadAttempts = new Map<string, number[]>()
function checkRateLimit(userId: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const prev = (uploadAttempts.get(userId) ?? []).filter(t => t > cutoff)
  if (prev.length >= RATE_LIMIT_PER_WINDOW) {
    return { ok: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - prev[0]) }
  }
  prev.push(now)
  uploadAttempts.set(userId, prev)
  return { ok: true }
}
const ALLOWED_AUDIO_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
  'video/mp4',
]
const MIN_TRANSCRIPT_CHARS = 50

const metadataSchema = z.object({
  ghlContactId: z.string().min(1, 'Contact is required'),
  contactName: z.string().optional(),
  callType: z.string().min(1, 'Call type is required'),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
  assignedToId: z.string().optional(),
})

export const POST = withTenant<{ tenant: string }>(async (request, ctx) => {
  const rate = checkRateLimit(ctx.userId)
  if (!rate.ok) {
    return NextResponse.json(
      { success: false, error: `Too many uploads. Try again in ${Math.ceil(rate.retryAfterMs / 1000)}s.` },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 })
  }

  const parsed = metadataSchema.safeParse({
    ghlContactId: form.get('ghlContactId'),
    contactName: form.get('contactName') ?? undefined,
    callType: form.get('callType'),
    direction: form.get('direction') ?? 'OUTBOUND',
    assignedToId: form.get('assignedToId') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }
  const meta = parsed.data

  const file = form.get('file')
  const transcriptRaw = form.get('transcript')
  const hasFile = file instanceof File && file.size > 0
  const hasTranscript = typeof transcriptRaw === 'string' && transcriptRaw.trim().length >= MIN_TRANSCRIPT_CHARS

  if (!hasFile && !hasTranscript) {
    return NextResponse.json(
      { success: false, error: 'Provide an audio file or a transcript (min 50 chars)' },
      { status: 400 },
    )
  }
  if (hasFile && hasTranscript) {
    return NextResponse.json(
      { success: false, error: 'Provide either audio or transcript, not both' },
      { status: 400 },
    )
  }

  if (hasFile) {
    const f = file as File
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` },
        { status: 413 },
      )
    }
    if (!ALLOWED_AUDIO_MIMES.includes(f.type.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${f.type || 'unknown'}` },
        { status: 415 },
      )
    }
  }

  const assignedToId = meta.assignedToId ?? ctx.userId

  // Create the Call row first so we have an ID for the storage path
  let callId: string
  try {
    const created = await db.call.create({
      data: {
        tenantId: ctx.tenantId,
        ghlContactId: meta.ghlContactId,
        contactName: meta.contactName ?? null,
        callType: meta.callType,
        direction: meta.direction,
        assignedToId,
        calledAt: new Date(),
        gradingStatus: 'PENDING',
        manualUpload: true,
        source: 'manual_upload',
        ...(hasTranscript
          ? { transcript: (transcriptRaw as string).trim() }
          : {}),
      },
      select: { id: true },
    })
    callId = created.id
  } catch (err) {
    await logFailure(ctx.tenantId, 'call.manual_upload.create', 'calls', err, {
      ghlContactId: meta.ghlContactId,
    })
    return NextResponse.json({ success: false, error: 'Failed to create call' }, { status: 500 })
  }

  // Audio path: upload to Supabase, transcribe, update row.
  // FIX (cross-tenant defense): the three call.update sites below previously
  // scoped only by id (callId is the just-created row, so no active leak —
  // but a future refactor that derives callId from somewhere other than
  // this handler's create() would break the boundary silently). Tenant
  // scope on each update makes the safety structural.
  if (hasFile) {
    const f = file as File
    const arrayBuffer = await f.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const uploaded = await uploadCallAudio(ctx.tenantId, callId, buffer, f.type)
    if (uploaded.status === 'error') {
      await logFailure(ctx.tenantId, 'call.manual_upload.storage', 'calls', uploaded.error, { callId })
      await db.call.update({
        where: { id: callId, tenantId: ctx.tenantId },
        data: { gradingStatus: 'FAILED', aiSummary: `Upload failed: ${uploaded.error}` },
      })
      return NextResponse.json({ success: false, error: `Upload failed: ${uploaded.error}` }, { status: 500 })
    }

    const transcription = await transcribeBuffer(arrayBuffer, f.type)
    if (transcription.status === 'error' || !transcription.transcript) {
      await logFailure(ctx.tenantId, 'call.manual_upload.transcribe', 'calls', transcription.error, { callId })
      await db.call.update({
        where: { id: callId, tenantId: ctx.tenantId },
        data: {
          gradingStatus: 'FAILED',
          audioStoragePath: uploaded.path,
          aiSummary: `Transcription failed: ${transcription.error ?? 'unknown'}`,
        },
      })
      return NextResponse.json(
        { success: false, error: `Transcription failed: ${transcription.error ?? 'unknown'}` },
        { status: 500 },
      )
    }

    await db.call.update({
      where: { id: callId, tenantId: ctx.tenantId },
      data: {
        audioStoragePath: uploaded.path,
        transcript: transcription.transcript,
        durationSeconds: transcription.duration ?? null,
      },
    })
  }

  // Fire-and-forget grading
  gradeCall(callId).catch(err => {
    logFailure(ctx.tenantId, 'call.manual_upload.grade', 'calls', err, { callId }).catch(() => {})
  })

  return NextResponse.json({ success: true, data: { callId } })
})
