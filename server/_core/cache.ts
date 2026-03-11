/**
 * Simple in-memory TTL cache for expensive read queries.
 * Entries automatically expire after the configured TTL.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    Array.from(this.store.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    });
  }

  clear(): void {
    this.store.clear();
  }
}

export const cache = new TtlCache();

/** Default TTLs */
export const TTL = {
  SHORT: 60_000,      // 1 minute
  MEDIUM: 5 * 60_000, // 5 minutes
  LONG: 15 * 60_000,  // 15 minutes
} as const;
