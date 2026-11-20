/**
 * Which Gemini failures are worth retrying — shared by the photo reader and the
 * menu translator.
 *
 * The rule is simple and it matters: a *transient* failure (rate limit, 5xx, a
 * timeout) is worth another rung of the ladder. A *permanent* one (a bad key, a
 * model this key can't use, a safety block) never fixes itself, so retrying it
 * only burns the function budget and delays the honest error the owner needs to
 * see.
 */

/** A reply Gemini refused on content grounds. Never retried. */
export class BlockedReply extends Error {
  constructor(readonly reason: string) {
    super(`blocked: ${reason}`);
    this.name = "BlockedReply";
  }
}

/** The HTTP status behind an SDK error, when there is one. */
export function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { status?: unknown; statusCode?: unknown; code?: unknown };

  for (const value of [record.status, record.statusCode]) {
    if (typeof value === "number") return value;
  }
  if (typeof record.code === "number") return record.code;
  if (typeof record.code === "string" && /^\d{3}$/.test(record.code)) {
    return Number(record.code);
  }
  return null;
}

/**
 * 429 and 5xx are transient; timeouts and pure network errors are too.
 * 400/401/403/404 are not: the key is wrong, the model is gone, or the request
 * is malformed — every one of those is the same answer next time.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof BlockedReply) return false;
  if (error instanceof Error && error.name === "AbortError") return true;

  const status = errorStatus(error);
  if (status === null) return true;
  if (status === 429) return true;
  return status >= 500;
}

/** The cause of a safety block, if the reply carried one. */
export function blockReason(response: {
  promptFeedback?: { blockReason?: string } | null;
}): string | null {
  return response.promptFeedback?.blockReason ?? null;
}
