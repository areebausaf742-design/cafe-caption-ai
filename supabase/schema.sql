-- ---------------------------------------------------------------------------
-- CafeCaption — lead capture schema
-- Run this in Supabase → SQL Editor (or `supabase db push`).
-- Optional: the contact form still works without it (the UI falls back to a
-- one-tap WhatsApp handoff), but you won't keep a record of enquiries.
-- ---------------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  cafe_name text not null,
  city text not null,
  -- Optional: the quick-quote form has no phone field, and an enforced NOT NULL
  -- only ever turned a usable enquiry into a rejected one.
  whatsapp text,
  email text,
  interest text not null default 'not-sure',
  message text,
  source text not null default 'cafe-caption',
  page_url text
);

comment on table public.leads is
  'Enquiries submitted through the CafeCaption contact form.';

create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- Idempotent upgrade for a table created before whatsapp became optional.
alter table public.leads alter column whatsapp drop not null;

-- Row Level Security: the browser never reads this table.
alter table public.leads enable row level security;

-- No anon access at all. Supabase's default privileges grant `anon` everything
-- on new tables in `public`, so this is a revoke, not just a missing grant:
-- INSERT from the browser is what let anyone holding the publishable key skip
-- the API's validation and rate limits. Rows are written by `/api/leads` as the
-- service role, which bypasses RLS.
--
-- Deliberately no SELECT / UPDATE / DELETE policy either.
revoke insert, update, delete on public.leads from anon;
revoke insert, update, delete on public.leads from authenticated;
drop policy if exists "leads_insert_only" on public.leads;

-- ---------------------------------------------------------------------------
-- Handy queries
-- ---------------------------------------------------------------------------
-- select * from public.leads order by created_at desc limit 50;
-- select count(*) from public.leads where created_at > now() - interval '7 days';

-- ---------------------------------------------------------------------------
-- Hosted menus
--
-- A published menu is a row here; the public page reads it through
-- `menu_public()`, and the owner edits it with the key they were given once.
-- The key itself is never stored — only its SHA-256 — so a database leak hands
-- out no editing rights.
--
-- Deliberately no `select`/`update`/`delete` privilege for `anon`: drafts can't
-- be listed or read, and rows can only change through the functions below.
-- ---------------------------------------------------------------------------

create table if not exists public.menus (
  slug          text primary key
                check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  cafe_name     text not null check (char_length(cafe_name) between 1 and 80),
  tagline       text check (tagline is null or char_length(tagline) between 1 and 90),
  whatsapp      text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  items         jsonb not null
                check (jsonb_typeof(items) = 'array'
                   and jsonb_array_length(items) between 1 and 120),
  published     boolean not null default true,
  edit_key_hash text not null check (edit_key_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.menus is
  'Digitised café menus. Edit with the capability key, never by logging in.';

alter table public.menus enable row level security;

-- No table privilege for the public roles: rows are created by `/api/menus` as
-- the service role and changed only through the functions below.
revoke all on public.menus from anon, authenticated;

-- No INSERT policy for `anon`. Publishing is a server write.
drop policy if exists "menus_insert_only" on public.menus;

-- Public read: published rows only, and only these fields.
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
    'updatedAt',  m.updated_at
  )
  from public.menus m
  where m.slug = p_slug
    and m.published;
$$;

-- Owner read: requires the hash of the edit key. Returns drafts too.
create or replace function public.menu_read(p_slug text, p_hash text)
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
    'published',  m.published,
    'updatedAt',  m.updated_at
  )
  from public.menus m
  where m.slug = p_slug
    and m.edit_key_hash = p_hash;
$$;

