// lib/ai/transcribe.ts
// Transcribes call recordings using Deepgram
// Accepts a URL — Deepgram fetches the audio directly, no download needed

interface TranscriptionResult {
  status: 'success' | 'error'
  transcript?: string
  duration?: number
  error?: string
}

export async function transcribeRecording(recordingUrl: string): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return { status: 'error', error: 'DEEPGRAM_API_KEY not configured' }
  }

  try {
    // Use Deepgram REST API directly — simpler and more reliable than SDK
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: recordingUrl }),
    })

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
