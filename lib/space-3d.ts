/**
 * Image → model, on a free Hugging Face ZeroGPU Space.
 *
 * There is no free hosted image-to-3D API to call instead: every commercial
 * provider bills per model, and Hugging Face's own router stopped giving free
 * accounts usable credits. A Space *is* free — it runs open weights (TripoSR,
 * Stable Fast 3D, TRELLIS) on shared GPUs with a small daily quota per account —
 * so it is the only route that generates genuine geometry for ₹0.
 *
 * The trade is honest and is surfaced in the UI: a few models a day across the
 * whole deployment, a queue, and a Space that sleeps when idle. Nothing here
 * ever invents a result; a quota wall becomes a message, not a fake model.
 */
import "server-only";

import { MAX_MODEL_BYTES } from "@/lib/model-store";

const SPACE_URL = process.env.THREED_SPACE_URL?.trim().replace(/\/+$/, "");
const SPACE_API = process.env.THREED_SPACE_API?.trim() || "/predict";
const HF_TOKEN = process.env.HF_TOKEN?.trim();
const PROVIDER = process.env.THREED_PROVIDER_NAME?.trim() || "triposr";

/** Any one HTTP leg of the conversation. The route owns the overall budget. */
const LEG_TIMEOUT_MS = 90_000;

export function generatorConfigured(): boolean {
  return Boolean(SPACE_URL);
}

export function generatorProvider(): string {
  return PROVIDER;
}

export type GeneratedModel = {
  ok: true;
  glb: ArrayBuffer;
  provider: string;
  /** Human-readable provenance for the dish panel, e.g. "Free ZeroGPU queue". */
  via: string;
};

export type GenerationFailure = {
  ok: false;
  code: "GENERATION_DISABLED" | "GENERATION_BUSY" | "GENERATION_FAILED" | "BAD_OUTPUT";
  message: string;
  retryAfter?: number;
};

function failure(
  code: GenerationFailure["code"],
  message: string,
  retryAfter?: number,
): GenerationFailure {
  return { ok: false, code, message, ...(retryAfter ? { retryAfter } : {}) };
}

/** Files come back as a path, a URL, or an object carrying both. */
function fileCandidates(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === "string") {
    if (value.startsWith("http") || value.startsWith("/")) return [value];
    if (value.startsWith("data:")) return [];
    return [];
  }
  if (Array.isArray(value)) return value.flatMap((entry) => fileCandidates(entry, depth + 1));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const found: string[] = [];
    if (typeof record.url === "string") found.push(record.url);
    if (typeof record.path === "string") found.push(record.path);
    if (typeof record.name === "string" && /\.(glb|gltf)$/i.test(record.name)) {
      found.push(record.name);
    }
    // Gradio sometimes nests the payload one level down.
    for (const key of ["data", "value", "file"]) {
      if (key in record) found.push(...fileCandidates(record[key], depth + 1));
    }
    return found;
  }
  return [];
}

function absolute(base: string, candidate: string): string | null {
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (candidate.startsWith("/")) {
    if (candidate.startsWith("/gradio_api/")) return `${base}${candidate}`;
    if (candidate.startsWith("/tmp/") || candidate.startsWith("/home/")) {
      return `${base}/gradio_api/file=${encodeURI(candidate)}`;
    }
    return `${base}${candidate}`;
  }
  return null;
}

function authHeaders(): Record<string, string> {
  return HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {};
}

/**
 * Where the generated file may actually be downloaded from.
 *
 * The Gradio reply is attacker-influenced data: a compromised or impersonated
 * Space could hand back `https://collect.evil.test/x.glb` and, without this
 * check, the next line would send `Authorization: Bearer $HF_TOKEN` to it. So a
 * URL is only usable when it is https, and only on our own Space's origin or a
 * Hugging Face host — and the token is only ever attached to a same-origin
 * request.
 *
 * Loopback over http is allowed **only** when the Space URL itself is loopback,
 * which is what a local stub Space (and `npm run dev` testing) needs; the token
 * still isn't sent there unless it's same-origin.
 */
const HF_ORIGIN_SUFFIXES = [".hf.space", ".huggingface.co"];

function isLoopback(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function safeDownloadUrl(
  base: string,
  candidate: string,
): { url: string; sameOrigin: boolean } | null {
  let space: URL;
  let target: URL;
  try {
    space = new URL(base);
    target = new URL(candidate);
  } catch {
    return null;
  }

  const httpsOk = target.protocol === "https:";
  const localHttpOk =
    target.protocol === "http:" && space.protocol === "http:" && isLoopback(target.hostname);
  if (!httpsOk && !localHttpOk) return null;

  const sameOrigin = target.origin === space.origin;
  if (sameOrigin) return { url: target.toString(), sameOrigin: true };

  const host = target.hostname.toLowerCase();
  const trustedHost =
    host === "huggingface.co" ||
    host.endsWith(".huggingface.co") ||
    HF_ORIGIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (!trustedHost) return null;

  return { url: target.toString(), sameOrigin: false };
}

function looksBusy(status: number, text: string): boolean {
  if (status === 429) return true;
  return /quota|gpu hours|too many requests|rate limit|queue is full|try again later/i.test(text);
}

/** Parse a Gradio event stream into its final payload. */
async function readEventStream(response: Response): Promise<{ event: string; data: unknown }> {
  const body = response.body;
  if (!body) return { event: "error", data: "The Space closed the connection." };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let last: { event: string; data: unknown } = { event: "error", data: "The Space sent no result." };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");

      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        let parsed: unknown = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Plain-text payloads are legal in this stream.
        }
        last = { event, data: parsed };
        if (event === "complete" || event === "error") {
          void reader.cancel().catch(() => {});
          return last;
        }
      }
    }
  }

  return last;
}

