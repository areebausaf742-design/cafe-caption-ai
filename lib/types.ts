/**
 * Shared types & options for CafeCaption AI.
 * Imported by both the client UI (app/page.tsx) and the API route,
 * so the request/response contract stays in sync.
 */

export type Tone = "cozy" | "aesthetic" | "playful" | "promo";

/** Language the captions are written in. */
export type Language = "english" | "hinglish";

export interface Caption {
  /** The Instagram caption, ready to paste. */
  caption: string;
  /** Up to five hashtags, each already prefixed with "#". */
  hashtags: string[];
}

/** Which studio tool a request or response belongs to. */
export type StudioTool = "captions" | "review_reply" | "google_post" | "digital_menu";

/** Google review star rating, 1–5. */
export type StarRating = 1 | 2 | 3 | 4 | 5;

/** One reply option for a Google review. */
export interface ReviewReply {
  /** Strategy name, e.g. "Apologetic & Solution-Oriented". */
  label: string;
  /** The reply exactly as it should be published. */
  text: string;
}

/** A Google Business Profile post, ready to paste. */
export interface GooglePost {
  /** Post subtitle, ≤ 60 characters. */
  heading: string;
  /** 100–150 word body, ending with the call to action. */
  body: string;
  /** That final call-to-action line on its own. */
  callToAction: string;
  /** Local-intent phrases the model actually used (2–4). */
  keywords: string[];
  /** Body length, for the "x / 1500" meter. */
  characters: number;
}

/**
 * The languages a menu can be read in *besides* the one it was printed in.
 *
 * English is never listed: the printed name is the original, and every other
 * language is an overlay on it. Keeping the original as the base means a menu
 * with lost or failed translations still reads correctly.
 */
export const TRANSLATION_LANGUAGES = ["hi", "hinglish"] as const;

export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

/** One line, translated. Prices are never part of this — they don't translate. */
export interface MenuTranslation {
  category: string;
  name: string;
}

export type MenuTranslations = Partial<
  Record<TranslationLanguage, MenuTranslation>
>;

/**
 * What a dish is, beyond its price.
 *
 * `ingredients` are the things a person can *see* in the photo — a curry leaf,
 * a swirl of cream, a charred edge. They are a description of the picture, not
 * a recipe and not a dietary claim: allergens are never asserted here, because
 * being wrong about one is not a copywriting problem.
 */
export interface DishDetails {
  /** One or two sentences of menu copy, in the menu's printed language. */
  description: string;
  /** Visible ingredients only, in reading order, deduplicated. */
  ingredients: string[];
  /** Who wrote this: an AI pass the owner approved, or the owner directly. */
  source: "ai" | "owner";
}

/**
 * A real 3D asset the viewer streams: a GLB (or glTF) file with actual geometry.
 *
 * It comes from one of two places — the app's own photo → mesh pipeline (an open
 * TripoSR-class model on a free shared GPU, stored in R2) or, for operators
 * only, a file supplied directly. Never an image plane, never a fake: when a
 * dish has no model the menu simply doesn't offer a 3D view for it.
 */
export interface DishModel {
  /** https URL to a `.glb` / `.gltf` file. */
  glb: string;
  /** Optional still frame, shown while loading and when WebGL is unavailable. */
  poster?: string;
  /** Short credit line, e.g. "trellis" — shown in the studio, never invented. */
  by?: string;
}

/** One line of a digitised menu. */
export interface MenuItem {
  /** Section it sits under, e.g. "Beverages" or "Sandwiches". */
  category: string;
  /** The dish or drink exactly as printed. */
  name: string;
  /** Price as printed, with its currency symbol ("₹180"). */
  price: string;
  /**
   * Optional Hindi and Hinglish names for this line, written once at publish
   * time. Absent on old menus, on menus translated before a row was renamed,
   * and on any row the model declined to translate — the card falls back to the
   * printed name, so a missing translation is never a broken menu.
   */
  translations?: MenuTranslations;
  /** Optional description and visible ingredients. Never touches the price. */
  dish?: DishDetails;
  /** Optional real 3D model. Absent unless someone supplied a GLB. */
  model?: DishModel;
}

/** A menu read off a photo, ready to render. */
export interface DigitalMenu {
  /** Every item, in reading order, categories kept together. */
  items: MenuItem[];
  /** Unique category names in the order they appeared. */
  categories: string[];
  /** Distinct category count, for the summary line. */
  categoryCount: number;
}

/**
 * A photo, already downscaled and JPEG-compressed in the browser.
 * `data` is raw base64 with no `data:` prefix — exactly what Gemini's
 * `inlineData` part expects.
 */
export interface GenerateImage {
  mimeType: string;
  data: string;
}

