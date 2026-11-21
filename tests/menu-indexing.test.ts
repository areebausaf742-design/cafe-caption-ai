import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Menus are `noindex` by default, and only become crawlable once a row has been
 * approved. Both halves are tested here: the default (nothing leaks into the
 * index), and the opt-in (an approved menu appears in the sitemap rather than
 * being permanently invisible — which was the reported bug).
 */
const URL_ENV = "SUPABASE_URL";
const ANON_ENV = "SUPABASE_ANON_KEY";
const BASE = "https://project-ref.supabase.co";
const ANON = "anon-key-not-a-secret-for-tests";

async function load(env: { url?: string; anon?: string } = {}) {
  vi.resetModules();
  vi.stubEnv(URL_ENV, env.url ?? BASE);
  vi.stubEnv(ANON_ENV, env.anon ?? ANON);
  return {
    store: await import("@/lib/menu-store"),
    sitemap: (await import("@/app/sitemap")).default,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("a menu is not indexable unless the row says so", () => {
  it("defaults to false when the column doesn't exist yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ slug: "chai", cafeName: "Chai & Chapter", items: [] }),
      }),
    );
    const { store } = await load();

    const menu = await store.readPublicMenu("chai");
    expect(menu?.indexable).toBe(false);
  });

  it("reads true when the row is approved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ slug: "chai", cafeName: "Chai & Chapter", items: [], indexable: true }),
      }),
    );
    const { store } = await load();

    expect((await store.readPublicMenu("chai"))?.indexable).toBe(true);
  });
});

describe("readIndexableMenus", () => {
  it("asks the capability function, not the table", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([{ slug: "chai", updatedAt: "2026-11-14T10:00:00Z" }]),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { store } = await load();

    const menus = await store.readIndexableMenus();

    expect(menus).toEqual([{ slug: "chai", updatedAt: "2026-11-14T10:00:00Z" }]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/rest/v1/rpc/menu_indexable`);
    expect((init.headers as Record<string, string>).apikey).toBe(ANON);
  });

  it("returns an empty list when the migration hasn't been applied", async () => {
    // PostgREST answers 404 for a function that doesn't exist yet.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
    const { store } = await load();

    await expect(store.readIndexableMenus()).resolves.toEqual([]);
  });

  it("returns an empty list when the store is unconfigured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { store } = await load({ url: "", anon: "" });

    await expect(store.readIndexableMenus()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an empty list on a non-array payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "null" }));
    const { store } = await load();
    await expect(store.readIndexableMenus()).resolves.toEqual([]);
  });
});

describe("sitemap", () => {
  it("always lists the pages that are ours", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
    const { sitemap } = await load();

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toHaveLength(3);
    expect(urls.some((url) => url.endsWith("/privacy"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/terms"))).toBe(true);
  });

  it("includes an approved menu, with its own last-modified date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([{ slug: "chai-and-chapter", updatedAt: "2026-11-01T09:30:00Z" }]),
      }),
    );
    const { sitemap } = await load();

    const entries = await sitemap();
    const menu = entries.find((entry) => entry.url.endsWith("/menu/chai-and-chapter"));

    expect(menu).toBeDefined();
    expect(menu?.priority).toBe(0.6);
    expect(menu?.changeFrequency).toBe("weekly");
    expect(new Date(String(menu?.lastModified)).toISOString()).toBe("2026-11-01T09:30:00.000Z");
  });

  it("still ships the page list when storage is unconfigured", async () => {
    const { sitemap } = await load({ url: "", anon: "" });
    expect((await sitemap()).length).toBe(3);
  });
});

describe("the page metadata follows the same flag", () => {
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

  it("marks the menu page noindex unless the row is approved", () => {
    const text = source("app/menu/[slug]/page.tsx");
    expect(text).toContain("menu?.indexable === true");
    expect(text).toMatch(/indexable \? \{ index: true, follow: true \} : \{ index: false, follow: true \}/);
  });

  it("gives a menu its own social card instead of the homepage's", () => {
    const menu = source("app/menu/[slug]/page.tsx");
    const demo = source("app/menu/demo/page.tsx");

    for (const text of [menu, demo]) {
      expect(text).toContain("openGraph");
      expect(text).toContain("twitter");
      expect(text).toContain("/opengraph-image");
    }
    expect(menu).toContain("url,");
    expect(demo).toContain("/menu/demo");
  });
});
