// lib/ai/transcribe.ts
// Transcribes call recordings using Deepgram
// GHL recording URLs require authentication, so we download the audio first
// then send the raw audio buffer to Deepgram

export interface TranscriptionResult {
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
      return {
        status: 'error',
        error: `Recording too small (${audioBuffer.byteLength} bytes) — likely not a valid audio file`,
        duration: sniffWavDuration(audioBuffer) ?? undefined,
      }
    }

    const probedDuration = sniffWavDuration(audioBuffer)
    const result = await postToDeepgram(audioBuffer, 'audio/mpeg', apiKey)
    // Always return duration when we can derive it — lets callers make short-call
    // skip decisions even when Deepgram returns empty/error.
    if (probedDuration !== null && !result.duration) {
      return { ...result, duration: probedDuration }
    }
    return result
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown transcription error',
    }
  }
}

// Parse RIFF/WAVE header to get audio duration in seconds.
// Returns null for non-WAV or unparseable buffers — callers should fall back.
function sniffWavDuration(buffer: ArrayBuffer): number | null {
  if (buffer.byteLength < 44) return null
  const view = new DataView(buffer)
  // "RIFF" = 0x52 0x49 0x46 0x46
  if (view.getUint32(0, false) !== 0x52494646) return null
  // "WAVE" at offset 8
  if (view.getUint32(8, false) !== 0x57415645) return null
  // byteRate lives at offset 28 (little-endian uint32) in the fmt chunk
  const byteRate = view.getUint32(28, true)
  if (!byteRate) return null
  // Find the "data" chunk — scan byte-by-byte after the fmt chunk
  const bytes = new Uint8Array(buffer)
  for (let i = 36; i < bytes.length - 8; i++) {
    if (bytes[i] === 0x64 && bytes[i + 1] === 0x61 && bytes[i + 2] === 0x74 && bytes[i + 3] === 0x61) {
      const dataSize = view.getUint32(i + 4, true)
      return Math.round(dataSize / byteRate)
    }
  }
  return null
}

export async function transcribeBuffer(
  buffer: ArrayBuffer | Buffer,
  mimeType: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return { status: 'error', error: 'DEEPGRAM_API_KEY not configured' }
  }
  const audio: ArrayBuffer = Buffer.isBuffer(buffer)
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    : buffer
  if (audio.byteLength < 1000) {
    return { status: 'error', error: `Audio too small (${audio.byteLength} bytes)` }
  }
  return postToDeepgram(audio, mimeType || 'audio/mpeg', apiKey)
}

async function postToDeepgram(
  audioBuffer: ArrayBuffer,
  contentType: string,
  apiKey: string,
): Promise<TranscriptionResult> {
  try {
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': contentType,
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
