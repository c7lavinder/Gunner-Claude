/**
 * All BullMQ queue definitions for GunnerAI.
 *
 * Queues:
 *  - webhook:processing    — Incoming GHL webhook events
 *  - webhook:retry         — Failed webhook retries with backoff
 *  - calls:transcription   — Audio transcription jobs
 *  - calls:grading         — AI grading pipeline
 *  - agents:tasks          — Agent task orchestration (P0-P4 priority)
 *  - agents:memory         — Agent memory writes (decisions, bugs, experiments)
 *  - notifications:email   — Email notifications (digests, alerts)
 *  - sync:crm              — CRM data sync (polling, reconciliation)
 */

export const QUEUE_NAMES = {
  WEBHOOK_PROCESSING: "webhook:processing",
  WEBHOOK_RETRY: "webhook:retry",
  CALL_TRANSCRIPTION: "calls:transcription",
  CALL_GRADING: "calls:grading",
  AGENT_TASKS: "agents:tasks",
  AGENT_MEMORY: "agents:memory",
  NOTIFICATIONS: "notifications:email",
  CRM_SYNC: "sync:crm",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Agent task priority levels */
export const PRIORITY = {
  P0_CRITICAL: 1,
  P1_HIGH: 2,
  P2_MEDIUM: 3,
  P3_LOW: 4,
  P4_ENHANCEMENT: 5,
} as const;

/** Default retry config per queue */
export const RETRY_CONFIG: Record<string, { attempts: number; backoff: { type: "exponential" | "fixed"; delay: number } }> = {
  [QUEUE_NAMES.WEBHOOK_PROCESSING]: { attempts: 1, backoff: { type: "fixed", delay: 0 } },
  [QUEUE_NAMES.WEBHOOK_RETRY]: { attempts: 4, backoff: { type: "exponential", delay: 60_000 } },
  [QUEUE_NAMES.CALL_TRANSCRIPTION]: { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
  [QUEUE_NAMES.CALL_GRADING]: { attempts: 3, backoff: { type: "exponential", delay: 15_000 } },
  [QUEUE_NAMES.AGENT_TASKS]: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
  [QUEUE_NAMES.AGENT_MEMORY]: { attempts: 2, backoff: { type: "fixed", delay: 1_000 } },
  [QUEUE_NAMES.NOTIFICATIONS]: { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
  [QUEUE_NAMES.CRM_SYNC]: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } },
};
