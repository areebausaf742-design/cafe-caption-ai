/**
 * Supabase credentials, split by what each one is allowed to do.
 *
 * Two keys, two jobs, and no fallback between them:
 *
 *   - **read** (`SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`) is a capability
 *     key. It is not a secret in any meaningful sense — the browser needs it to
 *     read a public menu page — so nothing it can do may be *write* access. It
 *     reads through `menu_public()` and edits through `menu_read()` /
 *     `menu_save()`, which check the owner's edit-key hash in SQL.
 *
 *   - **write** (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS entirely. It exists
 *     only in the server environment, is never prefixed `NEXT_PUBLIC_`, and is
 *     the only key that may insert.
 *
 * The important property here is the *absence* of a fallback: if the write key is
 * missing, `serviceWritesConfigured()` is false and `writeHeaders()` throws.
 * There is deliberately no `SERVICE_ROLE ?? ANON` expression anywhere, because
 * that one line is how a deployment silently reverts to anon-key writes and
 * leaves the revoke in `supabase/schema.sql` looking pointless.
 */
import "server-only";

/** Project URL, without a trailing slash. */
const URL_BASE = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");

/**
 * The public capability key. Newer projects issue it as a publishable key, so
 * either name is accepted — for *reads and capability RPCs only*.
 */
const READ_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

/** Server-only. Never logged, never returned, never in a bundle. */
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let warnedServiceKey = false;
function warnServiceKey(detail: string) {
  if (warnedServiceKey) return;
  warnedServiceKey = true;
  // Names and roles only — never a key, never a URL.
  console.warn(`[supabase] ${detail} Writes are disabled until this is fixed.`);
}

/**
 * The `role` claim of a Supabase key, if it is a JWT, without verifying it.
 *
 * We are not authenticating anything with this — the plausibility check exists
 * because pasting the anon key into `SUPABASE_SERVICE_ROLE_KEY` is a single
 * mis-click that would otherwise turn every "server write" back into an anon
 * write, and revoking the anon grant would then look like it had failed.
 */
function jwtRole(key: string): string | null {
  if (!key.startsWith("eyJ")) return null;
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { role?: unknown };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

/** True when reads through the public capability key are possible. */
export function supabaseReadConfigured(): boolean {
  return Boolean(URL_BASE && READ_KEY);
}

/**
 * True when the *server* can write. False when the URL or the service key is
 * missing, and false when the configured service key is really a public key —
 * in both cases callers must answer 503 instead of writing as `anon`.
 */
export function supabaseWriteConfigured(): boolean {
  if (!URL_BASE) return false;

  if (!SERVICE_KEY) {
    warnServiceKey("SUPABASE_SERVICE_ROLE_KEY is not set.");
    return false;
  }

  if (READ_KEY && SERVICE_KEY === READ_KEY) {
    warnServiceKey(
      "SUPABASE_SERVICE_ROLE_KEY is identical to the publishable key, so it is a public credential.",
    );
    return false;
  }

  const role = jwtRole(SERVICE_KEY);
  if (role !== null && role !== "service_role") {
    warnServiceKey(
      `SUPABASE_SERVICE_ROLE_KEY carries role "${role}", not "service_role".`,
    );
    return false;
  }

  return true;
}

export function supabaseEndpoint(path: string): string {
  if (!URL_BASE) throw new Error("SUPABASE_URL is not configured");
  return `${URL_BASE}${path}`;
}

/** Headers for the public key: reads and the capability RPCs. */
export function readHeaders(): Record<string, string> {
  if (!supabaseReadConfigured()) {
    throw new Error("Supabase reads are not configured");
  }
  return {
    apikey: READ_KEY,
    Authorization: `Bearer ${READ_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Headers for the service role: the only credentials that may INSERT.
 *
 * Throws rather than degrading — a caller that forgot `supabaseWriteConfigured()`
 * gets an error it can log, not a write that quietly succeeds as `anon`.
 */
export function writeHeaders(): Record<string, string> {
  if (!supabaseWriteConfigured()) {
    throw new Error("Supabase writes are not configured");
  }
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
