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
import type { MenuItem } from "@/lib/types";

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
