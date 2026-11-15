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
  /**
   * What the photo shows. Required for text-only requests; optional (used as
   * extra context) when a photo is attached.
   */
  description?: string;
  tone?: Tone;
  /** Optional: the café's name, woven in naturally. */
  cafeName?: string;
  /** Optional: city, used for local flavour / local hashtags. */
  city?: string;
  /** Optional: caption language. Defaults to English. */
  language?: Language;
  /** Optional: the photo to describe. At least one of this or `description`. */
  image?: GenerateImage;
}

export interface GenerateResponse {
  captions: Caption[];
  meta: {
    model: string;
    tone: Tone;
    language: Language;
    /** True when the captions were written from an uploaded photo. */
    hasImage: boolean;
  };
}

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

/** Image types Gemini can read. Anything else is a 415. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

