import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The limiter reads its env at module load and keeps module-level state (the
 * bucket map, the warn-one-time flags), so every case re-imports a fresh copy
 * with the env it needs. That is the only way to test the difference between
 * "no Upstash configured" and "Upstash configured but broken" — which is the
 * whole point of this file.
 */
const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

type Limiter = typeof import("@/lib/rate-limit");

async function loadLimiter(
  env: { url?: string; token?: string; nodeEnv?: string; allowMemory?: string } = {},
): Promise<Limiter> {
  vi.resetModules();
  vi.stubEnv(URL_ENV, env.url ?? "");
  vi.stubEnv(TOKEN_ENV, env.token ?? "");
  // Production is a *behaviour*, not a build flag: the limiter has to decide
  // what to do when a paid route has no shared store, and only prod refuses.
  vi.stubEnv("NODE_ENV", env.nodeEnv ?? "test");
  vi.stubEnv("RATE_LIMIT_ALLOW_MEMORY_LIMITS", env.allowMemory ?? "");
  return import("@/lib/rate-limit");
}

const request = () => new Request("https://cafe-caption-ai.vercel.app/api/generate", { method: "POST" });

/** What a paid route in this codebase looks like: small budget, fail closed. */
const PAID = { namespace: "generate", max: 6, windowMs: 10 * 60 * 1000, failClosed: true } as const;

/** What a route that only touches our own database looks like. */
const FREE = { namespace: "leads", max: 6, windowMs: 10 * 60 * 1000 } as const;

/** A healthy Upstash `/pipeline` reply: [INCR|GET, PEXPIRE, PTTL] or [GET, PTTL]. */
const healthy = (count: number, ttlMs = 600_000) => ({
  ok: true,
  status: 200,
  json: async () => [{ result: String(count) }, { result: 1 }, { result: ttlMs }],
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("no Upstash configured — paid routes keep working on the in-memory map", () => {
  it("allows requests up to the limit and then blocks, without a 503", async () => {
    const { rateLimit } = await loadLimiter();
    const results = [];
    for (let i = 0; i < 7; i += 1) results.push(await rateLimit(request(), PAID));

    expect(results.slice(0, 6).every((r) => r.allowed)).toBe(true);
    const last = results[6];
    expect(last.allowed).toBe(false);
    // Out of budget, not out of service: the route must answer 429, not 503.
    expect(last.unavailable).toBeUndefined();
    expect(last.remaining).toBe(0);
    expect(last.retryAfter).toBeGreaterThan(0);
  });

  it("warns once, and says the limits are per instance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { peekRateLimit } = await loadLimiter();

    await peekRateLimit(request(), PAID);
    await peekRateLimit(request(), PAID);
    await peekRateLimit(request(), PAID);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("per instance only");
  });

  it("does not warn for routes that never asked for a shared limiter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rateLimit } = await loadLimiter();
    await rateLimit(request(), FREE);
    expect(warn).not.toHaveBeenCalled();
  });

  it("never touches the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { rateLimit } = await loadLimiter({ url: "", token: "" });
    await rateLimit(request(), PAID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("production with no shared limiter — paid routes refuse", () => {
  it("refuses with a code that says 'not configured', not 'try again in 30s'", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { peekRateLimit } = await loadLimiter({ nodeEnv: "production" });

    const rate = await peekRateLimit(request(), PAID);

    expect(rate.allowed).toBe(false);
    expect(rate.unavailable).toBe(true);
    expect(rate.misconfigured).toBe(true);
    // Retrying changes nothing, so the routes must not send a Retry-After.
    expect(rate.retryAfter).toBe(0);
    expect(String(warn.mock.calls[0]?.[0])).toContain("No shared limiter in production");
  });

  it("refuses the spend path too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimit } = await loadLimiter({ nodeEnv: "production" });
    expect((await rateLimit(request(), PAID)).misconfigured).toBe(true);
  });

  it("says so once, not once per request", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimit } = await loadLimiter({ nodeEnv: "production" });
    await rateLimit(request(), PAID);
    await rateLimit(request(), PAID);
    await rateLimit(request(), PAID);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("leaves free routes on the in-memory map, as before", async () => {
    const { rateLimit } = await loadLimiter({ nodeEnv: "production" });
    const first = await rateLimit(request(), FREE);
    expect(first.allowed).toBe(true);
    expect(first.unavailable).toBeUndefined();
  });

  it("still refuses when Redis is configured but only half of it is set", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A URL with no token is not a configured limiter, but it isn't an outage
    // either — it is the same misconfiguration.
    const { peekRateLimit } = await loadLimiter({ nodeEnv: "production", url: "https://example.upstash.io" });
    expect((await peekRateLimit(request(), PAID)).misconfigured).toBe(true);
  });

  it("honours the documented escape hatch, and warns about what it costs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rateLimit } = await loadLimiter({ nodeEnv: "production", allowMemory: "1" });

    const rate = await rateLimit(request(), PAID);

    expect(rate.allowed).toBe(true);
    expect(rate.misconfigured).toBeUndefined();
    expect(String(warn.mock.calls[0]?.[0])).toContain("RATE_LIMIT_ALLOW_MEMORY_LIMITS=1");
  });

  it("does not refuse in development", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rateLimit } = await loadLimiter({ nodeEnv: "development" });
    expect((await rateLimit(request(), PAID)).allowed).toBe(true);
  });

  it("copies the refusal into a usable error + code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { peekRateLimit, rateLimitRefusal } = await loadLimiter({ nodeEnv: "production" });

    const refusal = rateLimitRefusal(await peekRateLimit(request(), PAID));

    expect(refusal.code).toBe("RATE_LIMIT_NOT_CONFIGURED");
    expect(refusal.error).toContain("paused");
  });
});

