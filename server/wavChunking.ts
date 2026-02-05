/**
 * Pure JavaScript WAV Audio Chunking
 * Splits WAV files into chunks without external dependencies (no FFmpeg required)
 * Works by parsing WAV header and splitting by byte position
 */

const MAX_CHUNK_DURATION_SECONDS = 900; // 15 minutes per chunk

export interface AudioChunk {
  buffer: Buffer;
  startTime: number;
  endTime: number;
  chunkIndex: number;
}

export interface ChunkingResult {
  success: boolean;
  chunks?: AudioChunk[];
  totalDuration?: number;
  error?: string;
}

interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  byteRate: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
}

/**
 * Parse WAV file header to extract audio properties
 */
function parseWavHeader(buffer: Buffer): WavHeader | null {
  try {
    // Check RIFF header
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') {
      console.log('[WavChunking] Not a RIFF file, got:', riff);
      return null;
    }

    // Check WAVE format
    const wave = buffer.toString('ascii', 8, 12);
    if (wave !== 'WAVE') {
      console.log('[WavChunking] Not a WAVE file, got:', wave);
      return null;
    }

    // Find fmt chunk
    let offset = 12;
    let fmtChunkFound = false;
    let numChannels = 0;
    let sampleRate = 0;
    let byteRate = 0;
    let blockAlign = 0;
    let bitsPerSample = 0;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ') {
        fmtChunkFound = true;
        numChannels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        byteRate = buffer.readUInt32LE(offset + 16);
        blockAlign = buffer.readUInt16LE(offset + 20);
        bitsPerSample = buffer.readUInt16LE(offset + 22);
        console.log(`[WavChunking] Format: ${numChannels} channels, ${sampleRate}Hz, ${bitsPerSample} bits`);
      }

      if (chunkId === 'data') {
        if (!fmtChunkFound) {
          console.log('[WavChunking] Data chunk found before fmt chunk');
          return null;
        }

        return {
          sampleRate,
          numChannels,
          bitsPerSample,
          byteRate,
          blockAlign,
          dataOffset: offset + 8,
          dataSize: chunkSize,
        };
      }

      offset += 8 + chunkSize;
      // Align to even byte boundary
      if (chunkSize % 2 !== 0) {
        offset += 1;
      }
    }

    console.log('[WavChunking] Could not find data chunk');
    return null;
  } catch (error) {
    console.error('[WavChunking] Error parsing WAV header:', error);
    return null;
  }
}

/**
 * Create a new WAV file buffer from a portion of the original
 */
function createWavChunk(
  originalBuffer: Buffer,
  header: WavHeader,
  startByte: number,
  endByte: number
): Buffer {
  const dataSize = endByte - startByte;
  const fileSize = 44 + dataSize; // Standard WAV header is 44 bytes

  const chunkBuffer = Buffer.alloc(fileSize);

  // RIFF header
  chunkBuffer.write('RIFF', 0);
  chunkBuffer.writeUInt32LE(fileSize - 8, 4);
  chunkBuffer.write('WAVE', 8);

  // fmt chunk
  chunkBuffer.write('fmt ', 12);
  chunkBuffer.writeUInt32LE(16, 16); // fmt chunk size
  chunkBuffer.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  chunkBuffer.writeUInt16LE(header.numChannels, 22);
  chunkBuffer.writeUInt32LE(header.sampleRate, 24);
  chunkBuffer.writeUInt32LE(header.byteRate, 28);
  chunkBuffer.writeUInt16LE(header.blockAlign, 32);
  chunkBuffer.writeUInt16LE(header.bitsPerSample, 34);

  // data chunk
  chunkBuffer.write('data', 36);
  chunkBuffer.writeUInt32LE(dataSize, 40);

  // Copy audio data
  originalBuffer.copy(chunkBuffer, 44, header.dataOffset + startByte, header.dataOffset + endByte);

  return chunkBuffer;
}

/**
 * Split WAV audio file into chunks for transcription
 * Pure JavaScript implementation - no FFmpeg required
 */
export async function splitWavIntoChunks(audioBuffer: Buffer): Promise<ChunkingResult> {
  console.log(`[WavChunking] Processing ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB WAV file`);

  const header = parseWavHeader(audioBuffer);
  if (!header) {
    return {
      success: false,
      error: 'Could not parse WAV file header',
    };
  }

  // Calculate total duration
  const totalDuration = header.dataSize / header.byteRate;
  console.log(`[WavChunking] Total duration: ${totalDuration.toFixed(1)}s (${(totalDuration / 60).toFixed(1)} minutes)`);

  // If under chunk limit, return as single chunk
  if (totalDuration <= MAX_CHUNK_DURATION_SECONDS) {
    console.log(`[WavChunking] Audio is under ${MAX_CHUNK_DURATION_SECONDS / 60} minutes, no chunking needed`);
    return {
      success: true,
      chunks: [{
        buffer: audioBuffer,
        startTime: 0,
        endTime: totalDuration,
        chunkIndex: 0,
      }],
      totalDuration,
    };
  }

  // Calculate bytes per chunk (aligned to block boundary)
  const bytesPerSecond = header.byteRate;
  const bytesPerChunk = Math.floor((MAX_CHUNK_DURATION_SECONDS * bytesPerSecond) / header.blockAlign) * header.blockAlign;

  const numChunks = Math.ceil(header.dataSize / bytesPerChunk);
  console.log(`[WavChunking] Splitting into ${numChunks} chunks of ~${MAX_CHUNK_DURATION_SECONDS / 60} minutes each`);

  const chunks: AudioChunk[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startByte = i * bytesPerChunk;
    const endByte = Math.min((i + 1) * bytesPerChunk, header.dataSize);
    const startTime = startByte / bytesPerSecond;
    const endTime = endByte / bytesPerSecond;

    console.log(`[WavChunking] Creating chunk ${i + 1}/${numChunks}: ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`);

    const chunkBuffer = createWavChunk(audioBuffer, header, startByte, endByte);
    
    chunks.push({
      buffer: chunkBuffer,
      startTime,
      endTime,
      chunkIndex: i,
    });
  }

  return {
    success: true,
    chunks,
    totalDuration,
  };
}

/**
 * Check if a buffer is a WAV file
 */
export function isWavFile(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  return riff === 'RIFF' && wave === 'WAVE';
}

/**
 * Combine transcripts from multiple chunks into a single transcript
 */
export function combineTranscripts(
  chunkTranscripts: Array<{
    text: string;
    segments?: Array<{
      start: number;
      end: number;
      text: string;
      [key: string]: unknown;
    }>;
    chunk: AudioChunk;
  }>
): {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    [key: string]: unknown;
  }>;
} {
  // Sort by chunk index to ensure correct order
  const sorted = [...chunkTranscripts].sort((a, b) => a.chunk.chunkIndex - b.chunk.chunkIndex);

  // Combine text with proper spacing
  const combinedText = sorted.map(t => t.text.trim()).join(" ");

  // Combine and adjust segments
  const combinedSegments: Array<{
    start: number;
    end: number;
    text: string;
    [key: string]: unknown;
  }> = [];

  for (const transcript of sorted) {
    if (transcript.segments) {
      for (const segment of transcript.segments) {
        combinedSegments.push({
          ...segment,
          start: segment.start + transcript.chunk.startTime,
          end: segment.end + transcript.chunk.startTime,
        });
      }
    }
  }

  return {
    text: combinedText,
    segments: combinedSegments,
  };
}
