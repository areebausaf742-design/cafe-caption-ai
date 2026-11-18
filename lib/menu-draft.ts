/**
 * Editing a menu *before* it is published.
 *
 * Until now the studio handed the model's rows straight to `POST /api/menus`:
 * one wrong price meant publishing a wrong menu and fixing it afterwards, from
 * a different page. These are the pure functions behind the editable preview —
 * no React, no fetch, no browser — so the editing rules can be tested on their
 * own.
 *
 * Every setter clamps to the same limits the API enforces (`lib/menu.ts`), and
 * `checkDraft` reports anything the API would otherwise truncate or drop. The
 * studio blocks publishing on a non-empty message rather than letting the
 * server silently cut a row.
 */

import { MAX_CATEGORY, MAX_ITEM_NAME, MAX_ITEMS, MAX_PRICE } from "@/lib/menu";
import { DISH_LIMITS } from "@/lib/dish";
import type { DishDetails, DishModel, MenuItem } from "@/lib/types";

/** The two fields a person types into on a row; the section name has its own. */
export type MenuField = "name" | "price";

/**
 * A category is only ever reachable through its section heading, but it still
 * has to be clamped: a 60-character heading would be cut server-side.
 */
export function setItemField(
  items: MenuItem[],
  index: number,
  field: MenuField,
  value: string,
): MenuItem[] {
  if (index < 0 || index >= items.length) return items;

  const limit = field === "name" ? MAX_ITEM_NAME : MAX_PRICE;
  const next = tidy(value).slice(0, limit);
  if (items[index][field] === next) return items;

  return items.map((item, i) => (i === index ? { ...item, [field]: next } : item));
}

export function removeItem(items: MenuItem[], index: number): MenuItem[] {
  if (index < 0 || index >= items.length) return items;
  return items.filter((_, i) => i !== index);
}

/**
 * Append a blank row to a section. The row is deliberately empty rather than
 * pre-filled with a placeholder price: an item with no price is what the API
 * drops, and `checkDraft` turns that into a visible "needs a price" instead of
 * a menu that quietly lost a line.
 */
export function addItem(items: MenuItem[], category: string): MenuItem[] {
  if (items.length >= MAX_ITEMS) return items;

  return [
    ...items,
    {
      category: tidy(category).trim().slice(0, MAX_CATEGORY) || "Menu",
      name: "",
      price: "",
    },
  ];
}

/**
 * Rename a section by editing its heading.
 *
 * Rows are grouped by their `category` string and every row in the section
 * carries the same one, so renaming moves the whole group in place — the rows
 * don't reorder and the input keeps focus. An empty heading is allowed while
 * typing; the API maps "" to "Menu" on the way in.
 */
export function renameSection(
  items: MenuItem[],
  from: string,
  to: string,
): MenuItem[] {
  const next = tidy(to).slice(0, MAX_CATEGORY);
  if (next === from) return items;

  return items.map((item) =>
    item.category === from ? { ...item, category: next } : item,
  );
}

/* -------------------------------------------------------------------------- */
/*  Dishes: words and models                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Attach (or clear) a dish's description and visible ingredients.
 *
 * `null` removes the field entirely rather than leaving `{ description: "" }`
 * behind — an empty dish would still light up the card's "more" affordance and
 * open a panel with nothing in it.
 */
export function setItemDish(
  items: MenuItem[],
  index: number,
  dish: DishDetails | null,
): MenuItem[] {
  if (index < 0 || index >= items.length) return items;
  // Clearing something that isn't there must not re-render the list.
  if (!dish && !items[index].dish) return items;

  return items.map((item, i) => {
    if (i !== index) return item;
    if (!dish) {
      const rest = { ...item };
      delete rest.dish;
      return rest;
    }
    return { ...item, dish };
  });
}

/**
 * Attach (or clear) a real GLB.
 *
 * The URL is validated here as well as server-side: a typo in the studio should
 * read as "that isn't a GLB URL" next to the field, not as a 3D button on a
 * live menu that fails to load in front of a customer.
 */
export function setItemModel(
  items: MenuItem[],
  index: number,
  model: DishModel | null,
): MenuItem[] {
  if (index < 0 || index >= items.length) return items;
  if (!model && !items[index].model) return items;

  return items.map((item, i) => {
    if (i !== index) return item;
    if (!model) {
      const rest = { ...item };
      delete rest.model;
      return rest;
    }
    return { ...item, model };
  });
}

