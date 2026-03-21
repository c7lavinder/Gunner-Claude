// lib/ai/transcribe.ts
// Transcribes call recordings using Deepgram
// GHL recording URLs require authentication, so we download the audio first
// then send the raw audio buffer to Deepgram

interface TranscriptionResult {
  status: 'success' | 'error'
  transcript?: string
  duration?: number
  error?: string
}

export async function transcribeRecording(
  recordingUrl: string,
  ghlAccessToken?: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return { status: 'error', error: 'DEEPGRAM_API_KEY not configured' }
  }

  try {
    // Step 1: Download the recording (GHL URLs require Bearer token)
    const isGHLUrl = recordingUrl.includes('leadconnectorhq.com') || recordingUrl.includes('services.leadconnector')
    let audioBuffer: ArrayBuffer

    if (isGHLUrl && ghlAccessToken) {
      const downloadRes = await fetch(recordingUrl, {
        headers: {
          'Authorization': `Bearer ${ghlAccessToken}`,
          'Version': '2021-04-15',
        },
      })
      if (!downloadRes.ok) {
        return { status: 'error', error: `Recording download failed (${downloadRes.status}): ${(await downloadRes.text()).slice(0, 200)}` }
      }
      audioBuffer = await downloadRes.arrayBuffer()
    } else {
      // Public URL — download directly
      const downloadRes = await fetch(recordingUrl)
      if (!downloadRes.ok) {
        return { status: 'error', error: `Recording download failed (${downloadRes.status})` }
      }
      audioBuffer = await downloadRes.arrayBuffer()
    }

    if (audioBuffer.byteLength < 1000) {
      return { status: 'error', error: `Recording too small (${audioBuffer.byteLength} bytes) — likely not a valid audio file` }
    }

    // Step 2: Send raw audio to Deepgram
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'audio/mpeg',
        },
        body: audioBuffer,
      },
    )

    if (!response.ok) {
      const errText = await response.text()
      return { status: 'error', error: `Deepgram API ${response.status}: ${errText.substring(0, 200)}` }
    }

    const result = await response.json()
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript
    const duration = result?.metadata?.duration

    if (!transcript) {
      return { status: 'error', error: 'No transcript returned from Deepgram' }
    }

    return {
      status: 'success',
      transcript,
      duration: duration ? Math.round(duration) : undefined,
    }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown transcription error',
    }
  }
}
