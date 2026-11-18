/**
 * Dishes with a story and a model — the pure half.
 *
 * Two things live on a menu row that the row itself can't prove:
 *
 * - `dish`: the words. A description and the ingredients someone could
 *   actually *see* in the photo. Never a synthesis of what "should" be in a
 *   dish, and never an allergen claim — a menu is not a medical document.
 * - `model`: a real GLB, hosted somewhere, loaded by the viewer.
 *
 * This module is plain data in, plain data out: no React, no fetch, no three.js.
 * Everything the customer's browser will trust is validated here first, because
 * both fields arrive from a studio text box or from a model reply, and neither
 * is trustworthy on arrival.
 *
 * **The one invariant that matters:** a dish can never change a price. Nothing
 * in this file reads `price` except `recommendations`, which only ever *returns*
 * rows that already exist — it cannot invent a dish, a price, or availability.
 */

import { MAX_CATEGORY, MAX_ITEM_NAME } from "@/lib/menu";
import type { DishDetails, DishModel, MenuItem } from "@/lib/types";
import { parsePrice } from "@/lib/order";

/* -------------------------------------------------------------------------- */
/*  Limits — mirrored by the studio's input caps and the API route            */
/* -------------------------------------------------------------------------- */

export const DISH_LIMITS = {
  /** Two sentences of menu copy, not a paragraph. */
  description: 320,
  /** An ingredient is a word or two ("burrata", "curry leaf"), not a sentence. */
  ingredient: 40,
  /** Eight visible things is already a generous plate. */
  ingredients: 8,
  /** A CDN URL, not a novel. */
  url: 400,
  /** Short credit: "meshy", "trellis", "owner". */
  by: 24,
} as const;

/** Suggestions for the studio's category field — free text is still allowed. */
export const DISH_CATEGORIES = [
  "Beverages",
  "Starters",
  "Sandwiches",
  "Mains",
  "Rice & Bowls",
  "Desserts",
] as const;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/* -------------------------------------------------------------------------- */
/*  Asset URLs                                                                */
/* -------------------------------------------------------------------------- */

const MODEL_PATH_RE = /\.(glb|gltf)$/i;
const IMAGE_PATH_RE = /\.(png|jpe?g|webp|avif)$/i;

/**
 * Is this a URL we are willing to hand to a `<model-viewer>`-style loader?
 *
 * Deliberately narrow: **https only** (a menu on a phone is https, so a plain
 * http asset would be blocked as mixed content and fail silently), no
 * credentials in the URL, no `data:` blobs, no javascript:/file:/blob:. A
 * published menu is a public document — an owner pasting a URL shouldn't be
 * able to turn it into something that runs code or ships a 40 MB base64 blob
 * through `POST /api/menus`.
 */
export function isAssetUrl(raw: unknown, kind: "model" | "image"): boolean {
  if (typeof raw !== "string") return false;

  const value = raw.trim();
  if (!value || value.length > DISH_LIMITS.url) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const pattern = kind === "model" ? MODEL_PATH_RE : IMAGE_PATH_RE;
  return pattern.test(url.pathname);
}

/* -------------------------------------------------------------------------- */
/*  Normalising                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The words, re-validated.
 *
 * A dish with neither a description nor an ingredient is not a dish — it's an
 * empty object that would render a blank panel — so it's dropped entirely
 * rather than published as a stub.
 */
export function normalizeDish(raw: unknown): DishDetails | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;

  const row = raw as Record<string, unknown>;
  const description = text(row.description, DISH_LIMITS.description);

  const seen = new Set<string>();
  const ingredients: string[] = [];
  if (Array.isArray(row.ingredients)) {
    for (const entry of row.ingredients) {
      const ingredient = text(entry, DISH_LIMITS.ingredient);
      if (!ingredient) continue;
      const key = ingredient.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ingredients.push(ingredient);
      if (ingredients.length >= DISH_LIMITS.ingredients) break;
    }
  }

  if (!description && ingredients.length === 0) return undefined;

  return {
    description,
    ingredients,
    // Anything that isn't a claimed AI pass is treated as the owner's own
    // words — the safer of the two, because it carries no "AI wrote this" tag
    // the customer could read as a promise.
    source: row.source === "ai" ? "ai" : "owner",
  };
}

