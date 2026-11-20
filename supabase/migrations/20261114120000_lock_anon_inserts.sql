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
