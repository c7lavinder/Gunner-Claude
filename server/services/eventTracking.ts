import { db } from "../_core/db";
import { coachActionLog } from "../../drizzle/schema";
import { ENV } from "../_core/env";

type BufferedEvent = {
  tenantId: number;
  userId: number;
  eventType: string;
  page: string;
  metadata?: Record<string, unknown>;
};

const buffer: BufferedEvent[] = [];
const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_THRESHOLD = 50;

export function trackEvent(params: {
  tenantId: number;
  userId: number;
  eventType: string;
  page: string;
  metadata?: Record<string, unknown>;
}): void {
  if (!ENV.isProduction) {
    console.log("[event]", params.eventType, params.page, params.metadata);
    return;
  }
  buffer.push(params);
  if (buffer.length >= FLUSH_THRESHOLD) flushEvents();
}

export async function flushEvents(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await db.insert(coachActionLog).values(
      batch.map((e) => ({
        tenantId: e.tenantId,
        requestedBy: e.userId,
        actionType: e.eventType,
        requestText: e.page,
        payload: e.metadata ?? null,
        status: "tracked",
      }))
    );
  } catch {
    buffer.unshift(...batch);
  }
}

export function startEventFlusher(): void {
  setInterval(() => void flushEvents(), FLUSH_INTERVAL_MS);
}
