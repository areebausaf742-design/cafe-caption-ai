import { afterEach, describe, expect, it, vi } from "vitest";

import { readJsonWithLimit } from "@/lib/request-body";
import { isSupportedImageFile } from "@/lib/image";
import { safeDownloadUrl } from "@/lib/space-3d";
import { validateLead } from "@/lib/leads";

const SPACE = "https://owner-dish-3d.hf.space";

describe("safeDownloadUrl", () => {
  it("allows a file on the Space's own origin", () => {
    const result = safeDownloadUrl(SPACE, "https://owner-dish-3d.hf.space/gradio_api/file=/tmp/out.glb");
    expect(result).toEqual({
      url: "https://owner-dish-3d.hf.space/gradio_api/file=/tmp/out.glb",
      sameOrigin: true,
    });
  });

  it("allows huggingface.co hosts without marking them same-origin", () => {
    const result = safeDownloadUrl(SPACE, "https://huggingface.co/datasets/x/y.glb");
    expect(result).toMatchObject({ sameOrigin: false });
  });

  it("refuses a foreign host — the case the HF token used to leak to", () => {
    expect(safeDownloadUrl(SPACE, "https://evil.example.com/out.glb")).toBeNull();
    // Looks like ours, isn't: `hf.space.evil.com` ends with the attacker's domain.
    expect(safeDownloadUrl(SPACE, "https://owner-dish-3d.hf.space.evil.com/out.glb")).toBeNull();
  });

  it("refuses plain http for a remote host", () => {
    expect(safeDownloadUrl(SPACE, "http://huggingface.co/x.glb")).toBeNull();
  });

  it("refuses nonsense URLs and data: payloads", () => {
    expect(safeDownloadUrl(SPACE, "not a url")).toBeNull();
    expect(safeDownloadUrl(SPACE, "data:model/gltf-binary;base64,AAAA")).toBeNull();
  });

  it("refuses anything when the configured Space URL is junk", () => {
    expect(safeDownloadUrl("", "https://huggingface.co/x.glb")).toBeNull();
  });

  it("keeps local http working for a local stub server", () => {
    const result = safeDownloadUrl("http://127.0.0.1:7860", "http://127.0.0.1:7860/out.glb");
    expect(result).toMatchObject({ sameOrigin: true });
  });
});

describe("readJsonWithLimit", () => {
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("https://cafe.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("parses a body under the limit", async () => {
    const result = await readJsonWithLimit(json({ hello: "world" }), 1024);
    expect(result).toEqual({ ok: true, body: { hello: "world" } });
  });

  it("rejects an honest oversized body by content-length, without reading it", async () => {
    const payload = { big: "x".repeat(4096) };
    const result = await readJsonWithLimit(json(payload), 512);
    expect(result).toMatchObject({ ok: false, status: 413, code: "REQUEST_TOO_LARGE" });
  });

  it("rejects a chunked body that lies about its size", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new TextEncoder().encode("a".repeat(1024));
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = new Request("https://cafe.test/api", {
      method: "POST",
      // No content-length: a streamed request has no declared size.
      body: stream,
      duplex: "half",
    } as RequestInit);
    const result = await readJsonWithLimit(request, 512);
    expect(result).toMatchObject({ ok: false, status: 413, code: "REQUEST_TOO_LARGE" });
  });

  it("reports invalid JSON as a 400, not a 413", async () => {
    const request = new Request("https://cafe.test/api", {
      method: "POST",
      body: "{ not json",
    });
    const result = await readJsonWithLimit(request, 1024);
    expect(result).toMatchObject({ ok: false, status: 400, code: "INVALID_JSON" });
  });

  it("uses the caller's wording when it supplies one", async () => {
    const result = await readJsonWithLimit(json({ a: 1 }), 2, {
      tooLarge: "Photo is too big.",
    });
    expect(result).toMatchObject({ ok: false, message: "Photo is too big." });
  });
});

