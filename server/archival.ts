/**
 * Call Archival Service
 * 
 * Archives calls older than 14 days by:
 * 1. Moving transcripts to S3 storage
 * 2. Setting isArchived flag to true
 * 3. Clearing the transcript field in the database to reduce size
 * 
 * Archived calls remain accessible for AI training via transcriptUrl
 */

import { getDb } from "./db";
import { calls } from "../drizzle/schema";
import { eq, and, lt, isNull, sql } from "drizzle-orm";
import { storagePut } from "./storage";

// Archive calls older than 14 days
const DEFAULT_ARCHIVE_THRESHOLD_DAYS = 14;

export interface ArchivalResult {
  totalArchived: number;
  transcriptsMovedToS3: number;
  errors: string[];
}

/**
 * Archive a single call - move transcript to S3 and mark as archived
 */
export async function archiveCall(callId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.error("[Archival] Database not available");
    return false;
  }

  try {
    // Get the call
    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call) {
      console.error(`[Archival] Call ${callId} not found`);
      return false;
    }

    if (call.isArchived === "true") {
      console.log(`[Archival] Call ${callId} already archived`);
      return true;
    }

    let transcriptUrl = call.transcriptUrl;

    // If there's a transcript, move it to S3
    if (call.transcript && call.transcript.length > 0) {
      const s3Key = `archived-transcripts/${callId}-${Date.now()}.txt`;
      const { url } = await storagePut(s3Key, call.transcript, "text/plain");
      transcriptUrl = url;
      console.log(`[Archival] Moved transcript for call ${callId} to S3: ${url}`);
    }

    // Update the call record
    await db
      .update(calls)
      .set({
        isArchived: "true",
        archivedAt: new Date(),
        transcriptUrl: transcriptUrl,
        transcript: null, // Clear transcript from DB to save space
      })
      .where(eq(calls.id, callId));

    console.log(`[Archival] Archived call ${callId}`);
    return true;
  } catch (error) {
    console.error(`[Archival] Error archiving call ${callId}:`, error);
    return false;
  }
}

/**
 * Run the archival job - archive all calls older than threshold
 */
export async function runArchivalJob(options?: { retentionDays?: number }): Promise<ArchivalResult> {
  const result: ArchivalResult = {
    totalArchived: 0,
    transcriptsMovedToS3: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    result.errors.push("Database not available");
    return result;
  }

  try {
    // Use configurable retention days (default 14)
    const thresholdDays = options?.retentionDays ?? DEFAULT_ARCHIVE_THRESHOLD_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

    console.log(`[Archival] Starting archival job (retention: ${thresholdDays} days). Archiving calls older than ${cutoffDate.toISOString()}`);

    // Find calls to archive
    const callsToArchive = await db
      .select({ id: calls.id, transcript: calls.transcript })
      .from(calls)
      .where(
        and(
          eq(calls.isArchived, "false"),
          lt(calls.createdAt, cutoffDate)
        )
      )
      .limit(100); // Process in batches of 100

    console.log(`[Archival] Found ${callsToArchive.length} calls to archive`);

    for (const call of callsToArchive) {
      try {
        const hadTranscript = call.transcript && call.transcript.length > 0;
        const success = await archiveCall(call.id);
        
        if (success) {
          result.totalArchived++;
          if (hadTranscript) {
            result.transcriptsMovedToS3++;
          }
        } else {
          result.errors.push(`Failed to archive call ${call.id}`);
        }
      } catch (error: any) {
        result.errors.push(`Error archiving call ${call.id}: ${error.message}`);
      }
    }

    console.log(`[Archival] Job complete. Archived: ${result.totalArchived}, Transcripts moved: ${result.transcriptsMovedToS3}, Errors: ${result.errors.length}`);
    return result;
  } catch (error: any) {
    result.errors.push(`Job error: ${error.message}`);
    console.error("[Archival] Job failed:", error);
    return result;
  }
}

/**
 * Get archival statistics
 */
export async function getArchivalStats(): Promise<{
  totalCalls: number;
  activeCalls: number;
  archivedCalls: number;
  oldestActiveCall: Date | null;
}> {
  const db = await getDb();
  if (!db) {
    return { totalCalls: 0, activeCalls: 0, archivedCalls: 0, oldestActiveCall: null };
  }

  const [stats] = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      archivedCalls: sql<number>`SUM(CASE WHEN ${calls.isArchived} = 'true' THEN 1 ELSE 0 END)`,
      oldestActiveCall: sql<Date>`MIN(CASE WHEN ${calls.isArchived} = 'false' THEN ${calls.createdAt} END)`,
    })
    .from(calls);

  return {
    totalCalls: Number(stats.totalCalls) || 0,
    archivedCalls: Number(stats.archivedCalls) || 0,
    activeCalls: (Number(stats.totalCalls) || 0) - (Number(stats.archivedCalls) || 0),
    oldestActiveCall: stats.oldestActiveCall || null,
  };
}

/**
 * Get transcript for a call (handles both active and archived)
 */
export async function getCallTranscript(callId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const [call] = await db
    .select({
      transcript: calls.transcript,
      transcriptUrl: calls.transcriptUrl,
      isArchived: calls.isArchived,
    })
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1);

  if (!call) return null;

  // If not archived, return the transcript directly
  if (call.isArchived === "false" && call.transcript) {
    return call.transcript;
  }

  // If archived, fetch from S3
  if (call.transcriptUrl) {
    try {
      const response = await fetch(call.transcriptUrl);
      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      console.error(`[Archival] Error fetching archived transcript for call ${callId}:`, error);
    }
  }

  return null;
}
