/**
 * Pure JavaScript Audio Compression
 * Uses lamejs for MP3 encoding - works in any environment without FFmpeg
 * Designed to handle calls up to 90+ minutes
 * 
 * Strategy: Since lamejs only has Mp3Encoder (no decoder), we:
 * 1. First try FFmpeg if available (best quality)
 * 2. Fall back to sending the file and letting the API handle it
 * 3. For WAV files, we can decode and re-encode directly
 */

import { Mp3Encoder, WavHeader } from "@breezystack/lamejs";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE_MB = 24; // Leave buffer under 25MB limit
const TARGET_BITRATE = 32; // 32kbps for speech
const TARGET_SAMPLE_RATE = 16000; // 16kHz for speech
const FFMPEG_PATH = "/usr/bin/ffmpeg";

export interface JSCompressionResult {
  success: boolean;
  compressedBuffer?: Buffer;
  originalSizeMB: number;
  compressedSizeMB?: number;
  error?: string;
  method?: "ffmpeg" | "lamejs" | "none";
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
 * Compress audio using FFmpeg (preferred method)
 */
async function compressWithFfmpeg(
  audioBuffer: Buffer,
  mimeType: string
): Promise<JSCompressionResult> {
  const originalSizeMB = audioBuffer.length / (1024 * 1024);
  const tempDir = tmpdir();
  const inputId = randomUUID();
  const outputId = randomUUID();
  const inputExt = getExtension(mimeType);
  const inputPath = join(tempDir, `${inputId}.${inputExt}`);
  const outputPath = join(tempDir, `${outputId}.mp3`);

  try {
    await fs.writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, [
        "-i", inputPath,
        "-ac", "1",                         // Mono
        "-ar", TARGET_SAMPLE_RATE.toString(), // 16kHz
        "-b:a", `${TARGET_BITRATE}k`,       // 32kbps
        "-f", "mp3",
        "-y",
        outputPath,
      ]);

      let stderr = "";
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (err) => reject(err));
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });
    });

    const compressedBuffer = await fs.readFile(outputPath);
    const compressedSizeMB = compressedBuffer.length / (1024 * 1024);

    console.log(`[AudioCompressionJS] FFmpeg: ${originalSizeMB.toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB`);

    return {
      success: true,
      compressedBuffer,
      originalSizeMB,
      compressedSizeMB,
      method: "ffmpeg",
    };
  } catch (error) {
    return {
      success: false,
      originalSizeMB,
      error: error instanceof Error ? error.message : "FFmpeg compression failed",
      method: "ffmpeg",
    };
  } finally {
    try {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Decode WAV file to PCM samples
 */
function decodeWav(buffer: Buffer): { 
  leftChannel: Int16Array; 
  rightChannel?: Int16Array;
  sampleRate: number; 
  channels: number;
} | { error: string } {
  try {
    const riff = buffer.toString("ascii", 0, 4);
    if (riff !== "RIFF") {
      return { error: "Invalid WAV file: missing RIFF header" };
    }

    const wave = buffer.toString("ascii", 8, 12);
    if (wave !== "WAVE") {
      return { error: "Invalid WAV file: missing WAVE format" };
    }

    let offset = 12;
    let channels = 2;
    let sampleRate = 44100;
    let bitsPerSample = 16;
    let dataOffset = 0;
    let dataSize = 0;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString("ascii", offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === "fmt ") {
        const audioFormat = buffer.readUInt16LE(offset + 8);
        if (audioFormat !== 1) {
          return { error: "Only PCM WAV files are supported" };
        }
        channels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        bitsPerSample = buffer.readUInt16LE(offset + 22);
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
      if (chunkSize % 2 !== 0) offset++;
    }

    if (dataOffset === 0) {
      return { error: "Invalid WAV file: missing data chunk" };
    }

    const bytesPerSample = bitsPerSample / 8;
    const samplesPerChannel = Math.floor(dataSize / (bytesPerSample * channels));
    
    const leftChannel = new Int16Array(samplesPerChannel);
    const rightChannel = channels > 1 ? new Int16Array(samplesPerChannel) : undefined;

    for (let i = 0; i < samplesPerChannel; i++) {
      const frameOffset = dataOffset + i * bytesPerSample * channels;
      
      if (bitsPerSample === 16) {
        leftChannel[i] = buffer.readInt16LE(frameOffset);
        if (rightChannel && channels > 1) {
          rightChannel[i] = buffer.readInt16LE(frameOffset + bytesPerSample);
        }
      } else if (bitsPerSample === 8) {
        leftChannel[i] = (buffer.readUInt8(frameOffset) - 128) * 256;
        if (rightChannel && channels > 1) {
          rightChannel[i] = (buffer.readUInt8(frameOffset + 1) - 128) * 256;
        }
      }
    }

    return { leftChannel, rightChannel, sampleRate, channels };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to decode WAV" };
  }
}

/**
 * Resample audio to target sample rate using linear interpolation
 */
function resample(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return samples;

  const ratio = fromRate / toRate;
  const newLength = Math.floor(samples.length / ratio);
  const resampled = new Int16Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    
    if (srcIndex + 1 < samples.length) {
      // Linear interpolation
      resampled[i] = Math.round(samples[srcIndex] * (1 - frac) + samples[srcIndex + 1] * frac);
    } else {
      resampled[i] = samples[srcIndex];
    }
  }

  return resampled;
}

/**
 * Compress WAV file using lamejs (pure JavaScript)
 */
function compressWavWithLamejs(
  audioBuffer: Buffer
): JSCompressionResult {
  const originalSizeMB = audioBuffer.length / (1024 * 1024);

  try {
    const decoded = decodeWav(audioBuffer);
    if ("error" in decoded) {
      return { success: false, originalSizeMB, error: decoded.error, method: "lamejs" };
    }

    console.log(`[AudioCompressionJS] Decoded WAV: ${decoded.leftChannel.length} samples, ${decoded.sampleRate}Hz, ${decoded.channels}ch`);

    // Resample to target rate
    let leftResampled = resample(decoded.leftChannel, decoded.sampleRate, TARGET_SAMPLE_RATE);
    let rightResampled = decoded.rightChannel 
      ? resample(decoded.rightChannel, decoded.sampleRate, TARGET_SAMPLE_RATE)
      : undefined;

    console.log(`[AudioCompressionJS] Resampled to ${TARGET_SAMPLE_RATE}Hz: ${leftResampled.length} samples`);

    // Encode to MP3
    const channels = rightResampled ? 2 : 1;
    const encoder = new Mp3Encoder(channels, TARGET_SAMPLE_RATE, TARGET_BITRATE);
    const mp3Data: Uint8Array[] = [];

    const sampleBlockSize = 1152;
    for (let i = 0; i < leftResampled.length; i += sampleBlockSize) {
      const leftChunk = leftResampled.subarray(i, Math.min(i + sampleBlockSize, leftResampled.length));
      const rightChunk = rightResampled?.subarray(i, Math.min(i + sampleBlockSize, rightResampled.length));
      
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }

    const flushBuf = encoder.flush();
    if (flushBuf.length > 0) {
      mp3Data.push(new Uint8Array(flushBuf));
    }

    const totalLength = mp3Data.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of mp3Data) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    const compressedBuffer = Buffer.from(result);
    const compressedSizeMB = compressedBuffer.length / (1024 * 1024);

    console.log(`[AudioCompressionJS] Lamejs: ${originalSizeMB.toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB`);

    return {
      success: true,
      compressedBuffer,
      originalSizeMB,
      compressedSizeMB,
      method: "lamejs",
    };
  } catch (error) {
    return {
      success: false,
      originalSizeMB,
      error: error instanceof Error ? error.message : "Lamejs compression failed",
      method: "lamejs",
    };
  }
}

