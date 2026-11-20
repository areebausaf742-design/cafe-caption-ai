/**
 * Reading JSON out of a model reply.
 *
 * Every Gemini caller needed the same three tolerances — a ```json fence, a
 * sentence before the object, a trailing note after it — and each route had its
 * own near-copy of the code. One implementation means one place to fix a parser
 * bug, and one message when there is nothing to parse.
 *
 * Only an *object* is returned: every caller immediately reads named keys, and
 * an array or a bare number at the top level is always a malformed reply.
 */

export class JsonExtractError extends Error {
  constructor(message = "The model reply contained no JSON object.") {
    super(message);
    this.name = "JsonExtractError";
  }
}

/**
 * Parse the first JSON object in `raw`.
 *
 * Tries the whole (fence-stripped) string first, then the span from the first
 * `{` to the last `}` — which is what actually rescues a reply prefixed with
 * "Here is the JSON:". Throws `JsonExtractError` when neither parses, or when
 * the result isn't a plain object.
 */
export function extractJsonObject(raw: string, message?: string): Record<string, unknown> {
  const cleaned = String(raw ?? "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const accept = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new JsonExtractError(message);
    }
    return value as Record<string, unknown>;
  };

  try {
    return accept(JSON.parse(cleaned));
  } catch (error) {
    if (error instanceof JsonExtractError) throw error;
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new JsonExtractError(message);
  }

  try {
    return accept(JSON.parse(cleaned.slice(start, end + 1)));
  } catch {
    throw new JsonExtractError(message);
  }
}
