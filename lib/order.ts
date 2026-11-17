/**
 * Cart → WhatsApp order, the pure half.
 *
 * Everything here is plain data in, string out: no React, no fetch, no browser
 * APIs — so the message the café receives can be reasoned about (and tested)
 * without rendering anything.
 *
 * The one rule that matters: **never invent a total.** Prices on a digitised
 * menu are strings typed by a person ("₹80", "₹1,200", "₹80 / ₹120"). If a
 * single line can't be read as one fixed number, the order is sent without a
 * total and says so, rather than quietly adding up the wrong thing.
 */

import type { MenuItem } from "@/lib/types";
import { formatINR } from "@/lib/business";
import { dialableWhatsapp } from "@/lib/menu";

/** Most a customer can order of one line, and most lines in one order. */
export const MAX_QTY = 20;
export const MAX_LINES = 25;

/** Instructions are a nudge ("less sugar"), not a letter. */
export const MAX_INSTRUCTIONS = 200;

export type Quantities = Record<number, number>;

/**
 * Read a printed price as a number, or say you can't.
 *
 * Handles what actually gets typed: `₹80`, `80`, `₹ 1,200`, `Rs. 80`, `80/-`.
 * Refuses anything with more than one number in it — `₹80 / ₹120` is two
 * prices, and picking one would be a guess.
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/,/g, "")
    .replace(/^\s*(?:₹|rs\.?|inr)\s*/i, "")
    .replace(/\s*(?:\/-|–|only)\s*$/i, "")
    .trim();

  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(cleaned)) return null;

  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Rupees without float drift: add paise, format once. */
export function formatAmount(amount: number): string {
  return formatINR(Math.round(amount * 100) / 100);
}

export interface OrderLine {
  index: number;
  name: string;
  qty: number;
  /** Unit price, or null when the printed price wasn't one number. */
  unit: number | null;
  /** Unit × qty, or null for the same reason. */
  lineTotal: number | null;
}

export interface BuiltOrder {
  lines: OrderLine[];
  /** Distinct items. */
  itemCount: number;
  /** Every unit added up, including quantities. */
  unitCount: number;
  /** Null when any selected line has an unreadable price. */
  total: number | null;
  /** Any line we couldn't price — the UI uses this to explain itself. */
  hasUnpricedLines: boolean;
  text: string;
}

/** Collapse whatever gets typed into one clean line. */
export function cleanInstruction(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INSTRUCTIONS);
}

/**
 * Build the order: the lines, the arithmetic, and the exact text the café reads
 * in WhatsApp. One function so the bar, the sheet and the sent message can
 * never disagree.
 */
export function buildOrder({
  cafeName,
  items,
  quantities,
  instructions = "",
  menuLabel,
}: {
  cafeName: string;
  items: MenuItem[];
  quantities: Quantities;
  instructions?: string;
  /** Short "sent from" line, e.g. the menu path. Kept out of the totals. */
  menuLabel?: string;
}): BuiltOrder {
  const lines: OrderLine[] = [];

  items.forEach((item, index) => {
    const qty = Math.min(Math.max(Math.trunc(quantities[index] ?? 0), 0), MAX_QTY);
    if (qty <= 0) return;

    const unit = parsePrice(item.price);
    lines.push({
      index,
      name: item.name,
      qty,
      unit,
      lineTotal: unit === null ? null : Math.round(unit * 100) * qty / 100,
    });
  });

  const hasUnpricedLines = lines.some((line) => line.lineTotal === null);
  const pricedTotal = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const total = lines.length === 0 || hasUnpricedLines ? null : pricedTotal;

  const note = cleanInstruction(instructions);
  const parts: string[] = [`New order for ${cafeName}`];

  for (const line of lines) {
    const money =
      line.lineTotal === null
        ? `— ${line.qty} × ${line.unit === null ? "priced in store" : formatAmount(line.unit)}`
        : `— ${formatAmount(line.lineTotal)}`;
    parts.push(`${line.qty} × ${line.name} ${money}`);
  }

  parts.push(
    total === null
      ? "Total: confirmed at the counter (one price wasn't a single figure)"
      : `Total: ${formatAmount(total)}`,
  );

  if (note) parts.push(`Note: ${note}`);
  if (menuLabel) parts.push(`Ordered from ${menuLabel}`);

  return {
    lines,
    itemCount: lines.length,
    unitCount: lines.reduce((sum, line) => sum + line.qty, 0),
    total,
    hasUnpricedLines,
    text: parts.join("\n"),
  };
}

/** The link the customer's phone opens with the whole order typed in. */
export function whatsappOrderUrl(phone: string, text: string): string {
  return `https://wa.me/${dialableWhatsapp(phone)}?text=${encodeURIComponent(text)}`;
}

/** Add one to a line, honouring both caps. Returns the same object on refusal. */
export function stepQuantity(
  quantities: Quantities,
  index: number,
  delta: number,
): Quantities {
  const current = quantities[index] ?? 0;
  const next = Math.min(Math.max(current + delta, 0), MAX_QTY);

  if (next === current) return quantities;
  if (next > 0 && current === 0 && Object.keys(quantities).length >= MAX_LINES) {
    return quantities;
  }

  const draft = { ...quantities };
  if (next === 0) delete draft[index];
  else draft[index] = next;
  return draft;
}

/** How many units are in the cart, for the bar and the live region. */
export function cartSize(quantities: Quantities): number {
  return Object.values(quantities).reduce((sum, qty) => sum + (qty || 0), 0);
}
