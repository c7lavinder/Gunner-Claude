/**
 * Pure JavaScript Audio Compression
 * Uses mpg123-decoder for MP3 decoding and lamejs for MP3 encoding
 * Works in any environment without FFmpeg
 * Designed to handle calls up to 90+ minutes
 */

import { Mp3Encoder } from "@breezystack/lamejs";
import { MPEGDecoder } from "mpg123-decoder";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE_MB = 24; // Leave buffer under 25MB limit
const TARGET_BITRATE = 96; // 96kbps for speech - high quality transcription
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
 * Decode MP3 file to PCM samples using mpg123-decoder
 */
async function decodeMp3(buffer: Buffer): Promise<{
  leftChannel: Float32Array;
  rightChannel?: Float32Array;
  sampleRate: number;
  channels: number;
} | { error: string }> {
  try {
    const decoder = new MPEGDecoder();
    await decoder.ready;

    const result = decoder.decode(new Uint8Array(buffer));
    
    if (!result || result.samplesDecoded === 0) {
      decoder.free();
      return { error: "Failed to decode MP3: no samples extracted" };
    }

    const channels = result.channelData.length;
    const sampleRate = result.sampleRate;
    
    console.log(`[AudioCompressionJS] Decoded MP3: ${result.samplesDecoded} samples, ${sampleRate}Hz, ${channels}ch`);

    const leftChannel = result.channelData[0];
    const rightChannel = channels > 1 ? result.channelData[1] : undefined;

    decoder.free();

    return { leftChannel, rightChannel, sampleRate, channels };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to decode MP3" };
  }
}

/**
 * Decode WAV file to PCM samples
 */
function decodeWav(buffer: Buffer): { 
  leftChannel: Float32Array; 
  rightChannel?: Float32Array;
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
    
    // Convert to Float32Array (normalized -1 to 1)
    const leftChannel = new Float32Array(samplesPerChannel);
    const rightChannel = channels > 1 ? new Float32Array(samplesPerChannel) : undefined;

    for (let i = 0; i < samplesPerChannel; i++) {
      const frameOffset = dataOffset + i * bytesPerSample * channels;
      
      if (bitsPerSample === 16) {
        leftChannel[i] = buffer.readInt16LE(frameOffset) / 32768;
        if (rightChannel && channels > 1) {
          rightChannel[i] = buffer.readInt16LE(frameOffset + bytesPerSample) / 32768;
        }
      } else if (bitsPerSample === 8) {
        leftChannel[i] = (buffer.readUInt8(frameOffset) - 128) / 128;
        if (rightChannel && channels > 1) {
          rightChannel[i] = (buffer.readUInt8(frameOffset + 1) - 128) / 128;
        }
      }
    }

    return { leftChannel, rightChannel, sampleRate, channels };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to decode WAV" };
  }
}

/**
 * Resample Float32Array audio to target sample rate using linear interpolation
 */
function resampleFloat32(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;

  const ratio = fromRate / toRate;
  const newLength = Math.floor(samples.length / ratio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    
    if (srcIndex + 1 < samples.length) {
      // Linear interpolation
      resampled[i] = samples[srcIndex] * (1 - frac) + samples[srcIndex + 1] * frac;
    } else {
      resampled[i] = samples[srcIndex];
    }
  }

  return resampled;
}

/**
 * Convert Float32Array to Int16Array for lamejs encoder
 */
function float32ToInt16(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to -1 to 1 range and convert to Int16
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = Math.round(clamped * 32767);
  }
  return int16;
}

/**
 * Mix stereo to mono by averaging channels
 */
function stereoToMono(left: Float32Array, right: Float32Array): Float32Array {
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) / 2;
  }
  return mono;
}

/**
 * Encode PCM samples to MP3 using lamejs
 */
