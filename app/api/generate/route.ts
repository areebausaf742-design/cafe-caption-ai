/**
 * Server-only route handler.
 *
 * `server-only` makes the build FAIL loudly if this module (and therefore the
 * Gemini API key) is ever imported from a Client Component, so the key can
 * never end up in the browser bundle.
 *
 * One endpoint, three tools (see `type`):
 *
 *   captions      Instagram captions + hashtags, with optional photo
 *   review_reply  three public replies to a Google review
 *   google_post   100–150 word Google Business Profile post
 *
 * The prompts, schemas and normalisers live in ./prompts.ts so this file stays
 * about transport: validation, the attempt ladder, and honest errors.
 */
import "server-only";

import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  type GenerationConfig,
  type Part,
} from "@google/generative-ai";

import type {
  ApiError,
  GenerateResponse,
  Language,
  StudioTool,
  Tone,
} from "@/lib/types";
import {
  rateLimit,
  withRateHeaders,
  type RateLimitResult,
} from "@/lib/rate-limit";
import {
  ALLOWED_IMAGE_TYPES,
  LANGUAGES,
  MAX_CAFE_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_BASE64_LENGTH,
  MAX_REVIEW_LENGTH,
  MAX_TOPIC_LENGTH,
  MIN_REVIEW_LENGTH,
  MIN_TOPIC_LENGTH,
  TONES,
} from "@/lib/types";
import {
  googlePostSpec,
  reviewSpec,
  captionsSpec,
  type ToolSpec,
} from "./prompts";

/* -------------------------------------------------------------------------- */
/*  ROUTE CONFIG                                                              */
/* -------------------------------------------------------------------------- */

/** The Gemini SDK needs the Node.js runtime (not Edge). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Vercel: allow up to 45s. Photo requests get a longer ladder (12s + 16s + 12s)
 * than text ones because image tokens take longer to read; 45s keeps every
 * rung inside the function budget and inside the browser's 70s patience.
 */
export const maxDuration = 45;

/**
 * Time budgets, per input type. The first attempt is cut off early so a hung
 * upstream call fails fast; the retry gets a longer leash because the model
 * usually answers second time around; the last slot goes to a lighter model.
 *
 *   text  8 + 12 + 10 = 30s
 *   photo 12 + 16 + 12 = 40s
 */
const TEXT_TIMEOUTS_MS = [8_000, 12_000, 10_000] as const;
const PHOTO_TIMEOUTS_MS = [12_000, 16_000, 12_000] as const;

/* -------------------------------------------------------------------------- */
/*  CONFIG                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 🔑 The Gemini API key is read HERE, on the server, and nowhere else.
 *
 *   1. Local dev  → `GEMINI_API_KEY=...` in `.env.local`
 *   2. Vercel     → Settings → Environment Variables → add GEMINI_API_KEY
 *
 * The name does NOT start with NEXT_PUBLIC_, so Next.js never inlines it into
 * client JavaScript. Never rename it, never log it, never import this route
 * from a Client Component (the `server-only` guard above enforces that).
 */
const apiKey = process.env.GEMINI_API_KEY;

/** Default model. Override with GEMINI_MODEL if you want a different one. */
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

/**
 * Safety net. If the primary model is overloaded (503), rate limited or simply
 * missing on this key, one last attempt goes to a cheaper model before we
 * bother the visitor with an error. Override with GEMINI_FALLBACK_MODEL.
 *
 * This used to default to `gemini-2.0-flash`, which Google has shut down (every
 * call 404s). `gemini-3.5-flash-lite` is the model Google documents as the
 * replacement for `gemini-2.5-flash`, so it is the safest second rung.
 */
const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.5-flash-lite";

/**
 * Last resort, only when every configured model 404s (a retired id, a typo in
 * GEMINI_MODEL). The newest stable Flash generation keeps the studio working
 * without a redeploy.
 */
const LAST_RESORT_MODEL = "gemini-3.8-flash";

