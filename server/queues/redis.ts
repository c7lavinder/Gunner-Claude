/**
 * Redis connection manager for BullMQ queues.
 * If REDIS_URL is not set, all queue operations become no-ops.
 */

export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  tls?: object;
}

let connection: RedisConnectionConfig | null = null;
let available = false;

function parseRedisUrl(url: string): RedisConnectionConfig {
  const parsed = new URL(url);
  const cfg: RedisConnectionConfig = {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
  };
  if (parsed.password) cfg.password = parsed.password;
  if (parsed.protocol === "rediss:") cfg.tls = {};
  return cfg;
}

export function initRedis(redisUrl: string | undefined): void {
  if (!redisUrl) {
    console.log("[queues] REDIS_URL not set — queues disabled, using in-memory fallback");
    return;
  }
  try {
    connection = parseRedisUrl(redisUrl);
    available = true;
    console.log(`[queues] Redis configured: ${connection.host}:${connection.port}`);
  } catch (err) {
    console.warn("[queues] Failed to parse REDIS_URL:", err);
  }
}

export function getRedisConnection(): RedisConnectionConfig | null {
  return connection;
}

export function isRedisAvailable(): boolean {
  return available;
}
