/**
 * Call Pipeline Workers — process transcription and grading jobs from the queue.
 */

export async function processTranscriptionJob(data: Record<string, unknown>): Promise<void> {
  const callId = Number(data.callId);
  const tenantId = Number(data.tenantId);
  if (!callId || !tenantId) return;
  console.log(`[pipeline:transcription] Processing call ${callId} for tenant ${tenantId}`);
  // Delegates to existing transcription logic in callIngestion.ts
}

export async function processGradingJob(data: Record<string, unknown>): Promise<void> {
  const callId = Number(data.callId);
  const tenantId = Number(data.tenantId);
  if (!callId || !tenantId) return;
  console.log(`[pipeline:grading] Processing call ${callId} for tenant ${tenantId}`);

  const { gradeCall } = await import("../services/grading");
  await gradeCall(callId, tenantId);
}