/**
 * Output ceiling. Gemini 2.5 models spend part of this budget on *thinking*
 * tokens; 1024 was tight enough that a chatty attempt could return an empty or
 * half-written JSON object. 2048 leaves room for both.
 */
const MAX_OUTPUT_TOKENS = 2_048;

/**
 * Test-only override so the route can be exercised against a local mock Gemini.
 * Ignored in production: the SDK always talks to Google there.
 */
const BASE_URL =
  process.env.NODE_ENV === "production"
    ? undefined
    : process.env.GEMINI_BASE_URL?.trim() || undefined;

interface Attempt {
  model: string;
  timeoutMs: number;
}

/**
 * The attempt ladder: fast try → longer retry on the same model → cheaper
 * fallback model. Photo requests get more time on every rung.
 */
function buildAttempts(hasPhoto: boolean): Attempt[] {
  const [first, retry, fallback] = hasPhoto
    ? PHOTO_TIMEOUTS_MS
    : TEXT_TIMEOUTS_MS;

  return [
    { model: MODEL, timeoutMs: first },
    { model: MODEL, timeoutMs: retry },
    { model: FALLBACK_MODEL, timeoutMs: fallback },
  ];
}

/** Abuse guard: requests allowed per IP inside the window. */
const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Photos cost far more upstream quota than text, so they get their own, tighter
 * bucket on top of the general one above.
 */
const PHOTO_RATE_LIMIT_MAX = 6;

/** Requests allowed per IP inside the window. */
const LIMIT = { namespace: "generate", max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS };

/** Photos cost far more quota upstream, so they get their own tighter bucket. */
const PHOTO_LIMIT = {
  namespace: "generate-photo",
  max: PHOTO_RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_WINDOW_MS,
};

/* -------------------------------------------------------------------------- */
/*  PHOTO VALIDATION                                                          */
/* -------------------------------------------------------------------------- */

/** A photo that passed validation, ready to become an `inlineData` part. */
interface PhotoInput {
  mimeType: string;
  data: string;
  bytes: number;
}

type PhotoParse =
  | { ok: true; photo: PhotoInput | null }
  | { ok: false; status: number; code: string; message: string };

const ALLOWED_IMAGE_MIME = new Set<string>(ALLOWED_IMAGE_TYPES);

/**
 * Validate the optional photo before it reaches Gemini.
 *
 * The browser already downscales to ~1 MB, but a server never trusts a client:
 * the MIME type is checked against an allowlist, the payload must actually be
 * base64, and the decoded size is capped well under Vercel's 4.5 MB body limit.
 * A data-URL prefix is tolerated (and stripped) rather than rejected.
 */
function parsePhoto(raw: unknown): PhotoParse {
  if (raw === undefined || raw === null) return { ok: true, photo: null };

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_IMAGE",
      message: "The photo arrived in an unexpected format. Try uploading it again.",
    };
  }

  const { mimeType, data } = raw as { mimeType?: unknown; data?: unknown };

  if (
    typeof mimeType !== "string" ||
    !ALLOWED_IMAGE_MIME.has(mimeType.trim().toLowerCase())
  ) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_IMAGE",
      message:
        "That file type can't be read. Upload a photo — JPG, PNG or WebP.",
    };
  }

  if (typeof data !== "string" || !data.trim()) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_IMAGE",
      message: "The photo didn't arrive with any data. Try uploading it again.",
    };
  }

  const clean = (data.includes(",") ? data.slice(data.indexOf(",") + 1) : data)
    .replace(/\s+/g, "");

  if (clean.length > MAX_IMAGE_BASE64_LENGTH) {
    return {
      ok: false,
      status: 413,
      code: "IMAGE_TOO_LARGE",
      message:
        "That photo is too large to process. Try a smaller photo (under 5 MB before compression).",
    };
  }

  if (clean.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_IMAGE",
      message: "The photo data was unreadable. Try uploading it again.",
    };
  }

  const bytes = Math.floor((clean.replace(/=+$/, "").length * 3) / 4);

  return {
    ok: true,
    photo: { mimeType: mimeType.trim().toLowerCase(), data: clean, bytes },
  };
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                   */
/* -------------------------------------------------------------------------- */

