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
