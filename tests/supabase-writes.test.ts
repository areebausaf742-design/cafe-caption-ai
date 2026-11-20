import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Writes go through the service role, and only the service role.
 *
 * The failure this file exists to prevent is not "the insert is broken" — it is
 * "the insert silently succeeded as `anon`". So the interesting assertions are
 * the negative ones: with no service key, nothing is sent to the network at all.
 */
const URL_ENV = "SUPABASE_URL";
const ANON_ENV = "SUPABASE_ANON_KEY";
const PUBLISHABLE_ENV = "SUPABASE_PUBLISHABLE_KEY";
const SERVICE_ENV = "SUPABASE_SERVICE_ROLE_KEY";

const BASE = "https://project-ref.supabase.co";
const ANON = "anon-key-not-a-secret-for-tests";
const SERVICE = "service-role-key-not-a-secret-for-tests";

type Env = { url?: string; anon?: string; publishable?: string; service?: string };

async function load({
  url = BASE,
  anon = ANON,
  publishable = "",
  service = "",
}: Env = {}) {
  vi.resetModules();
  vi.stubEnv(URL_ENV, url);
  vi.stubEnv(ANON_ENV, anon);
  vi.stubEnv(PUBLISHABLE_ENV, publishable);
  vi.stubEnv(SERVICE_ENV, service);

  return {
    menuStore: await import("@/lib/menu-store"),
    leadStore: await import("@/lib/lead-store"),
    config: await import("@/lib/supabase-config"),
  };
}

const MENU = {
  cafeName: "Chai & Chapter",
  tagline: "",
  whatsapp: "",
  items: [{ id: "1", name: "Masala chai", price: "₹40" }],
  published: true,
} as unknown as Parameters<Awaited<ReturnType<typeof load>>["menuStore"]["createMenuRecord"]>[2];

const LEAD = {
  name: "Areeb",
  cafeName: "The Daily Grind",
  city: "Lucknow",
  interest: "not-sure",
} as unknown as Parameters<Awaited<ReturnType<typeof load>>["leadStore"]["storeLead"]>[0];

const ok = () => ({ ok: true, status: 201, text: async () => "" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("server writes use the service role", () => {
  it("inserts a menu with the service key and never the publishable one", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchSpy);
    const { menuStore } = await load({ service: SERVICE });

    await menuStore.createMenuRecord("chai-and-chapter", "a".repeat(64), MENU);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/rest/v1/menus`);
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(SERVICE);
    expect(headers.Authorization).toBe(`Bearer ${SERVICE}`);
    // The public key must not appear anywhere in the request.
    expect(JSON.stringify(headers)).not.toContain(ANON);
    expect(String(init.body)).not.toContain(ANON);
  });

  it("stores a lead with the service key", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);
    const { leadStore } = await load({ service: SERVICE });

    expect(await leadStore.storeLead(LEAD, "https://cafe-caption-ai.vercel.app/")).toEqual({
      stored: true,
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/rest/v1/leads`);
    expect((init.headers as Record<string, string>).apikey).toBe(SERVICE);
    expect(String(init.body)).toContain("cafe-caption");
  });
});

describe("a missing service key never falls back to anon", () => {
  it("refuses to write a menu and sends nothing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { menuStore } = await load({ service: "" });

    expect(menuStore.menuWriteConfigured()).toBe(false);
    await expect(
      menuStore.createMenuRecord("chai-and-chapter", "a".repeat(64), MENU),
    ).rejects.toThrow(/not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a lead as not configured instead of inserting as anon", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { leadStore } = await load({ service: "" });

    expect(await leadStore.storeLead(LEAD, null)).toEqual({
      stored: false,
      reason: "not-configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    // One warning, and it names the variable — never a value.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(ANON);
  });

  it("refuses a publishable key pasted into the service slot", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config, leadStore } = await load({ anon: ANON, service: ANON });

    expect(config.supabaseWriteConfigured()).toBe(false);
    expect(await leadStore.storeLead(LEAD, null)).toMatchObject({ stored: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a JWT whose role claim is not service_role", async () => {
    const anonJwt = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ role: "anon", iss: "supabase" })).toString("base64url"),
      "signature",
    ].join(".");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config } = await load({ service: anonJwt });

    expect(config.supabaseWriteConfigured()).toBe(false);
  });

  it("accepts a JWT whose role claim is service_role", async () => {
    const serviceJwt = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
      "signature",
    ].join(".");
    const { config } = await load({ service: serviceJwt });
    expect(config.supabaseWriteConfigured()).toBe(true);
  });

  it("refuses to write when there is no project URL at all", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { leadStore } = await load({ url: "", service: SERVICE });
    expect(await leadStore.storeLead(LEAD, null)).toMatchObject({ stored: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports an upstream failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "denied" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { leadStore } = await load({ service: SERVICE });
    expect(await leadStore.storeLead(LEAD, null)).toEqual({
      stored: false,
      reason: "upstream",
    });
  });
});

