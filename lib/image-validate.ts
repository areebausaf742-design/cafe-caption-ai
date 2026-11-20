/**
 * Photo validation shared by every route that accepts a dish or menu photo.
 *
 * The browser already downscales to ~1 MB, but a server never trusts a client:
 * the MIME type is checked against an allowlist, the payload must actually be
 * base64, the decoded size is capped well under the platform's 4.5 MB body
 * limit, and the file signature has to match the type it claims. A data-URL
 * prefix is tolerated (and stripped) rather than rejected.
 *
 * Extracted from `app/api/generate/route.ts` so `/api/dish-model` and
 * `/api/dish-vision` enforce exactly the same rules — one place to fix, one
 * place to test.
 */
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BASE64_LENGTH } from "@/lib/types";

/** A photo that passed validation, ready to become an `inlineData` part. */
export interface PhotoInput {
  mimeType: string;
  data: string;
  bytes: number;
}

export type PhotoParse =
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
export function parsePhoto(raw: unknown): PhotoParse {
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

  // The MIME type is the client's claim; the file signature is the file's. A
  // rename or a crafted request can make the two disagree, and forwarding a
  // non-image to the model wastes an attempt (and a rate-limit token).
  const type = mimeType.trim().toLowerCase();
  if (!hasValidImageHeader(clean, type)) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_IMAGE",
      message:
        "That file isn't a photo we can read. Try a JPG, PNG or WebP export of it.",
    };
  }

  const bytes = Math.floor((clean.replace(/=+$/, "").length * 3) / 4);

  return { ok: true, photo: { mimeType: type, data: clean, bytes } };
}

/**
 * Does the payload actually begin with the file signature its type claims?
 *
 * Twenty-four base64 characters decode to 18 bytes — enough for every header we
 * care about: JPEG's SOI+marker, PNG's 8-byte magic, WebP's RIFF/WEBP pair, and
 * the ISO base-media `ftyp` box that HEIC and HEIF both use.
 */
export function hasValidImageHeader(base64: string, mimeType: string): boolean {
  const head = Buffer.from(base64.slice(0, 24), "base64");
  if (head.length < 12) return false;

  switch (mimeType) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return (
        head[0] === 0x89 &&
        head[1] === 0x50 &&
        head[2] === 0x4e &&
        head[3] === 0x47
      );
    case "image/webp":
      return (
        head.subarray(0, 4).toString("latin1") === "RIFF" &&
        head.subarray(8, 12).toString("latin1") === "WEBP"
      );
    case "image/heic":
    case "image/heif":
      return head.subarray(4, 8).toString("latin1") === "ftyp";
    default:
      return false;
  }
}
