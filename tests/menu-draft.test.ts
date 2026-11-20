import { describe, expect, it } from "vitest";

import { addItem, removeItem, setItemField } from "@/lib/menu-draft";
import { MAX_PRICE } from "@/lib/limits";
import type { MenuItem } from "@/lib/types";

const rich = (): MenuItem => ({
  category: "Chai",
  name: "Masala Chai",
  price: "₹80",
  dish: {
    description: "Slow-brewed with cardamom and ginger.",
    ingredients: ["tea", "milk", "cardamom"],
    source: "ai",
  },
  model: {
    glb: "https://cdn.example.com/masala-chai.glb",
    poster: "https://cdn.example.com/masala-chai.png",
    by: "triposr",
  },
  translations: { hi: { category: "चाय", name: "मसाला चाय" } },
});

describe("setItemField", () => {
  it("renaming a dish keeps its description, photo model and translations", () => {
    const before = [rich()];
    const after = setItemField(before, 0, "name", "Kadak Masala Chai");

    expect(after[0].name).toBe("Kadak Masala Chai");
    // The whole point: only the name moves.
    expect(after[0].dish).toEqual(before[0].dish);
    expect(after[0].model).toEqual(before[0].model);
    expect(after[0].translations).toEqual(before[0].translations);
  });

  it("re-pricing a dish leaves the name and the description alone", () => {
    const after = setItemField([rich()], 0, "price", "₹95");
    expect(after[0].price).toBe("₹95");
    expect(after[0].name).toBe("Masala Chai");
    expect(after[0].dish?.description).toContain("cardamom");
  });

  it("caps a price at the shared limit", () => {
    const after = setItemField([rich()], 0, "price", "₹" + "9".repeat(60));
    expect(after[0].price.length).toBeLessThanOrEqual(MAX_PRICE);
  });

  it("is a no-op out of range or when nothing changed", () => {
    const before = [rich()];
    expect(setItemField(before, 5, "name", "x")).toBe(before);
    expect(setItemField(before, 0, "name", "Masala Chai")).toBe(before);
  });
});

describe("addItem / removeItem", () => {
  it("appends a blank row in the given section", () => {
    const after = addItem([rich()], "Desserts");
    expect(after).toHaveLength(2);
    expect(after[1]).toMatchObject({ category: "Desserts", name: "", price: "" });
  });

  it("refuses an index that doesn't exist", () => {
    const before = [rich()];
    expect(removeItem(before, 3)).toBe(before);
    expect(removeItem(before, -1)).toBe(before);
  });

  it("removes exactly one row", () => {
    const rows = [rich(), { ...rich(), name: "Cold Brew" }];
    const after = removeItem(rows, 0);
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe("Cold Brew");
  });
});