describe("reads and capability-key edits keep working on the public key", () => {
  it("reads a public menu through menu_public() with the publishable key", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          slug: "chai-and-chapter",
          cafeName: "Chai & Chapter",
          items: [],
          published: true,
          updatedAt: "2026-11-14T00:00:00Z",
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { menuStore } = await load({ service: SERVICE });

    const doc = await menuStore.readPublicMenu("chai-and-chapter");

    expect(doc?.slug).toBe("chai-and-chapter");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/rest/v1/rpc/menu_public`);
    expect((init.headers as Record<string, string>).apikey).toBe(ANON);
  });

  it("saves with menu_save() on the public key, even with no service key on the box", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ slug: "chai-and-chapter", updatedAt: "2026-11-14T00:00:00Z" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { menuStore } = await load({ service: "" });

    const updatedAt = await menuStore.saveMenu("chai-and-chapter", "b".repeat(64), MENU);

    expect(updatedAt).toBe("2026-11-14T00:00:00Z");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/rest/v1/rpc/menu_save`);
    expect((init.headers as Record<string, string>).apikey).toBe(ANON);
  });

  it("still reports reads as configured when only the public key exists", async () => {
    const { menuStore } = await load({ service: "" });
    // The public menu page must keep rendering: reads are not gated on the
    // service key, writes are.
    expect(menuStore.menuStoreConfigured()).toBe(true);
    expect(menuStore.menuWriteConfigured()).toBe(false);
  });

  it("falls back to SUPABASE_PUBLISHABLE_KEY for reads when ANON_KEY is unset", async () => {
    const { config } = await load({ anon: "", publishable: "sb_publishable_test" });
    expect(config.supabaseReadConfigured()).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Structural guards: where the key may appear at all                        */
/* -------------------------------------------------------------------------- */

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    const full = join(ROOT, rel);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("the service key stays server-side", () => {
  it("is never given a NEXT_PUBLIC_ name anywhere in the repo", () => {
    const offenders = walk(".").filter((path) =>
      /NEXT_PUBLIC_[A-Z_]*SERVICE/i.test(source(path)),
    );
    expect(offenders).toEqual([]);
  });

  it("is only read in server-only modules", () => {
    const readers = walk("lib")
      .concat(walk("app"))
      .filter((path) => source(path).includes("SUPABASE_SERVICE_ROLE_KEY"));

    // The credential module is the single reader; everything else asks it.
    for (const path of readers) {
      const text = source(path);
      const serverOnly =
        text.includes('import "server-only"') ||
        text.includes('runtime = "nodejs"');
      const isStaticPage = path.startsWith("app/") && !path.includes("/api/");
      expect(
        serverOnly || isStaticPage,
        `${path} touches the service key without server-only protection`,
      ).toBe(true);
    }
    expect(readers).toContain("lib/supabase-config.ts");
  });

  it("never appears in a client component", () => {
    const clientFiles = walk("app")
      .concat(walk("components"))
      .filter((path) => /^\s*["']use client["']/.test(source(path)));

    expect(clientFiles.length).toBeGreaterThan(0);
    for (const path of clientFiles) {
      expect(source(path)).not.toContain("SERVICE_ROLE");
    }
  });

  it("is not baked into a client bundle built from the studio", () => {
    // `lib/supabase-config.ts` must stay out of anything a browser downloads:
    // the marker is the server-only import every such module carries.
    expect(source("lib/supabase-config.ts")).toContain('import "server-only"');
    expect(source("lib/lead-store.ts")).toContain('import "server-only"');
    expect(source("lib/menu-store.ts")).toContain('import "server-only"');
  });
});

describe("routes answer 503 instead of writing as anon", () => {
  it("leads route delegates to the store and never touches the table itself", () => {
    const text = source("app/api/leads/route.ts");
    expect(text).toContain("storeLead");
    expect(text).not.toContain("/rest/v1/");
    expect(text).not.toContain("SUPABASE_ANON_KEY");
    expect(text).toContain("STORE_UNAVAILABLE");
    expect(text).toMatch(/status:\s*503/);
  });

  it("publish route gates on the write credential, not the read one", () => {
    const text = source("app/api/menus/route.ts");
    expect(text).toContain("menuWriteConfigured");
    expect(text).not.toContain("menuStoreConfigured");
    expect(text).toMatch(/status:\s*503/);
  });

  it("edit and read routes keep using the capability key", () => {
    const text = source("app/api/menus/[slug]/route.ts");
    expect(text).toContain("menuStoreConfigured");
    expect(text).not.toContain("menuWriteConfigured");
    expect(text).not.toContain("SERVICE_ROLE");
  });
});

/* -------------------------------------------------------------------------- */
/*  The SQL that closes the door                                              */
/* -------------------------------------------------------------------------- */

describe("migration revokes anon INSERT and keeps the RPCs", () => {
  const migration = source("supabase/migrations/20261114120000_lock_anon_inserts.sql");
  const schema = source("supabase/schema.sql");

  it.each([
    ["the migration", () => migration],
    ["schema.sql", () => schema],
  ])("%s revokes INSERT on both tables and drops both policies", (_label, read) => {
    const sql = read();
    expect(sql).toContain("revoke insert on public.leads from anon");
    expect(sql).toContain("revoke insert on public.menus from anon");
    expect(sql).toContain('drop policy if exists "leads_insert_only" on public.leads');
    expect(sql).toContain('drop policy if exists "menus_insert_only" on public.menus');
  });

  it("nothing anywhere grants INSERT back to anon or recreates the policies", () => {
    for (const path of ["supabase/schema.sql", "supabase/migrations/20261114120000_lock_anon_inserts.sql"]) {
      const sql = source(path);
      // A grant or a `create policy` for INSERT would silently undo the revoke
      // the next time the file is run — the classic way this bug comes back.
      expect(sql).not.toMatch(/^\s*grant\s+insert/im);
      expect(sql).not.toMatch(/^\s*create policy/im);
    }
  });

  it("keeps RLS enabled on both tables", () => {
    expect(migration).toContain("alter table public.leads enable row level security");
    expect(migration).toContain("alter table public.menus enable row level security");
    expect(schema).toContain("alter table public.leads enable row level security");
    expect(schema).toContain("alter table public.menus enable row level security");
  });

  it("leaves the capability RPC grants intact", () => {
    for (const sql of [migration, schema]) {
      expect(sql).toContain("grant execute on function public.menu_public(text)");
      expect(sql).toContain("grant execute on function public.menu_read(text, text)");
      expect(sql).toContain(
        "grant execute on function public.menu_save(text, text, text, text, text, jsonb, boolean)",
      );
    }
  });

  it("is idempotent: no unguarded drops, and it runs in one transaction", () => {
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
    const drops = migration.match(/drop\s+\w+[^;]*;/gi) ?? [];
    // Commented-out rollback lines start with `--`, so they aren't matched here.
    expect(drops.length).toBeGreaterThan(0);
    for (const statement of drops) {
      expect(statement).toMatch(/if exists/i);
    }
  });

  it("warns that it must be applied after the deployment, not before", () => {
    expect(migration).toMatch(/ONLY after/i);
    expect(migration).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
