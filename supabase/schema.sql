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
