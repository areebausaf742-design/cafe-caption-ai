import { describe, expect, it } from "vitest";

import { dialableWhatsapp, slugify, validateMenu, withSuffix } from "@/lib/menu";
import { MAX_PRICE } from "@/lib/limits";
import { parsePrice } from "@/lib/order";

describe("validateMenu", () => {
  const item = { category: "Chai", name: "Masala Chai", price: "₹80" };

  it("accepts a minimal menu and trims what it stores", () => {
    const result = validateMenu({
      cafeName: "  The Daily Grind ",
      items: [item],
      whatsapp: "98765 43210",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cafeName).toBe("The Daily Grind");
    expect(result.value.items).toHaveLength(1);
    expect(result.value.whatsapp).toBe("919876543210");
  });

  it("rejects a café name shorter than two characters", () => {
    const result = validateMenu({ cafeName: "A", items: [item] });
    expect(result).toMatchObject({ ok: false, field: "cafeName" });
  });

  it("drops rows with no name or no price rather than failing the publish", () => {
    const result = validateMenu({
      cafeName: "Cafe",
      items: [item, { name: "No price" }, { price: "₹10" }, null, "nope"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
  });

  it("refuses an empty menu", () => {
    expect(validateMenu({ cafeName: "Cafe", items: [] })).toMatchObject({
      ok: false,
      field: "items",
    });
  });

  it("rejects a WhatsApp number that is too short, pointing at the field", () => {
    const result = validateMenu({ cafeName: "Cafe", items: [item], whatsapp: "12345" });
    expect(result).toMatchObject({ ok: false, field: "whatsapp" });
  });

  it("rejects a WhatsApp number longer than 15 digits", () => {
    const result = validateMenu({
      cafeName: "Cafe",
      items: [item],
      whatsapp: "1234567890123456",
    });
    expect(result).toMatchObject({ ok: false, field: "whatsapp" });
  });

  it("allows a menu with no WhatsApp number at all", () => {
    const result = validateMenu({ cafeName: "Cafe", items: [item] });
    expect(result.ok && result.value.whatsapp).toBe("");
  });

  it("caps a price at the shared limit", () => {
    const longPrice = "₹" + "1".repeat(MAX_PRICE + 20);
    const result = validateMenu({ cafeName: "Cafe", items: [{ ...item, price: longPrice }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0].price.length).toBeLessThanOrEqual(MAX_PRICE);
  });

  it("publishes unless explicitly told not to", () => {
    const draft = validateMenu({ cafeName: "Cafe", items: [item], published: false });
    expect(draft.ok && draft.value.published).toBe(false);
    const live = validateMenu({ cafeName: "Cafe", items: [item], published: "no" });
    expect(live.ok && live.value.published).toBe(true);
  });
});

describe("slugify", () => {
  it("turns a café name into something a phone can dial to", () => {
    expect(slugify("The Daily Grind")).toBe("the-daily-grind");
    expect(slugify("  Café  Noor!! ")).toBe("cafe-noor");
  });

  it("moves reserved names out of the way", () => {
    // `/menu/demo` is a real page; a menu published there would never render.
    expect(slugify("Demo")).toBe("demo-menu");
    expect(slugify("edit")).toBe("edit-menu");
    expect(slugify("API")).toBe("api-menu");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("cafe-menu");
    expect(slugify("")).toBe("cafe-menu");
    expect(slugify("a")).toBe("a-menu");
  });
});

describe("withSuffix", () => {
  it("numbers the second attempt onwards", () => {
    expect(withSuffix("the-daily-grind", 0)).toBe("the-daily-grind");
    expect(withSuffix("the-daily-grind", 1)).toBe("the-daily-grind-2");
    expect(withSuffix("the-daily-grind", 2)).toBe("the-daily-grind-3");
  });

  it("re-checks every attempt, including the first", () => {
    // A caller that skipped `slugify` still can't land on a static route.
    expect(withSuffix("demo", 0)).toBe("demo-menu");
    expect(withSuffix("api", 0)).toBe("api-menu");
    expect(withSuffix("demo-menu", 1)).toBe("demo-menu-2");
  });

  it("(slugify then withSuffix) still avoids the reserved space", () => {
    const slug = withSuffix(slugify("Demo"), 1);
    expect(slug).toBe("demo-menu-2");
    expect(slug).not.toBe("demo");
  });
});

describe("dialableWhatsapp", () => {
  it("prefixes a bare ten-digit mobile with 91", () => {
    expect(dialableWhatsapp("9876543210")).toBe("919876543210");
    expect(dialableWhatsapp("+91 98765 43210")).toBe("919876543210");
    expect(dialableWhatsapp("098754 32100")).toBe("919875432100");
  });

  it("leaves an already-international number alone", () => {
    expect(dialableWhatsapp("919876543210")).toBe("919876543210");
  });

  it("returns nothing when there are no digits", () => {
    expect(dialableWhatsapp("ask at the counter")).toBe("");
  });
});

describe("parsePrice", () => {
  it("reads the way prices are printed in India", () => {
    expect(parsePrice("₹80")).toBe(80);
    expect(parsePrice("80")).toBe(80);
    expect(parsePrice("Rs. 1,250")).toBe(1250);
    expect(parsePrice("₹ 80/-")).toBe(80);
    expect(parsePrice("₹1,299.50")).toBe(1299.5);
  });

  it("refuses to guess", () => {
    expect(parsePrice("₹80 / ₹120")).toBeNull();
    expect(parsePrice("Market price")).toBeNull();
    expect(parsePrice("-")).toBeNull();
    expect(parsePrice(80)).toBeNull();
  });
});
