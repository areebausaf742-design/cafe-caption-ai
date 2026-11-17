/**
 * One place that knows how to talk to `/api/generate`.
 *
 * Both studio tabs need the same things: a request body, a 70s client-side
 * timeout (longer than the server's 45s so the server always gets to answer
 * first), and errors that already read like sentences. Keeping it here means
 * the caption tab and the Local SEO tab can't drift apart.
 */
import type { ApiError, GenerateRequest, GenerateResponse } from "@/lib/types";

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
