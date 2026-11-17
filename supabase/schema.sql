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

-- The API route uses the anon/publishable key, so it needs INSERT only.
-- There is deliberately no SELECT / UPDATE / DELETE policy.
drop policy if exists "leads_insert_only" on public.leads;
create policy "leads_insert_only"
  on public.leads
  for insert
  to anon
  with check (true);

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

revoke all on public.menus from anon, authenticated;
grant insert on public.menus to anon;

-- The API route is the only thing that inserts, and it always hashes a fresh
-- 24-byte key. Even if the anon key leaked, it buys nothing without a hash.
drop policy if exists "menus_insert_only" on public.menus;
create policy "menus_insert_only"
  on public.menus
  for insert
  to anon
  with check (
    edit_key_hash ~ '^[0-9a-f]{64}$'
    and jsonb_array_length(items) between 1 and 120
  );

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
