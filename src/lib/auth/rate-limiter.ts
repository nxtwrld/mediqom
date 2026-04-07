/**
 * In-memory rate limiter with namespace isolation.
 * Resets on cold start/deploy (acceptable for server-side protection).
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  remaining: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Check whether a request is within rate limits.
 *
 * @param namespace - Logical group (e.g. endpoint path)
 * @param key - Caller identity (e.g. user ID or IP)
 * @param maxRequests - Max allowed requests per window
 * @param windowMs - Sliding window duration in milliseconds
 */
export function checkRateLimit(
  namespace: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  if (!stores.has(namespace)) {
    stores.set(namespace, new Map());
  }
  const store = stores.get(namespace)!;

  const now = Date.now();

  // Lazy prune expired entries (at most once per call, cheap for small maps)
  for (const [k, entry] of store) {
    if (now - entry.windowStart > windowMs) {
      store.delete(k);
    }
  }

  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, retryAfterMs, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}
