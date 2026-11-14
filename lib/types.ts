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

export interface GenerateRequest {
  description: string;
  tone?: Tone;
  /** Optional: the café's name, woven in naturally. */
  cafeName?: string;
  /** Optional: city, used for local flavour / local hashtags. */
  city?: string;
  /** Optional: caption language. Defaults to English. */
  language?: Language;
}

export interface GenerateResponse {
  captions: Caption[];
  meta: {
    model: string;
    tone: Tone;
    language: Language;
  };
}

export interface ApiError {
  error: string;
  /** Machine-readable code: VALIDATION_ERROR, MISSING_API_KEY, RATE_LIMITED, … */
  code: string;
  hint?: string;
  /** Seconds until the client may retry (429 responses). */
  retryAfter?: number;
}

export const TONES: { id: Tone; label: string; emoji: string; blurb: string }[] = [
  { id: "cozy", label: "Cozy", emoji: "☕", blurb: "Warm and welcoming" },
  { id: "aesthetic", label: "Aesthetic", emoji: "🌿", blurb: "Soft, editorial, minimal" },
  { id: "playful", label: "Playful", emoji: "✨", blurb: "Fun and a little cheeky" },
  { id: "promo", label: "Promo", emoji: "🔥", blurb: "Drives visits and orders" },
];

export const LANGUAGES: {
  id: Language;
  label: string;
  blurb: string;
}[] = [
  { id: "english", label: "English", blurb: "Global audience" },
  { id: "hinglish", label: "Hinglish", blurb: "Hindi + English mix" },
];

/** Quick-start examples shown under the textarea. */
export const EXAMPLES: string[] = [
  "Iced latte with a croissant on a wooden table",
  "Freshly baked cinnamon rolls, morning light",
  "Matcha latte and a book in a quiet corner",
  "New cold brew launch, 20% off this weekend",
];

export const MAX_DESCRIPTION_LENGTH = 400;
export const MAX_CAFE_NAME_LENGTH = 60;
export const MAX_CITY_LENGTH = 40;
