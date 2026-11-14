import "server-only";

import { createHash } from "node:crypto";

import type { NextResponse } from "next/server";

export interface RateLimitOptions {
  /** Separate budgets per feature, e.g. "generate" vs "leads". */
  namespace: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the window resets. */
  resetAt: number;
  /** Seconds until the client may retry. */
  retryAfter: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Fixed-window limiter keyed by a hashed IP, so raw addresses are never kept
 * in memory or logs. Per serverless instance — for strict global limits on
 * Vercel, back this with Upstash Redis or Vercel KV.
 */
export function rateLimit(
  request: Request,
  { namespace, max, windowMs }: RateLimitOptions,
): RateLimitResult {
  const ip = clientIp(request);
  const key = createHash("sha256")
    .update(`${namespace}:${ip}`)
    .digest("hex")
    .slice(0, 24);

  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  // Opportunistic cleanup so the map can't grow forever.
  if (buckets.size > 1000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return {
    allowed: bucket.count <= max,
    limit: max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: Math.ceil(bucket.resetAt / 1000),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Attach standard rate-limit headers to a response. */
export function withRateHeaders<T extends NextResponse>(
  response: T,
  rate: RateLimitResult,
): T {
  response.headers.set("X-RateLimit-Limit", String(rate.limit));
  response.headers.set("X-RateLimit-Remaining", String(rate.remaining));
  response.headers.set("X-RateLimit-Reset", String(rate.resetAt));
  return response;
}
