/**
 * The hosted-menu contract, shared by the studio, the API routes and the pages.
 *
 * A menu is small enough to be one JSON document: a café name, an optional
 * tagline and WhatsApp number, and the items. There is no account behind it —
 * the owner holds a capability key, and the key is only ever stored as a hash.
 * Nothing in this file is secret or server-only, so it can be imported anywhere.
 */

import {
  TRANSLATION_LANGUAGES,
  type DigitalMenu,
  type MenuItem,
  type MenuTranslations,
} from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Limits (mirrored by the checks in supabase/schema.sql)                    */
/* -------------------------------------------------------------------------- */

export const MAX_ITEMS = 120;
export const MAX_CAFE_NAME = 80;
export const MAX_TAGLINE = 90;
export const MAX_CATEGORY = 40;
export const MAX_ITEM_NAME = 80;
export const MAX_PRICE = 16;

/** Bytes of randomness in an edit key — 24 bytes is 32 URL-safe characters. */
export const EDIT_KEY_BYTES = 24;

/** `abc`, `chai-and-chapter`, never `-abc`, `abc-` or `a`. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** What the API accepts and the database stores. */
export interface MenuDraft {
  cafeName: string;
  /** One line under the café name, e.g. "Since 2019 · Hazratganj". */
  tagline: string;
  /** Digits only, with country code, or "" for no ordering button. */
  whatsapp: string;
  items: MenuItem[];
  published: boolean;
}

export interface MenuDoc extends MenuDraft {
  slug: string;
  /** ISO timestamp, so the owner can see the edit actually landed. */
  updatedAt: string;
}

export type MenuValidation =
  | { ok: true; value: MenuDraft }
  | { ok: false; error: string; field?: "cafeName" | "items" };

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Hindi and Hinglish overlays, re-validated like everything else.
 *
 * A language is kept only when it has a name; a translation with no category
 * borrows the printed one, because a section heading is not worth losing the
 * translation over. Malformed values are dropped rather than published.
 */
function normalizeTranslations(
  raw: unknown,
  fallbackCategory: string,
): MenuTranslations | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const out: MenuTranslations = {};

  for (const language of TRANSLATION_LANGUAGES) {
    const entry = source[language];
    if (typeof entry !== "object" || entry === null) continue;

    const row = entry as Record<string, unknown>;
    const name = text(row.name, MAX_ITEM_NAME);
    if (!name) continue;

    out[language] = {
      category: text(row.category, MAX_CATEGORY) || fallbackCategory,
      name,
    };
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Items arrive from the model (or the editor), so every field is re-validated
 * here rather than trusted. Items with no name or no price are dropped instead
 * of failing the whole menu — one blank row shouldn't cost you the publish.
 */
export function normalizeItems(input: unknown): MenuItem[] {
  if (!Array.isArray(input)) return [];

  const items: MenuItem[] = [];
  for (const raw of input.slice(0, MAX_ITEMS)) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const name = text(row.name, MAX_ITEM_NAME);
    const price = text(row.price, MAX_PRICE);
    if (!name || !price) continue;

    const category = text(row.category, MAX_CATEGORY) || "Menu";
    const translations = normalizeTranslations(row.translations, category);

    items.push(
      translations
        ? { category, name, price, translations }
        : { category, name, price },
    );
  }
  return items;
}

export function validateMenu(input: unknown): MenuValidation {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Nothing to publish." };
  }
  const raw = input as Record<string, unknown>;

  const cafeName = text(raw.cafeName, MAX_CAFE_NAME);
  if (cafeName.length < 2) {
    return { ok: false, error: "Add your café's name first.", field: "cafeName" };
  }

  const items = normalizeItems(raw.items);
  if (items.length === 0) {
    return {
      ok: false,
      error: "A menu needs at least one item with a name and a price.",
      field: "items",
    };
  }

  // Stored pre-dialled: an owner typing the number off a visiting card gets a
  // number the order button can actually reach, not ten digits wa.me rejects.
  const whatsapp = dialableWhatsapp(text(raw.whatsapp, 20));

  return {
    ok: true,
    value: {
      cafeName,
      tagline: text(raw.tagline, MAX_TAGLINE),
      whatsapp: whatsapp.length >= 8 ? whatsapp : "",
      items,
      // Anything other than an explicit `false` publishes — the happy path is
      // "I just read my menu, put it live".
      published: raw.published !== false,
    },
  };
}

/** Categories in the order they first appear, for both the card and editing. */
export function groupItems(items: MenuItem[]): { category: string; items: MenuItem[] }[] {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.category);
    if (bucket) bucket.push(item);
    else groups.set(item.category, [item]);
  }
  return [...groups].map(([category, list]) => ({ category, items: list }));
}

/** The shape `MenuCard` renders. */
export function toDigitalMenu(items: MenuItem[]): DigitalMenu {
  const categories = [...new Set(items.map((item) => item.category))];
  return { items, categories, categoryCount: categories.length };
}

/* -------------------------------------------------------------------------- */
/*  Slugs and paths                                                          */
/* -------------------------------------------------------------------------- */

export function slugify(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  const slug = base.length >= 3 ? base : `${base || "cafe"}-menu`;
  return SLUG_RE.test(slug) ? slug : "cafe-menu";
}

/** Slugs are guesses, names collide — this is what makes the second one unique. */
export function withSuffix(slug: string, attempt: number): string {
  const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
  const trimmed = slug.slice(0, 40 - suffix.length).replace(/-+$/g, "");
  return `${trimmed}${suffix}`;
}

/**
 * Digits a `wa.me` link will actually dial.
 *
 * Ten digits starting 6–9 are an Indian mobile, so they get the country code; a
 * leading zero is dropped for the same reason. Anything already carrying a
 * country code is left alone.
 */
export function dialableWhatsapp(raw: string): string {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function menuPath(slug: string): string {
  return `/menu/${slug}`;
}

/**
 * The editor URL carries the key in the **fragment**, which browsers never send
 * to a server: no access log, no referrer, no CDN copy. The editor reads it from
 * `location.hash` and sends it as a header instead.
 */
export function menuEditPath(slug: string, key: string): string {
  return `/menu/${slug}/edit#${key}`;
}

/* -------------------------------------------------------------------------- */
/*  Keys                                                                     */
/* -------------------------------------------------------------------------- */

/** A fresh capability key. Only the hash is stored; this value is shown once. */
export function createEditKey(): string {
  const bytes = new Uint8Array(EDIT_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/**
 * Hex SHA-256 of a key, computed here rather than in Postgres so the schema
 * needs no pgcrypto and the database only ever compares two strings.
 */
export async function hashEditKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Keys are compared by length first: a stray header value must not throw. */
export function looksLikeEditKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{30,60}$/.test(value);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
