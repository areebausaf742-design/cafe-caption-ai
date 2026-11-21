import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The shell pieces that are easy to forget and impossible to notice until they
 * matter: the page a broken link lands on, the page a server error lands on, and
 * the first tab stop on every page.
 *
 * Structural rather than rendered — there is no DOM environment in this project
 * (deliberately: it keeps `npm test` fast and dependency-free), so these assert
 * the contracts Next.js itself relies on.
 */
const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

describe("404", () => {
  const notFound = source("app/not-found.tsx");

  it("is a real page, not Next's default", () => {
    expect(notFound).toContain("export default function NotFound");
    expect(notFound).toContain("404");
  });

  it("offers a way back instead of a dead end", () => {
    expect(notFound).toMatch(/href:\s*"\/"/);
    expect(notFound).toMatch(/href:\s*"\/menu\/demo"/);
  });

  it("stays out of the index", () => {
    expect(notFound).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

describe("error boundaries", () => {
  const error = source("app/error.tsx");
  const globalError = source("app/global-error.tsx");

  it("the route boundary is a client component, which Next requires", () => {
    expect(error.trimStart().startsWith('"use client";')).toBe(true);
  });

  it("offers a retry rather than only a link", () => {
    expect(error).toContain("reset");
    expect(error).toContain("onClick={reset}");
  });

  it("never renders the error message or the stack to the visitor", () => {
    // `error.message` in JSX would print a database or path fragment on a public
    // page. The digest is the safe half of the same object.
    expect(error).not.toContain("{error.message}");
    expect(error).not.toContain("error.stack");
  });

  it("the global boundary renders its own document", () => {
    expect(globalError.trimStart().startsWith('"use client";')).toBe(true);
    expect(globalError).toContain("<html lang=\"en\">");
    expect(globalError).toContain("<body");
    // It must not depend on the stylesheet that may have failed to load.
    expect(globalError).toContain("style={{");
  });
});

describe("skip link", () => {
  const layout = source("app/layout.tsx");
  const css = source("app/globals.css");

  it("is the first thing in the body", () => {
    const body = layout.indexOf("<body");
    const skip = layout.indexOf("Skip to content");
    const header = layout.indexOf("<SiteHeader />");
    expect(body).toBeGreaterThan(-1);
    expect(skip).toBeGreaterThan(body);
    expect(skip).toBeLessThan(header);
  });

  it("points at a landmark that exists", () => {
    expect(layout).toContain('href="#main"');
    expect(source("app/page.tsx")).toContain('id="main"');
    expect(source("app/not-found.tsx")).toContain('id="main"');
    expect(source("app/error.tsx")).toContain('id="main"');
    expect(source("app/menu/[slug]/page.tsx")).toContain('id="main"');
    expect(source("app/menu/[slug]/edit/page.tsx")).toContain('id="main"');
  });

  it("is visually hidden but still focusable", () => {
    const rule = css.slice(css.indexOf(".skip-link"));
    // `display:none` / `visibility:hidden` would take it out of the tab order,
    // which is the one thing a skip link cannot afford.
    expect(rule).toContain("transform: translateY(-200%)");
    expect(rule).toContain(".skip-link:focus-visible");
  });
});

describe("the menu route keeps its 404", () => {
  it("has no loading boundary, because one turns a 404 into a 200", () => {
    // A `loading.tsx` makes Next flush the shell before the page body resolves,
    // so `notFound()` arrives too late to set the status: the response is
    // "200 OK" with a not-found body — a soft 404. Measured with `next start`
    // against a stub store: with the boundary 200, without it 404.
    const path = fileURLToPath(new URL("../app/menu/[slug]/loading.tsx", import.meta.url));
    expect(existsSync(path)).toBe(false);

    const page = source("app/menu/[slug]/page.tsx");
    expect(page).toContain("soft 404");
  });

  it("gives every <main> on the page the skip target", () => {
    const page = source("app/menu/[slug]/page.tsx");
    const mains = page.match(/<main/g) ?? [];
    const targets = page.match(/id="main"/g) ?? [];
    expect(mains.length).toBeGreaterThan(0);
    expect(targets.length).toBe(mains.length);
  });
});

describe("the repository is sellable, not just runnable", () => {
  it("has a licence that says what a buyer is getting", () => {
    const licence = source("LICENSE");
    expect(licence).toContain("Copyright");
    expect(licence).toContain("All rights reserved");
    // Third-party obligations have to survive the sale.
    expect(licence).toContain("SIL Open Font Licence");
  });

  it("declares its own metadata", () => {
    const pkg = JSON.parse(source("package.json")) as Record<string, unknown>;
    expect(pkg.license).toBe("SEE LICENSE IN LICENSE");
    expect(pkg.repository).toBeTruthy();
    expect(pkg.author).toBeTruthy();
  });

  it("has a contact address that actually receives mail", async () => {
    // A placeholder address is the quietest way to lose a sale's first enquiry:
    // the form posts to the CRM, but the mailto: links and the JSON-LD both
    // point at this, and nothing bounces visibly.
    const { CONTACT_EMAIL } = await import("@/lib/business");
    expect(CONTACT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i);
    expect(CONTACT_EMAIL).not.toMatch(/example\.(com|org)|yourdomain|@cafecaption\.tech/i);
  });

  it("ships a handover document", () => {
    const handover = source("docs/HANDOVER.md");
    expect(handover).toContain("Known limitations");
    expect(handover).toContain("Environment variables");
    expect(handover).toContain("Accounts to transfer");
  });

  it("keeps the one-paste SQL file identical to the migrations it wraps", async () => {
    // A generated file that drifts is worse than no file: it looks authoritative
    // and applies the wrong schema. The builder's --check mode fails on drift.
    const { execFileSync } = await import("node:child_process");
    const cwd = fileURLToPath(new URL("..", import.meta.url));
    expect(() =>
      execFileSync(process.execPath, ["scripts/build-apply-all.mjs", "--check"], {
        cwd,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("has a one-paste SQL file that contains every pending migration", () => {
    const applyAll = source("supabase/APPLY-ALL.sql");
    for (const migration of [
      "20261114120000_lock_anon_inserts.sql",
      "20261114130000_menu_indexing.sql",
      "20261121100000_rate_limit_store.sql",
    ]) {
      expect(applyAll).toContain(migration);
    }
    expect(applyAll).toContain("VERIFY");
  });

  it("runs the gate in CI, not only on a laptop", () => {
    const ci = source(".github/workflows/ci.yml");
    for (const step of ["npm run typecheck", "npm run lint", "npm test", "npm run build"]) {
      expect(ci).toContain(step);
    }
    expect(ci).toContain("pull_request");
  });
});
