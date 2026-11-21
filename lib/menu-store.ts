/**
 * Hosted-menu storage: Supabase's REST API, no SDK.
 *
 * Reads use the public capability key and go through the three SQL functions in
 * `supabase/schema.sql` rather than touching the table, because the table has no
 * `select`/`update` privilege for `anon` at all. The route computes the edit
 * key's hash and the database compares strings — so the key never leaves the
 * owner's browser, and a database dump hands out no editing rights.
 *
 * The one direct table write is the INSERT that publishes a new menu, and that
 * runs as the **service role** (`SUPABASE_SERVICE_ROLE_KEY`): `anon` no longer
 * has INSERT on `public.menus`, so this is the only path that can create a row.
 * If the key is missing there is no fallback — `createMenuRecord` throws and the
 * route answers 503.
 *
 * Everything here throws on an upstream failure and returns `null` for "not
 * found", so callers can tell a 404 from an outage.
 */
import "server-only";

import type { MenuDoc, MenuDraft } from "@/lib/menu";
import {
  readHeaders,
  supabaseEndpoint,
  supabaseReadConfigured,
  supabaseWriteConfigured,
  writeHeaders,
} from "@/lib/supabase-config";

/** A slow database must not hold the function open until Vercel kills it. */
const TIMEOUT_MS = 5_000;

/** Reads: public pages and the capability-key edit endpoints. */
export function menuStoreConfigured(): boolean {
  return supabaseReadConfigured();
}

/** Writes: publishing a new menu, which only the service role may do. */
export function menuWriteConfigured(): boolean {
  return supabaseWriteConfigured();
}

const endpoint = supabaseEndpoint;

/** Call a SQL function. Returns the decoded JSON body (which may be `null`). */
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const response = await fetch(endpoint(`/rest/v1/rpc/${name}`), {
    method: "POST",
    headers: readHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`rpc ${name} failed: ${response.status} ${detail.slice(0, 200)}`);
  }

  const body = await response.text();
  if (!body || body === "null") return null;
  return JSON.parse(body) as T;
}

/**
 * Insert a published menu, as the service role. `Prefer: return=minimal` keeps
 * the response small — the caller already knows everything it just wrote.
 *
 * Throws when the write key is absent. That is intentional: `anon` has no INSERT
 * grant on `public.menus` any more, so a fallback would only produce a confusing
 * 401 from PostgREST instead of an honest "not configured".
 */
export async function createMenuRecord(
  slug: string,
  hash: string,
  menu: MenuDraft,
): Promise<void> {
  const response = await fetch(endpoint("/rest/v1/menus"), {
    method: "POST",
    headers: { ...writeHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      slug,
      cafe_name: menu.cafeName,
      tagline: menu.tagline || null,
      whatsapp: menu.whatsapp || null,
      items: menu.items,
      published: menu.published,
      edit_key_hash: hash,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 409) {
    const conflict = new Error("slug already taken");
    conflict.name = "SlugTaken";
    throw conflict;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`menu insert failed: ${response.status} ${detail.slice(0, 200)}`);
  }
}

/** The public page's read: published rows only. */
export async function readPublicMenu(slug: string): Promise<MenuDoc | null> {
  const row = await rpc<Record<string, unknown>>("menu_public", { p_slug: slug });
  return row ? mapRow(row) : null;
}

/** The editor's read: needs the hash, and can see unpublished menus. */
export async function readMenuForEdit(
  slug: string,
  hash: string,
): Promise<MenuDoc | null> {
  const row = await rpc<Record<string, unknown>>("menu_read", {
    p_slug: slug,
    p_hash: hash,
  });
  return row ? mapRow(row) : null;
}

/** Save the whole document. Returns the new timestamp, or null on a bad key. */
export async function saveMenu(
  slug: string,
  hash: string,
  menu: MenuDraft,
): Promise<string | null> {
  const row = await rpc<{ updatedAt?: string }>("menu_save", {
    p_slug: slug,
    p_hash: hash,
    p_cafe_name: menu.cafeName,
    p_tagline: menu.tagline,
    p_whatsapp: menu.whatsapp,
    p_items: menu.items,
    p_published: menu.published,
  });
  return row?.updatedAt ?? null;
}

/** jsonb comes back with camelCase keys already (see the SQL functions). */
function mapRow(row: Record<string, unknown>): MenuDoc {
  return {
    slug: String(row.slug ?? ""),
    cafeName: String(row.cafeName ?? ""),
    tagline: String(row.tagline ?? ""),
    whatsapp: String(row.whatsapp ?? ""),
    items: Array.isArray(row.items) ? (row.items as MenuDoc["items"]) : [],
    published: row.published !== false,
    updatedAt: String(row.updatedAt ?? ""),
    indexable: row.indexable === true,
  };
}

/**
 * Slugs and timestamps of menus cleared for indexing, for the sitemap.
 *
 * Returns `[]` on every failure — a sitemap that 500s costs more than one
 * missing URL, and the function only exists once the indexing migration has
 * been applied, so "not there yet" is a normal answer rather than an error.
 */
export async function readIndexableMenus(): Promise<
  { slug: string; updatedAt: string }[]
> {
  if (!menuStoreConfigured()) return [];

  try {
    const rows = await rpc<Record<string, unknown>[]>("menu_indexable", {});
    if (!Array.isArray(rows)) return [];

    return rows
      .map((row) => ({
        slug: String(row.slug ?? ""),
        updatedAt: String(row.updatedAt ?? ""),
      }))
      .filter((row) => row.slug.length > 0);
  } catch {
    return [];
  }
}
