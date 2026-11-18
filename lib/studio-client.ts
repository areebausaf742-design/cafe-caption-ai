/**
 * One place that knows how to talk to `/api/generate`.
 *
 * Both studio tabs need the same things: a request body, a 70s client-side
 * timeout (longer than the server's 45s so the server always gets to answer
 * first), and errors that already read like sentences. Keeping it here means
 * the caption tab and the Local SEO tab can't drift apart.
 */
import type { DishReading } from "@/lib/dish";
import type { TranslationPayload, TranslatedLine } from "@/lib/menu-translate";
import type { ApiError, DishModel, GenerateRequest, GenerateResponse } from "@/lib/types";

export interface StudioError {
  message: string;
  hint?: string;
  /** Seconds until a retry makes sense (429s). */
  retryAfter?: number;
  status: number;
  code?: string;
}

export type GenerationOutcome =
  | { ok: true; data: GenerateResponse }
  | { ok: false; error: StudioError };

/** Longer than the route's maxDuration, so the browser never wins the race. */
const CLIENT_TIMEOUT_MS = 70_000;

export async function requestGeneration(
  body: GenerateRequest,
): Promise<GenerationOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const apiError = data as ApiError | null;
      const retryHeader = Number(response.headers.get("Retry-After"));
      const retryAfter =
        apiError?.retryAfter ??
        (Number.isFinite(retryHeader) && retryHeader > 0
          ? retryHeader
          : undefined);

      return {
        ok: false,
        error: {
          message:
            apiError?.error ??
            `Something went wrong (${response.status}). Please try again.`,
          hint: apiError?.hint,
          retryAfter,
          status: response.status,
          code: apiError?.code,
        },
      };
    }

    // A 200 with an empty or non-JSON body (a proxy error page, a truncated
    // response) parses to null. Callers read `.tool` immediately, so handing
    // that back as success is an uncaught TypeError in the tab.
    if (!data || typeof data !== "object" || Array.isArray(data) || !("tool" in data)) {
      return {
        ok: false,
        error: {
          message: "The server sent back something unexpected. Please try again.",
          status: response.status,
        },
      };
    }

    return { ok: true, data: data as GenerateResponse };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: aborted
          ? "That took longer than expected. Please try again."
          : "Network hiccup — check your connection and try again.",
        status: 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** "Try again in about 40s" / "…about 3 min". */
export function retryAfterLabel(seconds: number): string {
  return `about ${seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`}`;
}

/* -------------------------------------------------------------------------- */
/*  Menu translation                                                          */
/* -------------------------------------------------------------------------- */

export type TranslationOutcome =
  | { ok: true; translations: TranslationPayload }
  | { ok: false; error: StudioError };

/**
 * Ask for Hindi + Hinglish for the printed lines.
 *
 * Translation is a nicety, publishing is not: every caller is expected to
 * publish in English when this fails, which is why it returns an error object
 * instead of throwing. Timeout is shorter than `/api/generate`'s because the
 * server does at most three parallel calls of 20s each.
 */
export async function requestTranslations(
  items: TranslatedLine[],
): Promise<TranslationOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: controller.signal,
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const apiError = data as ApiError | null;
      return {
        ok: false,
        error: {
          message:
            apiError?.error ??
            `The translator didn't answer (${response.status}).`,
          hint: apiError?.hint,
          retryAfter: apiError?.retryAfter,
          status: response.status,
          code: apiError?.code,
        },
      };
    }

    const translations = (data as { translations?: TranslationPayload } | null)
      ?.translations;

    if (!translations || typeof translations !== "object") {
      return {
        ok: false,
        error: {
          message: "The translator sent back something unexpected.",
          status: response.status,
        },
      };
    }

    return { ok: true, translations };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: aborted
          ? "Translating took too long. Your menu is still here — publish in English, or try again."
          : "Couldn't reach the translator. Your menu is still here.",
        status: 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*  Dish photos                                                               */
/* -------------------------------------------------------------------------- */

export type DishVisionOutcome =
  | { ok: true; dish: DishReading; model: string }
  | { ok: false; error: StudioError };

/**
 * Read one food photo.
 *
 * The photo travels as base64 for the length of this request and nothing else —
 * it is never written to storage, never attached to the menu, and never seen by
 * the published page. A failure here is a normal outcome: the studio falls back
 * to the fields the owner already has and says why.
 */
export async function requestDishVision(
  photo: { mimeType: string; data: string },
): Promise<DishVisionOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);

  try {
    const response = await fetch("/api/dish-vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: photo }),
      signal: controller.signal,
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const apiError = data as ApiError | null;
      return {
        ok: false,
        error: {
          message: apiError?.error ?? `The photo couldn't be read (${response.status}).`,
          hint: apiError?.hint,
          status: response.status,
          code: apiError?.code,
        },
      };
    }

    const payload = data as { dish?: DishReading; meta?: { model?: string } } | null;
    if (!payload?.dish || typeof payload.dish.name !== "string") {
      return {
        ok: false,
        error: { message: "The reader sent back something unexpected.", status: response.status },
      };
    }

    return { ok: true, dish: payload.dish, model: payload.meta?.model ?? "" };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: aborted
          ? "Reading the photo took too long. Type the dish in — nothing is lost."
          : "Couldn't reach the dish reader. Type the dish in instead.",
        status: 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*  3D models                                                                 */
/* -------------------------------------------------------------------------- */

export type DishModelOutcome =
  | { ok: true; model: DishModel; meta: { provider: string; via: string; seconds: number } }
  | { ok: false; error: StudioError };

/**
 * Ask for a model from a food photo.
 *
 * This is the slowest thing in the product: a free GPU Space may be asleep, and
 * a generation passes through a queue before the mesh exists. Two and a half
 * minutes covers a cold start plus a TripoSR pass; past that the server's own
 * budget has already given up, and saying so beats spinning forever.
 */
export async function requestDishModel(
  photo: { mimeType: string; data: string },
): Promise<DishModelOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 255_000);

  try {
    const response = await fetch("/api/dish-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: photo }),
      signal: controller.signal,
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const apiError = data as ApiError | null;
      return {
        ok: false,
        error: {
          message: apiError?.error ?? `The model couldn't be generated (${response.status}).`,
          hint: apiError?.hint,
          status: response.status,
          code: apiError?.code,
          retryAfter: apiError?.retryAfter,
        },
      };
    }

    const payload = data as {
      model?: { glb?: unknown; by?: unknown };
      meta?: { provider?: string; via?: string; seconds?: number };
    } | null;

    const glb = typeof payload?.model?.glb === "string" ? payload.model.glb : "";
    if (!glb) {
      return {
        ok: false,
        error: { message: "The generator sent back no model. Nothing was changed.", status: response.status },
      };
    }

    return {
      ok: true,
      model: {
        glb,
        ...(typeof payload?.model?.by === "string" && payload.model.by
          ? { by: payload.model.by }
          : {}),
      },
      meta: {
        provider: payload?.meta?.provider ?? "triposr",
        via: payload?.meta?.via ?? "free ZeroGPU",
        seconds: payload?.meta?.seconds ?? 0,
      },
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: aborted
          ? "That took longer than a free GPU can hold a job. Nothing was saved — try again, or later."
          : "Couldn't reach the generator. Nothing was changed.",
        status: 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
