/** @type {import('next').NextConfig} */

/**
 * Security headers, applied to every response.
 *
 * The Content-Security-Policy is *not* here: it needs a per-request header, so it
 * is built in `lib/csp.ts` and attached by `middleware.ts`. This file carries the
 * headers that never vary. `script-src` there is report-only until it can carry a
 * nonce — see the comment in `lib/csp.ts` for why that is a deliberate choice and
 * not an oversight.
 */
const securityHeaders = [
  // Never let a browser re-interpret a response as a type we didn't send.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Keep full URLs (which can carry a review's text) out of other origins' logs.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs a camera, a mic, a location or a payment sheet.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Two years, subdomains included. Ignored on http://, so local dev is fine.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // The studio posts photos to our own origin only.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/**
 * Frame protection is production-only on purpose: preview environments render
 * the app inside an iframe, and `DENY` would black-hole those previews. A
 * deployed site is never legitimately framed, so production says no.
 */
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({ key: "X-Frame-Options", value: "DENY" });
  securityHeaders.push({
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
