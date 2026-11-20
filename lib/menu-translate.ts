/**
 * Reading a menu in someone else's language.
 *
 * A published menu carries its printed name for every line, and — when the café
 * published after this feature existed — a Hindi and a Hinglish overlay for the
 * same line. This module is the whole of that model: no React, no network, no
 * Gemini. The API route in `app/api/translate/route.ts` does the calling; these
 * are the pure parts, which is why they can be tested.
 *
 * The rule that matters most: **prices are never translated, and never sent to
 * be translated.** `translatableLines()` is the only thing that gets serialised
 * into a request, and it has no price field to leak.
 */

import { MAX_CATEGORY, MAX_ITEM_NAME } from "@/lib/menu";
import {
  TRANSLATION_LANGUAGES,
  type MenuItem,
  type MenuTranslations,
  type TranslationLanguage,
} from "@/lib/types";

/** What a customer can pick from, in the order the switcher shows it. */
export type MenuLanguage = "en" | TranslationLanguage;

export interface MenuLanguageMeta {
  id: MenuLanguage;
  /** English label, for `aria-label` and analytics. */
  label: string;
  /** How it's written in that language — what the pill says. */
  native: string;
  /** BCP-47 tag, so a screen reader pronounces it properly. */
  tag: string;
}

export const MENU_LANGUAGES: readonly MenuLanguageMeta[] = [
  { id: "en", label: "English", native: "English", tag: "en" },
  { id: "hi", label: "Hindi", native: "हिंदी", tag: "hi" },
  { id: "hinglish", label: "Hinglish", native: "Hinglish", tag: "hi-Latn" },
];

export function languageMeta(id: MenuLanguage): MenuLanguageMeta {
  return MENU_LANGUAGES.find((language) => language.id === id) ?? MENU_LANGUAGES[0];
}

/** One line of a translation, as the model returns it. */
export interface TranslatedLine {
  category: string;
  name: string;
}

export type TranslationPayload = Partial<
  Record<TranslationLanguage, TranslatedLine[]>
>;

/** Trim, collapse whitespace and cap, exactly like the stored limits. */
function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/* -------------------------------------------------------------------------- */
/*  What goes to the translator                                               */
/* -------------------------------------------------------------------------- */

/**
 * The only shape that leaves the browser for translation: section and item
 * names, in order. There is no `price` key, so no code path can send one.
 */
export function translatableLines(items: MenuItem[]): TranslatedLine[] {
  return items.map((item) => ({ category: item.category, name: item.name }));
}

/* -------------------------------------------------------------------------- */
/*  What comes back                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Attach translations to the rows they belong to.
 *
 * `indices` is what the translator actually saw: the original position of every
 * row it was given, because blank rows are never sent. Stitching by position
 * instead would shift every name one place the moment a café leaves a row empty.
 *
 * Deliberately forgiving in the other direction too: a language whose list
 * doesn't line up with those indices is dropped whole (rather than silently
 * putting "Cappuccino" beside a price of ₹80), and a row whose translated name
 * is empty keeps the printed name. The price object is never touched — it's the
 * same string, from the same item.
 */
