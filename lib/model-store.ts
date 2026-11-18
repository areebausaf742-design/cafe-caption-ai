/**
 * Model storage: Cloudflare R2 through its S3-compatible API.
 *
 * Why R2 and not the database: a dish model is megabytes of binary, and the
 * menu document is a JSON column that has to stay small enough to read on every
 * page view. Why R2 and not Supabase Storage: the free tier's 1 GB and 5 GB of
 * egress would be spent by a single café's menu being opened a few hundred
 * times, while R2 charges nothing for egress.
 *
 * Objects are content-addressed (`sha256` of the bytes), so regenerating the
 * same dish twice stores one object, and a URL that has been published once can
 * never change meaning underneath it.
 */
import "server-only";

import { createHash } from "node:crypto";

import { AwsClient } from "aws4fetch";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim();
const BUCKET = process.env.R2_BUCKET?.trim();
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID?.trim();
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY?.trim();
const PUBLIC_URL = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
/**
 * Optional endpoint override. Real R2 accepts the default (and jurisdiction
 * specific hosts), and local tooling such as MinIO needs its own — which is also
 * how the upload path is exercised end to end without spending a byte of egress.
 */
const ENDPOINT = process.env.R2_ENDPOINT?.trim().replace(/\/+$/, "");

/** A single dish model should never be anywhere near this. */
export const MAX_MODEL_BYTES = 40 * 1024 * 1024;

export function modelStoreConfigured(): boolean {
  return Boolean(ACCOUNT_ID && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY && PUBLIC_URL);
}

/** Content-addressed key: the same bytes always land on the same object. */
export function modelKey(bytes: ArrayBuffer | Uint8Array): string {
  const digest = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  return `dish-models/${digest.slice(0, 40)}.glb`;
}

/** Public, immutable URL for a key. Returns null when storage isn't configured. */
export function modelUrl(key: string): string | null {
  if (!PUBLIC_URL) return null;
  return `${PUBLIC_URL}/${key}`;
}

export type StoreResult =
  | { ok: true; url: string; key: string; bytes: number }
  | { ok: false; code: "STORAGE_DISABLED" | "TOO_LARGE" | "STORAGE_FAILED"; message: string };

/**
 * Upload a GLB and return the URL a browser can load it from.
 *
 * A missing configuration or a failed upload is reported, never swallowed: the
 * caller must not tell a café a model exists when it doesn't.
 */
export async function putModel(bytes: ArrayBuffer): Promise<StoreResult> {
  if (!modelStoreConfigured()) {
    return {
      ok: false,
      code: "STORAGE_DISABLED",
      message:
        "Model storage isn't configured, so a generated model has nowhere to live. Set the R2_* variables.",
    };
  }

  if (bytes.byteLength > MAX_MODEL_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: "That model came back larger than 40 MB, which is too heavy for a phone on 4G.",
    };
  }

  const key = modelKey(bytes);
  const base = ENDPOINT || `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url = `${base}/${BUCKET}/${key}`;

  try {
    const client = new AwsClient({
      accessKeyId: ACCESS_KEY_ID as string,
      secretAccessKey: SECRET_ACCESS_KEY as string,
      service: "s3",
      region: "auto",
    });

    const response = await client.fetch(url, {
      method: "PUT",
      // Content-addressed, so a re-upload of the same bytes can be cached hard.
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "STORAGE_FAILED",
        message: `Model storage refused the upload (${response.status}). Nothing was saved.`,
      };
    }
  } catch {
    return {
      ok: false,
      code: "STORAGE_FAILED",
      message: "Couldn't reach model storage. Nothing was saved — try again in a moment.",
    };
  }

  const publicUrl = modelUrl(key);
  if (!publicUrl) {
    return {
      ok: false,
      code: "STORAGE_DISABLED",
      message: "Model storage has no public URL configured, so the model couldn't be served.",
    };
  }

  return { ok: true, url: publicUrl, key, bytes: bytes.byteLength };
}
