/**
 * POST /api/dish-model — one food photo in, one real GLB out.
 *
 * The order of checks matters: refuse before spending anything, and never
 * report success for something that isn't stored and loadable.
 *
 *   1. configured?      (a free GPU Space and somewhere to put the file)
 *   2. valid photo?     (JPEG/PNG/WebP, sensible size)
 *   3. allowed rate?    (generation is scarce — a few a day, not a hundred)
 *   4. generate         (open weights on a free ZeroGPU Space)
 *   5. verify + store   (glTF magic bytes, then content-addressed R2 upload)
 *
 * Any failure is a named code with a sentence a café owner can read. There is
 * no path here that returns `ok` without a URL that a browser can load.
 */
import "server-only";

import { NextResponse } from "next/server";

import { putModel, modelStoreConfigured } from "@/lib/model-store";
import { rateLimit, withRateHeaders } from "@/lib/rate-limit";
import { generateModel, generatorConfigured, generatorProvider } from "@/lib/space-3d";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A cold ZeroGPU Space plus a TripoSR pass can take a couple of minutes. */
export const maxDuration = 300;

const LIMIT = { namespace: "dish-model", max: 6, windowMs: 30 * 60 * 1000 };

/** 4 MB of base64 is ~3 MB of JPEG — the compressor's ceiling, with slack. */
const MAX_BODY_BYTES = 4_500_000;

const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(
  status: number,
  error: string,
  code: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ error, code, ...extra }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const rate = await rateLimit(request, LIMIT);

  if (!rate.allowed) {
    return withRateHeaders(
      fail(429, "That's a lot of models at once. Give it a few minutes.", "RATE_LIMITED", {
        retryAfter: rate.retryAfter,
      }),
      rate,
    );
  }

  if (!generatorConfigured()) {
    return withRateHeaders(
      fail(
        503,
        "3D generation isn't switched on for this deployment yet.",
        "GENERATION_DISABLED",
        {
          hint:
            "It needs one free Hugging Face Space running open weights (TripoSR or similar). Until that exists there is nothing to generate with, and nothing here will pretend otherwise.",
        },
      ),
      rate,
    );
  }

  if (!modelStoreConfigured()) {
    return withRateHeaders(
      fail(
        503,
        "Generated models have nowhere to live yet.",
        "STORAGE_DISABLED",
        { hint: "Set the R2_* variables so a finished model can be stored and served." },
      ),
      rate,
    );
  }

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return withRateHeaders(
      fail(413, "That photo is too big to send. A JPEG under 4 MB is plenty.", "REQUEST_TOO_LARGE"),
      rate,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withRateHeaders(fail(400, "Request body must be valid JSON.", "INVALID_JSON"), rate);
  }

  const image = (body as { image?: { mimeType?: unknown; data?: unknown } } | null)?.image;
  const mimeType = typeof image?.mimeType === "string" ? image.mimeType.trim().toLowerCase() : "";
  const data = typeof image?.data === "string" ? image.data : "";

  if (!MIME.has(mimeType)) {
    return withRateHeaders(
      fail(400, "That photo isn't a JPEG, PNG or WebP.", "BAD_PHOTO"),
      rate,
    );
  }

  if (data.length < 512) {
    return withRateHeaders(
      fail(400, "That photo looks empty. Try another one.", "BAD_PHOTO"),
      rate,
    );
  }

  const started = Date.now();
  const generated = await generateModel({ mimeType, data });

  if (!generated.ok) {
    const status =
      generated.code === "GENERATION_DISABLED"
        ? 503
        : generated.code === "GENERATION_BUSY"
          ? 429
          : 502;

    const response = fail(status, generated.message, generated.code, {
      ...(generated.retryAfter ? { retryAfter: generated.retryAfter } : {}),
    });
    if (generated.retryAfter) {
      response.headers.set("Retry-After", String(generated.retryAfter));
    }
    return withRateHeaders(response, rate);
  }

  const stored = await putModel(generated.glb);

  if (!stored.ok) {
    const status = stored.code === "STORAGE_DISABLED" ? 503 : 502;
    return withRateHeaders(fail(status, stored.message, stored.code), rate);
  }

  return withRateHeaders(
    NextResponse.json(
      {
        ok: true,
        model: {
          glb: stored.url,
          // Provenance travels with the model, so the credit line is never invented.
          by: generated.provider,
        },
        meta: {
          provider: generated.provider,
          via: generated.via,
          bytes: stored.bytes,
          seconds: Math.round((Date.now() - started) / 1000),
        },
      },
      { headers: NO_STORE },
    ),
    rate,
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST with a photo.",
      code: "METHOD_NOT_ALLOWED",
      // Cheap health probe for the operator: is generation wired up at all?
      provider: generatorConfigured() ? generatorProvider() : null,
      storage: modelStoreConfigured(),
    },
    { status: 405, headers: { Allow: "POST", ...NO_STORE } },
  );
}
