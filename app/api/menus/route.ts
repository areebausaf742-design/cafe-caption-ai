/**
 * Publish a digitised menu.
 *
 * One request turns the menu in the studio into a page on this site and hands
 * back the two links the owner needs: the public URL (what the QR encodes) and
 * the editor URL, whose key lives in the fragment and is shown exactly once.
 *
 * There is no account. The key is the only credential, and the database stores
 * its hash — so this route computes the hash and forgets the key.
 */
import "server-only";

import { NextResponse } from "next/server";

import {
  createEditKey,
  hashEditKey,
  menuEditPath,
  menuPath,
  slugify,
  validateMenu,
  withSuffix,
} from "@/lib/menu";
import {
  createMenuRecord,
  menuStoreConfigured,
} from "@/lib/menu-store";
import { rateLimit, withRateHeaders } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 120 items now carry up to three languages each, and a dish can also carry a
 * description, eight ingredients and two long asset URLs, so the ceiling has
 * room for the worst case with a margin. A menu this size is still far below
 * what the database column and the page renderer are happy with.
 */
const MAX_BODY_BYTES = 512_000;

/** A menu is a bigger write than a lead, so it gets a tighter window. */
const LIMIT = { namespace: "menu-publish", max: 5, windowMs: 10 * 60 * 1000 };

/** If a café name collides, try `name-2` … `name-5` before giving up. */
const SLUG_ATTEMPTS = 5;

export async function POST(request: Request) {
  const rate = await rateLimit(request, LIMIT);

  if (!rate.allowed) {
    const response = NextResponse.json(
      {
        error: "That's a lot of menus. Try again in a few minutes.",
        code: "RATE_LIMITED",
        retryAfter: rate.retryAfter,
      },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(rate.retryAfter));
    return withRateHeaders(response, rate);
  }

  if (!menuStoreConfigured()) {
    return withRateHeaders(
      NextResponse.json(
        {
          error: "Publishing isn't switched on yet.",
          code: "PUBLISHING_DISABLED",
          hint: "Set SUPABASE_URL and SUPABASE_ANON_KEY, then run supabase/schema.sql. The menu you just read is still yours to download.",
        },
        { status: 503 },
      ),
      rate,
    );
  }

  const declaredBytes = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    return withRateHeaders(
      NextResponse.json(
        {
          error:
            "That menu is too big to publish. Long 3D links or descriptions on many dishes usually push it over — shorten a few and try again.",
          code: "REQUEST_TOO_LARGE",
        },
        { status: 413 },
      ),
      rate,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withRateHeaders(
      NextResponse.json(
        { error: "Request body must be valid JSON.", code: "INVALID_JSON" },
        { status: 400 },
      ),
      rate,
    );
  }

  const result = validateMenu(body);
  if (!result.ok) {
    return withRateHeaders(
      NextResponse.json(
        { error: result.error, field: result.field, code: "VALIDATION_ERROR" },
        { status: 400 },
      ),
      rate,
    );
  }

  const menu = result.value;
  const key = createEditKey();
  const hash = await hashEditKey(key);
  const base = slugify(menu.cafeName);

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = withSuffix(base, attempt);

    try {
      await createMenuRecord(slug, hash, menu);
    } catch (error) {
      if (error instanceof Error && error.name === "SlugTaken") continue;
      console.error("[menus] publish failed:", error);
      return withRateHeaders(
        NextResponse.json(
          {
            error: "The menu couldn't be published just now.",
            code: "STORE_UNAVAILABLE",
            hint: "Nothing was saved. Your menu is still in the studio — try again in a moment.",
          },
          { status: 503 },
        ),
        rate,
      );
    }

    return withRateHeaders(
      NextResponse.json(
        {
          ok: true,
          slug,
          url: `${siteUrl}${menuPath(slug)}`,
          editUrl: `${siteUrl}${menuEditPath(slug, key)}`,
          // Shown once, never retrievable again — that is the whole point.
          key,
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      ),
      rate,
    );
  }

  return withRateHeaders(
    NextResponse.json(
      {
        error: "There are a lot of menus with that name already.",
        code: "SLUG_EXHAUSTED",
        hint: "Publish under a slightly different name — add your area, for example.",
      },
      { status: 409 },
    ),
    rate,
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "This endpoint only accepts POST requests.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
