#!/usr/bin/env node
/**
 * Production checks that cost nothing and print no secrets.
 *
 *   npm run check:prod                                  # against the live site
 *   npm run check:prod -- https://your-deployment.app   # or a preview
 *
 * Two questions, asked in the only way that answers them honestly:
 *
 *   1. **Rate limiting.** POST an empty body to each paid endpoint. An empty body
 *      fails validation, so nothing is generated and no quota is spent — but the
 *      limiter is consulted *first*, so the status tells you which limiter
 *      answered: 503 `RATE_LIMIT_UNAVAILABLE` when Redis is configured and not
 *      answering, 400 `VALIDATION_ERROR` when the request got through to
 *      validation. A free endpoint is probed the same way: it must never answer
 *      `RATE_LIMIT_UNAVAILABLE`, because free routes keep the in-memory fallback.
 *
 *   2. **Anonymous writes.** With `SUPABASE_ANON_KEY` (or
 *      `SUPABASE_PUBLISHABLE_KEY`) + `SUPABASE_URL` in the environment, try a
 *      direct INSERT into `leads` and `menus` as `anon`. After the migration both
 *      must be refused. The payload is inert (`source: 'anon-lock-check'`) and a
 *      successful insert is reported as a *failure*, with the one-line cleanup.
 *
 * Neither the keys nor any request IP is ever printed.
 */
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const BASE = (process.argv[2] || process.env.CHECK_BASE_URL || "https://cafe-caption-ai.vercel.app").replace(/\/$/, "");

const results = [];
function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${area.padEnd(13)} ${name.padEnd(26)} ${detail}`);
}

/** `fetch` with a timeout, and a response body read that can't hang. */
async function post(path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* not JSON — fine, the status still counts */
  }

  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    code: payload?.code ?? null,
  };
}

/**
 * Supabase REST over `https`, so a `SUPABASE_URL` is used verbatim and never
 * printed. `fetch` would do, but this keeps the request identical to the one an
 * attacker's script would send.
 */
function supabaseInsert(path, key, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path);
    const send = url.protocol === "http:" ? httpRequest : httpsRequest;
    const payload = JSON.stringify(body);
    const req = send(
      url,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 15_000,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(payload);
  });
}

async function checkRateLimiting() {
  const paid = [
    ["/api/generate", {}],
    ["/api/translate", {}],
    ["/api/dish-vision", {}],
    ["/api/dish-model", {}],
  ];

  for (const [path, body] of paid) {
    try {
      const { status, code, retryAfter } = await post(path, body);

      if (status === 503 && code === "RATE_LIMIT_UNAVAILABLE") {
        record(
          "rate-limit",
          path,
          retryAfter === "30",
          `503 RATE_LIMIT_UNAVAILABLE, Retry-After: ${retryAfter ?? "(missing)"}`,
        );
      } else if (status === 400) {
        record(
          "rate-limit",
          path,
          true,
          `400 ${code ?? "VALIDATION_ERROR"} — limiter answered (memory or Redis); no quota spent`,
        );
      } else if (status === 429) {
        record("rate-limit", path, true, `429 ${code} — over budget, no quota spent`);
      } else if (status === 503) {
        // Reached the limiter and got past it, then stopped on something that
        // isn't the limiter (a missing upstream key on this deployment). Still
        // a pass for the question being asked — but say which, so a genuinely
        // disabled tool isn't mistaken for a healthy one.
        record(
          "rate-limit",
          path,
          true,
          `limiter answered, then ${code} — this deployment is also missing an upstream key`,
        );
      } else {
        record("rate-limit", path, false, `unexpected ${status} ${code ?? ""}`);
      }
    } catch (error) {
      record("rate-limit", path, false, `request failed: ${error.name}`);
    }
  }

  // A free route must keep working when the paid ones are refusing: an empty
  // body is a validation error, not a limiter outage, and stores nothing.
  try {
    const { status, code } = await post("/api/leads", {});
    const ok = !(status === 503 && code === "RATE_LIMIT_UNAVAILABLE");
    record(
      "rate-limit",
      "/api/leads (free)",
      ok,
      ok
        ? `${status} ${code ?? ""} — did not fail closed, as intended`
        : "503 RATE_LIMIT_UNAVAILABLE — a free route must not fail closed",
    );
  } catch (error) {
    record("rate-limit", "/api/leads (free)", false, `request failed: ${error.name}`);
  }
}

async function checkAnonWrites() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    record(
      "anon-write",
      "direct INSERT",
      true,
      "skipped — set SUPABASE_URL and SUPABASE_ANON_KEY (both public) to probe",
    );
    return;
  }

  const canary = {
    name: "anon-lock-check",
    cafe_name: "anon-lock-check",
    city: "anon-lock-check",
    interest: "not-sure",
    source: "anon-lock-check",
  };

  try {
    const status = await supabaseInsert(`${url}/rest/v1/leads`, key, canary);
    const refused = status >= 400;
    record(
      "anon-write",
      "INSERT public.leads",
      refused,
      refused
        ? `refused (${status}) — anon has no INSERT`
        : `ACCEPTED (${status}). Run the migration, then: delete from public.leads where source = 'anon-lock-check';`,
    );
  } catch (error) {
    record("anon-write", "INSERT public.leads", false, `request failed: ${error.name}`);
  }

  try {
    const status = await supabaseInsert(`${url}/rest/v1/menus`, key, {
      slug: "anon-lock-check",
      cafe_name: "anon-lock-check",
      items: [{ name: "x", price: "1" }],
      published: false,
      edit_key_hash: "0".repeat(64),
    });
    const refused = status >= 400;
    record(
      "anon-write",
      "INSERT public.menus",
      refused,
      refused
        ? `refused (${status}) — anon has no INSERT`
        : `ACCEPTED (${status}). Run the migration, then: delete from public.menus where slug = 'anon-lock-check';`,
    );
  } catch (error) {
    record("anon-write", "INSERT public.menus", false, `request failed: ${error.name}`);
  }
}

console.log(`\nChecking ${BASE}\n`);
await checkRateLimiting();
await checkAnonWrites();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed${
    failed.length ? ` — ${failed.length} need attention` : ""
  }\n`,
);

process.exitCode = failed.length ? 1 : 0;
