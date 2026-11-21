import type { MetadataRoute } from "next";

import { readIndexableMenus } from "@/lib/menu-store";
import { siteUrl } from "@/lib/site";

/**
 * Rebuilt hourly rather than per request: a menu that goes live should be
 * crawlable within the hour, and a crawler hammering /sitemap.xml should never
 * be able to make us query the database.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const pages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Published menus appear only once someone has marked the row `indexable`
  // (see the moderation note in supabase/schema.sql). Unconfigured storage or a
  // missing migration resolves to an empty list, so the page list above still
  // ships — an unindexable menu is not a reason to lose the sitemap.
  const menus = await readIndexableMenus();

  return [
    ...pages,
    ...menus.map((menu) => ({
      url: `${siteUrl}/menu/${menu.slug}`,
      lastModified: menu.updatedAt ? new Date(menu.updatedAt) : lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
