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
import { rateLimit, withRateHeaders } from "@/lib/rate-limit";

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
  if (!menuStoreConfigured()) {
    return fail(503, "Menus aren't switched on yet.", "STORE_UNAVAILABLE");
  }

  const rate = await rateLimit(request, READ_LIMIT);
  if (!rate.allowed) {
    return withRateHeaders(
      fail(429, "Too many requests. Give it a minute.", "RATE_LIMITED"),
      rate,
    );
  }

  const hash = await keyHash(request);
  if (!hash) return fail(401, "This editor link is missing its key.", "BAD_KEY");

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
  if (!menuStoreConfigured()) {
    return fail(503, "Menus aren't switched on yet.", "STORE_UNAVAILABLE");
  }

  const rate = await rateLimit(request, SAVE_LIMIT);
  if (!rate.allowed) {
    const response = fail(429, "Too many saves. Give it a minute.", "RATE_LIMITED");
    response.headers.set("Retry-After", String(rate.retryAfter));
    return withRateHeaders(response, rate);
  }

  const hash = await keyHash(request);
  if (!hash) return fail(401, "This editor link is missing its key.", "BAD_KEY");

  const declaredBytes = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    return withRateHeaders(
      fail(
        413,
        "That menu is too big to save. Very long 3D links or descriptions on many dishes usually push it over.",
        "REQUEST_TOO_LARGE",
      ),
      rate,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withRateHeaders(
      fail(400, "Request body must be valid JSON.", "INVALID_JSON"),
      rate,
    );
  }

  const result = validateMenu(body);
  if (!result.ok) {
    return withRateHeaders(
      NextResponse.json(
        { error: result.error, field: result.field, code: "VALIDATION_ERROR" },
        { status: 400, headers: NO_STORE },
      ),
      rate,
    );
  }

  try {
    const updatedAt = await saveMenu(slug, hash, result.value);
    if (!updatedAt) {
      return withRateHeaders(
        fail(403, "That key doesn't match this menu.", "FORBIDDEN"),
        rate,
      );
    }
    return withRateHeaders(
      NextResponse.json({ ok: true, updatedAt }, { headers: NO_STORE }),
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
