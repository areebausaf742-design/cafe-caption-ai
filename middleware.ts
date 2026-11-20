import { NextResponse } from "next/server";

/**
 * A Content-Security-Policy that is enforced where it can't break anything, and
 * reported where it could.
 *
 * Why not one strict, nonce-based policy everywhere: this site is built from
 * statically rendered pages, and three of them embed JSON-LD through
 * `dangerouslySetInnerHTML`. A nonce has to be generated per request by
 * middleware and threaded into every inline tag — which forces those pages to
 * render dynamically (`headers()` in the layout), losing the static HTML that
 * makes them fast. Doing it half-way is worse than not doing it: `script-src`
 * is the one directive that needs the nonce, so it ships as **Report-Only**
 * while everything else is enforced. That combination catches injected
 * `<base>`, `<object>`, form-action and image/connect exfiltration today, and
 * reports the script violations that a future nonce pass will have to fix.
 *
 * The enforced policy deliberately has no `default-src`: it would fall back to
 * `script-src` and block Next's own inline bootstrap.
 */

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/$/, "") || "https://us.i.posthog.com";

/**
 * Hosts the menu UI loads 3D models and posters from. Same allowlist the API
 * validates against (`NEXT_PUBLIC_ASSET_HOSTS`, `R2_PUBLIC_URL`) — an operator
 * who names their asset hosts gets a tighter `img-src`/`media-src` too.
 */
const ASSET_HOSTS = [process.env.NEXT_PUBLIC_ASSET_HOSTS ?? "", process.env.R2_PUBLIC_URL ?? ""]
  .join(",")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    try {
      return new URL(entry.includes("://") ? entry : `https://${entry}`).origin;
    } catch {
      return "";
    }
  })
  .filter(Boolean);

const ENFORCED = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Blob and data URLs come from the QR/PNG export and the compressed photo
  // previews; https: covers an owner's own asset host when none is configured.
  `img-src 'self' data: blob:${ASSET_HOSTS.length ? ` ${ASSET_HOSTS.join(" ")}` : " https:"}`,
  `media-src 'self' blob:${ASSET_HOSTS.length ? ` ${ASSET_HOSTS.join(" ")}` : " https:"}`,
  `connect-src 'self'${ASSET_HOSTS.length ? ` ${ASSET_HOSTS.join(" ")}` : ""} ${POSTHOG_HOST}`,
  "frame-src 'self'",
].join("; ");

const REPORT_ONLY = [
  "script-src 'self' 'unsafe-inline'",
  // React's development build uses eval; production does not.
  process.env.NODE_ENV === "production" ? "" : "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

export function middleware() {
  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", ENFORCED);
  response.headers.set("Content-Security-Policy-Report-Only", REPORT_ONLY);
  // Vary on nothing in the policy: it is the same for every visitor, so a CDN
  // may reuse it — but say so explicitly rather than relying on an accident.
  response.headers.set("Vary", "Accept-Encoding");

  return response;
}

/**
 * Pages only. API routes return JSON (never rendered, so no CSP surface) and
 * skipping `_next/*` keeps static chunks off the middleware path entirely.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml).*)",
  ],
};