function glbMagic(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false;
  const header = new Uint8Array(bytes, 0, 4);
  // "glTF" in ASCII — the only thing a browser's GLTFLoader will accept as binary.
  return header[0] === 0x67 && header[1] === 0x6c && header[2] === 0x54 && header[3] === 0x46;
}

/**
 * Send one photo to the configured Space and come back with a real GLB.
 *
 * `photo.data` is base64 with no `data:` prefix — `prepareImage` has already
 * shrunk and re-encoded it in the browser.
 */
export async function generateModel(
  photo: { mimeType: string; data: string },
  signal?: AbortSignal,
): Promise<GeneratedModel | GenerationFailure> {
  if (!SPACE_URL) {
    return failure(
      "GENERATION_DISABLED",
      "3D generation isn't switched on for this deployment — no free GPU Space is configured.",
    );
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, LEG_TIMEOUT_MS);

  try {
    /* ------------------------------ start ------------------------------ */
    const start = await fetch(`${SPACE_URL}/gradio_api/call${SPACE_API}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        data: [`data:${photo.mimeType};base64,${photo.data}`],
      }),
      signal: controller.signal,
    });

    const startText = await start.text();

    if (!start.ok) {
      if (looksBusy(start.status, startText)) {
        return failure(
          "GENERATION_BUSY",
          "The free GPU queue is full or its daily quota is spent. Nothing was charged — try again later.",
          900,
        );
      }
      return failure(
        "GENERATION_FAILED",
        "The 3D Space didn't accept the photo. It may be waking up — try again in a minute.",
      );
    }

    let eventId = "";
    try {
      eventId = String((JSON.parse(startText) as { event_id?: string }).event_id ?? "");
    } catch {
      eventId = "";
    }

    if (!eventId) {
      return failure("GENERATION_FAILED", "The 3D Space didn't return a job. Try again in a minute.");
    }

    /* ------------------------------ collect ---------------------------- */
    const stream = await fetch(
      `${SPACE_URL}/gradio_api/call${SPACE_API}/${encodeURIComponent(eventId)}`,
      { headers: { Accept: "text/event-stream", ...authHeaders() }, signal: controller.signal },
    );

    if (!stream.ok) {
      const text = await stream.text().catch(() => "");
      if (looksBusy(stream.status, text)) {
        return failure(
          "GENERATION_BUSY",
          "The free GPU quota is spent for today. Nothing was charged — try again tomorrow.",
          3600,
        );
      }
      return failure("GENERATION_FAILED", "The 3D Space stopped part-way. Try again in a minute.");
    }

    const result = await readEventStream(stream);

    if (result.event === "error") {
      const text = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
      if (looksBusy(0, text)) {
        return failure(
          "GENERATION_BUSY",
          "The free GPU quota is spent for today. Nothing was charged — try again later.",
          3600,
        );
      }
      return failure(
        "GENERATION_FAILED",
        "The 3D Space couldn't build a model from that photo. A single dish, well lit, on a plain background works best.",
      );
    }

    const candidates = fileCandidates(result.data);
    const target = candidates
      .map((entry) => absolute(SPACE_URL, entry))
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => safeDownloadUrl(SPACE_URL, entry))
      .find((entry): entry is { url: string; sameOrigin: boolean } => Boolean(entry));

    if (!target) {
      return failure(
        "BAD_OUTPUT",
        "The 3D Space replied without a usable model file. Nothing was saved — try again.",
      );
    }

    /* ------------------------------ download --------------------------- */
    // Same-origin only: a foreign host never sees the token. `redirect: "error"`
    // closes the other half of the hole — a trusted URL that 302s elsewhere
    // would otherwise carry the Authorization header along with it.
    const file = await fetch(target.url, {
      headers: target.sameOrigin ? authHeaders() : {},
      redirect: "error",
      signal: controller.signal,
    });

    if (!file.ok) {
      return failure("GENERATION_FAILED", "The generated model couldn't be downloaded. Try again.");
    }

    const declared = Number(file.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_MODEL_BYTES) {
      return failure("BAD_OUTPUT", "That model came back too large for a phone. Nothing was saved.");
    }

    const bytes = await file.arrayBuffer();

    if (bytes.byteLength > MAX_MODEL_BYTES) {
      return failure("BAD_OUTPUT", "That model came back too large for a phone. Nothing was saved.");
    }

    if (!glbMagic(bytes)) {
      // A PNG preview where a mesh should be is exactly the kind of "success"
      // that must never reach a customer.
      return failure(
        "BAD_OUTPUT",
        "The Space returned something that isn't a 3D model. Nothing was saved — try again.",
      );
    }

    return {
      ok: true,
      glb: bytes,
      provider: PROVIDER,
      via: HF_TOKEN ? "free ZeroGPU quota" : "free ZeroGPU queue",
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted && !signal?.aborted) {
      return failure(
        "GENERATION_BUSY",
        "The free GPU took too long — it may be waking up or queued. Try again in a minute.",
        300,
      );
    }
    return failure("GENERATION_FAILED", "Couldn't reach the 3D Space. Nothing was saved.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
