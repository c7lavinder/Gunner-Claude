import { db } from "../_core/db";
import { coachActionLog, userEvents } from "../../drizzle/schema";
import { ENV } from "../_core/env";

type BufferedEvent = {
  tenantId: number;
  userId: number;
  eventType: string;
  page: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  source?: string;
};

const buffer: BufferedEvent[] = [];
const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_THRESHOLD = 50;

export function trackEvent(params: {
  tenantId: number;
  userId: number;
  eventType: string;
  page: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}): void {
  if (!ENV.isProduction) {
    console.log("[event]", params.eventType, params.page, params.metadata);
  }
  buffer.push(params);
  if (buffer.length >= FLUSH_THRESHOLD) void flushEvents();
}

export async function flushEvents(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    // Write to new user_events table
    await db.insert(userEvents).values(
      batch.map((e) => ({
        tenantId: e.tenantId,
        userId: e.userId,
        eventType: e.eventType,
        page: e.page,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        metadata: e.metadata ?? null,
        source: e.source ?? "user",
      }))
    );
    // Also write to legacy coachActionLog for backwards compatibility
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
