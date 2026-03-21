// lib/ghl/fetch-recording.ts
// Fetches call recording from GHL's conversations/messages recording endpoint
// Recording endpoint: GET /conversations/messages/{messageId}/locations/{locationId}/recording
// Requires Version: 2021-04-15 header

import { db } from '@/lib/db/client'

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

// Fetch recording with retry — used after 90s delay
export async function fetchAndStoreRecording(
  callId: string,
  messageId: string,
): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
    select: {
      id: true,
      recordingUrl: true,
      tenant: {
        select: { ghlAccessToken: true, ghlLocationId: true },
      },
    },
  })

  if (!call || call.recordingUrl) return // already has recording or call deleted
  if (!call.tenant.ghlAccessToken || !call.tenant.ghlLocationId) return

  const result = await fetchCallRecording(
    call.tenant.ghlAccessToken,
    call.tenant.ghlLocationId,
    messageId,
  )

  if (result.status === 'success' && result.recordingUrl) {
    await db.call.update({
      where: { id: callId },
      data: { recordingUrl: result.recordingUrl },
    })
    console.log(`[Recording] Stored recording for call ${callId}: ${result.recordingUrl.slice(0, 80)}`)
  } else {
    console.warn(`[Recording] Failed for call ${callId} (msg: ${messageId}): ${result.error ?? result.status}`)
  }
}
