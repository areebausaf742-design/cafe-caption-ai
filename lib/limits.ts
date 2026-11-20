/**
 * Every length the menu contract enforces, in one file — because "the same"
 * limit written twice is two limits waiting to disagree.
 *
 * These are the *stored* ceilings. OCR output, the publish route, the editor
 * and the SQL checks in `supabase/schema.sql` all read from here (the SQL is a
 * transcription, checked by hand — it is the one place that can't import).
 *
 * Dependency-free on purpose: importable from a server route, a client
 * component and a test without dragging anything else in.
 */

/** Rows a menu can hold. 120 × three languages is already a large document. */
export const MAX_ITEMS = 120;
/** Café name printed at the top of a menu and in metadata. */
export const MAX_CAFE_NAME = 80;
/** One line under the café name, e.g. "Since 2019 · Hazratganj". */
export const MAX_TAGLINE = 90;
/** Section heading, e.g. "Beverages". */
export const MAX_CATEGORY = 40;
/** Dish or drink name. */
export const MAX_ITEM_NAME = 80;
/**
 * Price *as printed*, with its symbol ("₹180", "₹1,200 (large)"). 24 characters
 * is the OCR ceiling too, so a long "₹1,200 / ₹1,500" line survives the trip.
 */
export const MAX_PRICE = 24;
/** City, used for local SEO copy. */
export const MAX_CITY = 40;

/** Description under a dish. */
export const MAX_DESCRIPTION = 320;
/** Visible ingredients per dish. */
export const MAX_INGREDIENTS = 8;
/** Characters per ingredient. */
export const MAX_INGREDIENT = 40;
