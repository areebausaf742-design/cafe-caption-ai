/**
 * Menu translation — Hindi and Hinglish, once, at publish time.
 *
 * Why at publish rather than per view:
 *
 *  - A QR scan has to feel instant. If the page called Gemini when it loaded,
 *    every customer would wait seconds, and every scan would cost money.
 *  - A café's menu changes rarely. Translating it once and storing the result
 *    with the items means the switcher is instant, works offline-ish, and costs
 *    one call per publish instead of one per table.
 *  - Prices are the thing that must never drift, so **prices are never sent**.
 *    The request body is `{category, name}` and nothing else — see
 *    `translatableLines()` in `lib/menu-translate.ts`.
 *
 * The route is deliberately independent of publishing: `POST /api/menus` stays
 * free of AI, so a model outage can never stop a café putting its menu live.
 * The studio calls this first, then publishes whatever came back.
 */
import "server-only";

import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from "@google/generative-ai";

import { MAX_CATEGORY, MAX_ITEM_NAME, MAX_ITEMS } from "@/lib/menu";
import type { TranslationPayload, TranslatedLine } from "@/lib/menu-translate";
import { peekRateLimit, rateLimit, withRateHeaders, type RateLimitResult } from "@/lib/rate-limit";
import { TRANSLATION_LANGUAGES, type TranslationLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Two chunks of 40 can run in parallel; three lanes would push the 60s cap. */
export const maxDuration = 60;

const apiKey = process.env.GEMINI_API_KEY;

/** Same ladder as the studio, so there is one set of model guesses, not two. */
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.5-flash-lite";

/** Names only, so a 120-line menu is a small body. */
const MAX_BODY_BYTES = 32_000;

/** Rows per model call. Keeps each response short enough to never truncate. */
const CHUNK_SIZE = 40;

/** A translate is a smaller job than a menu photo, but not free. */
const LIMIT = { namespace: "menu-translate", max: 6, windowMs: 10 * 60 * 1000 };

const CHUNK_TIMEOUT_MS = 20_000;

const SYSTEM = `You translate café menus for customers in India. You are given a JSON array of menu lines: objects with "category" (the section heading printed on the menu) and "name" (the dish or drink as printed).

Return the same array — same length, same order — in two forms:

- "hi": natural Hindi, written in Devanagari. Translate the dish, not the brand: the café's own name and any proper noun stay as they are. Keep it short, the way a menu board is short.
- "hinglish": the same Hindi in Roman letters, written the way Indian cafés write on their boards — everyday English words stay in English ("Cold Coffee", "Paneer Tikka"), and Hindi words are spelled the way people type them ("Adrak Chai", "Bun Maska").

Hard rules:
1. Never add, drop, merge, split or reorder a line. Line 4 in, line 4 out.
2. Never invent a dish. If a name is unclear or already brand-like, repeat it unchanged rather than guessing.
3. If a name is already how people say it in Hinglish — many are — return it unchanged. Do not invent a variant to look busy.
4. No prices, no currency, no numbers that aren't part of a name. Prices are not part of this task.
5. Section headings get the same treatment as names: "Beverages" → "पेय" → "Beverages".
6. Reply with JSON only. No markdown, no commentary.`;

const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    hi: {
      type: SchemaType.ARRAY,
      description: "One entry per input line, in the same order, in Devanagari.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING },
          name: { type: SchemaType.STRING },
        },
        required: ["category", "name"],
      },
    },
    hinglish: {
      type: SchemaType.ARRAY,
      description: "One entry per input line, in the same order, in Roman letters.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING },
          name: { type: SchemaType.STRING },
        },
        required: ["category", "name"],
      },
    },
  },
  required: ["hi", "hinglish"],
};

interface CleanLine {
  category: string;
  name: string;
}

/** Same cleaning as everywhere else: strip control characters, collapse, cap. */
function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function fail(
  status: number,
  error: string,
  code: string,
  extra?: { rate?: RateLimitResult; retryAfter?: number; hint?: string },
) {
  const response = NextResponse.json(
    {
      error,
      code,
      ...(extra?.hint ? { hint: extra.hint } : {}),
      ...(extra?.retryAfter ? { retryAfter: extra.retryAfter } : {}),
    },
    { status },
  );
  if (extra?.retryAfter) {
    response.headers.set("Retry-After", String(extra.retryAfter));
  }
  return extra?.rate ? withRateHeaders(response, extra.rate) : response;
}

/** Pull JSON out of a model reply, tolerating fences or a stray sentence. */
function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model reply contained no JSON object.");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/**
 * Translate one chunk, with one retry on the fallback model.
 *
 * Returns lines aligned to the input. A short or long array is a failure, not
 * something to patch up: a shifted array would put the wrong Hindi beside a
 * price, which is worse than showing English.
 */
