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

/**
 * The caller's IP, as best we can know it behind a proxy.
 *
 * `x-forwarded-for` is append-only: every hop adds to it, so the *first* entry
 * is whatever the caller chose to send. Reading it (as this file used to) meant
 * a request with `X-Forwarded-For: <random>` got a fresh bucket every time.
 *
 * So: headers the edge sets itself win, and when we have to read
 * `x-forwarded-for` we take the *last* hop — the proxy closest to us, the one
 * the client can't append to.
 */
export function clientIp(request: Request): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const first = vercelForwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const nearest = hops.at(-1);
    if (nearest) return nearest;
  }

  // No proxy headers at all: local dev, or a direct hit. Bucketing every such
  // caller as "unknown" let one of them lock out all the others, so fall back to
  // a coarse fingerprint instead. It only has to be stable, not identifying —
  // the key is hashed again below and never stored raw.
  const fingerprint = [
    request.headers.get("user-agent") ?? "",
    request.headers.get("accept-language") ?? "",
    request.headers.get("accept-encoding") ?? "",
  ].join("|");

  return `anon:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}

function bucketKey(request: Request, namespace: string): string {
  return createHash("sha256")
    .update(`${namespace}:${clientIp(request)}`)
    .digest("hex")
    .slice(0, 24);
}

/** Current window for this key, created on demand. Never increments. */
function readBucket(
  request: Request,
  { namespace, windowMs }: RateLimitOptions,
  now: number,
) {
  const key = bucketKey(request, namespace);
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  return bucket;
}

function summarise(
  bucket: { count: number; resetAt: number },
  max: number,
  now: number,
  /** True when the count already includes this request. */
  counted: boolean,
): RateLimitResult {
  return {
    // A peek is allowed only if there is a token left to spend; a counted
    // request is allowed up to and including the limit.
    allowed: counted ? bucket.count <= max : bucket.count < max,
    limit: max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: Math.ceil(bucket.resetAt / 1000),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Opportunistic cleanup so the map can't grow forever. */
function sweep(now: number) {
  if (buckets.size <= 1000) return;
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Check the budget **without spending** a token.
 *
 * The route uses this first: a request that turns out to be malformed, or that
 * can't run because a key is missing, shouldn't eat into the caller's quota.
 * Only work we're actually going to attempt gets charged (see `rateLimit`).
 */
export function peekRateLimit(
  request: Request,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  return summarise(readBucket(request, options, now), options.max, now, false);
}

/**
 * Check the budget **and spend** one token.
 *
 * Fixed-window, keyed by a hashed IP, so raw addresses are never kept in memory
 * or logs. Per serverless instance — for strict global limits on Vercel, back
 * this with Upstash Redis or Vercel KV.
 */
export function rateLimit(
  request: Request,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const bucket = readBucket(request, options, now);

  bucket.count += 1;
  sweep(now);

  return summarise(bucket, options.max, now, true);
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
