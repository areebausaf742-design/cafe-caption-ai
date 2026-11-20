import { describe, expect, it } from "vitest";

import { buildCsp, normaliseOrigin, posthogAssetsHost } from "@/lib/csp";

/** Parse a policy into `{ directive: sources[] }`. */
function parse(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name] = sources;
  }
  return out;
}

const base = buildCsp({ nodeEnv: "production" });
const enforced = parse(base.enforced);
const reportOnly = parse(base.reportOnly);

describe("enforced policy — the fonts actually load", () => {
  it("allows the Google Fonts stylesheet in style-src", () => {
    // Without this the whole site renders in fallback serif and the console
    // fills with refusals; this assertion exists because that happened.
    expect(enforced["style-src"]).toContain("https://fonts.googleapis.com");
    expect(enforced["style-src"]).toContain("'self'");
  });

  it("allows the font files in font-src, alongside 'self' and data:", () => {
    expect(enforced["font-src"]).toContain("https://fonts.gstatic.com");
    expect(enforced["font-src"]).toContain("'self'");
    expect(enforced["font-src"]).toContain("data:");
  });
});

describe("upgrade-insecure-requests", () => {
  it("lives in the enforced policy", () => {
    expect(base.enforced).toContain("upgrade-insecure-requests");
  });

  it("is absent from the report-only policy, where browsers ignore it", () => {
    expect(base.reportOnly).not.toContain("upgrade-insecure-requests");
    expect(reportOnly["upgrade-insecure-requests"]).toBeUndefined();
  });
});

describe("no wildcards", () => {
  it("never falls back to https:, http: or *", () => {
    const all = Object.values({ ...enforced, ...reportOnly }).flat();
    expect(all).not.toContain("https:");
    expect(all).not.toContain("http:");
    expect(all).not.toContain("*");
  });

  it("has no default-src (it would swallow script-src)", () => {
    expect(enforced["default-src"]).toBeUndefined();
  });
});

describe("the hosts the app really uses", () => {
  it("allows PostHog's API and asset origins in connect-src", () => {
    expect(enforced["connect-src"]).toContain("https://us.i.posthog.com");
    expect(enforced["connect-src"]).toContain("https://us-assets.i.posthog.com");
    expect(enforced["connect-src"]).toContain("'self'");
  });

  it("follows a configured PostHog region", () => {
    const eu = parse(buildCsp({ posthogHost: "https://eu.i.posthog.com/" }).enforced);
    expect(eu["connect-src"]).toContain("https://eu.i.posthog.com");
    expect(eu["connect-src"]).toContain("https://eu-assets.i.posthog.com");
  });

  it("derives the assets host from the API host", () => {
    expect(posthogAssetsHost("https://us.i.posthog.com")).toBe(
      "https://us-assets.i.posthog.com",
    );
    // Already an assets host: left alone.
    expect(posthogAssetsHost("https://eu-assets.i.posthog.com")).toBe(
      "https://eu-assets.i.posthog.com",
    );
  });

  it("adds configured asset hosts to img, media and connect", () => {
    const withAssets = parse(
      buildCsp({
        nodeEnv: "production",
        assetHosts: ["https://pub-abc.r2.dev", "cdn.example.com"],
      }).enforced,
    );
    for (const directive of ["img-src", "media-src", "connect-src"]) {
      expect(withAssets[directive]).toContain("https://pub-abc.r2.dev");
      expect(withAssets[directive]).toContain("https://cdn.example.com");
    }
  });

  it("keeps blob: and data: for the QR export and photo previews", () => {
    expect(enforced["img-src"]).toContain("blob:");
    expect(enforced["img-src"]).toContain("data:");
  });

  it("does not hand the whole web an image source when nothing is configured", () => {
    expect(enforced["img-src"]).not.toContain("https:");
  });
});

describe("script-src stays report-only", () => {
  it("is present in the report-only policy", () => {
    expect(reportOnly["script-src"]).toContain("'self'");
    expect(enforced["script-src"]).toBeUndefined();
  });

  it("allows eval in development only", () => {
    const dev = parse(buildCsp({ nodeEnv: "development" }).reportOnly);
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(reportOnly["script-src"]).not.toContain("'unsafe-eval'");
  });
});

describe("preview deployments", () => {
  it("adds vercel.live only on preview", () => {
    const built = buildCsp({ nodeEnv: "production", preview: true });
    const previewEnforced = parse(built.enforced);
    const previewReportOnly = parse(built.reportOnly);
    expect(previewEnforced["connect-src"]).toContain("https://vercel.live");
    expect(previewEnforced["frame-src"]).toContain("https://vercel.live");
    expect(previewReportOnly["script-src"]).toContain("https://vercel.live");
    expect(enforced["connect-src"]).not.toContain("https://vercel.live");
  });
});

describe("normaliseOrigin", () => {
  it("accepts a bare host or a full URL and ignores the path", () => {
    expect(normaliseOrigin("cdn.example.com")).toBe("https://cdn.example.com");
    expect(normaliseOrigin("https://cdn.example.com/dish/1.glb")).toBe(
      "https://cdn.example.com",
    );
    expect(normaliseOrigin("not a host")).toBe("");
  });
});