/**
 * The model, re-validated.
 *
 * A model without a usable `glb` is not a model. The poster is optional and
 * dropped if it isn't a plain https image — the viewer falls back to its own
 * typographic plate, which is better than a broken `<img>`.
 */
export function normalizeModel(raw: unknown): DishModel | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;

  const row = raw as Record<string, unknown>;
  const glb = typeof row.glb === "string" ? row.glb.trim() : "";
  if (!isAssetUrl(glb, "model")) return undefined;

  const model: DishModel = { glb };
  if (isAssetUrl(row.poster, "image")) model.poster = (row.poster as string).trim();

  const by = text(row.by, DISH_LIMITS.by);
  if (by) model.by = by;

  return model;
}

/* -------------------------------------------------------------------------- */
/*  Reading a menu                                                            */
/* -------------------------------------------------------------------------- */

/** Does this row have a model the viewer can actually try to load? */
export function hasModel(item: MenuItem): boolean {
  return Boolean(item.model?.glb && isAssetUrl(item.model.glb, "model"));
}

/** Does this row have words worth showing? */
export function hasDish(item: MenuItem): boolean {
  return Boolean(item.dish && (item.dish.description || item.dish.ingredients.length));
}

/** How many rows carry a model — the studio's coverage line. */
export function modelCount(items: MenuItem[]): number {
  return items.filter(hasModel).length;
}

/* -------------------------------------------------------------------------- */
/*  Recommendations                                                           */
/* -------------------------------------------------------------------------- */

export interface Recommendation {
  item: MenuItem;
  /** Index in the same array the picker was given, so callers can align. */
  index: number;
  /** Why this one — shown as a quiet label, never a claim about pairing. */
  note: string;
}

/**
 * "Goes well with" without inventing anything.
 *
 * The temptation is to ask a model for pairings and print them. That model has
 * never seen this café's kitchen: it will suggest a dish that isn't on the menu,
 * or one that's sold out, with a price it made up. So pairings are derived from
 * the menu itself, which means every recommendation is a real row, at the real
 * price, that the owner can actually serve.
 *
 * Ranking is deliberately boring and explainable:
 *   1. a different section first (a drink beside a sandwich beats two sandwiches),
 *   2. then the closest price — the ₹120 side, not the ₹900 platter,
 *   3. then the order the owner put them in.
 */
