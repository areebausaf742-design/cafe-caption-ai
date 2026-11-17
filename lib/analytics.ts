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
 * - Properties describe the click or the tool, never the person. Review text,
 *   customer names and email addresses are never sent.
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
  | {
      name: "seo_generate";
      props: {
        /** Which Local SEO tool ran. */
        tool: "review_reply" | "google_post";
        /** Star rating for a review reply; 0 for a Google post. */
        rating: number;
      };
    }
  | {
      name: "menu_generate";
      props: {
        /** Items read off the photo. 0 when the photo wasn't a readable menu. */
        items: number;
        /** How many sections those items fell into. */
        categories: number;
      };
    }
  | {
      name: "qr_download";
      props: {
        /** `own` once the QR encodes the café's published menu. */
        target: "demo" | "own";
      };
    }
  | {
      name: "menu_publish";
      props: {
        /** Items that went live. No slug, no café name — nothing identifying. */
        items: number;
        categories: number;
        /** `first` for the first publish in this session, `again` after that. */
        attempt: "first" | "again";
      };
    }
  | {
      name: "copy";
      props: { kind: "caption" | "hashtags" | "all" | "reply" | "post" | "post_cta" };
    }
  | {
      name: "order_send";
      props: {
        /** Distinct items in the cart. */
        items: number;
        /** Every unit, so quantity edits show up. */
        units: number;
        /** Whether a note went with the order. Never what the note said. */
        has_note: boolean;
        /** False when a price wasn't a single figure, so no total was shown. */
        total_known: boolean;
      };
    }
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
