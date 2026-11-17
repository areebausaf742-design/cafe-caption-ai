/** @type {import('next').NextConfig} */

/**
 * Security headers, applied to every response.
 *
 * Kept deliberately boring: no CSP yet. A wrong `script-src` silently breaks
 * Next's inline bootstrap, analytics and the JSON-LD block, and this site has no
 * third-party embeds that a CSP would be buying us protection from. Adding one
 * properly needs a nonce, which is a separate piece of work.
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
