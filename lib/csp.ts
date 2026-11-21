/**
 * The site's Content-Security-Policy, as pure data.
 *
 * Kept out of `middleware.ts` so it can be unit-tested without an edge runtime:
 * a policy is the sort of thing that silently breaks a page (a blocked font is
 * a page that renders in Times New Roman and a console full of red), and the
 * only way to catch that in CI is to assert on the string.
 *
 * Philosophy, in short:
 *   - Enforced: everything that cannot break the app — object/base/frame
 *     ancestors, form-action, and explicit allowlists for styles, fonts,
 *     images, media and connections.
 *   - Report-Only: `script-src`, because the only strict form of it needs a
 *     per-request nonce, and a nonce forces the statically rendered pages
 *     dynamic (they carry JSON-LD through `dangerouslySetInnerHTML`).
 *   - Every source is an explicit origin. No `https:`, no `*`: a wildcard in
 *     `img-src` is an exfiltration channel, which is most of the point of having
 *     a policy at all.
 */

/** The Google Fonts stylesheet and the files it points at — two origins. */
/**
 * Fonts are self-hosted (`@fontsource-variable/*`, imported in `app/layout.tsx`),
 * so no third-party font host appears in the policy at all. Both directives are
 * same-origin only; `data:` stays for inline SVG masks.
 */

/** Vercel's preview toolbar/comments, preview deployments only. */
const VERCEL_LIVE = "https://vercel.live";

export interface CspInputs {
  /** `NEXT_PUBLIC_POSTHOG_HOST`, or the US default. */
  posthogHost?: string;
  /** Hosts that may serve dish posters / 3D models (`NEXT_PUBLIC_ASSET_HOSTS` + `R2_PUBLIC_URL`). */
  assetHosts?: string[];
  /** `NODE_ENV`. */
  nodeEnv?: string;
  /** True on a Vercel preview deployment. */
  preview?: boolean;
}

export interface CspPolicy {
  enforced: string;
  reportOnly: string;
}

/**
 * `us.i.posthog.com` → `us-assets.i.posthog.com`.
 *
 * PostHog serves remote config and the recorder bundle from an `-assets` host;
 * an EU project uses `eu-assets`. A host that already carries the suffix is
 * returned unchanged.
 */
export function posthogAssetsHost(apiHost: string): string {
  try {
    const url = new URL(apiHost);
    if (!url.hostname.includes("-assets")) {
      url.hostname = url.hostname.replace(/^([a-z0-9-]+)\./, "$1-assets.");
    }
    return url.origin;
  } catch {
    return "https://us-assets.i.posthog.com";
  }
}

/** Normalise `example.com`, `https://example.com/x` → `https://example.com`. */
export function normaliseOrigin(entry: string): string {
  try {
    return new URL(entry.includes("://") ? entry : `https://${entry}`).origin;
  } catch {
    return "";
  }
}

const list = (...entries: (string | false | undefined)[]) =>
  entries.filter((entry): entry is string => Boolean(entry)).join(" ");

export function buildCsp({
  posthogHost = "https://us.i.posthog.com",
  assetHosts = [],
  nodeEnv,
  preview = false,
}: CspInputs = {}): CspPolicy {
  const posthogApi = posthogHost.replace(/\/$/, "") || "https://us.i.posthog.com";
  const posthogAssets = posthogAssetsHost(posthogApi);
  const assets = assetHosts.map(normaliseOrigin).filter(Boolean);

  const enforced = [
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    // Fonts are bundled from npm (see app/layout.tsx), so both directives are
    // same-origin. `data:` covers inline SVG masks.
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    // Blob/data URLs come from the PNG QR export and the browser-side photo
    // previews; the listed hosts are dish posters and 3D model previews.
    list("img-src 'self' data: blob:", ...assets, preview && VERCEL_LIVE),
    list("media-src 'self' blob:", ...assets),
    list("connect-src 'self'", ...assets, posthogApi, posthogAssets, preview && VERCEL_LIVE),
    list("frame-src 'self'", preview && VERCEL_LIVE),
    // Browsers ignore this directive in a report-only policy, so it belongs here
    // — and only here — where it is actually enforced.
    "upgrade-insecure-requests",
  ].join("; ");

  const reportOnly = [
    list(
      "script-src 'self' 'unsafe-inline'",
      preview && VERCEL_LIVE,
      // React's development build uses eval; production does not.
      nodeEnv !== "production" && "'unsafe-eval'",
    ),
    // PostHog's session recorder can run in a worker; blob: is ours as well.
    "worker-src 'self' blob:",
  ].join("; ");

  return { enforced, reportOnly };
}
