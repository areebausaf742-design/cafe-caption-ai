/**
 * The three Gemini model ids this app will ever call — one place, so a retired
 * id is one env change rather than a hunt through every route.
 *
 * The defaults are the current stable Flash generation as documented by Google:
 * `gemini-2.5-flash` (primary), `gemini-2.5-flash-lite` (cheaper fallback when
 * the primary is overloaded) and `gemini-2.5-pro` (last resort, only reached
 * when every configured model answers "model not found").
 *
 * ⚠️ Model ids are a moving target. Check them against the live list before a
 * launch, and any time the studio starts reporting a model error:
 *
 *     curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
 *
 * Then set GEMINI_MODEL / GEMINI_FALLBACK_MODEL / GEMINI_LAST_RESORT_MODEL to
 * ids that list actually contains. Unknown ids fail closed: the route reports
 * "no usable model", never a silent empty answer.
 */
import "server-only";

import type { GenerationConfig } from "@google/generative-ai";

export const GEMINI_PRIMARY_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-2.5-flash-lite";

export const GEMINI_LAST_RESORT_MODEL =
  process.env.GEMINI_LAST_RESORT_MODEL?.trim() || "gemini-2.5-pro";

/**
 * 2.5-family models spend part of the output budget on *thinking* tokens unless
 * they are told not to, which is how a JSON answer ends up truncated. Older
 * families reject the field, so it is only added where it belongs.
 */
export function thinkingConfigFor(model: string): Partial<GenerationConfig> {
  if (!model.includes("2.5")) return {};
  // This SDK version doesn't type `thinkingConfig`, but it forwards the
  // generation config object to the REST API untouched.
  return { thinkingConfig: { thinkingBudget: 0 } } as Partial<GenerationConfig>;
}