async function translateChunk(
  lines: CleanLine[],
  key: string,
): Promise<{ lines: Record<TranslationLanguage, TranslatedLine[]>; model: string }> {
  const client = new GoogleGenerativeAI(key);

  for (const model of [MODEL, FALLBACK_MODEL]) {
    try {
      const generativeModel = client.getGenerativeModel({
        model,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      });

      const response = await Promise.race([
        generativeModel.generateContent(
          `${SYSTEM}\n\nMenu lines to translate:\n${JSON.stringify(lines)}`,
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`timeout after ${CHUNK_TIMEOUT_MS}ms`)),
            CHUNK_TIMEOUT_MS,
          ),
        ),
      ]);

      const parsed = extractJson(response.response.text()) as Record<
        string,
        unknown
      >;

      // Each language stands or falls on its own. A model that fumbles the
      // Roman-script pass shouldn't cost the café the Hindi it did get right —
      // the caller drops a language that isn't whole, and English covers the
      // rest.
      const out = {} as Record<TranslationLanguage, TranslatedLine[]>;
      const broken: string[] = [];

      for (const language of TRANSLATION_LANGUAGES) {
        const list = parsed?.[language];
        if (!Array.isArray(list) || list.length !== lines.length) {
          broken.push(`${language} (${Array.isArray(list) ? list.length : 0} of ${lines.length})`);
          continue;
        }

        out[language] = list.map((entry, index) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          const name = clean(row.name, MAX_ITEM_NAME);
          return {
            // A missing heading isn't worth losing a translation over.
            category: clean(row.category, MAX_CATEGORY) || lines[index].category,
            name: name || lines[index].name,
          };
        });
      }

      if (Object.keys(out).length === 0) {
        throw new Error(`no usable language: ${broken.join(", ")}`);
      }
      if (broken.length > 0) {
        console.warn(`[translate] ${model} returned nothing usable for ${broken.join(", ")}`);
      }

      return { lines: out, model };
    } catch (error) {
      // Log the shape of the failure, never the menu itself.
      console.warn(
        `[translate] ${model} failed: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`,
      );
    }
  }

  throw new Error("Every model attempt failed.");
}

export async function POST(request: Request) {
  const rate = await rateLimit(request, LIMIT);

  if (!rate.allowed) {
    return fail(
      429,
      "That's a lot of translating. Try again in a few minutes.",
      "RATE_LIMITED",
      { rate, retryAfter: rate.retryAfter },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail(413, "That menu is too long to translate in one go.", "REQUEST_TOO_LARGE", {
      rate,
    });
  }

  if (!apiKey) {
    return fail(
      503,
      "Translation isn't switched on yet.",
      "GENERATION_DISABLED",
      { rate, hint: "GEMINI_API_KEY is missing. Publish in English for now." },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Nothing to translate.", "VALIDATION_ERROR", { rate });
  }

  const rawItems = (body as { items?: unknown })?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return fail(400, "Nothing to translate.", "VALIDATION_ERROR", { rate });
  }
  if (rawItems.length > MAX_ITEMS) {
    return fail(
      400,
      `A menu holds up to ${MAX_ITEMS} items — that's more than a menu.`,
      "VALIDATION_ERROR",
      { rate },
    );
  }

  // Only these two fields survive: a price sent by a stale client is dropped
  // here as well as never being built in the studio.
  const lines: CleanLine[] = [];
  for (const entry of rawItems) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const name = clean(row.name, MAX_ITEM_NAME);
    if (!name) continue;
    lines.push({ category: clean(row.category, MAX_CATEGORY) || "Menu", name });
  }

  if (lines.length === 0) {
    return fail(400, "Nothing to translate.", "VALIDATION_ERROR", { rate });
  }

  const chunks: CleanLine[][] = [];
  for (let index = 0; index < lines.length; index += CHUNK_SIZE) {
    chunks.push(lines.slice(index, index + CHUNK_SIZE));
  }

  try {
    const started = Date.now();
    const results = await Promise.all(chunks.map((chunk) => translateChunk(chunk, apiKey)));

    // A language survives only if every chunk produced it — a half-filled
    // array would shift names against prices, which is exactly what this whole
    // module exists to prevent.
    const translations: TranslationPayload = {};
    for (const language of TRANSLATION_LANGUAGES) {
      const parts = results.map((result) => result.lines[language]);
      if (parts.every((part) => Array.isArray(part) && part.length > 0)) {
        translations[language] = parts.flat();
      }
    }

    if (Object.keys(translations).length === 0) {
      throw new Error("No language survived every chunk.");
    }

    console.info(
      `[translate] ${lines.length} lines in ${chunks.length} chunk(s) in ${Date.now() - started}ms via ${results[0]?.model}`,
    );

    return withRateHeaders(
      NextResponse.json(
        {
          ok: true,
          translations,
          meta: {
            model: results[0]?.model ?? MODEL,
            items: lines.length,
            languages: TRANSLATION_LANGUAGES,
          },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      ),
      rate,
    );
  } catch (error) {
    console.error(`[translate] failed: ${error instanceof Error ? error.message : "unknown"}`);
    // The studio publishes in English when it sees this — a translator outage
    // must never stop a café going live.
    return fail(
      502,
      "The translation service didn't answer. You can still publish in English.",
      "TRANSLATION_FAILED",
      { rate },
    );
  }
}

/** A GET is a mistake, but it shouldn't look like a broken menu. */
export async function GET(request: Request) {
  const rate = await peekRateLimit(request, LIMIT);
  return fail(405, "Translate with a POST.", "METHOD_NOT_ALLOWED", { rate });
}