describe("isSupportedImageFile", () => {
  const file = (name: string, type: string, bytes = 64) =>
    new File([new Uint8Array(bytes)], name, { type });

  it("accepts the formats the studio advertises", () => {
    expect(isSupportedImageFile(file("a.jpg", "image/jpeg"))).toBe(true);
    expect(isSupportedImageFile(file("a.png", "image/png"))).toBe(true);
    expect(isSupportedImageFile(file("a.webp", "image/webp"))).toBe(true);
    expect(isSupportedImageFile(file("a.heic", "image/heic"))).toBe(true);
  });

  it("falls back to the extension when the type is missing", () => {
    // Phones hand over HEIC with no MIME type; rejecting it was a silent dead end.
    expect(isSupportedImageFile(file("IMG_0001.HEIC", ""))).toBe(true);
    expect(isSupportedImageFile(file("photo.jpg", ""))).toBe(true);
  });

  it("refuses a typeless file that isn't a photo", () => {
    expect(isSupportedImageFile(file("invoice.pdf", ""))).toBe(false);
    expect(isSupportedImageFile(file("notes.txt", ""))).toBe(false);
  });

  it("refuses SVG and other code-carrying types by MIME", () => {
    expect(isSupportedImageFile(file("x.svg", "image/svg+xml"))).toBe(false);
    expect(isSupportedImageFile(file("page.html", "text/html"))).toBe(false);
  });
});

describe("validateLead", () => {
  const base = { name: "Asha", cafeName: "Daily Grind", city: "Lucknow" };

  it("accepts a complete lead", () => {
    const result = validateLead(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Asha",
      cafe_name: "Daily Grind",
      city: "Lucknow",
      interest: "not-sure",
    });
  });

  it("requires two characters, matching the form", () => {
    expect(validateLead({ ...base, name: "A" })).toMatchObject({ ok: false, field: "name" });
    expect(validateLead({ ...base, city: "L" })).toMatchObject({ ok: false, field: "city" });
    expect(validateLead({ ...base, cafeName: " " })).toMatchObject({
      ok: false,
      field: "cafeName",
    });
  });

  it("silently drops a bot that fills the honeypot", () => {
    expect(validateLead({ ...base, company: "Acme" }).ok).toBe(false);
  });

  it("rejects an unusable WhatsApp or email but allows none", () => {
    expect(validateLead({ ...base, whatsapp: "123" })).toMatchObject({
      ok: false,
      field: "whatsapp",
    });
    expect(validateLead({ ...base, email: "not-an-email" })).toMatchObject({
      ok: false,
      field: "email",
    });
    const empty = validateLead(base);
    expect(empty.ok && empty.value.whatsapp).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  clientIp — module-level env, so each case re-imports the module           */
/* -------------------------------------------------------------------------- */

describe("clientIp", () => {
  const load = async (env: Record<string, string | undefined>) => {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const mod = await import("@/lib/rate-limit");
    return mod.clientIp;
  };

  const headers = (values: Record<string, string>) =>
    new Request("https://cafe.test/api", { headers: values });

  afterEach(() => {
    delete process.env.TRUST_PROXY;
    delete process.env.VERCEL;
  });

  it("ignores a spoofed X-Real-IP when nothing says a proxy sets it", async () => {
    const clientIp = await load({ TRUST_PROXY: undefined, VERCEL: undefined });
    const request = headers({
      "x-real-ip": "1.2.3.4",
      "x-forwarded-for": "5.6.7.8",
      "x-vercel-forwarded-for": "9.9.9.9",
    });
    expect(clientIp(request)).toBe("unknown");
  });

  it("believes the same headers once TRUST_PROXY=1 is set", async () => {
    const clientIp = await load({ TRUST_PROXY: "1", VERCEL: undefined });
    expect(clientIp(headers({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    // The nearest hop is the one our own proxy appended.
    expect(clientIp(headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("10.0.0.1");
  });

  it("believes x-vercel-forwarded-for on Vercel", async () => {
    const clientIp = await load({ TRUST_PROXY: undefined, VERCEL: "1" });
    const request = headers({
      "x-vercel-forwarded-for": "9.9.9.9",
      "x-real-ip": "1.2.3.4",
    });
    expect(clientIp(request)).toBe("9.9.9.9");
  });

  it("returns one shared bucket when no address is available", async () => {
    const clientIp = await load({ TRUST_PROXY: undefined, VERCEL: undefined });
    expect(clientIp(headers({}))).toBe("unknown");
  });
});
