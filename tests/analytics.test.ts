import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isPrivatePath,
  sanitizeAnalyticsProperties,
  stripUrlFragment,
} from "@/lib/analytics";

/**
 * The menu editor puts its capability key in the URL fragment, because a
 * fragment is the one part of a URL the browser never sends to a server. Then
 * PostHog builds `$current_url` from `window.location.href` — fragment included
 * — and the key rides out to a third party. These are the two defences.
 */
describe("stripUrlFragment", () => {
  it("removes a capability key from an editor URL", () => {
    expect(
      stripUrlFragment("https://cafe-caption-ai.vercel.app/menu/chai/edit#k_live_9f2c"),
    ).toBe("https://cafe-caption-ai.vercel.app/menu/chai/edit");
  });

  it("leaves a URL without a fragment alone", () => {
    const url = "https://cafe-caption-ai.vercel.app/menu/chai?ref=qr";
    expect(stripUrlFragment(url)).toBe(url);
  });

  it("strips everything after the first hash, not just the last segment", () => {
    expect(stripUrlFragment("/menu/chai/edit#a#b#c")).toBe("/menu/chai/edit");
  });

  it("handles an empty fragment", () => {
    expect(stripUrlFragment("/menu/chai/edit#")).toBe("/menu/chai/edit");
  });
});

describe("isPrivatePath", () => {
  it("recognises the editor", () => {
    expect(isPrivatePath("https://cafe-caption-ai.vercel.app/menu/chai-and-chapter/edit#key")).toBe(
      true,
    );
    expect(isPrivatePath("/menu/chai-and-chapter/edit")).toBe(true);
    expect(isPrivatePath("/menu/chai-and-chapter/edit/")).toBe(true);
  });

  it("leaves the public menu alone — that is the page we do want to count", () => {
    expect(isPrivatePath("https://cafe-caption-ai.vercel.app/menu/chai-and-chapter")).toBe(false);
    expect(isPrivatePath("/menu/demo")).toBe(false);
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath("/menu/chai-and-chapter/editorial")).toBe(false);
  });
});

describe("sanitizeAnalyticsProperties", () => {
  it("strips the fragment from every URL-shaped property", () => {
    const properties = {
      $current_url: "https://x.test/menu/a/edit#secret-key",
      $referrer: "https://x.test/menu/a/edit#secret-key",
      $pathname: "/menu/a/edit",
    };

    const cleaned = sanitizeAnalyticsProperties(properties);

    expect(cleaned.$current_url).toBe("https://x.test/menu/a/edit");
    expect(cleaned.$referrer).toBe("https://x.test/menu/a/edit");
    expect(cleaned.$pathname).toBe("/menu/a/edit");
    expect(JSON.stringify(cleaned)).not.toContain("secret-key");
  });

  it("leaves other strings and non-strings untouched", () => {
    const properties = { tone: "warm #2", items: 4, ok: true, note: "has # in text" };

    expect(sanitizeAnalyticsProperties(properties)).toEqual(properties);
  });

  it("does not mutate the object it was given", () => {
    const properties = { $current_url: "https://x.test/menu/a/edit#key" };
    sanitizeAnalyticsProperties(properties);
    expect(properties.$current_url).toContain("#key");
  });

  it("keeps every key — this redacts, it does not drop events", () => {
    const cleaned = sanitizeAnalyticsProperties({ a: "/x#1", b: 2, c: null });
    expect(Object.keys(cleaned).sort()).toEqual(["a", "b", "c"]);
  });

  it("leaves a bare hash string that is not a URL alone", () => {
    expect(sanitizeAnalyticsProperties({ label: "#hashtag" }).label).toBe("#hashtag");
  });
});

describe("the provider is wired to both defences", () => {
  // Structural, because the wiring is a PostHog config object and the failure
  // mode is silent: the helpers can be perfect and never called.
  it("uses sanitize_properties and drops editor pageviews", () => {
    const path = fileURLToPath(new URL("../components/AnalyticsProvider.tsx", import.meta.url));
    const text = readFileSync(path, "utf8");

    expect(text).toContain("sanitize_properties");
    expect(text).toContain("sanitizeAnalyticsProperties");
    expect(text).toContain("before_send");
    expect(text).toContain("isPrivatePath");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
