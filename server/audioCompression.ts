/**
 * Audio compression utility for large call recordings
 * Compresses audio to 16kbps mono to fit within transcription service limits
 * Supports calls up to 120+ minutes
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE_MB = 16;
const TARGET_BITRATE = "16k"; // 16kbps - optimal for speech transcription
const SAMPLE_RATE = 16000; // 16kHz - standard for speech

export interface CompressionResult {
  success: boolean;
  compressedBuffer?: Buffer;
  originalSizeMB: number;
  compressedSizeMB?: number;
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
        console.warn("[AudioCompression] FFmpeg check timed out");
        resolve(false);
      }
    }, 5000);

    try {
      const proc = spawn("/usr/bin/ffmpeg", ["-version"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      });

      proc.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error("[AudioCompression] FFmpeg check error:", err.message);
          resolve(false);
        }
      });

      proc.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (code === 0) {
            console.log("[AudioCompression] FFmpeg is available");
            resolve(true);
          } else {
            console.warn(`[AudioCompression] FFmpeg exited with code ${code}`);
            resolve(false);
          }
        }
      });
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.error("[AudioCompression] FFmpeg spawn error:", err);
        resolve(false);
      }
    }
  });
}

/**
 * Compress audio buffer to 16kbps mono MP3
 */
export async function compressAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<CompressionResult> {
  const originalSizeMB = audioBuffer.length / (1024 * 1024);

  // If already under limit, no compression needed
  if (originalSizeMB <= MAX_FILE_SIZE_MB) {
    return {
      success: true,
      compressedBuffer: audioBuffer,
      originalSizeMB,
      compressedSizeMB: originalSizeMB,
    };
  }

  // Check if FFmpeg is available
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    return {
      success: false,
      originalSizeMB,
      error: "FFmpeg not available for audio compression",
    };
  }

  const tempDir = tmpdir();
  const inputId = randomUUID();
  const outputId = randomUUID();
  const inputExt = getExtension(mimeType);
  const inputPath = join(tempDir, `${inputId}.${inputExt}`);
  const outputPath = join(tempDir, `${outputId}.mp3`);

  try {
    // Write input file
    await fs.writeFile(inputPath, audioBuffer);

    // Compress with FFmpeg
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("/usr/bin/ffmpeg", [
        "-i", inputPath,
        "-ac", "1",                    // Mono
        "-ar", SAMPLE_RATE.toString(), // 16kHz sample rate
        "-b:a", TARGET_BITRATE,        // 16kbps bitrate
        "-f", "mp3",                   // MP3 format
        "-y",                          // Overwrite output
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
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
    });

    // Read compressed file
    const compressedBuffer = await fs.readFile(outputPath);
    const compressedSizeMB = compressedBuffer.length / (1024 * 1024);

    console.log(
      `[AudioCompression] Compressed ${originalSizeMB.toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB`
    );

    return {
      success: true,
      compressedBuffer,
      originalSizeMB,
      compressedSizeMB,
    };
  } catch (error) {
    return {
      success: false,
      originalSizeMB,
      error: error instanceof Error ? error.message : "Compression failed",
    };
  } finally {
    // Cleanup temp files
    try {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Download and compress audio from URL if needed
 */
export async function downloadAndCompressAudio(
  audioUrl: string
): Promise<{
  buffer: Buffer;
  mimeType: string;
  wasCompressed: boolean;
  originalSizeMB: number;
  finalSizeMB: number;
} | { error: string }> {
  try {
    // Download audio
    const response = await fetch(audioUrl);
    if (!response.ok) {
      return { error: `Failed to download audio: HTTP ${response.status}` };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "audio/mpeg";
    const originalSizeMB = audioBuffer.length / (1024 * 1024);

    // Check if compression is needed
    if (originalSizeMB <= MAX_FILE_SIZE_MB) {
      return {
        buffer: audioBuffer,
        mimeType,
        wasCompressed: false,
        originalSizeMB,
        finalSizeMB: originalSizeMB,
      };
    }

    // Compress
    console.log(
      `[AudioCompression] File is ${originalSizeMB.toFixed(2)}MB, attempting compression...`
    );
    const result = await compressAudio(audioBuffer, mimeType);

    if (!result.success || !result.compressedBuffer) {
      // Fallback: If compression failed, try sending the original file anyway
      // Whisper API might handle it, or will give us a proper error message
      console.warn(
        `[AudioCompression] Compression failed (${result.error}), attempting to send original file to Whisper API`
      );
      return {
        buffer: audioBuffer,
        mimeType,
        wasCompressed: false,
        originalSizeMB,
        finalSizeMB: originalSizeMB,
      };
    }

    return {
      buffer: result.compressedBuffer,
      mimeType: "audio/mpeg", // Compressed to MP3
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
