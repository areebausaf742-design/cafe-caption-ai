"use client";

import { track as vercelTrack } from "@vercel/analytics";

/**
 * Every conversion event the site sends, in one typed place.
 *
 * Vercel custom events accept at most two properties, so keep them small.
 * Nothing here ever carries personal data — no names, numbers or messages,
 * only what was clicked and in which context.
 *
 * Note: Vercel records custom events on Pro/Enterprise plans. On Hobby the
 * calls are accepted and dropped — page views still work. Nothing breaks
 * either way, and switching plans needs no code change.
 */
export type AnalyticsEvent =
  | { name: "generate"; props: { tone: string; source: "example" | "form" } }
  | { name: "copy"; props: { kind: "caption" | "hashtags" | "all" } }
  | { name: "lead_submit"; props: { interest: string } }
  | { name: "cta_click"; props: { location: string; label: string } };

export function track({ name, props }: AnalyticsEvent): void {
  try {
    vercelTrack(name, props);
  } catch {
    // Analytics must never break a click.
  }

  if (process.env.NODE_ENV !== "production") {
    // Handy while building: open the console to see events fire.
    console.debug(`[analytics] ${name}`, props);
  }
}
