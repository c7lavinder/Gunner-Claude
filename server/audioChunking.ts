/**
 * Audio Chunking for Long Calls
 * Splits long audio files into chunks, transcribes each, and combines results
 * No compression - preserves original audio quality
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

// Whisper API limit is 25MB, but we use duration-based chunking for reliability
const MAX_CHUNK_DURATION_SECONDS = 900; // 15 minutes per chunk

// Use ffmpeg-static for bundled FFmpeg binary (works in production)
let FFMPEG_PATH = '/usr/bin/ffmpeg'; // Default fallback

// Try to load ffmpeg-static at runtime
async function getFfmpegPath(): Promise<string> {
  try {
    // Dynamic import for ESM compatibility
    const ffmpegStatic = await import('ffmpeg-static');
    const path = ffmpegStatic.default || ffmpegStatic;
    if (path && typeof path === 'string') {
      console.log('[AudioChunking] Using ffmpeg-static:', path);
      return path;
    }
  } catch (e) {
    console.log('[AudioChunking] ffmpeg-static not available, using system FFmpeg');
  }
  return '/usr/bin/ffmpeg';
}

// Initialize FFmpeg path
let ffmpegPathPromise: Promise<string> | null = null;
function ensureFfmpegPath(): Promise<string> {
  if (!ffmpegPathPromise) {
    ffmpegPathPromise = getFfmpegPath().then(path => {
      FFMPEG_PATH = path;
      return path;
    });
  }
  return ffmpegPathPromise;
}

export interface AudioChunk {
  buffer: Buffer;
  startTime: number; // seconds from start of original audio
  endTime: number;
  chunkIndex: number;
}

export interface ChunkingResult {
  success: boolean;
  chunks?: AudioChunk[];
  totalDuration?: number;
  error?: string;
}

/**
 * Check if FFmpeg is available
 */
async function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, 3000);

    try {
      const proc = spawn(FFMPEG_PATH, ["-version"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 3000,
      });

      proc.on("error", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });

      proc.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(code === 0);
        }
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(false);
      }
    }
  });
}

/**
 * Get audio duration using FFprobe
 */
async function getAudioDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? null : duration);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Extract a chunk of audio using FFmpeg
 */
async function extractChunk(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_PATH, [
      "-i", inputPath,
      "-ss", startTime.toString(),
      "-t", duration.toString(),
      "-c", "copy", // Copy without re-encoding to preserve quality
      "-y",
      outputPath,
    ]);

    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Split audio file into chunks for transcription
 * Returns original file as single chunk if under 15 minutes
 */
export async function splitAudioIntoChunks(
  audioBuffer: Buffer,
  mimeType: string
): Promise<ChunkingResult> {
  // Ensure FFmpeg path is loaded (uses ffmpeg-static if available)
  await ensureFfmpegPath();
  const hasFfmpeg = await checkFfmpeg();
  
  if (!hasFfmpeg) {
    // Without FFmpeg, we can't split - return original as single chunk
    // This will work for files under 25MB
    console.warn('[AudioChunking] FFmpeg not available - cannot split long audio files. Long calls may fail.');
    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 25) {
      return {
        success: false,
        error: `File is ${sizeMB.toFixed(1)}MB. FFmpeg is required to split large audio files for transcription.`,
      };
    }
    
    return {
      success: true,
      chunks: [{
        buffer: audioBuffer,
        startTime: 0,
        endTime: 0, // Unknown without FFmpeg
        chunkIndex: 0,
      }],
      totalDuration: 0,
    };
  }

  const tempDir = tmpdir();
  const sessionId = randomUUID();
  const ext = getExtension(mimeType);
  const inputPath = join(tempDir, `${sessionId}_input.${ext}`);

  try {
    // Write input file
    await fs.writeFile(inputPath, audioBuffer);

    // Get duration
    const totalDuration = await getAudioDuration(inputPath);
    if (!totalDuration) {
      return {
        success: false,
        error: "Could not determine audio duration",
      };
    }

    console.log(`[AudioChunking] Total duration: ${totalDuration.toFixed(1)}s (${(totalDuration / 60).toFixed(1)} minutes)`);

    // If under chunk limit, return as single chunk
    if (totalDuration <= MAX_CHUNK_DURATION_SECONDS) {
      console.log(`[AudioChunking] Audio is under ${MAX_CHUNK_DURATION_SECONDS / 60} minutes, no chunking needed`);
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

    // Calculate number of chunks needed
    const numChunks = Math.ceil(totalDuration / MAX_CHUNK_DURATION_SECONDS);
    console.log(`[AudioChunking] Splitting into ${numChunks} chunks of ~${MAX_CHUNK_DURATION_SECONDS / 60} minutes each`);

    const chunks: AudioChunk[] = [];

    for (let i = 0; i < numChunks; i++) {
      const startTime = i * MAX_CHUNK_DURATION_SECONDS;
      const chunkDuration = Math.min(MAX_CHUNK_DURATION_SECONDS, totalDuration - startTime);
      const endTime = startTime + chunkDuration;
      
      const chunkPath = join(tempDir, `${sessionId}_chunk_${i}.${ext}`);
      
      console.log(`[AudioChunking] Extracting chunk ${i + 1}/${numChunks}: ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`);
      
      const success = await extractChunk(inputPath, chunkPath, startTime, chunkDuration);
      if (!success) {
        return {
          success: false,
          error: `Failed to extract chunk ${i + 1}`,
        };
      }

      const chunkBuffer = await fs.readFile(chunkPath);
      chunks.push({
        buffer: chunkBuffer,
        startTime,
        endTime,
        chunkIndex: i,
      });

      // Clean up chunk file
      await fs.unlink(chunkPath).catch(() => {});
    }

    return {
      success: true,
      chunks,
      totalDuration,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to split audio",
    };
  } finally {
    // Clean up input file
    await fs.unlink(inputPath).catch(() => {});
  }
}

/**
 * Combine transcripts from multiple chunks into a single transcript
 * Adjusts segment timestamps to reflect position in original audio
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

function getExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };
  return mimeToExt[mimeType] || "mp3";
}