/**
 * Apply an accepted AI suggestion to one row.
 *
 * Three fields move — name, section, dish copy — and **the price does not**.
 * That is the whole reason this is a function instead of three `setState`
 * calls: the studio can accept a model's reading of a photo, and the number the
 * café typed is provably outside the write.
 */
export function applyDishSuggestion(
  items: MenuItem[],
  index: number,
  suggestion: {
    name?: string;
    category?: string;
    description?: string;
    ingredients?: string[];
  },
): MenuItem[] {
  if (index < 0 || index >= items.length) return items;

  const current = items[index];
  const name = suggestion.name
    ? tidy(suggestion.name).trim().slice(0, MAX_ITEM_NAME) || current.name
    : current.name;
  const category = suggestion.category
    ? tidy(suggestion.category).trim().slice(0, MAX_CATEGORY) || current.category
    : current.category;

  const description = (suggestion.description ?? "").trim().slice(0, DISH_LIMITS.description);
  const ingredients = (suggestion.ingredients ?? [])
    .map((entry) => entry.trim().slice(0, DISH_LIMITS.ingredient))
    .filter(Boolean)
    .slice(0, DISH_LIMITS.ingredients);

  const dish: DishDetails = {
    description,
    ingredients,
    source: "ai",
  };

  return items.map((item, i) => {
    if (i !== index) return item;

    const next: MenuItem = { ...item, name, category };
    if (description || ingredients.length) {
      next.dish = dish;
    } else {
      // Saving an empty panel is the owner clearing the copy, not a request to
      // keep the old description under a new name.
      delete next.dish;
    }
    return next;
  });
}

/**
 * The café name is the one field the publish route refuses without: it becomes
 * the menu page's title, the card's heading and the first line of every
 * WhatsApp order. Two characters after trimming is the same rule
 * `validateMenu` applies, so the studio can say it before the request is sent.
 */
export const MIN_CAFE_NAME = 2;

export function cafeNameProblem(cafeName: string): string | null {
  const clean = cafeName.trim();
  if (clean.length === 0) {
    return "Add your café's name — it goes on the menu page, the card and the WhatsApp order.";
  }
  if (clean.length < MIN_CAFE_NAME) {
    return "A name needs at least 2 characters.";
  }
  return null;
}

export interface DraftCheck {
  total: number;
  /** Row indices the API would cut or drop as they stand. */
  flawed: number[];
  canPublish: boolean;
  canAdd: boolean;
  /** One sentence for the studio, or null when the draft is publishable. */
  message: string | null;
}

/**
 * What would go wrong if this draft were published right now.
 *
 * The cases mirror the server exactly: `normalizeItems` drops a row with no
 * name or price, `text()` truncates anything over its limit, and only the first
 * `MAX_ITEMS` rows are kept. A menu extracted from a big printed card can
 * legitimately arrive with more rows than a published menu holds, so that
 * difference is surfaced and blocked rather than sliced.
 */
export function checkDraft(items: MenuItem[]): DraftCheck {
  const flawed: number[] = [];
  let missing = 0;
  let tooLong = 0;

  items.forEach((item, index) => {
    const name = item.name.trim();
    const price = item.price.trim();

    if (!name || !price) {
      missing += 1;
      flawed.push(index);
      return;
    }

    if (
      name.length > MAX_ITEM_NAME ||
      price.length > MAX_PRICE ||
      item.category.length > MAX_CATEGORY
    ) {
      tooLong += 1;
      flawed.push(index);
    }
  });

  const over = Math.max(0, items.length - MAX_ITEMS);

  let message: string | null = null;

  if (items.length === 0) {
    message = "Add at least one item before publishing.";
  } else if (over > 0) {
    message = `This menu has ${items.length} items and a published menu holds ${MAX_ITEMS}. Remove ${over} to publish — nothing is thrown away for you.`;
  } else if (tooLong > 0) {
    message = `${count(tooLong, "row is", "rows are")} longer than a menu allows (${MAX_ITEM_NAME} characters for a name, ${MAX_PRICE} for a price). Shorten ${tooLong === 1 ? "it" : "them"}, or the end would be cut when you publish.`;
  } else if (missing > 0) {
    message = `${count(missing, "row still needs", "rows still need")} a name and a price.`;
  }

  return {
    total: items.length,
    flawed,
    canPublish: message === null,
    canAdd: items.length < MAX_ITEMS,
    message,
  };
}

/** `3 rows are` / `1 row is` without a branch at every call site. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Collapse runs of whitespace — including the newlines a paste brings in. */
function tidy(value: string): string {
  return value.replace(/\s+/g, " ");
}
