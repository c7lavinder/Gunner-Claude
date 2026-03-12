/**
 * Queue Manager — creates BullMQ Queue instances or provides in-memory fallback.
 * Import this anywhere you need to add jobs to a queue.
 *
 * Usage:
 *   import { queueManager } from "../queues";
 *   await queueManager.add("webhook:processing", { eventId: 123, payload: {...} });
 */
import { getRedisConnection, isRedisAvailable } from "./redis";
import { RETRY_CONFIG, type QueueName } from "./queues";

interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

interface QueueManagerInterface {
  add(queueName: QueueName, data: Record<string, unknown>, opts?: JobOptions): Promise<string>;
  getQueueStats(queueName: QueueName): Promise<{ waiting: number; active: number; completed: number; failed: number }>;
  isAvailable(): boolean;
}

/**
 * In-memory fallback when Redis is not available.
 * Jobs are processed immediately via registered handlers.
 */
class InMemoryQueueManager implements QueueManagerInterface {
  private handlers = new Map<string, (data: Record<string, unknown>) => Promise<void>>();
  private jobCounter = 0;

  async add(queueName: QueueName, data: Record<string, unknown>, _opts?: JobOptions): Promise<string> {
    const jobId = `mem-${++this.jobCounter}`;
    const handler = this.handlers.get(queueName);
    if (handler) {
      // Process async but don't block the caller
      handler(data).catch((err) => {
        console.error(`[queue:memory] ${queueName} job ${jobId} failed:`, err);
      });
    } else {
      console.warn(`[queue:memory] No handler for ${queueName}, job ${jobId} dropped`);
    }
    return jobId;
  }

  registerHandler(queueName: QueueName, handler: (data: Record<string, unknown>) => Promise<void>): void {
    this.handlers.set(queueName, handler);
  }

  async getQueueStats(_queueName: QueueName) {
    return { waiting: 0, active: 0, completed: 0, failed: 0 };
  }

  isAvailable(): boolean {
    return false;
  }
}

/**
 * BullMQ-powered queue manager when Redis is available.
 */
class BullMQQueueManager implements QueueManagerInterface {
  private queues = new Map<string, unknown>();
  private initialized = false;

  private async ensureQueue(queueName: QueueName) {
    if (!this.initialized) {
      // Dynamic import so BullMQ is only loaded when Redis is available
      this.initialized = true;
    }
    if (!this.queues.has(queueName)) {
      const { Queue } = await import("bullmq");
      const conn = getRedisConnection()!;
      const queue = new Queue(queueName, {
        connection: conn,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
          ...(RETRY_CONFIG[queueName] ?? {}),
        },
      });
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName) as InstanceType<typeof import("bullmq").Queue>;
  }

  async add(queueName: QueueName, data: Record<string, unknown>, opts?: JobOptions): Promise<string> {
    const queue = await this.ensureQueue(queueName);
    const job = await queue.add(queueName, data, {
      priority: opts?.priority,
      delay: opts?.delay,
      attempts: opts?.attempts,
      removeOnComplete: opts?.removeOnComplete,
      removeOnFail: opts?.removeOnFail,
    });
    return job.id ?? "unknown";
  }

  async getQueueStats(queueName: QueueName) {
    const queue = await this.ensureQueue(queueName);
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }

  isAvailable(): boolean {
    return true;
  }
}

/** Singleton queue manager — auto-selects BullMQ or in-memory based on Redis */
function createQueueManager(): QueueManagerInterface & { registerHandler?: (queueName: QueueName, handler: (data: Record<string, unknown>) => Promise<void>) => void } {
  if (isRedisAvailable()) {
    console.log("[queues] Using BullMQ with Redis");
    return new BullMQQueueManager();
  }
  console.log("[queues] Using in-memory queue fallback");
  return new InMemoryQueueManager();
}

export let queueManager: ReturnType<typeof createQueueManager>;

export function initQueueManager(): void {
  queueManager = createQueueManager();
}