-- Owner write: same hash check, and a hard cap on how much one row may hold.
create or replace function public.menu_save(
  p_slug text,
  p_hash text,
  p_cafe_name text,
  p_tagline text,
  p_whatsapp text,
  p_items jsonb,
  p_published boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  update public.menus m
     set cafe_name = p_cafe_name,
         tagline   = nullif(p_tagline, ''),
         whatsapp  = nullif(p_whatsapp, ''),
         items     = p_items,
         published = coalesce(p_published, m.published),
         updated_at = now()
   where m.slug = p_slug
     and m.edit_key_hash = p_hash
     and jsonb_array_length(p_items) between 1 and 120
  returning jsonb_build_object('slug', m.slug, 'updatedAt', m.updated_at);
$$;

revoke all on function public.menu_public(text)                     from public;
revoke all on function public.menu_read(text, text)                from public;
revoke all on function public.menu_save(text, text, text, text, text, jsonb, boolean) from public;

grant execute on function public.menu_public(text)                  to anon;
grant execute on function public.menu_read(text, text)              to anon;
grant execute on function public.menu_save(text, text, text, text, text, jsonb, boolean) to anon;

-- Turn a menu off without deleting it:
--   update public.menus set published = false where slug = 'chai-and-chapter';

-- ---------------------------------------------------------------------------
-- Hardening migration (2026-11)
--
-- Safe to run on a database that already has the tables above: every statement
-- is guarded, and constraints are added `not valid` so existing rows are not
-- re-checked. Run `alter table … validate constraint …` afterwards if you want
-- the old rows verified too (it will fail loudly on any that are wrong, which is
-- usually how you find them).
-- ---------------------------------------------------------------------------

-- 1) Length ceilings on leads -------------------------------------------------
-- The API already trims to these numbers; the table is what actually enforces
-- them, so a leaked anon key can't be used to store a megabyte of text.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_name_len') then
    alter table public.leads add constraint leads_name_len
      check (char_length(name) between 2 and 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_cafe_name_len') then
    alter table public.leads add constraint leads_cafe_name_len
      check (char_length(cafe_name) between 2 and 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_city_len') then
    alter table public.leads add constraint leads_city_len
      check (char_length(city) between 2 and 40) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_whatsapp_len') then
    alter table public.leads add constraint leads_whatsapp_len
      check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$') not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_email_len') then
    alter table public.leads add constraint leads_email_len
      check (email is null or char_length(email) between 5 and 120) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_message_len') then
    alter table public.leads add constraint leads_message_len
      check (message is null or char_length(message) <= 600) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_page_url_len') then
    alter table public.leads add constraint leads_page_url_len
      check (page_url is null or char_length(page_url) <= 300) not valid;
  end if;
end $$;

-- 2) Menu items validated in the database ------------------------------------
-- `lib/menu.ts` normalises items on the way in. This is the same ceiling, stated
-- where a row can't ignore it: an array of objects, each with a usable name and
-- price, and nothing longer than the UI allows.
create or replace function public.menu_items_valid(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(p_items) = 'array', false)
     and coalesce(jsonb_array_length(p_items) between 1 and 120, false)
     and not exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
       ) as item
       where jsonb_typeof(item) <> 'object'
          or coalesce(char_length(item ->> 'name'), 0) not between 1 and 80
          or coalesce(char_length(item ->> 'price'), 0) not between 1 and 24
          or coalesce(char_length(item ->> 'category'), 0) > 40
     );
$$;

comment on function public.menu_items_valid(jsonb) is
  'Mirrors lib/menu.ts normalizeItems: array of {name, price, category?} within the UI limits.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menus_items_valid') then
    alter table public.menus add constraint menus_items_valid
      check (public.menu_items_valid(items)) not valid;
  end if;
end $$;

-- 3) Anonymous INSERT removed ------------------------------------------------
-- Writes are server-only now: `/api/leads` and `/api/menus` use
-- SUPABASE_SERVICE_ROLE_KEY (server environment only, never `NEXT_PUBLIC_*`,
-- never in a bundle). A missing key is a 503 from those routes — there is no
-- fallback to the publishable key, because a fallback is exactly how the anon
-- path would quietly come back.
--
-- The statements above already leave a fresh database in this state. This block
-- is for a database created by an earlier version of this file, and is what
-- `supabase/migrations/20261114120000_lock_anon_inserts.sql` applies. Every
-- statement is a revoke or a guarded drop, so it is safe to re-run.
revoke insert on public.leads from anon;
revoke insert on public.leads from authenticated;
drop policy if exists "leads_insert_only" on public.leads;

revoke insert on public.menus from anon;
revoke insert on public.menus from authenticated;
drop policy if exists "menus_insert_only" on public.menus;

-- RLS stays on. The `security definer` functions above are untouched: they run
-- as the owner, so `menu_public()`, `menu_read()` and `menu_save()` keep working
-- for `anon` — public pages and the capability-key editor included.
alter table public.leads enable row level security;
alter table public.menus enable row level security;

-- The same statements live in
-- `supabase/migrations/20261114120000_lock_anon_inserts.sql`, which is the file
-- to run on an existing database *after* the service-role deployment is live.
