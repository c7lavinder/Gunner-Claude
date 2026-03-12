/**
 * BullMQ Workers — process jobs from each queue.
 * Only starts workers when Redis is available.
 */
import { isRedisAvailable, getRedisConnection } from "./redis";
import { QUEUE_NAMES } from "./queues";

const activeWorkers: unknown[] = [];

async function startWorker(
  queueName: string,
  processor: (job: { id?: string; data: Record<string, unknown>; name: string }) => Promise<void>,
  concurrency = 3
): Promise<void> {
  const { Worker } = await import("bullmq");
  const conn = getRedisConnection()!;
  const worker = new Worker(queueName, processor, {
    connection: conn,
    concurrency,
  });
  worker.on("completed", (job) => {
    console.log(`[worker:${queueName}] Job ${job?.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker:${queueName}] Job ${job?.id} failed:`, (err as Error).message);
  });
  activeWorkers.push(worker);
  console.log(`[worker:${queueName}] Started (concurrency: ${concurrency})`);
}

export async function initWorkers(): Promise<void> {
  if (!isRedisAvailable()) {
    console.log("[workers] Redis not available — workers disabled");
    return;
  }

  // Webhook processing worker
  await startWorker(QUEUE_NAMES.WEBHOOK_PROCESSING, async (job) => {
    const { processWebhookJob } = await import("../middleware/webhookProcessor");
    await processWebhookJob(job.data);
  });

  // Webhook retry worker
  await startWorker(QUEUE_NAMES.WEBHOOK_RETRY, async (job) => {
    const { processWebhookJob } = await import("../middleware/webhookProcessor");
    await processWebhookJob(job.data);
  }, 1);

  // Call transcription worker
  await startWorker(QUEUE_NAMES.CALL_TRANSCRIPTION, async (job) => {
    const { processTranscriptionJob } = await import("../services/callPipeline");
    await processTranscriptionJob(job.data);
  }, 2);

  // Call grading worker
  await startWorker(QUEUE_NAMES.CALL_GRADING, async (job) => {
    const { processGradingJob } = await import("../services/callPipeline");
    await processGradingJob(job.data);
  }, 2);

  // Agent task worker
  await startWorker(QUEUE_NAMES.AGENT_TASKS, async (job) => {
    const { processAgentTask } = await import("../agents/orchestrator");
    await processAgentTask(job.data);
  }, 1);

  // Agent memory writer
  await startWorker(QUEUE_NAMES.AGENT_MEMORY, async (job) => {
    const { writeMemory } = await import("../memory/writer");
    await writeMemory(job.data);
  }, 1);

  // Notification worker
  await startWorker(QUEUE_NAMES.NOTIFICATIONS, async (job) => {
    const { processNotificationJob } = await import("../services/notificationWorker");
    await processNotificationJob(job.data);
  }, 2);

  // CRM sync worker
  await startWorker(QUEUE_NAMES.CRM_SYNC, async (job) => {
    const { processSyncJob } = await import("../services/syncWorker");
    await processSyncJob(job.data);
  }, 1);

  console.log(`[workers] All ${activeWorkers.length} workers started`);
}
