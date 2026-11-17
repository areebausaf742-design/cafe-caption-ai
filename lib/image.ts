import { MAX_UPLOAD_BYTES as MAX_UPLOAD_BYTES_LIMIT } from "@/lib/types";

/**
 * Client-side photo preparation for the caption studio.
 *
 * Why this exists: a phone photo is 3–12 MB, and a serverless function request
 * body is capped at ~4.5 MB on Vercel. Sending the original is how you get a
 * 413 or a timeout. So the browser does the work:
 *
 *   1. Reject anything that isn't an image, or anything over 5 MB.
 *   2. Decode it (EXIF orientation respected) and downscale the long edge to
 *      1024 px — Gemini tiles images internally, so a bigger photo costs more
 *      tokens without telling the model anything new.
 *   3. Re-encode as JPEG, stepping quality (and finally resolution) down until
 *      the file is under 1 MB.
 *   4. Hand back base64 ready for `inlineData`, plus a small object URL for the
 *      preview, so the thumbnail is exactly what the model sees.
 *
 * Everything here runs in the browser only — it is imported by a Client
 * Component and never touched by the server bundle.
 */

/** Target size after compression. Base64 adds ~33%, so this lands ~1.3 MB of JSON. */
export const TARGET_MAX_BYTES = 1024 * 1024;

/** Long-edge ceiling for the image actually sent to Gemini. */
export const MAX_EDGE_PX = 1024;

/** Below this the photo stops being useful for captions, so we give up instead. */
const MIN_EDGE_PX = 384;

/** Compression ladder: try each resolution at each quality until it fits. */
const EDGE_STEPS = [MAX_EDGE_PX, 820, 640, MIN_EDGE_PX] as const;
const JPEG_QUALITIES = [0.82, 0.7, 0.6, 0.5] as const;

/** File types we can decode in a browser. SVG is deliberately excluded. */
const BLOCKED_TYPES = new Set(["image/svg+xml"]);

/** The upload limit lives in lib/types.ts so the API and the UI can't drift. */
export { MAX_UPLOAD_BYTES } from "@/lib/types";

export type ImageErrorCode =
  /** The file wasn't an image at all (a PDF, a video, a zip…). */
  | "not_an_image"
  /** The original file was over 5 MB. */
  | "too_large"
  /** The browser couldn't decode it (corrupt file, unsupported HEIC…). */
  | "decode_failed"
  /** It was still over 1 MB at the smallest allowed resolution. */
  | "too_large_after_compress";

export class ImagePrepError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = "ImagePrepError";
    this.code = code;
  }
}