export function stitchTranslations(
  items: MenuItem[],
  payload: TranslationPayload | null | undefined,
  indices?: number[] | null,
): MenuItem[] {
  if (!payload) return items;

  /**
   * Where to read a row's translation from, for one language. `null` means this
   * language can't be trusted at all.
   */
  const mappingFor = (lines: unknown): Map<number, number> | null => {
    if (!Array.isArray(lines)) return null;

    // Indexed payload: the server told us exactly which row each line belongs
    // to, which is the case whenever blank rows were skipped.
    if (indices && indices.length === lines.length) {
      const map = new Map<number, number>();
      indices.forEach((original, position) => {
        if (Number.isInteger(original) && original >= 0 && original < items.length) {
          map.set(original, position);
        }
      });
      return map.size === lines.length ? map : null;
    }

    // Legacy positional payload: only safe when nothing was skipped.
    if (!indices && lines.length === items.length) {
      const map = new Map<number, number>();
      for (let index = 0; index < items.length; index += 1) map.set(index, index);
      return map;
    }

    return null;
  };

  const mappings = new Map<TranslationLanguage, Map<number, number>>();
  for (const language of TRANSLATION_LANGUAGES) {
    const mapping = mappingFor(payload[language]);
    if (mapping) mappings.set(language, mapping);
  }

  if (mappings.size === 0) return items;

  return items.map((item, index) => {
    const translations: MenuTranslations = {};

    for (const language of TRANSLATION_LANGUAGES) {
      const mapping = mappings.get(language);
      const lines = payload[language];
      if (!mapping || !Array.isArray(lines)) continue;

      const position = mapping.get(index);
      if (position === undefined) continue;

      const line = lines[position];
      const name = clean(line?.name, MAX_ITEM_NAME);
      if (!name) continue;

      translations[language] = {
        category: clean(line?.category, MAX_CATEGORY) || item.category,
        name,
      };
    }

    if (Object.keys(translations).length === 0) return item;
    return { ...item, translations };
  });
}

/** How many rows ended up with at least one translated name. */
export function translatedRowCount(items: MenuItem[]): number {
  return items.filter((item) => Object.keys(item.translations ?? {}).length > 0).length;
}

/* -------------------------------------------------------------------------- */
/*  What the customer sees                                                    */
/* -------------------------------------------------------------------------- */

export function hasTranslation(item: MenuItem, language: MenuLanguage): boolean {
  if (language === "en") return true;
  return Boolean(item.translations?.[language]?.name);
}

/** English first, then whichever languages at least one row can be read in. */
export function availableLanguages(items: MenuItem[]): MenuLanguage[] {
  return MENU_LANGUAGES.filter(
    (language) =>
      language.id === "en" ||
      items.some((item) => hasTranslation(item, language.id)),
  ).map((language) => language.id);
}

export function hasAnyTranslation(items: MenuItem[]): boolean {
  return availableLanguages(items).length > 1;
}

/**
 * The menu as it should read in `language`.
 *
 * Prices, translations and order are untouched — only the two display strings
 * change, and only for rows that actually have that language. A row without one
 * stays in the printed language, which is why a half-translated menu is still a
 * coherent menu rather than a mix of blanks.
 */
export function localizeItems(
  items: MenuItem[],
  language: MenuLanguage,
): MenuItem[] {
  if (language === "en") return items;

  return items.map((item) => {
    const translation = item.translations?.[language];
    if (!translation?.name) return item;

    return {
      ...item,
      category: translation.category || item.category,
      name: translation.name,
    };
  });
}

/**
 * Drop overlays whose English no longer exists.
 *
 * A translation is written *for* a printed name. Rename "Cold Coffee" to "Iced
 * Latte" and the Hindi we stored describes a drink that is no longer on the
 * menu — so the row falls back to English until it's translated again. Prices
 * are irrelevant here: changing ₹180 to ₹200 keeps every translation, because
 * the name didn't move.
 */
export function pruneStaleTranslations(
  items: MenuItem[],
  previous: MenuItem[],
): MenuItem[] {
  if (items.length === 0) return items;

  const keys = new Set(
    previous.map((item) => `${item.category}\u0000${item.name}`),
  );

  let changed = false;
  const next = items.map((item) => {
    if (!item.translations) return item;
    if (keys.has(`${item.category}\u0000${item.name}`)) return item;

    changed = true;
    // Rebuilt rather than spread, so the dropped key can't survive as
    // `translations: undefined`.
    return { category: item.category, name: item.name, price: item.price };
  });

  return changed ? next : items;
}

/** Rows that can't be read in this language yet — what the editor counts. */
export function missingTranslations(
  items: MenuItem[],
  language: MenuLanguage,
): number {
  return items.length - coverage(items, language);
}

/** `3 of 12` — how much of this menu can be read in that language. */
export function coverage(items: MenuItem[], language: MenuLanguage): number {
  if (language === "en") return items.length;
  return items.filter((item) => hasTranslation(item, language)).length;
}
