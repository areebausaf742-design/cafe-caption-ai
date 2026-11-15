/**
 * Single source of truth for the public site URL and SEO copy.
 * Used by metadata, robots.txt, sitemap.xml and the Open Graph image.
 *
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://cafecaption.in).
 */
const configuredUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  // Vercel sets this at build time; it keeps canonical URLs correct even if
  // NEXT_PUBLIC_SITE_URL was forgotten.
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "");

export const siteUrl = (
  configuredUrl.replace(/\/$/, "") || "http://localhost:3000"
).trim();

export const siteName = "CafeCaption";

export const siteTitle =
  "CafeCaption — captions, Google SEO & digital menus for cafés";

export const siteDescription =
  "Upload a café photo and get three considered Instagram captions with researched hashtags, paste a Google review for three replies, write a Business Profile post that ranks locally, or turn a photo of your printed menu into a digital menu with a downloadable QR code — in English or Hinglish.";
