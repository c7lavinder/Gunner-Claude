// lib/ghl/fetch-recording.ts
// Fetches call recording from GHL's conversations/messages recording endpoint
// Recording endpoint: GET /conversations/messages/{messageId}/locations/{locationId}/recording
// Requires Version: 2021-04-15 header

import { db } from '@/lib/db/client'
import { logFailure } from '@/lib/audit'
import { getGHLClient } from './client'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_RECORDING_API_VERSION = '2021-04-15'

interface RecordingResult {
  status: 'success' | 'not_found' | 'error'
  recordingUrl?: string
  error?: string
}

export async function fetchCallRecording(
  accessToken: string,
  locationId: string,
  messageId: string,
): Promise<RecordingResult> {
  try {
    const url = `${GHL_BASE_URL}/conversations/messages/${messageId}/locations/${locationId}/recording`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': GHL_RECORDING_API_VERSION,
      },
    })

    if (response.status === 404) {
      return { status: 'not_found', error: 'Recording not available yet or does not exist' }
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return { status: 'error', error: `GHL recording API ${response.status}: ${errText.slice(0, 200)}` }
    }

    // Response could be JSON with a URL or direct audio binary
    const contentType = response.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const data = await response.json() as Record<string, unknown>
      // Try common field names for the URL
      const recordingUrl = (data.url ?? data.recordingUrl ?? data.recording_url ?? data.recordingURL) as string | undefined
      if (recordingUrl) {
        return { status: 'success', recordingUrl }
      }
      // If JSON but no URL field, return the full response for debugging
      return { status: 'error', error: `JSON response but no URL field: ${JSON.stringify(data).slice(0, 300)}` }
    }

    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      // Direct audio binary — the URL itself IS the recording URL
      return { status: 'success', recordingUrl: url }
    }

    // Try to parse as text — might be a plain URL
    const text = await response.text()
    if (text.startsWith('http')) {
      return { status: 'success', recordingUrl: text.trim() }
    }

    return { status: 'error', error: `Unexpected content-type: ${contentType}, body: ${text.slice(0, 200)}` }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Fetch recording with retry — uses getGHLClient for auto-refreshed tokens
export async function fetchAndStoreRecording(
  callId: string,
  messageId: string,
): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
    select: { id: true, tenantId: true, recordingUrl: true },
  })
  if (!call || call.recordingUrl) return // already has recording or call deleted

  let client
  try {
    client = await getGHLClient(call.tenantId)
  } catch (err) {
    console.error(`[Recording] No GHL client for call ${callId}:`, err instanceof Error ? err.message : err)
    throw err // rethrow so the cron worker (Fix #2) retries with backoff
  }

  const result = await fetchCallRecording(client.accessToken, client.locationId, messageId)

  if (result.status === 'success' && result.recordingUrl) {
    await db.call.update({
      where: { id: callId },
      data: { recordingUrl: result.recordingUrl },
    })
    console.log(`[Recording] Stored recording for call ${callId}: ${result.recordingUrl.slice(0, 80)}`)

    // Re-evaluate: if this call was falsely marked FAILED at webhook time, flip back to PENDING
    const updated = await db.call.findUnique({
      where: { id: callId },
      select: { gradingStatus: true, callResult: true },
    })
    if (updated?.gradingStatus === 'FAILED' && (updated.callResult === 'no_answer' || updated.callResult === 'short_call')) {
      await db.call.update({
        where: { id: callId },
        data: { gradingStatus: 'PENDING', callResult: null, aiSummary: null },
      })
      console.log(`[Recording] Flipped call ${callId} from FAILED back to PENDING — recording arrived`)
      const { gradeCall } = await import('@/lib/ai/grading')
      gradeCall(callId).catch(err =>
        logFailure(call.tenantId, 'recording.regrade_failed', 'call', err, { callId, messageId })
      )
    }
  } else {
    console.warn(`[Recording] Failed for call ${callId} (msg: ${messageId}): ${result.error ?? result.status}`)
    throw new Error(result.error ?? `Recording fetch ${result.status}`)
  }
}
