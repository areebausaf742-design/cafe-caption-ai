import { NextResponse } from "next/server";

import { buildCsp } from "@/lib/csp";

/**
 * Applies the site's Content-Security-Policy to every page.
 *
 * The policy itself lives in `lib/csp.ts` so it can be unit-tested; this file
 * only feeds it the deployment's configuration. Read the header comment there
 * for why `script-src` is report-only while everything else is enforced.
 *
 * The two things that must never regress, both covered by `tests/csp.test.ts`:
 *   - the Google Fonts origins are allowlisted (they are loaded by `<link>` in
 *     `app/layout.tsx`), otherwise the whole site renders in fallback serif;
 *   - `upgrade-insecure-requests` appears only in the enforced policy, because
 *     browsers ignore it in a report-only one and log a warning about it.
 */

/** Hosts that may serve dish posters and 3D models. */
const ASSET_HOSTS = [process.env.NEXT_PUBLIC_ASSET_HOSTS ?? "", process.env.R2_PUBLIC_URL ?? ""]
  .join(",")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const POLICY = buildCsp({
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  assetHosts: ASSET_HOSTS,
  nodeEnv: process.env.NODE_ENV,
  // The preview toolbar only exists on preview deployments.
  preview: process.env.VERCEL_ENV === "preview",
});

export function middleware() {
  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", POLICY.enforced);
  response.headers.set("Content-Security-Policy-Report-Only", POLICY.reportOnly);

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
