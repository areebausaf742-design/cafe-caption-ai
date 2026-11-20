import { describe, expect, it } from "vitest";

import { stitchTranslations, translatedRowCount } from "@/lib/menu-translate";
import type { MenuItem } from "@/lib/types";

const items: MenuItem[] = [
  { category: "Chai", name: "Masala Chai", price: "₹80" },
  { category: "Chai", name: "Cappuccino", price: "₹160" },
  { category: "Chai", name: "Cold Brew", price: "₹190" },
];

const hi = (name: string) => ({ category: "चाय", name });

describe("stitchTranslations", () => {
  it("stitches by the indices the server sent, not by position", () => {
    // Row 1 was blank and skipped, so two lines come back for three rows.
    const result = stitchTranslations(
      items,
      {
        hi: [hi("मसाला चाय"), hi("कोल्ड ब्रू")],
        hinglish: [
          { category: "Chai", name: "Masala Chai" },
          { category: "Chai", name: "Cold Brew" },
        ],
      },
      [0, 2],
    );

    expect(result[0].translations?.hi?.name).toBe("मसाला चाय");
    expect(result[1].translations).toBeUndefined();
    expect(result[2].translations?.hi?.name).toBe("कोल्ड ब्रू");
    // The prices are untouched, always.
    expect(result.map((row) => row.price)).toEqual(items.map((row) => row.price));
  });

  it("drops a language whose indices don't line up instead of shifting names", () => {
    const result = stitchTranslations(
      items,
      {
        hi: [hi("मसाला चाय"), hi("कोल्ड ब्रू")],
        hinglish: [hi("a"), hi("b"), hi("c")],
      },
      [0, 2], // two indices, three Hinglish lines — untrustworthy
    );

    expect(result[0].translations?.hi?.name).toBe("मसाला चाय");
    expect(result[0].translations?.hinglish).toBeUndefined();
  });

  it("falls back to positional only when nothing was skipped", () => {
    const result = stitchTranslations(items, {
      hi: [hi("मसाला चाय"), hi("कैपुचीनो"), hi("कोल्ड ब्रू")],
    });
    expect(result[2].translations?.hi?.name).toBe("कोल्ड ब्रू");
  });

  it("refuses a positional payload with the wrong row count", () => {
    const result = stitchTranslations(items, { hi: [hi("मसाला चाय")] });
    expect(result).toEqual(items);
  });

  it("ignores indices that point outside the menu", () => {
    const result = stitchTranslations(
      items,
      { hi: [hi("मसाला चाय")] },
      [99],
    );
    expect(result).toEqual(items);
  });

  it("keeps the printed name when a translation comes back empty", () => {
    const result = stitchTranslations(items, { hi: [hi(""), hi(""), hi("")] }, [0, 1, 2]);
    expect(result).toEqual(items);
  });

  it("returns the items untouched when there is no payload", () => {
    expect(stitchTranslations(items, null)).toBe(items);
  });
});

describe("translatedRowCount", () => {
  it("counts the rows that have every language", () => {
    const stitched = stitchTranslations(
      items,
      {
        hi: [hi("मसाला चाय"), hi("कैपुचीनो"), hi("कोल्ड ब्रू")],
        hinglish: [
          { category: "Chai", name: "Masala Chai" },
          { category: "Chai", name: "Cappuccino" },
          { category: "Chai", name: "Cold Brew" },
        ],
      },
    );
    expect(translatedRowCount(stitched)).toBe(3);
    expect(translatedRowCount(items)).toBe(0);
  });
});