export function recommendations(
  items: MenuItem[],
  index: number,
  limit = 3,
): Recommendation[] {
  const source = items[index];
  if (!source) return [];

  const sourcePrice = parsePrice(source.price);

  const ranked = items
    .map((item, i) => ({ item, i }))
    .filter(({ item, i }) => i !== index && item.name.trim().length > 0 && item.price.trim().length > 0)
    .map(({ item, i }) => {
      const otherPrice = parsePrice(item.price);
      const differentSection = item.category !== source.category;
      const distance =
        sourcePrice !== null && otherPrice !== null
          ? Math.abs(sourcePrice - otherPrice)
          : Number.MAX_SAFE_INTEGER;

      return {
        item,
        index: i,
        differentSection,
        distance,
        note: differentSection ? `From ${item.category}` : `Also in ${item.category}`,
      };
    });

  ranked.sort((a, b) => {
    if (a.differentSection !== b.differentSection) return a.differentSection ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.index - b.index;
  });

  // Two rows with the same name in the same section are the same dish twice;
  // showing it as its own recommendation is just noise.
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const entry of ranked) {
    const key = `${entry.item.category}\u0000${entry.item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ item: entry.item, index: entry.index, note: entry.note });
    if (out.length >= Math.max(0, Math.min(limit, 4))) break;
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Reading a photo's description — and refusing to make claims              */
/* -------------------------------------------------------------------------- */

/** What the vision route hands the studio. Nothing here is trusted yet. */
export interface DishReading {
  name: string;
  category: string;
  description: string;
  ingredients: string[];
  presentation: string;
}

/**
 * Words that turn menu copy into a promise this product can't keep.
 *
 * The prompt forbids them; this is what happens when a model ignores the
 * prompt anyway. The whole sentence goes, not just the word — "gluten-free"
 * with the "gluten-free" deleted still reads as a claim about the food.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\ballerg(en|y|ies)\b/i,
  /\bgluten[- ]?free\b/i,
  /\bnut[- ]?free\b/i,
  /\bdairy[- ]?free\b/i,
  /\blactose[- ]?free\b/i,
  /\bvegan\b/i,
  /\bvegetarian\b/i,
  /\bnon[- ]?vegetarian\b/i,
  /\bcontains?\s+(nuts?|dairy|gluten|egg|soy|seafood)\b/i,
  /\bhealthy\b/i,
  /\borganic\b/i,
  /\bprobiotic\b/i,
  /\bsugar[- ]?free\b/i,
  /\bhalal\b/i,
];

export function statesAClaim(value: string): boolean {
  return CLAIM_PATTERNS.some((pattern) => pattern.test(value));
}

/** Drop any sentence that reads as a dietary or allergen promise. */
export function scrubClaims(value: string): string {
  if (!value) return "";
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() && !statesAClaim(sentence))
    .join(" ")
    .trim();
}

/**
 * A price written into prose — `₹999`, `Rs 80`, `INR 250`, `80/-`.
 *
 * A row already has a price, and it is the one the café typed. Copy that
 * mentions a different number is worse than no copy at all: a customer reads
 * ₹999 in the description and the ₹80 on the line and trusts neither.
 */
const PRICE_PATTERNS: RegExp[] = [
  /[₹$€£]\s?\d/,
  /\b(?:rs\.?|inr)\s?\d/i,
  /\b\d[\d,]*\s?\/-/,
  /\b\d+\s?(?:rupees|dollars|euros)\b/i,
];

export function mentionsPrice(value: string): boolean {
  return PRICE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Copy that is safe to print: no claims, no prices.
 *
 * Whole sentences go, not words — a sentence with its number deleted still
 * reads as a statement about price or ingredients that nobody verified.
 */
export function scrubCopy(value: string): string {
  if (!value) return "";
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const trimmed = sentence.trim();
      if (!trimmed) return false;
      return !statesAClaim(trimmed) && !mentionsPrice(trimmed);
    })
    .join(" ")
    .trim();
}

/**
 * Validate a model's reading of a photo into something the studio can show.
 *
 * A reading with no name is not usable — the studio would have nothing to put
 * in the row — so it returns null and the caller reports a failure instead of
 * presenting an empty suggestion as if it were an answer.
 */
export function readDishReading(parsed: unknown): DishReading | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const row = parsed as Record<string, unknown>;

  const name = text(row.name, MAX_ITEM_NAME);
  if (!name) return null;

  const ingredients = Array.isArray(row.ingredients)
    ? row.ingredients
        .map((entry) => text(entry, DISH_LIMITS.ingredient))
        .filter((entry) => entry && !statesAClaim(entry))
        .filter(
          (entry, index, all) =>
            all.findIndex((other) => other.toLowerCase() === entry.toLowerCase()) === index,
        )
        .slice(0, DISH_LIMITS.ingredients)
    : [];

  return {
    name,
    category: text(row.category, MAX_CATEGORY) || "Menu",
    description: scrubCopy(text(row.description, DISH_LIMITS.description)),
    ingredients,
    presentation: scrubCopy(text(row.presentation, 120)),
  };
}
