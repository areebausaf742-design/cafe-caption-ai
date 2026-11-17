/**
 * Hosted-menu storage: Supabase's REST API, no SDK.
 *
 * Reads and writes go through the three SQL functions in `supabase/schema.sql`
 * rather than touching the table, because the table has no `select`/`update`
 * privilege for the anon key at all. The route computes the key's hash and the
 * database compares strings — so the key never leaves the owner's browser, and
 * a database dump hands out no editing rights.
 *
 * Everything here throws on an upstream failure and returns `null` for "not
 * found", so callers can tell a 404 from an outage.
 */
import "server-only";

import type { MenuDoc, MenuDraft } from "@/lib/menu";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

/** A slow database must not hold the function open until Vercel kills it. */
const TIMEOUT_MS = 5_000;

export function menuStoreConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function headers(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY as string,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function endpoint(path: string): string {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not configured");
  return `${SUPABASE_URL}${path}`;
}

/** Call a SQL function. Returns the decoded JSON body (which may be `null`). */
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const response = await fetch(endpoint(`/rest/v1/rpc/${name}`), {
    method: "POST",
    headers: headers(),
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
 * Insert a published menu. `Prefer: return=minimal` keeps the response small —
 * the caller already knows everything it just wrote.
 */
export async function createMenuRecord(
  slug: string,
  hash: string,
  menu: MenuDraft,
): Promise<void> {
  const response = await fetch(endpoint("/rest/v1/menus"), {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
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
  };
}
