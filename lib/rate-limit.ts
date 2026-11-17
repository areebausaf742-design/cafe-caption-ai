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

/**
 * Two implementations, one interface.
 *
 * On Vercel every request can land on a different isolate, so a `Map` in module
 * scope is only a per-instance counter: warm instances hide the hole, and a
 * burst spread across cold starts walks straight through it. Anything that
 * costs money upstream (Gemini) needs a limit that all instances share.
 *
 * So: Upstash Redis over its REST API when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set (no SDK, no extra dependency, one `fetch`),
 * and the in-memory map — correct for local dev and a single long-lived server —
 * when they aren't. A Redis outage degrades to the map rather than failing the
 * request: a broken counter must never be the reason a visitor can't use the
 * studio.
 */
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** A slow Redis must not hold a request open. */
const REDIS_TIMEOUT_MS = 1_500;

const buckets = new Map<string, { count: number; resetAt: number }>();

let warned = false;
function warnOnce(reason: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    "[rate-limit] Upstash unavailable — falling back to per-instance limits.",
    reason,
  );
}

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

/* -------------------------------------------------------------------------- */
/*  Shared maths                                                              */
/* -------------------------------------------------------------------------- */

function summarise(
  count: number,
  { max, windowMs }: RateLimitOptions,
  now: number,
  /** True when the count already includes this request. */
  counted: boolean,
  /** Milliseconds left in the window. */
  remainingMs: number,
): RateLimitResult {
  const window = remainingMs > 0 ? remainingMs : windowMs;
  return {
    // A peek is allowed only if there is a token left to spend; a counted
    // request is allowed up to and including the limit.
    allowed: counted ? count <= max : count < max,
    limit: max,
    remaining: Math.max(0, max - count),
    resetAt: Math.ceil((now + window) / 1000),
    retryAfter: Math.max(1, Math.ceil(window / 1000)),
  };
}

/* -------------------------------------------------------------------------- */
/*  Upstash Redis (shared across instances)                                   */
/* -------------------------------------------------------------------------- */

type PipelineEntry = { result?: unknown; error?: string } | null;

async function pipeline(commands: unknown[][]): Promise<PipelineEntry[]> {
  const response = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`upstash ${response.status}`);

  const json = (await response.json()) as unknown;
  if (!Array.isArray(json)) throw new Error("upstash: unexpected payload");
  return json as PipelineEntry[];
}

function resultAt(entries: PipelineEntry[], index: number): unknown {
  const entry = entries[index];
  if (!entry || entry.error) {
    throw new Error(`upstash: ${entry?.error ?? "missing result"}`);
  }
  return entry.result;
}

/**
 * Fixed window in Redis: `INCR` the counter, and give it a TTL on the first
 * hit. The TTL is set with `NX` so a burst of concurrent requests can't keep
 * pushing the window forward — the window belongs to whoever created it.
 *
 * Returns `null` when Redis isn't configured or didn't answer, which is the
 * signal to use the in-memory map instead.
 */
async function redisWindow(
  request: Request,
  options: RateLimitOptions,
  spend: boolean,
  now: number,
): Promise<RateLimitResult | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;

  const key = `rl:${options.namespace}:${bucketKey(request, options.namespace)}`;

  try {
    const entries = await pipeline(
      spend
        ? [
            ["INCR", key],
            ["PEXPIRE", key, options.windowMs, "NX"],
            ["PTTL", key],
          ]
        : [["GET", key], ["PTTL", key]],
    );

    const raw = resultAt(entries, 0);
    const count = Number(raw ?? 0) || 0;
    // Spending adds a command, so PTTL is the third entry in that pipeline and
    // the second in a peek. Reading the wrong one turns PEXPIRE's 1/0 into a
    // one-millisecond window.
    const ttl = Number(resultAt(entries, spend ? 2 : 1) ?? 0);

    // A live counter with no expiry would count forever: the process died
    // between INCR and PEXPIRE, or Redis evicted the TTL. Give it one back,
    // without making the request wait for the repair.
    if (count > 0 && ttl <= 0) {
      void pipeline([["PEXPIRE", key, options.windowMs]]).catch(() => {});
    }

    const windowMs = ttl > 0 ? ttl : options.windowMs;

    return summarise(count, options, now, spend, windowMs);
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  In-memory map (single instance, and the fallback)                          */
/* -------------------------------------------------------------------------- */

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

/** Opportunistic cleanup so the map can't grow forever. */
function sweep(now: number) {
  if (buckets.size <= 1000) return;
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Check the budget **without spending** a token.
 *
 * The route uses this first: a request that turns out to be malformed, or that
 * can't run because a key is missing, shouldn't eat into the caller's quota.
 * Only work we're actually going to attempt gets charged (see `rateLimit`).
 */
export async function peekRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();

  const shared = await redisWindow(request, options, false, now);
  if (shared) return shared;

  const bucket = readBucket(request, options, now);
  return summarise(bucket.count, options, now, false, bucket.resetAt - now);
}

/**
 * Check the budget **and spend** one token.
 *
 * Fixed window, keyed by a hashed IP, so raw addresses are never stored in
 * Redis or in memory and never reach a log.
 */
export async function rateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();

  const shared = await redisWindow(request, options, true, now);
  if (shared) return shared;

  const bucket = readBucket(request, options, now);
  bucket.count += 1;
  sweep(now);

  return summarise(bucket.count, options, now, true, bucket.resetAt - now);
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
