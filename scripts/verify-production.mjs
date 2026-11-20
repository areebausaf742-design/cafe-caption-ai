#!/usr/bin/env node
/**
 * End-to-end rollout check against a **deployed** app.
 *
 *   npm run verify:release                                  # live site
 *   npm run verify:release -- https://your-deployment.app   # anywhere else
 *
 * `npm run check:prod` answers "is the rate limiter and the anon door behaving?"
 * without writing anything. This one is the complement: it proves the *write
 * path* works by using it, in the same order a real owner would.
 *
 *   1. publish a temporary menu              → 201, service-role INSERT
 *   2. read its public page                  → 200, publishable key + menu_public()
 *   3. edit it with the capability key       → 200, menu_read()/menu_save()
 *      …and unpublish it, so the site is left as it was found
 *   4. submit an inert lead                  → 200 { stored: true }
 *   5. (optional) direct anon INSERT probes  → refused, when public credentials
 *                                              are present in the environment
 *
 * Output is a pass/fail matrix of statuses and error codes only. The edit key is
 * never printed, the lead's contents are never printed, and no credential, URL
 * with a credential, or client IP is printed.
 *
 * Two rows are left behind in the database on purpose — that is what "verified
 * by using it" costs. Both are plainly named and neither is public. Cleanup SQL
 * is printed at the end.
 */
const BASE = (
  process.argv[2] ||
  process.env.VERIFY_BASE_URL ||
  "https://cafe-caption-ai.vercel.app"
).replace(/\/$/, "");

const MENU_TITLE = "Rollout Check";
const LEAD_NAME = "Rollout Check";

const rows = [];

