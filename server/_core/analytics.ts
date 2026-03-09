import { PostHog } from "posthog-node";

// Initialize PostHog client — reads from env var, gracefully no-ops if missing
const posthogApiKey = process.env.POSTHOG_API_KEY;

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!posthogApiKey) return null;
  if (!_client) {
    _client = new PostHog(posthogApiKey, {
      host: "https://us.i.posthog.com",
      flushAt: 20,
      flushInterval: 10000,
    });
  }
  return _client;
}

// ── Event helpers ────────────────────────────────────────────────────────────

export function trackUserLogin(params: {
  userId: string | number;
  email?: string;
  method?: "google" | "email" | "invite";
  tenantId?: string | number;
}) {
  const client = getClient();
  if (!client) return;
  client.capture({
    distinctId: String(params.userId),
    event: "user_login",
    properties: {
      email: params.email,
      login_method: params.method ?? "unknown",
      tenant_id: params.tenantId,
    },
  });
}

export function trackCallGraded(params: {
  userId: string | number;
  callId: string | number;
  tenantId?: string | number;
  score?: number;
  callType?: string;
}) {
  const client = getClient();
  if (!client) return;
  client.capture({
    distinctId: String(params.userId),
    event: "call_graded",
    properties: {
      call_id: params.callId,
      tenant_id: params.tenantId,
      score: params.score,
      call_type: params.callType,
    },
  });
}

export function trackCallViewed(params: {
  userId: string | number;
  callId: string | number;
  tenantId?: string | number;
}) {
  const client = getClient();
  if (!client) return;
  client.capture({
    distinctId: String(params.userId),
    event: "call_viewed",
    properties: {
      call_id: params.callId,
      tenant_id: params.tenantId,
    },
  });
}

export function trackEvent(
  userId: string | number,
  event: string,
  properties?: Record<string, unknown>
) {
  const client = getClient();
  if (!client) return;
  client.capture({
    distinctId: String(userId),
    event,
    properties: properties ?? {},
  });
}

/** Call on graceful shutdown to flush buffered events */
export async function shutdownAnalytics() {
  if (_client) {
    await _client.shutdown();
  }
}