/** A photo that has been validated, downscaled and is ready to send. */
export interface PreparedImage {
  /** Raw base64 JPEG, with no `data:` prefix. */
  base64: string;
  /** Always JPEG after compression, which Gemini reads natively. */
  mimeType: "image/jpeg";
  width: number;
  height: number;
  /** Size of the compressed JPEG in bytes. */
  bytes: number;
  /** Size of the file the user originally picked. */
  originalBytes: number;
  /** Object URL of the compressed image, for the on-screen preview. */
  previewUrl: string;
  fileName: string;
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers (kept dependency-free so they are trivial to reason about)   */
/* -------------------------------------------------------------------------- */

/** Scale `width × height` down so neither edge exceeds `maxEdge`. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) {
    return { width: 1, height: 1 };
  }
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** "2.4 MB" / "186 KB" — used in the dropzone meta line. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Bytes represented by a base64 string, without decoding it. */
export function base64Bytes(base64: string): number {
  const clean = base64.replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

/** True when the file claims to be an image we're willing to decode. */
export function isSupportedImageFile(file: File): boolean {
  if (!file.type) return false; // some HEIC uploads arrive with no type
  if (BLOCKED_TYPES.has(file.type)) return false;
  return file.type.startsWith("image/");
}

/* -------------------------------------------------------------------------- */
/*  Canvas pipeline                                                           */
/* -------------------------------------------------------------------------- */

type DecodedSource = ImageBitmap | HTMLImageElement;

async function decodeImage(file: File): Promise<DecodedSource> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` applies the EXIF rotation, so portrait phone photos don't
      // arrive on their side.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari has historically refused some HEIC/WebP variants here; fall
      // through to an <img> decode, which uses the platform's own decoder.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image failed to load."));
      img.src = url;
    });
  } catch {
    throw new ImagePrepError(
      "decode_failed",
      "That photo couldn't be opened — try a JPG, PNG or WebP.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/**
 * Draw the source onto a white canvas at the requested size.
 *
 * The canvas — and the full-image draw into it — is the expensive part of this
 * pipeline. Re-exporting the same pixels at a different JPEG quality costs a
 * fraction of that, so the canvas is built once per *resolution* and reused for
 * every quality step (see `prepareImage`).
 */
function drawToCanvas(
  source: DecodedSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImagePrepError(
      "decode_failed",
      "This browser can't process photos. Try a different browser.",
    );
  }

  // JPEG has no alpha channel: without this, transparent PNGs turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);

  return canvas;
}

function collectOriginalSize(source: DecodedSource): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma === -1 ? "" : result.slice(comma + 1));
    };
    reader.onerror = () =>
      reject(
        new ImagePrepError(
          "decode_failed",
          "That photo couldn't be read — try a different one.",
        ),
      );
    reader.readAsDataURL(blob);
  });
}

/**
 * Validate → decode → downscale → compress → base64.
 *
 * Throws `ImagePrepError` with a code the UI turns into friendly copy, so the
 * component never has to guess what went wrong.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isSupportedImageFile(file)) {
    throw new ImagePrepError(
      "not_an_image",
      "That file isn't a photo. Upload a JPG, PNG or WebP.",
    );
  }

  if (file.size > MAX_UPLOAD_BYTES_LIMIT) {
    throw new ImagePrepError(
      "too_large",
      `That photo is ${formatBytes(file.size)}. The limit is 5 MB — try a smaller one.`,
    );
  }

  const source = await decodeImage(file);

  // `close()` releases decoded pixels that live outside the JS heap, and an
  // ImageBitmap is only ever closed by hand. It belongs in `finally`: the old
  // code closed it on the success path, so an unsupported photo (width < 2) or a
  // failed encode leaked the bitmap until GC felt like it.
  try {
    const original = collectOriginalSize(source);

    if (original.width < 2 || original.height < 2) {
      throw new ImagePrepError(
        "decode_failed",
        "That photo looks empty — try a different one.",
      );
    }

    let best: Blob | null = null;
    let dimensions = fitWithin(original.width, original.height, MAX_EDGE_PX);

    // Walk resolution, then quality, until the payload fits. In practice a
    // 12 MP phone photo lands on the first or second rung at ~150–400 KB.
    //
    // Draw once per distinct size: a photo smaller than the first few rungs
    // produces identical targets, and redrawing identical pixels was the bulk
    // of the old cost.
    let canvas: HTMLCanvasElement | null = null;
    let drawnWidth = 0;
    let drawnHeight = 0;

    search: for (const edge of EDGE_STEPS) {
      const target = fitWithin(original.width, original.height, edge);

      if (
        !canvas ||
        target.width !== drawnWidth ||
        target.height !== drawnHeight
      ) {
        canvas = drawToCanvas(source, target.width, target.height);
        drawnWidth = target.width;
        drawnHeight = target.height;
      }

      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToBlob(canvas, quality);
        if (!blob) {
          throw new ImagePrepError(
            "decode_failed",
            "That photo couldn't be processed — try a different one.",
          );
        }

        best = blob;
        dimensions = target;
        if (blob.size <= TARGET_MAX_BYTES) break search;
      }
    }

    if (!best || best.size > TARGET_MAX_BYTES) {
      throw new ImagePrepError(
        "too_large_after_compress",
        "That photo couldn't be shrunk enough. Try a different shot.",
      );
    }

    return {
      base64: await blobToBase64(best),
      mimeType: "image/jpeg",
      width: dimensions.width,
      height: dimensions.height,
      bytes: best.size,
      originalBytes: file.size,
      previewUrl: URL.createObjectURL(best),
      fileName: file.name || "photo.jpg",
    };
  } finally {
    if ("close" in source && typeof source.close === "function") {
      source.close();
    }
  }
}

/** Free the preview object URL when a photo is replaced or removed. */
export function releaseImage(image: PreparedImage | null): void {
  if (!image) return;
  try {
    URL.revokeObjectURL(image.previewUrl);
  } catch {
    // Revoking twice is harmless; never let it break a render.
  }
}
