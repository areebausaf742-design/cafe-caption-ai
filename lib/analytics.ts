"use client";

/**
 * Every conversion event the site sends, in one typed place.
 *
 * Provider: PostHog (free under the GitHub Student Pack). It is loaded lazily
 * by `components/AnalyticsProvider.tsx` and handed to `attachAnalytics()`, so
 * the ~125 kB SDK never sits in the critical path for the caption studio.
 *
 * Rules we hold ourselves to:
 * - No personal data: no names, phone numbers, emails or message text.
 * - Two properties per event, both describing the click, never the person.
 * - No cookies: PostHog runs in memory-only mode (see the provider).
 */
export type AnalyticsEvent =
  | {
      name: "generate";
      props: {
        tone: string;
        source: "example" | "form";
        /** True when the captions were written from an uploaded photo. */
        has_image: boolean;
      };
    }
  | {
      name: "photo_upload";
      props: {
        /** `ready` = accepted and compressed, `rejected` = wrong type/size. */
        outcome: "ready" | "rejected";
      };
    }
  | { name: "copy"; props: { kind: "caption" | "hashtags" | "all" } }
  | { name: "lead_submit"; props: { interest: string } }
  | { name: "cta_click"; props: { location: string; label: string } };

/** Minimal surface we use, so this file doesn't import the SDK itself. */
type AnalyticsClient = {
  capture: (
    event: string,
    properties?: Record<string, string | number | boolean>,
  ) => void;
};

let client: AnalyticsClient | null = null;

/** Called by the provider once PostHog has finished loading. */
export function attachAnalytics(next: AnalyticsClient): void {
  client = next;
}

export function track({ name, props }: AnalyticsEvent): void {
  if (process.env.NODE_ENV !== "production") {
    // Handy while building: every event shows up in the console.
    console.debug(`[analytics] ${name}`, props);
  }

  if (!client) return;

  try {
    client.capture(name, props);
  } catch {
    // Analytics must never break a click.
  }
}
