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

export const siteTitle = "CafeCaption — Instagram captions for cafés, in seconds";

export const siteDescription =
  "Describe a café photo and get three considered Instagram captions with five researched hashtags each — in English or Hinglish. Websites, digital menus and caption systems for independent cafés.";
