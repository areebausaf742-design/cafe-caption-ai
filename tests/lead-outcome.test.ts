import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The quote form used to say "a copy is kept here" no matter what the server
 * said — including a 503, when nothing was stored. The fix has to keep the
 * WhatsApp handoff synchronous (a popup only survives the user gesture) *and*
 * report the outcome afterwards, which is an ordering problem worth pinning
 * down in a test: the obvious "fix" is to await the POST, and that breaks the
 * one thing the form exists for.
 */
const source = readFileSync(
  fileURLToPath(new URL("../components/LeadForm.tsx", import.meta.url)),
  "utf8",
);

describe("lead form reports what actually happened", () => {
  it("reads `stored` from the response instead of assuming success", () => {
    expect(source).toContain("body?.stored === true");
    expect(source).toContain('"failed"');
    expect(source).toContain('"saved"');
  });

  it("never blocks the WhatsApp handoff on the request", () => {
    // `void saveLead(…)` — fire, then report. An `await` here means the tab
    // opens after the network round trip, which popup blockers kill.
    expect(source).toContain("void saveLead(");
    expect(source).not.toMatch(/await saveLead\(/);

    const save = source.indexOf("void saveLead(");
    const open = source.indexOf("window.open(url");
    expect(save).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(save);
  });

  it("announces the outcome to assistive tech as well as to the eye", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
  });

  it("says plainly when the copy was not saved", () => {
    expect(source).toContain("The copy couldn't be saved on our side");
  });
});

describe("the route is honest about the write", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/leads/route.ts", import.meta.url)),
    "utf8",
  );

  it("answers 503 with a code, and a WhatsApp channel, when nothing was stored", () => {
    expect(route).toContain("STORE_UNAVAILABLE");
    expect(route).toMatch(/status:\s*503/);
    expect(route).toContain('channel: "whatsapp"');
  });

  it("only reports success for a row that was actually written", () => {
    expect(route).toContain("stored: true");
    expect(route).not.toContain("stored: false");
  });
});