function encodePCMtoMP3(samples: Int16Array, sampleRate: number, bitrate: number): Buffer {
  const encoder = new Mp3Encoder(1, sampleRate, bitrate); // Mono
  const mp3Data: Uint8Array[] = [];

  const sampleBlockSize = 1152;
  for (let i = 0; i < samples.length; i += sampleBlockSize) {
    const chunk = samples.subarray(i, Math.min(i + sampleBlockSize, samples.length));
    const mp3buf = encoder.encodeBuffer(chunk);
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

  return Buffer.from(result);
}

/**
 * Compress audio using pure JavaScript (decode -> resample -> encode)
 */
async function compressWithJS(
  audioBuffer: Buffer,
  mimeType: string
): Promise<JSCompressionResult> {
  const originalSizeMB = audioBuffer.length / (1024 * 1024);

  try {
    // Decode based on format
    let decoded: { leftChannel: Float32Array; rightChannel?: Float32Array; sampleRate: number; channels: number } | { error: string };
    
    if (mimeType.includes("mp3") || mimeType.includes("mpeg")) {
      console.log("[AudioCompressionJS] Decoding MP3 with mpg123-decoder...");
      decoded = await decodeMp3(audioBuffer);
    } else if (mimeType.includes("wav") || mimeType.includes("wave")) {
      console.log("[AudioCompressionJS] Decoding WAV...");
      decoded = decodeWav(audioBuffer);
    } else {
      return {
        success: false,
        originalSizeMB,
        error: `Unsupported format for JS compression: ${mimeType}`,
        method: "lamejs",
      };
    }

    if ("error" in decoded) {
      return {
        success: false,
        originalSizeMB,
        error: decoded.error,
        method: "lamejs",
      };
    }

    // Convert stereo to mono if needed
    let monoSamples: Float32Array;
    if (decoded.rightChannel) {
      console.log("[AudioCompressionJS] Converting stereo to mono...");
      monoSamples = stereoToMono(decoded.leftChannel, decoded.rightChannel);
    } else {
      monoSamples = decoded.leftChannel;
    }

    // Resample to target rate
    console.log(`[AudioCompressionJS] Resampling from ${decoded.sampleRate}Hz to ${TARGET_SAMPLE_RATE}Hz...`);
    const resampled = resampleFloat32(monoSamples, decoded.sampleRate, TARGET_SAMPLE_RATE);
    console.log(`[AudioCompressionJS] Resampled: ${resampled.length} samples`);

    // Convert to Int16 for lamejs
    const int16Samples = float32ToInt16(resampled);

    // Encode to MP3
    console.log(`[AudioCompressionJS] Encoding to MP3 at ${TARGET_BITRATE}kbps...`);
    let compressedBuffer = encodePCMtoMP3(int16Samples, TARGET_SAMPLE_RATE, TARGET_BITRATE);
    let compressedSizeMB = compressedBuffer.length / (1024 * 1024);

    // If still too large, try lower bitrate
    if (compressedSizeMB > MAX_FILE_SIZE_MB) {
      console.log(`[AudioCompressionJS] Still ${compressedSizeMB.toFixed(2)}MB, trying 16kbps...`);
      compressedBuffer = encodePCMtoMP3(int16Samples, TARGET_SAMPLE_RATE, 16);
      compressedSizeMB = compressedBuffer.length / (1024 * 1024);
    }

    console.log(`[AudioCompressionJS] JS compression: ${originalSizeMB.toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB`);

    if (compressedSizeMB > MAX_FILE_SIZE_MB) {
      return {
        success: false,
        originalSizeMB,
        compressedSizeMB,
        error: `Compressed file still too large: ${compressedSizeMB.toFixed(2)}MB (limit: ${MAX_FILE_SIZE_MB}MB)`,
        method: "lamejs",
      };
    }

    return {
      success: true,
      compressedBuffer,
      originalSizeMB,
      compressedSizeMB,
      method: "lamejs",
    };
  } catch (error) {
    console.error("[AudioCompressionJS] JS compression error:", error);
    return {
      success: false,
      originalSizeMB,
      error: error instanceof Error ? error.message : "JS compression failed",
      method: "lamejs",
    };
  }
}

/**
 * Main compression function - tries FFmpeg first, falls back to pure JS
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

  // Try FFmpeg first (works for all formats, best quality)
  const hasFfmpeg = await checkFfmpeg();
  if (hasFfmpeg) {
    console.log("[AudioCompressionJS] FFmpeg available, using FFmpeg compression");
    const result = await compressWithFfmpeg(audioBuffer, mimeType);
    if (result.success) {
      return result;
    }
    console.warn(`[AudioCompressionJS] FFmpeg failed: ${result.error}`);
  } else {
    console.log("[AudioCompressionJS] FFmpeg not available, using pure JS compression");
  }

  // Fall back to pure JavaScript compression
  const result = await compressWithJS(audioBuffer, mimeType);
  return result;
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
