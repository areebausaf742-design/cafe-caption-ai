-- ---------------------------------------------------------------------------
-- APPLY-ALL.sql — every pending schema change, in order, in one paste
--
-- GENERATED FILE. Do not edit by hand: it is built from supabase/migrations by
-- `node scripts/build-apply-all.mjs`, and a test fails if it drifts.
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


-- ===========================================================================
-- FROM 20261114120000_lock_anon_inserts.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Migration 2026-11-14 — close direct anonymous INSERT on leads and menus
--
-- Why: `public.leads` and `public.menus` accepted INSERT from the anon key, so
-- anyone holding the publishable key (it ships to browsers) could bypass the
-- routes entirely — their validation, their rate limits, their honeypot. Writes
-- now happen only through the server, using SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS and never leaves the server environment.
--
-- Run order matters. Apply this ONLY after all three are true:
--
--   1. `SUPABASE_SERVICE_ROLE_KEY` exists as an encrypted Production variable in
--      Vercel (never `NEXT_PUBLIC_*`), alongside `SUPABASE_URL` and the
--      publishable key.
--   2. The deployment that writes with it is READY and serving traffic.
--   3. `npm run verify:supabase` (or one real publish) has shown a successful
--      server write against that deployment.
--
-- Applying it early does not corrupt anything — the constraints still hold — it
-- just closes the door before the new key is in the room, and publishing/leads
-- answer 503 until the environment catches up.
--
-- Idempotent: every statement is a `revoke` or a `drop … if exists`, so running
-- it twice is a no-op, and so is running it on a database that already has the
-- final shape.
-- ---------------------------------------------------------------------------

begin;

-- 1) Leads: no INSERT grant, no INSERT policy ------------------------------
-- Reads stay closed too (there is no SELECT policy for anon, by design); the
-- service role bypasses RLS, so the leads route keeps working.
revoke insert on public.leads from anon;
revoke insert on public.leads from authenticated;
drop policy if exists "leads_insert_only" on public.leads;

-- 2) Menus: no INSERT grant, no INSERT policy ------------------------------
revoke insert on public.menus from anon;
revoke insert on public.menus from authenticated;
drop policy if exists "menus_insert_only" on public.menus;

-- 3) Re-state what must keep working ---------------------------------------
-- RLS stays on for both tables: the policies are what limit the anon role, and
-- removing an INSERT policy must not be read as "turn RLS off".
alter table public.leads enable row level security;
alter table public.menus enable row level security;

-- Public reads and capability-key edits run through `security definer`
-- functions, which execute as the owner and therefore still work for `anon`.
-- Re-asserting the grants is cheap, and guarded so this file also works on a
-- database where only `public.leads` has been created so far.
do $$
begin
  if to_regprocedure('public.menu_public(text)') is not null then
    execute 'grant execute on function public.menu_public(text) to anon';
  end if;

  if to_regprocedure('public.menu_read(text, text)') is not null then
    execute 'grant execute on function public.menu_read(text, text) to anon';
  end if;

  if to_regprocedure('public.menu_save(text, text, text, text, text, jsonb, boolean)') is not null then
    execute 'grant execute on function public.menu_save(text, text, text, text, text, jsonb, boolean) to anon';
  end if;
end $$;

commit;

-- Verify (all four should hold):
--
--   -- no INSERT privilege for anon on either table
--   select table_name, privilege_type
--     from information_schema.role_table_grants
--    where grantee = 'anon'
--      and table_schema = 'public'
--      and table_name in ('leads', 'menus')
--      and privilege_type = 'INSERT';
--   -- expect: 0 rows
--
--   -- no INSERT policy left for anon
--   select tablename, policyname, cmd, roles
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('leads', 'menus');
--   -- expect: no row with cmd = 'INSERT' and anon in roles
--
--   -- read/edit capability functions still callable
--   select proname, has_function_privilege('anon', oid, 'execute') as anon_may_execute
--     from pg_proc
--    where proname in ('menu_public', 'menu_read', 'menu_save');
--   -- expect: anon_may_execute = true for all three

