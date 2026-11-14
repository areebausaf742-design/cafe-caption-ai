/**
 * Single source of truth for the public site URL.
 * Used by metadata, robots.txt, sitemap.xml and the Open Graph image.
 *
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://cafecaption.vercel.app).
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000"
).trim();

export const siteName = "CafeCaption AI";

export const siteTitle =
  "CafeCaption AI — Instagram captions for cafés, in seconds";

export const siteDescription =
  "Describe your café photo and get three scroll-stopping Instagram captions, each with five trending hashtags. English or Hinglish. Built for independent coffee shops, bakeries and cafés.";
