/**
 * Read and rewrite one published menu, authenticated by the edit key.
 *
 * The key arrives in the `x-menu-key` header, never in the URL: the editor URL
 * carries it in the fragment, the browser keeps it there, and this file is the
 * first thing allowed to see it. Every response is `no-store` so a shared
 * machine or a CDN can't serve someone else their own menu.
 */
import "server-only";

import { NextResponse } from "next/server";

import {
  SLUG_RE,
  hashEditKey,
  looksLikeEditKey,
  validateMenu,
} from "@/lib/menu";
import {
  menuStoreConfigured,
  readMenuForEdit,
  saveMenu,
} from "@/lib/menu-store";
import { peekRateLimit, rateLimit, withRateHeaders } from "@/lib/rate-limit";
import { readJsonWithLimit } from "@/lib/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A saved menu is the published menu, so it carries the same worst case: 120
 * lines, three languages, and dish copy plus two asset URLs where the café
 * added them. Saving must never be stricter than publishing.
 */
const MAX_BODY_BYTES = 512_000;

const READ_LIMIT = { namespace: "menu-edit-read", max: 60, windowMs: 10 * 60 * 1000 };
const SAVE_LIMIT = { namespace: "menu-edit-save", max: 20, windowMs: 10 * 60 * 1000 };

type Params = { params: Promise<{ slug: string }> };

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string, code: string, hint?: string) {
  return NextResponse.json({ error, code, hint }, { status, headers: NO_STORE });
}

/** The key's hash, or a response explaining why there isn't one. */
async function keyHash(request: Request): Promise<string | null> {
  const key = request.headers.get("x-menu-key");
  if (!looksLikeEditKey(key)) return null;
  return hashEditKey(key);
}

export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;

  if (!SLUG_RE.test(slug)) return fail(404, "No menu here.", "NOT_FOUND");

  const peeked = await peekRateLimit(request, READ_LIMIT);
  if (!peeked.allowed) {
    return withRateHeaders(
      fail(429, "Too many requests. Give it a minute.", "RATE_LIMITED"),
      peeked,
    );
  }

  if (!menuStoreConfigured()) {
    return fail(503, "Menus aren't switched on yet.", "STORE_UNAVAILABLE");
  }

  // The key is the only credential, so a request without one is answered before
  // any database work — and before a token is spent.
  const hash = await keyHash(request);
  if (!hash) return fail(401, "This editor link is missing its key.", "BAD_KEY");

  const rate = await rateLimit(request, READ_LIMIT);
  if (!rate.allowed) {
    return withRateHeaders(
      fail(429, "Too many requests. Give it a minute.", "RATE_LIMITED"),
      rate,
    );
  }

  try {
    const menu = await readMenuForEdit(slug, hash);
    if (!menu) {
      return withRateHeaders(
        fail(403, "That key doesn't match this menu.", "FORBIDDEN"),
        rate,
      );
    }
    return withRateHeaders(
      NextResponse.json({ ok: true, menu }, { headers: NO_STORE }),
      rate,
    );
  } catch (error) {
    console.error("[menus] edit read failed:", error);
    return withRateHeaders(
      fail(503, "Couldn't load this menu just now.", "STORE_UNAVAILABLE"),
      rate,
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { slug } = await params;

  if (!SLUG_RE.test(slug)) return fail(404, "No menu here.", "NOT_FOUND");

  const peeked = await peekRateLimit(request, SAVE_LIMIT);
  if (!peeked.allowed) {
    const response = fail(429, "Too many saves. Give it a minute.", "RATE_LIMITED");
    response.headers.set("Retry-After", String(peeked.retryAfter));
    return withRateHeaders(response, peeked);
  }

  if (!menuStoreConfigured()) {
    return fail(503, "Menus aren't switched on yet.", "STORE_UNAVAILABLE");
  }

  // 1. The key. A wrong or missing one is answered before the body is even read.
  const hash = await keyHash(request);
  if (!hash) return fail(401, "This editor link is missing its key.", "BAD_KEY");

  // 2. The body, streamed against a hard ceiling.
  const parsed = await readJsonWithLimit(request, MAX_BODY_BYTES, {
    tooLarge:
      "That menu is too big to save. Very long 3D links or descriptions on many dishes usually push it over.",
    invalid: "Request body must be valid JSON.",
  });

  if (!parsed.ok) {
    return withRateHeaders(
      fail(parsed.status, parsed.message, parsed.code),
      peeked,
    );
  }

  const result = validateMenu(parsed.body);
  if (!result.ok) {
    return withRateHeaders(
      NextResponse.json(
        { error: result.error, field: result.field, code: "VALIDATION_ERROR" },
        { status: 400, headers: NO_STORE },
      ),
      peeked,
    );
  }

  // 3. Validated. Spend a token and write.
  const rate = await rateLimit(request, SAVE_LIMIT);
  if (!rate.allowed) {
    const response = fail(429, "Too many saves. Give it a minute.", "RATE_LIMITED");
    response.headers.set("Retry-After", String(rate.retryAfter));
    return withRateHeaders(response, rate);
  }

  try {
    const updatedAt = await saveMenu(slug, hash, result.value);
    if (!updatedAt) {
      return withRateHeaders(
        fail(403, "That key doesn't match this menu.", "FORBIDDEN"),
        rate,
      );
    }
    // Return the menu as it was actually stored — trimmed, blank rows dropped,
    // an unusable model stripped. The editor renders this back, so the owner
    // sees the saved state rather than their optimistic guess.
    return withRateHeaders(
      NextResponse.json(
        {
          ok: true,
          updatedAt,
          menu: { slug, ...result.value, updatedAt },
        },
        { headers: NO_STORE },
      ),
      rate,
    );
  } catch (error) {
    console.error("[menus] save failed:", error);
    return withRateHeaders(
      fail(503, "Couldn't save just now. Nothing was changed.", "STORE_UNAVAILABLE"),
      rate,
    );
  }
}