-- Rollback, if a write path ever needs the old behaviour back (it should not):
--   grant insert on public.leads to anon;
--   create policy "leads_insert_only" on public.leads for insert to anon with check (true);
--   grant insert on public.menus to anon;
--   create policy "menus_insert_only" on public.menus for insert to anon
--     with check (edit_key_hash ~ '^[0-9a-f]{64}$'
--             and jsonb_array_length(items) between 1 and 120);


-- ===========================================================================
-- FROM 20261114130000_menu_indexing.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Migration 2026-11-14 (b) — opt-in indexing for published menus
--
-- Until now every menu page was `noindex`, and sitemap.xml listed only the
-- homepage and the legal pages, so a café could never be found by searching for
-- their own menu. That was a deliberate default (free publishing has no
-- moderation step) and it stays the default: a menu is indexable only when
-- someone has read the row and said so.
--
-- Safe to run at any time, in any order, and more than once:
--   * the column is added with `if not exists` and a default, so existing rows
--     stay out of search;
--   * both functions are `create or replace`;
--   * the grants are idempotent.
--
-- The deploy works both ways round. The app reads `indexable` defensively (a
-- missing key is `false`), and `readIndexableMenus()` treats a missing
-- `menu_indexable()` as "no menus to list" rather than an error — so the sitemap
-- keeps working before this is applied and starts including menus after.
-- ---------------------------------------------------------------------------

begin;

-- 1) The flag ---------------------------------------------------------------
alter table public.menus
  add column if not exists indexable boolean not null default false;

comment on column public.menus.indexable is
  'Owner/moderator approval for search indexing. False by default; sitemap.xml and the page robots directive both read it.';

-- 2) The public read now carries it -----------------------------------------
create or replace function public.menu_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug',       m.slug,
    'cafeName',   m.cafe_name,
    'tagline',    m.tagline,
    'whatsapp',   m.whatsapp,
    'items',      m.items,
    'updatedAt',  m.updated_at,
    'indexable',  m.indexable
  )
  from public.menus m
  where m.slug = p_slug
    and m.published;
$$;

-- 3) The sitemap's read -----------------------------------------------------
create or replace function public.menu_indexable()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('slug', m.slug, 'updatedAt', m.updated_at)
      order by m.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.menus m
  where m.published
    and m.indexable;
$$;

revoke all on function public.menu_public(text) from public;
revoke all on function public.menu_indexable() from public;

grant execute on function public.menu_public(text) to anon;
grant execute on function public.menu_indexable() to anon;

commit;

-- Verify:
--
--   select slug, published, indexable from public.menus order by updated_at desc;
--   -- expect: indexable = false unless you have approved a row
--
--   select public.menu_indexable();
--   -- expect: [] until at least one row has indexable = true and published
--
-- Approve exactly one menu, after reading it:
--   update public.menus set indexable = true  where slug = 'chai-and-chapter';
--   update public.menus set indexable = false where slug = 'chai-and-chapter';


-- ===========================================================================
-- FROM 20261121100000_rate_limit_store.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Migration 2026-11-21 — a shared rate limiter that needs no new account
--
-- Until now a shared limiter meant Upstash: a second dashboard, two more
-- secrets, a second outage mode. But this deployment already has Postgres, and
-- a fixed-window counter is three lines of SQL. So the limiter lives here and
-- Upstash becomes an optional accelerator rather than a prerequisite.
--
-- Why this is not just "a table":
--   * the increment is a single `insert ... on conflict do update ... returning`
--     statement, which Postgres runs atomically — two isolates cannot both read
--     5 and both write 6;
--   * the window is owned by whoever created it, so a burst cannot keep pushing
--     the reset time forward (that would be an infinite budget);
--   * both functions are SECURITY DEFINER with `search_path = ''` and granted to
--     `service_role` only — the anon key can neither read nor spend a budget.
--
-- Safe to run at any time, more than once: everything is `if not exists` or
-- `create or replace`, and a row per (key) is upserted by the functions.
-- ---------------------------------------------------------------------------

begin;

