/**
 * Single source of truth for the public site URL and SEO copy.
 * Used by metadata, robots.txt, sitemap.xml and the Open Graph image.
 *
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://cafecaption.in).
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000"
).trim();

export const siteName = "CafeCaption";

export const siteTitle = "CafeCaption — Instagram captions for cafés, in seconds";

export const siteDescription =
  "Describe a café photo and get three considered Instagram captions with five researched hashtags each — in English or Hinglish. Websites, digital menus and caption systems for independent cafés.";