function record(step, name, ok, detail) {
  rows.push({ step, name, ok, detail });
  const mark = ok === "skip" ? "SKIP" : ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${step.padEnd(6)} ${name.padEnd(36)} ${detail}`);
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML pages: the status is the signal */
  }

  return { status: response.status, json, text };
}

/** A menu that validates, is obvious in the table, and is cheap to delete. */
function temporaryMenu(published) {
  return {
    cafeName: MENU_TITLE,
    tagline: "Temporary row created by verify-production.mjs",
    whatsapp: "",
    items: [{ name: "Verification item", price: "1" }],
    published,
  };
}

async function main() {
  console.log(`\nVerifying ${BASE}\n`);

  // 0. Is the deployment serving at all?
  try {
    const home = await call("/");
    record("1", "site responds", home.status === 200, `GET / → ${home.status}`);
  } catch (error) {
    record("1", "site responds", false, `request failed: ${error.name}`);
    return finish();
  }

  // 1. Publish. This is the request that used to answer 503 PUBLISHING_DISABLED.
  let slug = null;
  let editKey = null;
  try {
    const published = await call("/api/menus", {
      method: "POST",
      body: temporaryMenu(true),
    });
    const code = published.json?.code;
    slug = typeof published.json?.slug === "string" ? published.json.slug : null;
    editKey = typeof published.json?.key === "string" ? published.json.key : null;

    if (published.status === 201 && slug && editKey) {
      record("2", "menu publish (server write)", true, `201, slug "${slug}"`);
    } else {
      record(
        "2",
        "menu publish (server write)",
        false,
        `${published.status}${code ? ` ${code}` : ""}`,
      );
    }
  } catch (error) {
    record("2", "menu publish (server write)", false, `request failed: ${error.name}`);
  }

  // 2. Public read of the menu that was just written.
  if (slug) {
    try {
      const page = await call(`/menu/${slug}`);
      const named = page.text.includes(MENU_TITLE);
      record(
        "3",
        "public menu read",
        page.status === 200 && named,
        `GET /menu/${slug} → ${page.status}${named ? ", café name rendered" : ", name missing"}`,
      );
    } catch (error) {
      record("3", "public menu read", false, `request failed: ${error.name}`);
    }
  } else {
    record("3", "public menu read", false, "skipped — nothing was published");
  }

  // 3. Capability-key read + edit, then unpublish so the site is left clean.
  if (slug && editKey) {
    try {
      const read = await call(`/api/menus/${slug}`, {
        headers: { "x-menu-key": editKey },
      });
      record(
        "4",
        "edit-with-key read",
        read.status === 200 && read.json?.ok === true,
        `GET /api/menus/${slug} → ${read.status}${read.json?.code ? ` ${read.json.code}` : ""}`,
      );
    } catch (error) {
      record("4", "edit-with-key read", false, `request failed: ${error.name}`);
    }

    try {
      const saved = await call(`/api/menus/${slug}`, {
        method: "PATCH",
        headers: { "x-menu-key": editKey },
        body: temporaryMenu(false),
      });
      record(
        "4",
        "edit-with-key save (unpublish)",
        saved.status === 200 && saved.json?.ok === true,
        `PATCH /api/menus/${slug} → ${saved.status}${saved.json?.code ? ` ${saved.json.code}` : ""}`,
      );

      const after = await call(`/menu/${slug}`);
      record(
        "4",
        "unpublished menu is not public",
        after.status === 404,
        `GET /menu/${slug} → ${after.status} (expected 404)`,
      );
    } catch (error) {
      record("4", "edit-with-key save (unpublish)", false, `request failed: ${error.name}`);
    }
  } else {
    record("4", "edit-with-key read", false, "skipped — no capability key to use");
    record("4", "edit-with-key save (unpublish)", false, "skipped — no capability key to use");
  }

  // 4. Lead storage. Inert values, and nothing about the payload is printed.
  try {
    const lead = await call("/api/leads", {
      method: "POST",
      body: {
        name: LEAD_NAME,
        cafeName: LEAD_NAME,
        city: LEAD_NAME,
        interest: "not-sure",
        message: "Temporary row created by verify-production.mjs",
      },
    });
    const stored = lead.json?.stored === true;
    record(
      "5",
      "lead storage (server write)",
      lead.status === 200 && stored,
      `POST /api/leads → ${lead.status}${lead.json?.code ? ` ${lead.json.code}` : ""}, stored=${String(stored)}`,
    );
  } catch (error) {
    record("5", "lead storage (server write)", false, `request failed: ${error.name}`);
  }

  await anonInsertProbes();

  finish(slug);
}

/* -------------------------------------------------------------------------- */
/*  Optional: is the anon door actually shut?                                 */
/* -------------------------------------------------------------------------- */

async function anonInsertProbes() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    record(
      "6",
      "anon INSERT refused (leads, menus)",
      "skip",
      "no public Supabase credentials in the environment — run npm run check:prod with SUPABASE_URL + SUPABASE_ANON_KEY",
    );
    return;
  }

  const probes = [
    [
      "public.leads",
      `${url}/rest/v1/leads`,
      {
        name: "anon-lock-check",
        cafe_name: "anon-lock-check",
        city: "anon-lock-check",
        interest: "not-sure",
        source: "anon-lock-check",
      },
    ],
    [
      "public.menus",
      `${url}/rest/v1/menus`,
      {
        slug: "anon-lock-check",
        cafe_name: "anon-lock-check",
        items: [{ name: "x", price: "1" }],
        published: false,
        edit_key_hash: "0".repeat(64),
      },
    ],
  ];

  for (const [table, endpoint, body] of probes) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const refused = response.status >= 400;
      record(
        "6",
        `anon INSERT refused — ${table}`,
        refused,
        refused
          ? `refused (${response.status})`
          : `ACCEPTED (${response.status}) — the revoke is not in place`,
      );
    } catch (error) {
      record("6", `anon INSERT refused — ${table}`, false, `request failed: ${error.name}`);
    }
  }
}

/* -------------------------------------------------------------------------- */

function finish(slug) {
  const failed = rows.filter((row) => row.ok === false);
  const skipped = rows.filter((row) => row.ok === "skip");
  console.log(
    `\n${rows.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped\n`,
  );

  if (slug) {
    console.log(
      "Cleanup (service role / SQL editor), both rows are inert and non-public:\n" +
        `  delete from public.menus where slug = '${slug}';\n` +
        `  delete from public.leads where name = '${LEAD_NAME}' and source = 'cafe-caption';\n`,
    );
  }

  process.exitCode = failed.length ? 1 : 0;
}

await main();