-- 1) The store ---------------------------------------------------------------
create table if not exists public.rate_limits (
  key        text primary key,
  count      integer     not null default 0,
  reset_at   timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.rate_limits is
  'Fixed-window counters for lib/rate-limit.ts. Keys are hashed identifiers, never raw IPs or emails.';

-- The sweep below deletes expired rows; this index is what keeps it cheap.
create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);

-- No client needs to touch this table directly: the functions below are the
-- only door, and they run as the definer.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- 2) Spend one token ---------------------------------------------------------
-- Returns the *new* count and the window's reset time. The caller decides
-- whether that count is over its limit, so the limit lives in TypeScript where
-- it is next to the copy that explains it.
create or replace function public.rate_limit_hit(
  p_key    text,
  p_window integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reset timestamptz;
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'rate_limit_hit: key required' using errcode = '22023';
  end if;
  if p_window is null or p_window <= 0 or p_window > 86400 then
    raise exception 'rate_limit_hit: window must be 1..86400 seconds' using errcode = '22023';
  end if;

  insert into public.rate_limits as rl (key, count, reset_at, updated_at)
  values (p_key, 1, now() + make_interval(secs => p_window), now())
  on conflict (key) do update set
    -- Expired window: start a fresh one. Live window: add a token.
    count      = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
    reset_at   = case when rl.reset_at <= now()
                      then now() + make_interval(secs => p_window)
                      else rl.reset_at end,
    updated_at = now()
  returning rl.count, rl.reset_at into v_count, v_reset;

  return jsonb_build_object(
    'count',   v_count,
    'resetAt', extract(epoch from v_reset)
  );
end;
$$;

-- 3) Look without spending ---------------------------------------------------
-- Used for the pre-flight check: a request that turns out to be malformed must
-- not eat the caller's quota. Deliberately a plain read — no lock, no write — so
-- it can never be the reason a request is slow.
create or replace function public.rate_limit_peek(
  p_key    text,
  p_window integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reset timestamptz;
begin
  select rl.count, rl.reset_at
    into v_count, v_reset
    from public.rate_limits rl
   where rl.key = p_key;

  -- Nothing recorded yet, or the window has expired: the caller has a full
  -- budget, and `rate_limit_hit` will create the row when it spends.
  if v_count is null or v_reset is null or v_reset <= now() then
    return jsonb_build_object(
      'count',   0,
      'resetAt', extract(epoch from now() + make_interval(secs => p_window))
    );
  end if;

  return jsonb_build_object(
    'count',   v_count,
    'resetAt', extract(epoch from v_reset)
  );
end;
$$;

-- 4) Hygiene -----------------------------------------------------------------
-- Expired rows are dead weight forever; this is the caller for them. Both
-- functions are `create or replace`, so grants survive a re-run — but they are
-- restated anyway so the file works on a fresh database too.
create or replace function public.rate_limits_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits where reset_at <= now() - interval '1 hour';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer)   from public, anon, authenticated;
revoke all on function public.rate_limit_peek(text, integer)  from public, anon, authenticated;
revoke all on function public.rate_limits_sweep()             from public, anon, authenticated;

grant execute on function public.rate_limit_hit(text, integer)  to service_role;
grant execute on function public.rate_limit_peek(text, integer) to service_role;
grant execute on function public.rate_limits_sweep()            to service_role;

commit;

-- Verify:
--
--   select public.rate_limit_hit('test:probe', 60);
--   -- expect: {"count": 1, "resetAt": 1.79…e+09}
--
--   select public.rate_limit_hit('test:probe', 60);
--   -- expect: count 2 — the counter is shared, which is the whole point
--
--   select public.rate_limit_peek('test:probe', 60);
--   -- expect: count 2, and it must NOT increment
--
--   select public.rate_limits_sweep();   -- cleans up the probe rows
--
--   -- The anon key must not be able to spend a budget:
--   -- curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/rate_limit_hit" \
--   --   -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
--   --   -d '{"p_key":"x","p_window":60}'
--   -- expect: 401/403 permission denied for function rate_limit_hit


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
