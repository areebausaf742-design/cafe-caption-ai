#!/usr/bin/env node
/**
 * Builds `supabase/APPLY-ALL.sql` from the migrations in `supabase/migrations`.
 *
 * Why this exists: applying this schema is one paste into the Supabase SQL
 * editor, and asking a human to open three files, copy each one, and remember
 * the order is how a database ends up half-migrated. One file, in the right
 * order, with the verification queries already at the bottom.
 *
 * Run with `--check` to fail instead of writing (used by the test suite), so the
 * committed file can never drift from the migrations it claims to contain.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const target = join(root, "supabase", "APPLY-ALL.sql");

const check = process.argv.includes("--check");

/** Only the migrations that change the *shape* of production. */
const INCLUDE = [
  "20261114120000_lock_anon_inserts.sql",
  "20261114130000_menu_indexing.sql",
  "20261121100000_rate_limit_store.sql",
];

const header = `-- ---------------------------------------------------------------------------
-- APPLY-ALL.sql — every pending schema change, in order, in one paste
--
-- GENERATED FILE. Do not edit by hand: it is built from supabase/migrations by
-- \`node scripts/build-apply-all.mjs\`, and a test fails if it drifts.
--
-- How to use it:
--   1. Open your Supabase project → SQL Editor → New query.
--   2. Paste this whole file and press Run. It runs inside one transaction, so
--      a failure leaves the database exactly as it was.
--   3. Scroll to the bottom and check the VERIFY block's output.
--   4. Delete the two verification rows it creates (the block says how).
--
-- Safe to run twice. Every statement is "if not exists" or "create or replace",
-- and the cleanup deletes only named test rows.
-- ---------------------------------------------------------------------------
`;

const verify = `
-- ---------------------------------------------------------------------------
-- VERIFY — run this section on its own and read the output
-- ---------------------------------------------------------------------------

-- 1) The columns exist and only approved menus are indexable.
select slug, published, indexable
  from public.menus
 order by updated_at desc;

-- 2) The sitemap's read works and lists only what should be listed.
select public.menu_indexable();

-- 3) A shared rate limit counter exists, increments, and is not readable by
--    the publishable key. This creates two throwaway rows; delete them after.
select public.rate_limit_hit('verify:probe', 60) as first_hit;
select public.rate_limit_hit('verify:probe', 60) as second_hit;
select public.rate_limit_peek('verify:probe', 60) as peeked_without_spending;

-- Cleanup after verifying:
delete from public.rate_limits where key like 'verify:%';

-- ---------------------------------------------------------------------------
-- CLEANUP — the rows written by scripts/verify-production.mjs
-- ---------------------------------------------------------------------------
delete from public.menus where slug in ('rollout-check', 'rollout-check-2');
delete from public.leads where cafe_name = 'Rollout Check';
`;

const parts = [header];

for (const name of INCLUDE) {
  const path = join(migrationsDir, name);
  if (!existsSync(path)) {
    console.error(`build-apply-all: missing migration ${name}`);
    process.exit(1);
  }
  const body = readFileSync(path, "utf8").trimEnd();
  parts.push(`
-- ===========================================================================
-- FROM ${name}
-- ===========================================================================

${body}
`);
}

parts.push(verify);

const output = parts.join("\n");

if (check) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== output) {
    console.error(
      "build-apply-all: supabase/APPLY-ALL.sql is stale — run `node scripts/build-apply-all.mjs`.",
    );
    process.exit(1);
  }
  console.log("build-apply-all: up to date");
  process.exit(0);
}

writeFileSync(target, output);
console.log(`build-apply-all: wrote supabase/APPLY-ALL.sql (${INCLUDE.length} migrations)`);

// Keep the list honest: any migration on disk that isn't included is a bug.
const onDisk = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
const missing = onDisk.filter((file) => !INCLUDE.includes(file));
if (missing.length > 0) {
  console.warn(
    `build-apply-all: WARNING — ${missing.length} migration(s) not in INCLUDE: ${missing.join(", ")}`,
  );
}