/**
 * Main compression function - tries FFmpeg first, falls back to lamejs for WAV
 */
export async function compressAudioJS(
  audioBuffer: Buffer,
  mimeType: string
): Promise<JSCompressionResult> {
  const originalSizeMB = audioBuffer.length / (1024 * 1024);

  // If already under limit, no compression needed
  if (originalSizeMB <= MAX_FILE_SIZE_MB) {
    return {
      success: true,
      compressedBuffer: audioBuffer,
      originalSizeMB,
      compressedSizeMB: originalSizeMB,
      method: "none",
    };
  }

  console.log(`[AudioCompressionJS] File is ${originalSizeMB.toFixed(2)}MB, attempting compression...`);

  // Try FFmpeg first (works for all formats)
  const hasFfmpeg = await checkFfmpeg();
  if (hasFfmpeg) {
    console.log("[AudioCompressionJS] FFmpeg available, using FFmpeg compression");
    const result = await compressWithFfmpeg(audioBuffer, mimeType);
    if (result.success) {
      return result;
    }
    console.warn(`[AudioCompressionJS] FFmpeg failed: ${result.error}`);
  } else {
    console.log("[AudioCompressionJS] FFmpeg not available");
  }

  // Fall back to lamejs for WAV files
  if (mimeType.includes("wav") || mimeType.includes("wave")) {
    console.log("[AudioCompressionJS] Trying lamejs for WAV file");
    const result = compressWavWithLamejs(audioBuffer);
    if (result.success) {
      return result;
    }
    console.warn(`[AudioCompressionJS] Lamejs failed: ${result.error}`);
  }

  // No compression available for this format
  return {
    success: false,
    originalSizeMB,
    error: `Cannot compress ${mimeType} without FFmpeg. File size: ${originalSizeMB.toFixed(2)}MB exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
  };
}

/**
 * Download and compress audio from URL
 */
export async function downloadAndCompressAudioJS(
  audioUrl: string
): Promise<{
  buffer: Buffer;
  mimeType: string;
  wasCompressed: boolean;
  originalSizeMB: number;
  finalSizeMB: number;
} | { error: string }> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      return { error: `Failed to download audio: HTTP ${response.status}` };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "audio/mpeg";
    const originalSizeMB = audioBuffer.length / (1024 * 1024);

    if (originalSizeMB <= MAX_FILE_SIZE_MB) {
      return {
        buffer: audioBuffer,
        mimeType,
        wasCompressed: false,
        originalSizeMB,
        finalSizeMB: originalSizeMB,
      };
    }

    console.log(`[AudioCompressionJS] File is ${originalSizeMB.toFixed(2)}MB, compression required...`);
    const result = await compressAudioJS(audioBuffer, mimeType);

    if (!result.success || !result.compressedBuffer) {
      return { error: result.error || "Compression failed" };
    }

    return {
      buffer: result.compressedBuffer,
      mimeType: "audio/mpeg",
      wasCompressed: true,
      originalSizeMB,
      finalSizeMB: result.compressedSizeMB || originalSizeMB,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to process audio",
    };
  }
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