describe("rateLimitRefusal", () => {
  it("calls an outage an outage", async () => {
    const { rateLimitRefusal } = await loadLimiter();
    const refusal = rateLimitRefusal({
      allowed: false,
      limit: 6,
      remaining: 0,
      resetAt: 0,
      retryAfter: 30,
      unavailable: true,
    });
    expect(refusal.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(refusal.error).toContain("30 seconds");
  });
});

describe("Upstash configured but unreachable — paid routes fail closed", () => {
  const broken = { url: "https://example.upstash.io", token: "token" };

  it("refuses a peek with unavailable=true and a sane retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const { peekRateLimit } = await loadLimiter(broken);

    const rate = await peekRateLimit(request(), PAID);

    expect(rate.allowed).toBe(false);
    expect(rate.unavailable).toBe(true);
    expect(rate.remaining).toBe(0);
    expect(rate.retryAfter).toBe(30);
    // An outage, not a misconfiguration — the routes say different things.
    expect(rate.misconfigured).toBeUndefined();
    // resetAt is Unix seconds, ~30s out — not a millisecond timestamp leaking in.
    expect(rate.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(rate.resetAt).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000) + 31);
  });

  it("refuses a spend too — a hung Redis must not become a free pass", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const { rateLimit } = await loadLimiter(broken);

    for (let i = 0; i < 3; i += 1) {
      const rate = await rateLimit(request(), PAID);
      expect(rate.allowed).toBe(false);
      expect(rate.unavailable).toBe(true);
    }
  });

  it("treats an HTTP error the same as a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { peekRateLimit } = await loadLimiter(broken);
    expect((await peekRateLimit(request(), PAID)).unavailable).toBe(true);
  });

  it("treats a malformed payload the same as a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ nope: true }) }));
    const { peekRateLimit } = await loadLimiter(broken);
    expect((await peekRateLimit(request(), PAID)).unavailable).toBe(true);
  });

  it("treats a per-command Redis error the same as a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ error: "WRONGTYPE" }] }),
    );
    const { rateLimit } = await loadLimiter(broken);
    expect((await rateLimit(request(), PAID)).unavailable).toBe(true);
  });

  it("warns once about the outage, not once per request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const { rateLimit } = await loadLimiter(broken);

    await rateLimit(request(), PAID);
    await rateLimit(request(), PAID);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("paid routes will refuse");
  });

  it("leaves free routes on the in-memory fallback instead of 503-ing them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const { rateLimit } = await loadLimiter(broken);

    const first = await rateLimit(request(), FREE);
    expect(first.allowed).toBe(true);
    expect(first.unavailable).toBeUndefined();
  });
});

describe("Upstash configured and healthy", () => {
  const live = { url: "https://example.upstash.io", token: "token" };

  it("counts what Redis says and stays available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(healthy(2)));
    const { peekRateLimit } = await loadLimiter(live);

    const rate = await peekRateLimit(request(), PAID);

    expect(rate.allowed).toBe(true);
    expect(rate.unavailable).toBeUndefined();
    expect(rate.remaining).toBe(4);
  });

  it("returns a plain 429-shaped refusal when the budget really is spent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(healthy(6)));
    const { peekRateLimit } = await loadLimiter(live);

    const rate = await peekRateLimit(request(), PAID);

    expect(rate.allowed).toBe(false);
    // The distinction the routes depend on: over budget ≠ limiter down.
    expect(rate.unavailable).toBeUndefined();
  });

  it("sends the token as a bearer and never puts the IP in the key", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(healthy(1));
    vi.stubGlobal("fetch", fetchSpy);
    const { rateLimit } = await loadLimiter(live);

    await rateLimit(
      new Request("https://x.test/api/generate", { headers: { "x-vercel-forwarded-for": "203.0.113.7" } }),
      PAID,
    );

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.upstash.io/pipeline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
    const body = String(init.body);
    expect(body).toContain("INCR");
    expect(body).not.toContain("203.0.113.7");
  });
});

/**
 * The wiring is one flag per route, which is exactly the kind of thing that gets
 * dropped in a refactor. These assertions are structural — they read the route
 * source — because the alternative is importing route handlers built on
 * `next/server` primitives that don't exist outside a running Next app.
 */
describe("route wiring", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

  const paid: [string, string][] = [
    ["app/api/generate/route.ts", "generate"],
    ["app/api/generate/route.ts", "generate-photo"],
    ["app/api/translate/route.ts", "menu-translate"],
    ["app/api/dish-vision/route.ts", "dish-vision"],
    ["app/api/dish-model/route.ts", "dish-model"],
  ];

  it.each(paid)("%s: the %s bucket fails closed", (path, namespace) => {
    const source = read(path);
    const literal = `namespace: "${namespace}"`;
    const at = source.indexOf(literal);
    expect(at).toBeGreaterThan(-1);

    // Look at the object literal this namespace belongs to.
    const block = source.slice(at, source.indexOf("};", at));
    expect(block).toContain("failClosed: true");
  });

  it.each(["app/api/generate/route.ts", "app/api/translate/route.ts", "app/api/dish-vision/route.ts", "app/api/dish-model/route.ts"])(
    "%s: turns `unavailable` into a 503, not a 429",
    (path) => {
      const source = read(path);
      expect(source).toContain(".unavailable");
      expect(source).toContain("rateLimitRefusal");
      expect(source).toMatch(/fail\(\s*503/);
    },
  );

  it("leaves the free route on the fallback — it must never 503 for a counter", () => {
    const source = read("app/api/leads/route.ts");
    expect(source).not.toContain("failClosed");
    expect(source).not.toContain("RATE_LIMIT_UNAVAILABLE");
  });
});
