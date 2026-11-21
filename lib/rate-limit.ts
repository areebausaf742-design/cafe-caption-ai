import "server-only";

import { createHash } from "node:crypto";

import type { NextResponse } from "next/server";

export interface RateLimitOptions {
  /** Separate budgets per feature, e.g. "generate" vs "leads". */
  namespace: string;
  max: number;
  windowMs: number;
  /**
   * True for the routes that spend money upstream (Gemini tokens, GPU seconds).
   *
   * When Upstash is configured but not answering, these **fail closed**: the
   * request is refused rather than metered by a per-instance map that an
   * attacker can walk around with a few parallel cold starts. An unmetered paid
   * endpoint is worse than a 30-second outage.
   *
   * When Upstash isn't configured at all there is nothing to fail over from, so
   * the in-memory map is used (and a warning is logged once).
   */
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the window resets. */
  resetAt: number;
  /** Seconds until the client may retry. */
  retryAfter: number;
  /**
   * True when the request was refused because the *shared* limiter was down,
   * not because the caller ran out of budget. Routes turn this into a 503 with
   * `RATE_LIMIT_UNAVAILABLE` instead of a 429.
   */
  unavailable?: boolean;
  /**
   * True when `unavailable` is caused by missing configuration rather than an
   * outage: the deployment is in production and has no shared limiter at all.
   * Routes report it as `RATE_LIMIT_NOT_CONFIGURED`, which is a different thing
   * to tell a visitor ("paused") and to tell an operator ("set the variables").
   */
  misconfigured?: boolean;
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
 * when they aren't.
 *
 * What happens when there is no Redis at all depends on the environment and on
 * what the request costs. In production a paid route with no shared limiter is
 * **refused** (503 `RATE_LIMIT_NOT_CONFIGURED`): the whole point of the limiter
 * is a budget that survives a cold start, and without a shared store there is no
 * such thing. `RATE_LIMIT_ALLOW_MEMORY_LIMITS=1` re-enables the per-instance map
 * deliberately, and logs a warning per boot saying exactly what that costs.
 *
 * What happens when Redis *is* configured but doesn't answer depends on what the
 * request costs. Routes that only touch our own database or CPU (`leads`,
 * `menu-publish`, the edit endpoints) degrade to the map: a broken counter must
 * never be the reason a visitor can't save a menu. Routes that spend money
 * upstream pass `failClosed: true` and get a 503 instead, because a per-instance
 * counter under a limit of six is not a limit at all once an attacker can spread
 * across isolates. Failing closed costs a little availability; failing open
 * costs the API budget and, on the GPU Space, the queue.
 */
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Whether a shared limiter is *supposed* to exist. */
const SHARED_CONFIGURED = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

/** How long a fail-closed route asks the client to wait during an outage. */
const UNAVAILABLE_RETRY_SECONDS = 30;

const PRODUCTION = process.env.NODE_ENV === "production";

/**
 * The escape hatch — and it is meant to look like one.
 *
 * A per-instance `Map` under a limit of six is not a limit once a burst can
 * spread across cold starts, so in production a paid route with no shared
 * limiter **refuses** rather than pretending. This variable is the only way to
 * say "I know, keep serving me anyway", and it exists so a deployment without
 * Redis degrades loudly instead of silently: the console says so once per boot,
 * and removing the line restores the strict behaviour.
 */
const ALLOW_MEMORY_IN_PRODUCTION =
  process.env.RATE_LIMIT_ALLOW_MEMORY_LIMITS === "1";

/** A slow Redis must not hold a request open. */
const REDIS_TIMEOUT_MS = 1_500;

const buckets = new Map<string, { count: number; resetAt: number }>();

let warnedOutage = false;
function warnOnce(reason: unknown) {
  if (warnedOutage) return;
  warnedOutage = true;
  console.warn(
    "[rate-limit] Upstash unavailable — paid routes will refuse until it recovers; other routes fall back to per-instance limits.",
    reason,
  );
}

let warnedLocalOnly = false;
/**
 * Paid routes would like a shared limiter. If this deployment has none, say so
 * once: the numbers below still apply, but only per instance.
 */
function warnLocalOnly(namespace: string) {
  if (warnedLocalOnly) return;
  warnedLocalOnly = true;
  console.warn(
    `[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set — "${namespace}" is limited per instance only. Set them to enforce these limits across deployments.`,
  );
}

/** Set `TRUST_PROXY=1` only when *our own* proxy strips and sets the headers. */
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

/** Vercel's edge sets its own headers; nothing else may be believed. */
const ON_VERCEL = Boolean(process.env.VERCEL);

/**
 * The caller's IP, as best we can know it behind a proxy.
 *
 * Header spoofing is the whole problem here. `x-forwarded-for` is append-only
 * and `x-real-ip` is just a header: a caller can send either, so trusting them
 * unconditionally hands out a fresh bucket per request — the rate limit becomes
 * a suggestion.
 *
 * So:
 *   1. `x-vercel-forwarded-for` is believed only where it is genuinely set by
 *      the platform (on Vercel, or with TRUST_PROXY=1 for a self-hosted proxy).
 *   2. `x-real-ip` / the nearest `x-forwarded-for` hop are believed only with
 *      TRUST_PROXY=1, which is a statement that our own proxy overwrites them.
 *   3. Otherwise the caller is bucketed as `unknown`. That is deliberately
 *      coarse: one shared bucket is worse for a handful of visitors and far
 *      better than a limit anyone can walk around by editing a header. Next's
 *      `Request` exposes no socket address to fall back to.
 */
export function clientIp(request: Request): string {
  if (ON_VERCEL || TRUST_PROXY) {
    const edge = request.headers.get("x-vercel-forwarded-for");
    if (edge) {
      const first = edge.split(",")[0]?.trim();
      if (first) return first;
    }
  }

  if (TRUST_PROXY) {
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;

    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const hops = forwarded
        .split(",")
        .map((hop) => hop.trim())
        .filter(Boolean);
      // The last hop is the proxy closest to us — the one a client can't append to.
      const nearest = hops.at(-1);
      if (nearest) return nearest;
    }
  }

