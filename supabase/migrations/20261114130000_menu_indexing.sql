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
