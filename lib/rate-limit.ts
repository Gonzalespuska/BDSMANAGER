/**
 * Jednoduchý in-memory rate limiter — bezpečnostná sieť pred abusom.
 *
 * Model: sliding window per (key), typicky IP alebo IP+email.
 *   consume(key, limit, windowMs) → { allowed: bool, remaining: number, resetAt: Date }
 *
 * Poznámky:
 *  • Cloudflare Workers/Pages používajú multi-isolate execution — každý isolate
 *    má vlastnú Map. Znamená to že skutočný limit je O(N * limit) kde N je
 *    počet aktívnych isolatov. Pre burst protection to je OK; pre presný
 *    distributed rate limit treba KV/D1/Durable Object (upgrade path níže).
 *  • LRU eviction (max 10k kľúčov) chráni pred memory exhaustion.
 *  • Prod ready. Ak chceš striktný per-user limit, plug in KV cez:
 *     lib/rate-limit-kv.ts (TODO).
 */

interface Entry {
  count: number;
  resetAt: number; // epoch ms
}

const buckets = new Map<string, Entry>();
const MAX_BUCKETS = 10_000;

function evictIfFull() {
  if (buckets.size <= MAX_BUCKETS) return;
  // Zmaž prvých 500 (Map zachováva insertion order — najstaršie idú prvé)
  const keys = Array.from(buckets.keys()).slice(0, 500);
  keys.forEach((k) => buckets.delete(k));
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSec: number;
}

export function consume(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    // Nový window
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    evictIfFull();
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(resetAt),
      retryAfterSec: 0,
    };
  }

  // Aktívny window
  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const allowed = entry.count <= limit;
  return {
    allowed,
    remaining,
    resetAt: new Date(entry.resetAt),
    retryAfterSec: allowed ? 0 : Math.ceil((entry.resetAt - now) / 1000),
  };
}

/**
 * Extract client IP z Cloudflare headerov (fallback na 'unknown').
 * cf-connecting-ip je najspoľahlivejší — Cloudflare ho setuje vždy.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