  return "unknown";
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

/**
 * The answer when a paid route has no shared limiter to trust.
 *
 * Deliberately *not* a 429: nothing about the caller's usage is wrong. The
 * route turns `unavailable` into a 503 and tells the client to come back in
 * half a minute, which is the truth for an outage.
 *
 * `misconfigured` is the permanent version of the same answer: production with
 * no limiter configured at all. "Try again in 30 seconds" would be a lie there,
 * so the routes say so in a code the operator can grep for.
 */
function unavailable(
  options: RateLimitOptions,
  now: number,
  misconfigured = false,
): RateLimitResult {
  return {
    allowed: false,
    limit: options.max,
    remaining: 0,
    resetAt: Math.ceil((now + UNAVAILABLE_RETRY_SECONDS * 1000) / 1000),
    // 0 for a misconfiguration: there is no moment when retrying starts working,
    // so no route sends a Retry-After that implies otherwise.
    retryAfter: misconfigured ? 0 : UNAVAILABLE_RETRY_SECONDS,
    unavailable: true,
    ...(misconfigured ? { misconfigured: true } : {}),
  };
}

/**
 * Paid route, no shared limiter. Decide between "refuse" and "count locally".
 *
 * Production refuses unless `RATE_LIMIT_ALLOW_MEMORY_LIMITS=1`; everything else
 * (local dev, tests, a self-hosted single process) counts locally and warns
 * once. Returns the refusal, or `null` to mean "carry on with the map".
 */
function withoutSharedStore(options: RateLimitOptions, now: number): RateLimitResult | null {
  if (PRODUCTION) {
    if (ALLOW_MEMORY_IN_PRODUCTION) {
      warnMemoryInProduction(options.namespace);
      return null;
    }
    warnNoSharedStore(options.namespace);
    return unavailable(options, now, true);
  }

  warnLocalOnly(options.namespace);
  return null;
}

let warnedNoSharedStore = false;
function warnNoSharedStore(namespace: string) {
  if (warnedNoSharedStore) return;
  warnedNoSharedStore = true;
  console.error(
    `[rate-limit] No shared limiter in production — refusing "${namespace}" rather than serving it unmetered. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. (Per-instance limits can be re-enabled deliberately with RATE_LIMIT_ALLOW_MEMORY_LIMITS=1.)`,
  );
}

let warnedMemoryInProduction = false;
function warnMemoryInProduction(namespace: string) {
  if (warnedMemoryInProduction) return;
  warnedMemoryInProduction = true;
  console.warn(
    `[rate-limit] RATE_LIMIT_ALLOW_MEMORY_LIMITS=1 — "${namespace}" is metered by a per-instance map that a burst across isolates can exceed. Configure Upstash and remove that variable to fail closed.`,
  );
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

  if (options.failClosed) {
    // Configured but not answering: refuse rather than guess.
    if (SHARED_CONFIGURED) return unavailable(options, now);
    const refused = withoutSharedStore(options, now);
    if (refused) return refused;
  }

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

  if (options.failClosed) {
    if (SHARED_CONFIGURED) return unavailable(options, now);
    const refused = withoutSharedStore(options, now);
    if (refused) return refused;
  }

  const bucket = readBucket(request, options, now);
  bucket.count += 1;
  sweep(now);

  return summarise(bucket.count, options, now, true, bucket.resetAt - now);
}

/**
 * The copy and the code for a refusal, in one place so four paid routes cannot
 * drift apart — and so the difference between "the limiter is down" and "this
 * deployment has no limiter at all" is stated once rather than eight times.
 */
export function rateLimitRefusal(rate: RateLimitResult): {
  error: string;
  code: "RATE_LIMIT_UNAVAILABLE" | "RATE_LIMIT_NOT_CONFIGURED";
} {
  return rate.misconfigured
    ? {
        error:
          "Rate limiting isn't configured on this deployment, so this tool is paused. Please try again later.",
        code: "RATE_LIMIT_NOT_CONFIGURED",
      }
    : {
        error:
          "The limiter is briefly unavailable, so new requests are paused. Try again in about 30 seconds.",
        code: "RATE_LIMIT_UNAVAILABLE",
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
