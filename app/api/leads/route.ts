/**
 * Lead intake for the "Tell me about your café" form.
 *
 * The row is written by the **service role** only (see `lib/lead-store.ts`):
 * `anon` has no INSERT grant on `public.leads` any more, so a request that can't
 * reach a configured server store answers 503 instead of writing with a public
 * key. The form is deliberately fire-and-forget — it opens WhatsApp in the same
 * user gesture and never inspects this response — so no visitor-visible error is
 * introduced by that. The enquiry still arrives; what changes is that we no
 * longer claim it was stored when it wasn't.
 */
import "server-only";

import { NextResponse } from "next/server";

import { storeLead } from "@/lib/lead-store";
import { peekRateLimit, rateLimit, withRateHeaders } from "@/lib/rate-limit";
import { readJsonWithLimit } from "@/lib/request-body";
import { validateLead } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { namespace: "leads", max: 6, windowMs: 10 * 60 * 1000 };

/** Four short answers. 16 KB is already an order of magnitude more than that. */
const MAX_BODY_BYTES = 16_384;

/** The body is created once so the two exits can't drift apart. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  // 1. Peek: a malformed enquiry must not eat one of the six attempts.
  const rate = await peekRateLimit(request, LIMIT);

  if (!rate.allowed) {
    const response = NextResponse.json(
      {
        error: "Too many requests. Please try again in a few minutes.",
        code: "RATE_LIMITED",
        retryAfter: rate.retryAfter,
      },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(rate.retryAfter));
    return withRateHeaders(response, rate);
  }

  // 2. The body, streamed against 16 KB.
  const parsed = await readJsonWithLimit(request, MAX_BODY_BYTES, {
    tooLarge: "That message was too long to send.",
    invalid: "Request body must be valid JSON.",
  });

  if (!parsed.ok) {
    return withRateHeaders(
      NextResponse.json(
        { error: parsed.message, code: parsed.code },
        { status: parsed.status },
      ),
      rate,
    );
  }

  const result = validateLead(parsed.body);
  if (!result.ok) {
    return withRateHeaders(
      NextResponse.json(
        { error: result.error, field: result.field, code: "VALIDATION_ERROR" },
        { status: 400 },
      ),
      rate,
    );
  }

  // 3. Validated. Spend a token and store.
  const spent = await rateLimit(request, LIMIT);
  if (!spent.allowed) {
    const response = NextResponse.json(
      {
        error: "Too many requests. Please try again in a few minutes.",
        code: "RATE_LIMITED",
        retryAfter: spent.retryAfter,
      },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(spent.retryAfter));
    return withRateHeaders(response, spent);
  }

  const pageUrl = request.headers.get("referer")?.slice(0, 300) ?? null;
  const stored = await storeLead(result.value, pageUrl);

  if (!stored.stored) {
    // Honest about the write, not about the visitor's experience: the WhatsApp
    // tab has already opened from the same click, and `channel` says so.
    return withRateHeaders(
      NextResponse.json(
        {
          error:
            "Your enquiry couldn't be saved here — please send it on WhatsApp, where the message is already written.",
          code: "STORE_UNAVAILABLE",
          channel: "whatsapp",
        },
        { status: 503, headers: NO_STORE },
      ),
      spent,
    );
  }

  return withRateHeaders(
    NextResponse.json(
      { ok: true, stored: true, channel: "supabase" },
      { status: 200, headers: NO_STORE },
    ),
    spent,
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "This endpoint only accepts POST requests.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
