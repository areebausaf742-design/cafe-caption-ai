/**
 * Read a JSON body with a hard byte ceiling — on every API route.
 *
 * `content-length` is optional and a caller can lie about it, so a check on the
 * header alone turns "too large" into "too large unless you send it chunked".
 * This reads the stream itself and stops the moment the ceiling is passed, so an
 * oversized body costs a few kilobytes of memory instead of the whole thing.
 *
 * The early `content-length` test is kept as a fast path: when a client is
 * honest (every browser is), the body is never read at all.
 *
 * No `server-only` import here on purpose: this module holds no secrets and is
 * unit-tested directly.
 */

export type BodyParse =
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 413; code: string; message: string };

/** Thrown internally to unwind the reader once the limit is passed. */
class BodyTooLarge extends Error {}

const DEFAULT_TOO_LARGE = "That request was too large to process.";
const DEFAULT_INVALID = "Request body must be valid JSON.";

export async function readJsonWithLimit(
  request: Request,
  maxBytes: number,
  messages: { tooLarge?: string; invalid?: string } = {},
): Promise<BodyParse> {
  const tooLargeMessage = messages.tooLarge ?? DEFAULT_TOO_LARGE;
  const invalidMessage = messages.invalid ?? DEFAULT_INVALID;

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, code: "REQUEST_TOO_LARGE", message: tooLargeMessage };
  }

  let text: string;

  if (!request.body) {
    // A body-less request is just invalid JSON at this layer.
    return { ok: false, status: 400, code: "INVALID_JSON", message: invalidMessage };
  }

  try {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      bytes += value.byteLength;
      if (bytes > maxBytes) {
        // Stop pulling: the rest of this body is never read, and the connection
        // is dropped rather than drained.
        await reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }

      buffer += decoder.decode(value, { stream: true });
    }

    text = buffer + decoder.decode();
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return { ok: false, status: 413, code: "REQUEST_TOO_LARGE", message: tooLargeMessage };
    }
    return { ok: false, status: 400, code: "INVALID_JSON", message: invalidMessage };
  }

  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, code: "INVALID_JSON", message: invalidMessage };
  }
}