function fail(
  status: number,
  error: string,
  code: string,
  extra?: {
    hint?: string;
    retryAfter?: number;
    rate?: RateLimitResult;
    reason?: string;
  },
) {
  const body: ApiError = {
    error,
    code,
    ...(extra?.hint ? { hint: extra.hint } : {}),
    ...(extra?.retryAfter ? { retryAfter: extra.retryAfter } : {}),
    ...(extra?.reason ? { reason: extra.reason } : {}),
  };
  const response = NextResponse.json(body, { status });
  if (extra?.retryAfter) {
    response.headers.set("Retry-After", String(extra.retryAfter));
  }
  return extra?.rate ? withRateHeaders(response, extra.rate) : response;
}

/** HTTP status carried by an SDK error, if it has one. */
function getStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** Human-readable message for anything that can be thrown. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Never let anything key-shaped reach a log line or a response body. */
function sanitize(text: string, max = 300): string {
  return text
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, "AIza-redacted")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Trim, collapse whitespace and cap length of optional user text. */
function cleanOptional(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ") // strip control characters
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength);
}

/** Pull a JSON object out of a model response, tolerating stray prose/fences. */
function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model response did not contain JSON.");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/* -------------------------------------------------------------------------- */
/*  ERRORS                                                                    */
/* -------------------------------------------------------------------------- */

