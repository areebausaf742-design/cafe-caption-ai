/**
 * Shared types for CafeCaption AI.
 * Imported by both the client UI (app/page.tsx) and the API route,
 * so the request/response contract stays in sync.
 */

export type Tone = "cozy" | "aesthetic" | "playful" | "promo";

export interface Caption {
  /** The Instagram caption, ready to paste. */
  caption: string;
  /** Five hashtags, each already prefixed with "#". */
  hashtags: string[];
}

export interface GenerateRequest {
  description: string;
  tone?: Tone;
}

export interface GenerateResponse {
  captions: Caption[];
  meta: {
    model: string;
    tone: Tone;
  };
}

export interface ApiError {
  error: string;
  /** Machine-readable code: VALIDATION_ERROR, MISSING_API_KEY, RATE_LIMITED, … */
  code: string;
  hint?: string;
}

export const TONES: { id: Tone; label: string; emoji: string; blurb: string }[] = [
  { id: "cozy", label: "Cozy", emoji: "☕", blurb: "Warm and welcoming" },
  { id: "aesthetic", label: "Aesthetic", emoji: "🌿", blurb: "Soft, editorial, minimal" },
  { id: "playful", label: "Playful", emoji: "✨", blurb: "Fun and a little cheeky" },
  { id: "promo", label: "Promo", emoji: "🔥", blurb: "Drives visits and orders" },
];

/** Quick-start examples shown under the textarea. */
export const EXAMPLES: string[] = [
  "Iced latte with a croissant on a wooden table",
  "Freshly baked cinnamon rolls, morning light",
  "Matcha latte and a book in a quiet corner",
  "New cold brew launch, 20% off this weekend",
];

export const MAX_DESCRIPTION_LENGTH = 400;
