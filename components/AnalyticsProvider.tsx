"use client";

import { useEffect } from "react";

import { attachAnalytics } from "@/lib/analytics";

/**
 * Loads PostHog once, in the browser, and only when a key exists.
 *
 * The SDK is imported dynamically so it never lands in the initial bundle —
 * the caption studio stays fast, and analytics costs the visitor nothing until
 * after hydration.
 *
 * Privacy defaults (conscious choices, not accidents):
 * - `persistence: "memory"` → no cookies and no localStorage, so there is
 *   nothing to put behind a consent banner.
 * - `person_profiles: "identified_only"` → anonymous visitors stay anonymous.
 * - `autocapture: false` → we only send the four events declared in
 *   `lib/analytics.ts`, never form contents or clicks on everything.
 * - `disable_session_recording: true` → no screen recording of visitors.
 * - `respect_dnt: true` → visitors sending Do Not Track are ignored entirely.
 */
let started = false;

export default function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

    if (!key) {
      if (process.env.NODE_ENV !== "production") {
        console.info(
          "[analytics] NEXT_PUBLIC_POSTHOG_KEY is not set — events log to the console only.",
        );
      }
      return;
    }

    if (started) return;
    started = true;

    void (async () => {
      try {
        const { default: posthog } = await import("posthog-js");

        posthog.init(key, {
          api_host:
            process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          persistence: "memory",
          person_profiles: "identified_only",
          capture_pageview: true,
          capture_pageleave: false,
          autocapture: false,
          disable_session_recording: true,
          respect_dnt: true,
          cross_subdomain_cookie: false,
        });

        attachAnalytics(posthog);
      } catch (error) {
        // Blocked by an extension, offline, or a bad key — never break the page.
        console.warn("[analytics] PostHog failed to load:", error);
      }
    })();
  }, []);

  return <>{children}</>;
}
