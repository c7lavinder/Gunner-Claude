/**
 * Voice transcription helper using internal Speech-to-Text service
 * Supports long audio files via automatic chunking (no compression)
 */
import { ENV } from "./env";
import { splitAudioIntoChunks, combineTranscripts, AudioChunk } from "../audioChunking";

export type TranscribeOptions = {
  audioUrl: string; // URL to the audio file (e.g., S3 URL)
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  prompt?: string; // Optional: custom prompt for the transcription
};

// Native Whisper API segment format
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Native Whisper API response format
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

/**
 * Transcribe a single audio buffer (must be under 25MB)
 */
async function transcribeBuffer(
  audioBuffer: Buffer,
  mimeType: string,
  options: TranscribeOptions
): Promise<WhisperResponse | TranscriptionError> {
  // Validate environment configuration
  if (!ENV.forgeApiUrl) {
    return {
      error: "Voice transcription service is not configured",
      code: "SERVICE_ERROR",
      details: "BUILT_IN_FORGE_API_URL is not set"
    };
  }
  if (!ENV.forgeApiKey) {
    return {
      error: "Voice transcription service authentication is missing",
      code: "SERVICE_ERROR",
      details: "BUILT_IN_FORGE_API_KEY is not set"
    };
  }

  // Create FormData for multipart upload to Whisper API
  const formData = new FormData();
  // Normalize MIME type: Whisper API only accepts standard types (audio/wav, audio/mp3, etc.)
  // Twilio returns audio/x-wav which Whisper rejects as "Invalid file format"
  const normalizedMime = normalizeMimeType(mimeType);
  const filename = `audio.${getFileExtension(mimeType)}`;
  const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: normalizedMime });
  formData.append("file", audioBlob, filename);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  
  const prompt = options.prompt || (
    options.language 
      ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
      : "Transcribe the user's voice to text"
  );
  formData.append("prompt", prompt);

  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();

  // Create abort controller with 10-minute timeout for long audio chunks
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 10 * 60 * 1000);
  
  let response;
  try {
    response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
      signal: abortController.signal,
    });
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      console.error('[Transcription] Request timed out after 10 minutes');
      return {
        error: "Transcription request timed out",
        code: "SERVICE_ERROR",
        details: "The transcription API took longer than 10 minutes to respond. The audio file may be too long or the service is overloaded."
      };
    }
    console.error('[Transcription] Fetch error:', fetchError);
    return {
      error: "Transcription request failed",
      code: "SERVICE_ERROR",
      details: fetchError instanceof Error ? fetchError.message : "Unknown fetch error"
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[Transcription] API error: ${response.status} ${response.statusText}`, errorText);
    return {
      error: "Transcription service request failed",
      code: "TRANSCRIPTION_FAILED",
      details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
    };
  }

  const whisperResponse = await response.json() as WhisperResponse;
  
  // Validate the response has the expected structure
  // Note: Whisper returns { text: "", segments: [] } for silent/empty audio — that's valid
  if (typeof whisperResponse.text !== 'string') {
    return {
      error: "Invalid transcription response",
      code: "SERVICE_ERROR",
      details: `Transcription service returned an invalid response format (text type: ${typeof whisperResponse.text})`
    };
  }

  return whisperResponse;
}

/**
 * Transcribe audio to text using the internal Speech-to-Text service
 * Automatically handles long audio files by chunking
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // Download audio from URL with timeout (10 minutes for large files)
    console.log(`[Transcription] Downloading audio from ${options.audioUrl}`);
    const downloadController = new AbortController();
    const downloadTimeout = setTimeout(() => downloadController.abort(), 10 * 60 * 1000);
    
    let response;
    try {
      response = await fetch(options.audioUrl, { signal: downloadController.signal });
    } catch (downloadError) {
      clearTimeout(downloadTimeout);
      if (downloadError instanceof Error && downloadError.name === 'AbortError') {
        return {
          error: "Audio download timed out",
          code: "SERVICE_ERROR",
          details: "Download took longer than 10 minutes"
        };
      }
      throw downloadError;
    } finally {
      clearTimeout(downloadTimeout);
    }
    if (!response.ok) {
      // Twilio/GHL recordings may not be immediately available after a call ends.
      // Retry up to 3 times with increasing delays for 404 errors.
      if (response.status === 404) {
        const retryDelays = [30_000, 60_000, 120_000]; // 30s, 60s, 2min
        for (let attempt = 0; attempt < retryDelays.length; attempt++) {
          console.log(`[Transcription] Recording returned 404, retrying in ${retryDelays[attempt] / 1000}s (attempt ${attempt + 1}/${retryDelays.length})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          try {
            const retryResponse = await fetch(options.audioUrl);
            if (retryResponse.ok) {
              response = retryResponse;
              console.log(`[Transcription] Recording available on retry attempt ${attempt + 1}`);
              break;
            }
            if (retryResponse.status !== 404) {
              return {
                error: "Failed to download audio file",
                code: "SERVICE_ERROR",
                details: `HTTP ${retryResponse.status} on retry`
              };
            }
          } catch (retryErr) {
            console.warn(`[Transcription] Retry ${attempt + 1} fetch error:`, retryErr);
          }
          if (attempt === retryDelays.length - 1) {
            return {
              error: "Failed to download audio file",
              code: "SERVICE_ERROR",
              details: `HTTP 404 after ${retryDelays.length} retries (recording not available)`
            };
          }
        }
      } else {
        return {
          error: "Failed to download audio file",
          code: "SERVICE_ERROR",
          details: `HTTP ${response.status}`
        };
      }
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "audio/mpeg";
    const sizeMB = audioBuffer.length / (1024 * 1024);
    
    console.log(`[Transcription] Downloaded ${sizeMB.toFixed(2)}MB audio file (${mimeType})`);

    // Split into chunks if needed (based on duration, not size)
    const chunkingResult = await splitAudioIntoChunks(audioBuffer, mimeType);
    
    if (!chunkingResult.success || !chunkingResult.chunks) {
      return {
        error: "Failed to process audio file",
        code: "SERVICE_ERROR",
        details: chunkingResult.error || "Unknown chunking error"
      };
    }

    const chunks = chunkingResult.chunks;
    console.log(`[Transcription] Processing ${chunks.length} chunk(s), total duration: ${chunkingResult.totalDuration?.toFixed(1)}s`);

    // If single chunk, transcribe directly
    if (chunks.length === 1) {
      const chunk = chunks[0];
      const chunkSizeMB = chunk.buffer.length / (1024 * 1024);
      
      // Check if single chunk is under 25MB limit
      if (chunkSizeMB > 25) {
        return {
          error: "Audio file is too large for transcription",
          code: "FILE_TOO_LARGE",
          details: `File is ${chunkSizeMB.toFixed(1)}MB, maximum is 25MB. FFmpeg is required to split long audio files.`
        };
      }
      
      return await transcribeBuffer(chunk.buffer, mimeType, options);
    }

    // Transcribe each chunk
    const chunkTranscripts: Array<{
      text: string;
      segments?: WhisperSegment[];
      chunk: AudioChunk;
    }> = [];

    for (const chunk of chunks) {
      const chunkSizeMB = chunk.buffer.length / (1024 * 1024);
      console.log(`[Transcription] Transcribing chunk ${chunk.chunkIndex + 1}/${chunks.length} (${chunkSizeMB.toFixed(2)}MB, ${chunk.startTime.toFixed(0)}s-${chunk.endTime.toFixed(0)}s)`);
      
      if (chunkSizeMB > 25) {
        return {
          error: `Chunk ${chunk.chunkIndex + 1} is too large`,
          code: "FILE_TOO_LARGE",
          details: `Chunk is ${chunkSizeMB.toFixed(1)}MB, maximum is 25MB`
        };
      }

      const result = await transcribeBuffer(chunk.buffer, mimeType, options);
      
      if ('error' in result) {
        return {
          error: `Failed to transcribe chunk ${chunk.chunkIndex + 1}`,
          code: result.code,
          details: result.details
        };
      }

      chunkTranscripts.push({
        text: result.text,
        segments: result.segments,
        chunk,
      });
    }

    // Combine all transcripts
    console.log(`[Transcription] Combining ${chunkTranscripts.length} transcripts`);
    const combined = combineTranscripts(chunkTranscripts);

    // Return combined result in Whisper format
    return {
      task: "transcribe",
      language: chunkTranscripts[0]?.segments?.[0] ? "en" : "en", // Default to English
      duration: chunkingResult.totalDuration || 0,
      text: combined.text,
      segments: combined.segments as WhisperSegment[],
    };

  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}

/**
 * Normalize non-standard MIME types to standard ones that Whisper API accepts.
 * Twilio returns audio/x-wav which Whisper rejects as "Invalid file format".
 */
function normalizeMimeType(mimeType: string): string {
  const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
  const mimeMap: Record<string, string> = {
    'audio/x-wav': 'audio/wav',
    'audio/x-wave': 'audio/wav',
    'audio/vnd.wave': 'audio/wav',
    'audio/x-ogg': 'audio/ogg',
    'audio/x-m4a': 'audio/m4a',
    'audio/x-flac': 'audio/flac',
    'audio/x-mp3': 'audio/mpeg',
  };
  return mimeMap[cleanMime] || cleanMime;
}

function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/x-wave': 'wav',
    'audio/vnd.wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/x-ogg': 'ogg',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'm4a',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
  };
  // Handle charset suffixes (e.g., 'audio/wav; charset=utf-8') and normalize
  const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
  return mimeToExt[cleanMime] || 'mp3'; // Default to mp3 (widely supported) instead of 'audio'
}

function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
  };
  return langMap[langCode] || langCode;
}
