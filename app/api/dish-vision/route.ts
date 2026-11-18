/**
 * Dish vision — read a food photo, describe it, and stop there.
 *
 * What this route is allowed to do:
 *   - name what the photo shows, in the café's own vocabulary,
 *   - list what a person can *see* on the plate,
 *   - suggest a section and write two sentences of menu copy.
 *
 * What it is forbidden to do, in the prompt and in the schema:
 *   - state an allergen, a dietary claim, or a "healthy" claim as fact. A photo
 *     cannot prove a dish is nut-free, and a menu that says so is a liability
 *     rather than a feature. The copy may only describe what is visible, and
 *     anything uncertain is left out instead of guessed.
 *   - say a price. Prices are the café's, they never travel to a model, and
 *     they certainly never come back from one.
 *
 * No 3D happens here. Geometry is supplied by the owner (see `lib/dish.ts`),
 * because every hosted image-to-3D API costs money and this product doesn't.
 */
import "server-only";

import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from "@google/generative-ai";

import { readDishReading } from "@/lib/dish";
import { rateLimit, withRateHeaders, type RateLimitResult } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One photo, one pass, two attempts — well inside the platform limit. */
export const maxDuration = 45;

const apiKey = process.env.GEMINI_API_KEY;

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.5-flash-lite";

/** A dish photo is small after the browser downscales it; this is a guard. */
const MAX_BODY_BYTES = 4_000_000;

/** Reading a photo is a real model call, so it's metered like one. */
const LIMIT = { namespace: "dish-vision", max: 8, windowMs: 10 * 60 * 1000 };

const TIMEOUT_MS = 25_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const SYSTEM = `You look at a single photograph of one dish or drink from an Indian café, and help the owner describe it on their menu.

Return JSON only.

Rules, in order of importance:

1. ONLY what you can see. "Visible ingredients" means things a person could point at in this photograph — a swirl of cream, a curry leaf, a charred edge, a slice of lime. Never infer a recipe from the dish's name, and never list something you are assuming is in it.
2. Never make a dietary or allergen claim. Do not write "gluten-free", "nut-free", "vegan", "contains dairy", "healthy", "organic" or anything like it, even if you think it is obvious. The owner knows what is in the kitchen; a photograph does not.
3. If you cannot identify the dish with confidence, give it a plain descriptive name ("Grilled sandwich with mint chutney") rather than guessing at a specific restaurant dish.
4. The description is menu copy: two short sentences, sensory, concrete, no exclamation marks, no "delicious", no marketing adjectives stacked on each other. Describe what is on the plate, not how the customer will feel.
5. No prices, no currency, no numbers that aren't part of a name.
6. The section is the menu heading it would sit under: Beverages, Starters, Sandwiches, Mains, Rice & Bowls, Desserts — or a better one for this dish.`;

const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    name: {
      type: SchemaType.STRING,
      description: "What the dish is, in the words a café would print.",
    },
    category: {
      type: SchemaType.STRING,
      description: "Menu section heading.",
    },
    description: {
      type: SchemaType.STRING,
      description:
        "Two short sentences of menu copy about what is visibly on the plate.",
    },
    ingredients: {
      type: SchemaType.ARRAY,
      description: "Things visible in the photograph. Maximum 8.",
      items: { type: SchemaType.STRING },
    },
    presentation: {
      type: SchemaType.STRING,
      description: "One line about how it is plated or served, if visible.",
    },
  },
  required: ["name", "category", "description", "ingredients"],
};


function fail(
  status: number,
  error: string,
  code: string,
  extra?: { rate?: RateLimitResult; hint?: string },
) {
  const response = NextResponse.json(
    { error, code, ...(extra?.hint ? { hint: extra.hint } : {}) },
    { status },
  );
  return extra?.rate ? withRateHeaders(response, extra.rate) : response;
}

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

async function readPhoto(image: { mimeType: string; data: string }, key: string) {
  const client = new GoogleGenerativeAI(key);

  for (const model of [MODEL, FALLBACK_MODEL]) {
    try {
      const generativeModel = client.getGenerativeModel({
        model,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });

      const response = await Promise.race([
        generativeModel.generateContent([
          { text: SYSTEM },
          { inlineData: { mimeType: image.mimeType, data: image.data } },
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
        ),
      ]);

      const dish = readDishReading(extractJson(response.response.text()));
      if (!dish) throw new Error("Model reply had no usable dish.");

      return { dish, model };
    } catch (error) {
      // Log the shape of the failure, never the photo.
      console.warn(
        `[dish-vision] ${model} failed: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`,
      );
    }
  }

  throw new Error("Every model attempt failed.");
}

export async function POST(request: Request) {
  const rate = await rateLimit(request, LIMIT);

  if (!rate.allowed) {
    return fail(429, "That's a lot of photos. Try again in a few minutes.", "RATE_LIMITED", {
      rate,
    });
  }

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail(413, "That photo is too large. Try a smaller one.", "REQUEST_TOO_LARGE", { rate });
  }

  if (!apiKey) {
    return fail(
      503,
      "Photo recognition isn't switched on yet.",
      "GENERATION_DISABLED",
      { rate, hint: "GEMINI_API_KEY is missing. Type the dish in by hand for now." },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "No photo arrived.", "VALIDATION_ERROR", { rate });
  }

  const raw = (body as { image?: unknown })?.image;
  if (typeof raw !== "object" || raw === null) {
    return fail(400, "No photo arrived.", "VALIDATION_ERROR", { rate });
  }

  const image = raw as Record<string, unknown>;
  const mimeType = typeof image.mimeType === "string" ? image.mimeType.toLowerCase() : "";
  const data = typeof image.data === "string" ? image.data : "";

  if (!ALLOWED_MIME.has(mimeType)) {
    return fail(400, "That file type can't be read. Use a JPEG, PNG or WebP.", "VALIDATION_ERROR", { rate });
  }
  if (data.length < 64 || data.length > MAX_BODY_BYTES) {
    return fail(400, "That photo doesn't look right. Try another.", "VALIDATION_ERROR", { rate });
  }

  try {
    const { dish, model } = await readPhoto({ mimeType, data }, apiKey);

    console.info(`[dish-vision] read "${dish.name}" via ${model}`);

    return withRateHeaders(
      NextResponse.json(
        { ok: true, dish, meta: { model } },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      ),
      rate,
    );
  } catch (error) {
    console.error(
      `[dish-vision] failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return fail(
      502,
      "The photo couldn't be read. Type the dish in yourself — nothing is lost.",
      "VISION_FAILED",
      { rate },
    );
  }
}

/** A GET is a mistake, but it shouldn't look like a broken menu. */
export async function GET() {
  return NextResponse.json(
    { error: "Read a dish with a POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
