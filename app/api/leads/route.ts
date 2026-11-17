/**
 * Lead intake for the "Tell me about your café" form.
 *
 * Leads are stored in Supabase when SUPABASE_URL + SUPABASE_ANON_KEY are set
 * (see supabase/schema.sql). If they aren't configured yet, the request still
 * succeeds so the visitor is never shown an error — the UI then offers a
 * one-tap WhatsApp handoff so no enquiry is lost.
 */
import "server-only";

import { NextResponse } from "next/server";

import { rateLimit, withRateHeaders } from "@/lib/rate-limit";
import { validateLead, type LeadDraft } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const TABLE = process.env.SUPABASE_LEADS_TABLE || "leads";

const LIMIT = { namespace: "leads", max: 6, windowMs: 10 * 60 * 1000 };

/** Four short answers. 16 KB is already an order of magnitude more than that. */
const MAX_BODY_BYTES = 16_384;

/** A slow Supabase must not hold the function open until Vercel kills it. */
const SUPABASE_TIMEOUT_MS = 5_000;

async function storeLead(
  lead: LeadDraft,
  pageUrl: string | null,
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
      "[leads] Supabase is not configured — lead not stored. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
    return false;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        ...lead,
        source: "cafe-caption",
        page_url: pageUrl,
      }),
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[leads] Supabase insert failed:", response.status, detail);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[leads] Supabase request failed:", error);
    return false;
  }
}

export async function POST(request: Request) {
  const rate = rateLimit(request, LIMIT);

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

  const declaredBytes = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    return withRateHeaders(
      NextResponse.json(
        { error: "That message was too long to send.", code: "REQUEST_TOO_LARGE" },
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

  const result = validateLead(body);
  if (!result.ok) {
    return withRateHeaders(
      NextResponse.json(
        { error: result.error, field: result.field, code: "VALIDATION_ERROR" },
        { status: 400 },
      ),
      rate,
    );
  }

  const pageUrl = request.headers.get("referer")?.slice(0, 300) ?? null;
  const stored = await storeLead(result.value, pageUrl);

  return withRateHeaders(
    NextResponse.json(
      {
        ok: true,
        stored,
        // Set on the server so the UI can log which channel was configured.
        channel: stored ? "supabase" : "whatsapp",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
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