/** Raised when an attempt runs past its budget and is aborted. */
class GenerationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini did not respond within ${timeoutMs}ms.`);
    this.name = "GenerationTimeoutError";
  }
}

/** Gemini answered, but with nothing we can post. Worth one more attempt. */
class ModelOutputError extends Error {
  readonly kind: "empty" | "unparsable";

  constructor(kind: "empty" | "unparsable", message: string) {
    super(message);
    this.name = "ModelOutputError";
    this.kind = kind;
  }
}

/** Gemini refused the prompt outright (safety / recitation). Retrying won't help. */
class BlockedError extends Error {
  readonly blockReason: string;

  constructor(blockReason: string) {
    super(`Gemini blocked the prompt (${blockReason}).`);
    this.name = "BlockedError";
    this.blockReason = blockReason;
  }
}

/** Every rung of the ladder failed; carries the final diagnosis. */
class GenerationFailureError extends Error {
  readonly model: string;
  readonly status?: number;
  readonly kind:
    | "timeout"
    | "empty"
    | "unparsable"
    | "rate_limited"
    | "model_missing"
    | "upstream";

  constructor(failure: {
    error: unknown;
    model: string;
    status?: number;
    kind: GenerationFailureError["kind"];
  }) {
    super(errorMessage(failure.error));
    this.name = "GenerationFailureError";
    this.model = failure.model;
    this.status = failure.status;
    this.kind = failure.kind;
  }
}

/* -------------------------------------------------------------------------- */
/*  GEMINI CALLS                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Per-model generation config.
 *
 * Gemini 2.5 models are *thinking* models: reasoning tokens are charged to the
 * same `maxOutputTokens` budget as the answer, which is how a request can come
 * back with `finishReason: MAX_TOKENS` and no usable JSON. Writing cafe copy
 * needs no chain-of-thought, so the thinking budget is switched off for 2.5 and
 * the output ceiling is roomy for every model.
 */
function buildGenerationConfig(
  model: string,
  allowThinkingConfig: boolean,
  schema: object,
): GenerationConfig {
  const config: GenerationConfig = {
    temperature: 0.95,
    topP: 0.95,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    responseMimeType: "application/json",
    responseSchema: schema as unknown as GenerationConfig["responseSchema"],
  };

  if (allowThinkingConfig && model.includes("2.5")) {
    // This SDK version doesn't type `thinkingConfig` yet, but it forwards the
    // generation config object to the REST API untouched.
    return {
      ...config,
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig;
  }

  return config;
}

/** One bounded HTTP call to Gemini. Aborts so the function returns, not hangs. */
async function oneCall(
  spec: ToolSpec<unknown>,
  key: string,
  model: string,
  timeoutMs: number,
  allowThinkingConfig: boolean,
  photo?: PhotoInput,
) {
  const genAI = new GoogleGenerativeAI(key);
  const client = genAI.getGenerativeModel(
    {
      model,
      systemInstruction: spec.systemInstruction,
      generationConfig: buildGenerationConfig(
        model,
        allowThinkingConfig,
        spec.schema,
      ),
    },
    BASE_URL ? { baseUrl: BASE_URL } : undefined,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Multimodal request: the image goes first and the instructions after it, so
  // the model has already "looked" by the time it reads what to write.
  const parts: Part[] = photo
    ? [
        { inlineData: { mimeType: photo.mimeType, data: photo.data } },
        { text: spec.prompt },
      ]
    : [{ text: spec.prompt }];

  try {
    return await client.generateContent(parts, { signal: controller.signal });
  } catch (error) {
    // The SDK surfaces an abort as a network error - report it as a timeout.
    if (controller.signal.aborted) throw new GenerationTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the model's answer. Anything unusable becomes a `ModelOutputError` so
 * the caller can retry instead of showing the visitor a blank result.
 */
function interpretResponse<T>(
  result: Awaited<ReturnType<typeof oneCall>>,
  model: string,
  spec: ToolSpec<T>,
): T {
  const response = result.response;

  // Gemini can refuse a prompt (safety filters) before producing text.
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) throw new BlockedError(String(blockReason));

  const finishReason = response.candidates?.[0]?.finishReason
    ? String(response.candidates[0].finishReason)
    : undefined;

  let text = "";
  try {
    text = response.text();
  } catch {
    // `.text()` throws when the candidate has no parts at all.
    text = "";
  }

  if (!text.trim()) {
    throw new ModelOutputError(
      "empty",
      `Model ${model} returned no text (finishReason: ${finishReason ?? "unknown"}).`,
    );
  }

  try {
    return spec.parse(extractJson(text));
  } catch (error) {
    throw new ModelOutputError(
      "unparsable",
      `Model ${model} text was unusable (finishReason: ${finishReason ?? "unknown"}): ${sanitize(text, 180)}${
        error instanceof Error ? ` - ${error.message}` : ""
      }`,
    );
  }
}

/** One attempt: call the model, then insist on postable output. */
async function attemptModel<T>(
  spec: ToolSpec<T>,
  key: string,
  model: string,
  timeoutMs: number,
  photo?: PhotoInput,
): Promise<T> {
  const thinkingAllowed = model.includes("2.5");

  try {
    return interpretResponse(
      await oneCall(spec, key, model, timeoutMs, thinkingAllowed, photo),
      model,
      spec,
    );
  } catch (error) {
    // If this API version rejects `thinkingConfig`, retry the same model
    // without it (fails in ~200ms) rather than failing the whole request.
    if (
      thinkingAllowed &&
      getStatus(error) === 400 &&
      /thinking/i.test(errorMessage(error))
    ) {
      console.warn("[generate] thinkingConfig rejected - retrying without it.");
      return interpretResponse(
        await oneCall(spec, key, model, timeoutMs, false, photo),
        model,
        spec,
      );
    }
    throw error;
  }
}

/**
 * Walk the attempt ladder and return the first usable result.
 *
 * Throws `BlockedError` immediately (retrying a safety block is pointless) and
 * rethrows the raw SDK error for a dead key, but retries everything else:
 * overloaded models, rate limits, empty replies and half-written JSON.
 */
async function generateWithRetry<T>(
  spec: ToolSpec<T>,
  key: string,
  photo?: PhotoInput,
): Promise<{ value: T; model: string }> {
  const attempts = buildAttempts(Boolean(photo));
  const budgetMs = attempts.reduce((total, item) => total + item.timeoutMs, 0);
  const startedAt = Date.now();
  let last: {
    error: unknown;
    model: string;
    status?: number;
    kind: GenerationFailureError["kind"];
  } | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const { model, timeoutMs } = attempts[index];

    try {
      const value = await attemptModel(spec, key, model, timeoutMs, photo);
      if (index > 0) {
        console.info(
          `[generate] recovered on attempt ${index + 1}/${attempts.length} (${model}).`,
        );
      }
      return { value, model };
    } catch (error) {
      const status = getStatus(error);

      let kind: GenerationFailureError["kind"];
      if (error instanceof GenerationTimeoutError) kind = "timeout";
      else if (error instanceof ModelOutputError) kind = error.kind;
      else if (status === 429) kind = "rate_limited";
      else if (status === 404) kind = "model_missing";
      else kind = "upstream";

      last = { error, model, status, kind };

      console.warn(
        `[generate] attempt ${index + 1}/${attempts.length} failed on ${model} (${kind}${
          status ? `, status ${status}` : ""
        }): ${sanitize(errorMessage(error))}`,
      );

      if (error instanceof BlockedError) throw error;

      // A dead key never fixes itself: stop burning the remaining budget.
      if (
        (status === 400 || status === 403) &&
        /api key not valid|api_key_invalid|permission denied|unauthenticated/i.test(
          errorMessage(error),
        )
      ) {
        throw error;
      }
    }
  }

  // Every configured model 404'd — try the newest stable Flash model, but only
  // if enough of the function budget is left for it to be worth the wait.
  const lastResortTimeoutMs = attempts[attempts.length - 1].timeoutMs;
  if (
    last?.kind === "model_missing" &&
    Date.now() - startedAt + lastResortTimeoutMs < budgetMs * 1.5
  ) {
    try {
      const value = await attemptModel(
        spec,
        key,
        LAST_RESORT_MODEL,
        lastResortTimeoutMs,
        photo,
      );
      console.info(`[generate] recovered on the ${LAST_RESORT_MODEL} alias.`);
      return { value, model: LAST_RESORT_MODEL };
    } catch (error) {
      console.warn(
        `[generate] ${LAST_RESORT_MODEL} also failed: ${sanitize(errorMessage(error))}`,
      );
    }
  }

  throw new GenerationFailureError(
    last ?? {
      error: new Error("Gemini call failed."),
      model: MODEL,
      kind: "upstream",
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  TOOL COPY (what the visitor reads when something breaks)                  */
/* -------------------------------------------------------------------------- */

type ToolCopy = {
  timeout: string;
  timeoutHint: string;
  blocked: string;
  empty: string;
  emptyHint: string;
};

const FAILURE_COPY: Record<StudioTool, ToolCopy> = {
  captions: {
    timeout: "The caption engine took too long to answer and the request was stopped.",
    timeoutHint:
      "Try again in a few seconds. A shorter description usually comes back faster.",
    blocked:
      "The caption engine couldn't work with that description. Try describing the photo differently.",
    empty:
      "The caption engine came back empty. Please try again — a shorter description helps.",
    emptyHint: "A shorter description usually lands first time.",
  },
  review_reply: {
    timeout: "The reply engine took too long to answer. Nothing was posted anywhere — try again.",
    timeoutHint:
      "Long reviews take longer to read. You can paste just the main complaint.",
    blocked:
      "That review couldn't be processed. Paste the review text on its own, without screenshots or copied formatting.",
    empty:
      "The reply engine came back empty. Please try again in a moment.",
    emptyHint: "A slightly shorter review usually comes back on the first try.",
  },
  google_post: {
    timeout: "The post engine took too long to answer. Please try again.",
    timeoutHint: "A shorter brief comes back faster.",
    blocked:
      "That brief couldn't be processed. Describe the update in your own words and try again.",
    empty:
      "The post engine came back empty. Please try again in a moment.",
    emptyHint: "A simpler brief usually lands first time.",
  },
};

function failureCopy(tool: StudioTool, hasPhoto: boolean): ToolCopy {
  const copy = FAILURE_COPY[tool];
  if (tool !== "captions" || !hasPhoto) return copy;

  return {
    ...copy,
    timeout: "That photo took too long to read. Try a smaller or simpler photo.",
    timeoutHint:
      "Photos straight from the camera are heavy — a screenshot or a resized copy usually goes through faster.",
    blocked:
      "The caption engine couldn't work with that photo. Try a different shot or describe the scene in words.",
    empty:
      "The caption engine came back empty on that photo. Please try again — a simpler, brighter shot helps.",
    emptyHint: "A simpler, brighter photo usually lands first time.",
  };
}

/* -------------------------------------------------------------------------- */
/*  HANDLER                                                                   */
/* -------------------------------------------------------------------------- */

export async function POST(request: Request) {
  // 1. Per-IP rate limit before doing any expensive work.
  const rate = rateLimit(request, LIMIT);
  if (!rate.allowed) {
    return fail(
      429,
      "You've generated a lot of copy in the last 10 minutes. Take a coffee break and try again shortly.",
      "RATE_LIMITED",
      { retryAfter: rate.retryAfter, rate },
    );
  }

  // 2. Parse + validate the body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Request body must be valid JSON.", "INVALID_JSON", { rate });
  }

  const fields = (body ?? {}) as {
    type?: unknown;
    description?: unknown;
    tone?: unknown;
    cafeName?: unknown;
    city?: unknown;
    language?: unknown;
    image?: unknown;
    review?: unknown;
    rating?: unknown;
    contact?: unknown;
    topic?: unknown;
  };

  const tool: StudioTool =
    fields.type === "review_reply" || fields.type === "google_post"
      ? fields.type
      : "captions";

  const safeTone: Tone = TONES.find((t) => t.id === fields.tone)?.id ?? "cozy";
  const safeLanguage: Language =
    LANGUAGES.find((l) => l.id === fields.language)?.id ?? "english";
  const cleanCafeName = cleanOptional(fields.cafeName, MAX_CAFE_NAME_LENGTH);
  const cleanCity = cleanOptional(fields.city, MAX_CITY_LENGTH);

  // 2a. The photo (captions only) — validated before anything expensive runs.
  const photoResult = parsePhoto(fields.image);
  if (!photoResult.ok) {
    return fail(photoResult.status, photoResult.message, photoResult.code, {
      rate,
    });
  }
  const photo = tool === "captions" ? photoResult.photo : null;

  if (photoResult.photo && tool !== "captions") {
    return fail(
      400,
      "Photos are only used for Instagram captions. Remove the photo to use this tool.",
      "VALIDATION_ERROR",
      { rate },
    );
  }

  // 2b. Per-tool input validation.
  const copy = failureCopy(tool, Boolean(photo));

  if (tool === "captions") {
    const rawDescription =
      typeof fields.description === "string" ? fields.description : "";

    if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
      return fail(
        400,
        `Please keep your description under ${MAX_DESCRIPTION_LENGTH} characters.`,
        "VALIDATION_ERROR",
        { rate },
      );
    }

    const cleanDescription = rawDescription.trim();
    if (!photo && cleanDescription.length < 5) {
      return fail(
        400,
        "Upload a photo, or describe it in a few words (at least 5 characters).",
        "VALIDATION_ERROR",
        { rate },
      );
    }
  }

  if (tool === "review_reply") {
    const rawReview = typeof fields.review === "string" ? fields.review : "";
    const review = rawReview.trim();

    if (review.length < MIN_REVIEW_LENGTH) {
      return fail(
        400,
        "Paste the customer's review first — a sentence or two is enough.",
        "VALIDATION_ERROR",
        { rate },
      );
    }
    if (review.length > MAX_REVIEW_LENGTH) {
      return fail(
        400,
        `That review is longer than ${MAX_REVIEW_LENGTH} characters. Paste the main part and try again.`,
        "VALIDATION_ERROR",
        { rate },
      );
    }

    const rating = Number(fields.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return fail(
        400,
        "Pick the star rating the customer gave (1 to 5).",
        "VALIDATION_ERROR",
        { rate },
      );
    }
  }

  if (tool === "google_post") {
    const rawTopic = typeof fields.topic === "string" ? fields.topic : "";
    const topic = rawTopic.trim();

    if (topic.length < MIN_TOPIC_LENGTH) {
      return fail(
        400,
        "Tell us what the post is about — for example “New winter menu launch”.",
        "VALIDATION_ERROR",
        { rate },
      );
    }
    if (topic.length > MAX_TOPIC_LENGTH) {
      return fail(
        400,
        `Please keep the brief under ${MAX_TOPIC_LENGTH} characters.`,
        "VALIDATION_ERROR",
        { rate },
      );
    }
  }

  // 2c. Photos are expensive upstream: they get a second, tighter budget.
  if (photo) {
    const photoRate = rateLimit(request, PHOTO_LIMIT);
    if (!photoRate.allowed) {
      return fail(
        429,
        `That's ${PHOTO_RATE_LIMIT_MAX} photo captions in 10 minutes — the limit for now. Try again shortly, or describe a photo instead.`,
        "RATE_LIMITED",
        { retryAfter: photoRate.retryAfter, rate },
      );
    }
    console.info(
      `[generate] photo request (${Math.round(photo.bytes / 1024)} KB ${photo.mimeType}).`,
    );
  }

  // 3. Fail fast and clearly if the key is missing (the #1 setup mistake).
  if (!apiKey) {
    console.error("[generate] GEMINI_API_KEY is not set.");
    return fail(
      500,
      "The server is missing its Gemini API key, so nothing can be generated yet.",
      "MISSING_API_KEY",
      {
        hint: "Add GEMINI_API_KEY to .env.local (local) or Vercel → Settings → Environment Variables, then restart the server.",
        rate,
      },
    );
  }

  // 4. Run the tool — fast try, longer retry, then a cheaper fallback model.
  try {
    let payload: GenerateResponse;

    if (tool === "review_reply") {
      const review = (fields.review as string).trim();
      const rating = Number(fields.rating) as 1 | 2 | 3 | 4 | 5;
      const contact = cleanOptional(fields.contact, 120);

      const { value: replies, model } = await generateWithRetry(
        reviewSpec({
          tool: "review_reply",
          review,
          rating,
          language: safeLanguage,
          cafeName: cleanCafeName,
          city: cleanCity,
          contact,
        }),
        apiKey,
      );

      payload = {
        tool: "review_reply",
        replies,
        meta: {
          model,
          tone: safeTone,
          language: safeLanguage,
          tool: "review_reply",
        },
      };
    } else if (tool === "google_post") {
      const topic = (fields.topic as string).trim();

      const { value: post, model } = await generateWithRetry(
        googlePostSpec({
          tool: "google_post",
          topic,
          tone: safeTone,
          language: safeLanguage,
          cafeName: cleanCafeName,
          city: cleanCity,
        }),
        apiKey,
      );

      payload = {
        tool: "google_post",
        post,
        meta: {
          model,
          tone: safeTone,
          language: safeLanguage,
          tool: "google_post",
        },
      };
    } else {
      const description =
        typeof fields.description === "string" ? fields.description.trim() : "";

      const { value: captions, model } = await generateWithRetry(
        captionsSpec({
          tool: "captions",
          description: description || undefined,
          hasPhoto: Boolean(photo),
          tone: safeTone,
          language: safeLanguage,
          cafeName: cleanCafeName,
          city: cleanCity,
        }),
        apiKey,
        photo ?? undefined,
      );

      payload = {
        tool: "captions",
        captions,
        meta: {
          model,
          tone: safeTone,
          language: safeLanguage,
          tool: "captions",
          hasImage: Boolean(photo),
        },
      };
    }

    const ok = NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
    return withRateHeaders(ok, rate);
  } catch (error) {
    const devHint = process.env.NODE_ENV === "development";

    // Gemini refused the prompt — retrying the same input would fail again.
    if (error instanceof BlockedError) {
      console.warn(`[generate] blocked by Gemini (${error.blockReason}).`);
      return fail(422, copy.blocked, "BLOCKED", {
        hint: devHint ? `Blocked by Gemini (${error.blockReason}).` : undefined,
        reason: `blocked_${error.blockReason.toLowerCase()}`,
        rate,
      });
    }

    // Every attempt ran out of time.
    if (
      error instanceof GenerationTimeoutError ||
      (error instanceof GenerationFailureError && error.kind === "timeout")
    ) {
      const attempts = buildAttempts(Boolean(photo));
      console.error(
        `[generate] timed out on all ${attempts.length} attempts (${attempts
          .map((a) => `${a.timeoutMs}ms`)
          .join(" + ")}).`,
      );
      return fail(504, copy.timeout, "TIMEOUT", {
        hint: copy.timeoutHint,
        retryAfter: 10,
        reason: "timeout",
        rate,
      });
    }

    // The ladder is exhausted: report the last rung's diagnosis.
    const failure =
      error instanceof GenerationFailureError
        ? error
        : {
            status: getStatus(error),
            kind: "upstream" as const,
            model: MODEL,
            message: sanitize(errorMessage(error)),
          };

    const status = failure.status;
    const detail =
      error instanceof GenerationFailureError
        ? error.message
        : sanitize(errorMessage(error));

    console.error(
      `[generate] ${tool} failed (model ${failure.model}, kind ${failure.kind}, status ${status ?? "n/a"}): ${detail}`,
    );

    if (status === 429) {
      return fail(
        429,
        "The engine is receiving too many requests right now. Please try again in a minute.",
        "UPSTREAM_RATE_LIMITED",
        { retryAfter: 60, reason: "upstream_429", rate },
      );
    }

    if (status === 400 || status === 403) {
      // A dead key is a setup problem; a rejected request is usually a model or
      // schema problem. Different fixes, so they get different messages.
      const keyProblem =
        /api key not valid|api_key_invalid|api key expired|permission denied|unauthenticated/i.test(
          detail,
        );

      return keyProblem
        ? fail(
            502,
            "The engine rejected the key. Check that GEMINI_API_KEY is valid and that the Generative Language API is enabled for it.",
            "UPSTREAM_AUTH",
            { hint: devHint ? detail : undefined, reason: `upstream_${status}`, rate },
          )
        : fail(
            502,
            "The engine rejected the request. Please try again — if it keeps happening, set GEMINI_MODEL to a supported model.",
            "UPSTREAM_BAD_REQUEST",
            { hint: devHint ? detail : undefined, reason: `upstream_${status}`, rate },
          );
    }

    if (failure.kind === "model_missing") {
      return fail(
        502,
        `No usable Gemini model was available (tried ${MODEL} and ${FALLBACK_MODEL}).`,
        "UPSTREAM_MODEL_NOT_FOUND",
        {
          hint: devHint
            ? detail
            : "Set GEMINI_MODEL to a model your API key can access.",
          reason: "model_missing",
          rate,
        },
      );
    }

    // A 200 with nothing postable in it — usually a truncated or thin answer.
    if (failure.kind === "empty" || failure.kind === "unparsable") {
      return fail(502, copy.empty, "EMPTY_OUTPUT", {
        hint: devHint ? detail : copy.emptyHint,
        reason: failure.kind,
        rate,
      });
    }

    // Google-side outage (503 "model overloaded" is the common one).
    if (status !== undefined && status >= 500) {
      return fail(
        502,
        "The engine is busy right now. Give it a few seconds and try again.",
        "UPSTREAM_UNAVAILABLE",
        { hint: devHint ? detail : undefined, reason: `upstream_${status}`, rate },
      );
    }

    return fail(
      502,
      "The engine didn't respond as expected. Please try again in a moment.",
      "GENERATION_FAILED",
      { hint: devHint ? detail : undefined, reason: failure.kind, rate },
    );
  }
}

/** Anything other than POST gets a clear, boring 405. */
export async function GET() {
  return fail(405, "This endpoint only accepts POST requests.", "METHOD_NOT_ALLOWED");
}