export interface GenerateRequest {
  /** Which tool to run. Defaults to `captions`. */
  type?: StudioTool;
  /**
   * `captions`: what the photo shows. Required for text-only requests; optional
   * (used as extra context) when a photo is attached.
   */
  description?: string;
  tone?: Tone;
  /** Optional: the café's name, woven in naturally. */
  cafeName?: string;
  /** Optional: city, used for local flavour / local hashtags / local SEO. */
  city?: string;
  /** Optional: output language. Defaults to English. */
  language?: Language;
  /**
   * `captions`: the photo to describe. `digital_menu`: required — the photo of
   * the printed menu. Other tools ignore it.
   */
  image?: GenerateImage;
  /** `review_reply` only: the customer's review, pasted in full. */
  review?: string;
  /** `review_reply` only: the star rating the reviewer gave. */
  rating?: StarRating;
  /** `review_reply` only: a private channel offered to unhappy reviewers. */
  contact?: string;
  /** `google_post` only: what the post is about. */
  topic?: string;
}

/** Fields every response carries. */
export interface ResponseMeta {
  model: string;
  tone: Tone;
  language: Language;
  tool: StudioTool;
  /** `captions` only: true when an uploaded photo drove the captions. */
  hasImage?: boolean;
}

/**
 * The response is a discriminated union on `tool`, so the client can't read
 * `replies` off a captions response — the type system enforces the contract.
 */
export type GenerateResponse =
  | { tool: "captions"; captions: Caption[]; meta: ResponseMeta }
  | { tool: "review_reply"; replies: ReviewReply[]; meta: ResponseMeta }
  | { tool: "google_post"; post: GooglePost; meta: ResponseMeta }
  | { tool: "digital_menu"; menu: DigitalMenu; meta: ResponseMeta };

export interface ApiError {
  error: string;
  /** Machine-readable code: VALIDATION_ERROR, MISSING_API_KEY, RATE_LIMITED, … */
  code: string;
  hint?: string;
  /** Seconds until the client may retry (429 responses). */
  retryAfter?: number;
  /**
   * Short, non-sensitive machine tag for why generation failed
   * (`upstream_503`, `empty_output`, `invalid_json`, …). Logged server-side and
   * shown in development so a failure is never a mystery.
   */
  reason?: string;
}

export const TONES: { id: Tone; label: string; blurb: string }[] = [
  { id: "cozy", label: "Cozy", blurb: "Warm, welcoming" },
  { id: "aesthetic", label: "Editorial", blurb: "Soft, minimal" },
  { id: "playful", label: "Playful", blurb: "Light, cheeky" },
  { id: "promo", label: "Promotional", blurb: "Drives visits" },
];

export const LANGUAGES: {
  id: Language;
  label: string;
  blurb: string;
}[] = [
  { id: "english", label: "English", blurb: "Global audience" },
  { id: "hinglish", label: "Hinglish", blurb: "Hindi + English mix" },
];

/**
 * Quick-start examples shown under the textarea.
 * `label` keeps the chip tidy; `text` is what gets sent to the model.
 */
export const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Iced latte & croissant",
    text: "Iced latte with a croissant on a wooden table",
  },
  {
    label: "Cinnamon rolls",
    text: "Freshly baked cinnamon rolls, morning light",
  },
  {
    label: "Matcha & a book",
    text: "Matcha latte and a book in a quiet corner",
  },
  {
    label: "Cold brew launch",
    text: "New cold brew launch, 20% off this weekend",
  },
];

export const MAX_DESCRIPTION_LENGTH = 400;
export const MAX_CAFE_NAME_LENGTH = 60;
export const MAX_CITY_LENGTH = 40;

/* -------------------------------------------------------------------------- */
/*  Photo upload limits                                                       */
/* -------------------------------------------------------------------------- */

/** Largest file the browser will accept before compression (5 MB). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Base64 payload ceiling the API accepts, in characters (~1.5 MB of JPEG). */
export const MAX_IMAGE_BASE64_LENGTH = 2_100_000;

/* -------------------------------------------------------------------------- */
/*  Google Local SEO limits                                                   */
/* -------------------------------------------------------------------------- */

/** Longest review we will process (Google's own reviews are capped well below). */
export const MAX_REVIEW_LENGTH = 1_500;
/** Shorter than this and there is nothing to reply to. */
export const MIN_REVIEW_LENGTH = 10;

/** Longest "what is this post about" brief. */
export const MAX_TOPIC_LENGTH = 200;
export const MIN_TOPIC_LENGTH = 4;

/** Google's hard limit for a Business Profile post. */
export const GOOGLE_POST_MAX_CHARS = 1_500;

/** Human labels for the star selector. */
export const RATING_LABELS: Record<StarRating, string> = {
  1: "1 star · very unhappy",
  2: "2 stars · unhappy",
  3: "3 stars · mixed",
  4: "4 stars · happy",
  5: "5 stars · delighted",
};

/* -------------------------------------------------------------------------- */
/*  Digital menu limits                                                       */
/* -------------------------------------------------------------------------- */

/** Fewer than this from a menu photo means the model didn't really read it. */
export const MIN_MENU_ITEMS = 3;
/** Beyond this a "menu" is probably a price list the length of a book. */
export const MAX_MENU_ITEMS = 200;
export const MAX_MENU_ITEM_NAME = 80;
export const MAX_MENU_PRICE = 24;
export const MAX_MENU_CATEGORY = 40;

/** Image types Gemini can read. Anything else is a 415. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

