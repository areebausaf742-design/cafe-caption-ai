/**
 * POST /api/dish-model — one food photo in, one real GLB out.
 *
 * The order of checks matters: refuse before spending anything, and never
 * report success for something that isn't stored and loadable.
 *
 *   1. budget check     (peek only — a bad request costs nothing)
 *   2. configured?      (a free GPU Space and somewhere to put the file)
 *   3. valid photo?     (JPEG/PNG/WebP, real bytes, sensible size)
 *   4. spend a token    (generation is scarce — a few a day, not a hundred)
 *   4. generate         (open weights on a free ZeroGPU Space)
 *   5. verify + store   (glTF magic bytes, then content-addressed R2 upload)
 *
 * Any failure is a named code with a sentence a café owner can read. There is
 * no path here that returns `ok` without a URL that a browser can load.
 */
import "server-only";

import { NextResponse } from "next/server";

import { parsePhoto } from "@/lib/image-validate";
import { putModel, modelStoreConfigured } from "@/lib/model-store";
import {
  peekRateLimit,
  rateLimit,
  rateLimitRefusal,
  withRateHeaders,
} from "@/lib/rate-limit";
import { readJsonWithLimit } from "@/lib/request-body";
import { generateModel, generatorConfigured, generatorProvider } from "@/lib/space-3d";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A cold ZeroGPU Space plus a TripoSR pass can take a couple of minutes. */
export const maxDuration = 300;

const LIMIT = {
  namespace: "dish-model",
  max: 6,
  windowMs: 30 * 60 * 1000,
  // Paid route (free-tier GPU minutes, which are the scarcest budget here).
  failClosed: true,
};

/** 4 MB of base64 is ~3 MB of JPEG — the compressor's ceiling, with slack. */
const MAX_BODY_BYTES = 4_500_000;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(
  status: number,
  error: string,
  code: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  const response = NextResponse.json({ error, code, ...extra }, { status, headers: NO_STORE });
  // `Retry-After` is a header, not a body field: a queue that says no should say
  // when to come back in the one place clients actually read.
  const retryAfter = Number(extra.retryAfter);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    response.headers.set("Retry-After", String(Math.ceil(retryAfter)));
  }
  return response;
}

export async function POST(request: Request) {
  // 1. Read the budget without spending it: a malformed photo, or a deployment
  //    with no Space, must not cost the café one of its few generations.
  const rate = await peekRateLimit(request, LIMIT);

  if (!rate.allowed) {
    if (rate.unavailable) {
      const refusal = rateLimitRefusal(rate);
      return withRateHeaders(
        fail(503, refusal.error, refusal.code, {
          retryAfter: rate.retryAfter,
        }),
        rate,
      );
    }
    return withRateHeaders(
      fail(429, "That's a lot of models at once. Give it a few minutes.", "RATE_LIMITED", {
        retryAfter: rate.retryAfter,
      }),
      rate,
    );
  }

  // 2. Configuration, before anything expensive: no Space or no bucket means
  //    there is nothing to do, whatever the photo looks like.
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

  // 3. The body, streamed, with a ceiling that a lying `content-length` can't
  //    get around. Then the photo itself: format, base64, signature, and an
  //    upper length limit on top of the shared rules.
  const parsedBody = await readJsonWithLimit(request, MAX_BODY_BYTES, {
    tooLarge: "That photo is too big to send. A JPEG under 4 MB is plenty.",
    // For this route an unreadable body means an unreadable photo.
    invalid: "That photo didn't arrive in one piece. Try another one.",
  });

  if (!parsedBody.ok) {
    const code = parsedBody.status === 413 ? "REQUEST_TOO_LARGE" : "BAD_PHOTO";
    return withRateHeaders(fail(parsedBody.status, parsedBody.message, code), rate);
  }

  const body = parsedBody.body as { image?: unknown } | null;
  const photo = parsePhoto(body?.image);

  if (!photo.ok) {
    // Keep this route's vocabulary: anything wrong with the photo is BAD_PHOTO,
    // except a body that was simply too large.
    const code = photo.status === 413 ? "REQUEST_TOO_LARGE" : "BAD_PHOTO";
    const message =
      photo.code === "UNSUPPORTED_IMAGE"
        ? "That photo isn't a JPEG, PNG or WebP."
        : photo.message;
    return withRateHeaders(fail(photo.status === 413 ? 413 : 400, message, code), rate);
  }

  if (!photo.photo) {
    return withRateHeaders(
      fail(400, "No photo arrived. Choose one photo of the dish and try again.", "BAD_PHOTO"),
      rate,
    );
  }

  // Generators read JPEG/PNG/WebP; a HEIC straight off an iPhone is converted in
  // the browser, so anything else here is a client that skipped that step.
  const mimeType = photo.photo.mimeType;
  if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") {
    return withRateHeaders(
      fail(400, "That photo isn't a JPEG, PNG or WebP.", "BAD_PHOTO"),
      rate,
    );
  }

  // 4. Everything checks out — spend one token of the budget and generate.
  const spent = await rateLimit(request, LIMIT);
  if (!spent.allowed) {
    if (spent.unavailable) {
      const refusal = rateLimitRefusal(spent);
      return withRateHeaders(
        fail(503, refusal.error, refusal.code, {
          retryAfter: spent.retryAfter,
        }),
        spent,
      );
    }
    return withRateHeaders(
      fail(429, "That's a lot of models at once. Give it a few minutes.", "RATE_LIMITED", {
        retryAfter: spent.retryAfter,
      }),
      spent,
    );
  }

  const started = Date.now();
  const generated = await generateModel({ mimeType, data: photo.photo.data });

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
    return withRateHeaders(response, spent);
  }

  const stored = await putModel(generated.glb);

  if (!stored.ok) {
    const status = stored.code === "STORAGE_DISABLED" ? 503 : 502;
    return withRateHeaders(fail(status, stored.message, stored.code), spent);
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
    spent,
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
