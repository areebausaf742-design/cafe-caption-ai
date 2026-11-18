"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronDown,
  Loader2,
  Rotate3d,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import DishViewer from "@/components/menu/DishViewer";
import { prepareImage } from "@/lib/image";
import {
  DISH_CATEGORIES,
  DISH_LIMITS,
  hasDish,
  hasModel,
  isAssetUrl,
  modelCount,
  recommendations,
} from "@/lib/dish";
import { MAX_CATEGORY, MAX_ITEM_NAME } from "@/lib/menu";
import { requestDishVision } from "@/lib/studio-client";
import type { DishModel, MenuItem } from "@/lib/types";

/**
 * The owner's side of the 3D menu: read a photo, correct the words, attach a
 * model.
 *
 * Two shapes, one component: `compact` sits in the 248px column beside the menu
 * preview on the homepage, `full` is the card in the published-menu editor,
 * where an owner comes back weeks later to change one dish.
 *
 * Three rules shape every line here:
 *
 *  1. **Nothing is auto-saved.** The AI's reading of a photo lands in local
 *     fields, marked as a suggestion, and only reaches the menu when the owner
 *     presses Save. A wrong dish name published silently is exactly the failure
 *     this product exists to prevent.
 *  2. **The price is not here.** No field on this panel can reach it — the
 *     suggestion path (`applyDishSuggestion`) writes name, section and copy
 *     only. An owner can change a price on the row above, deliberately.
 *  3. **We do not generate 3D.** Every hosted image-to-3D service bills per
 *     model, so a model has to come from somewhere real: the owner's own GLB.
 *     The panel says where real models come from instead of implying a button
 *     exists that would quietly cost money.
 */

type Suggestion = {
  name: string;
  category: string;
  description: string;
  ingredients: string;
};

const EMPTY: Suggestion = { name: "", category: "", description: "", ingredients: "" };

export default function DishStudio({
  items,
  onApplyDetails,
  onSetModel,
  onClearDetails,
  variant = "compact",
}: {
  items: MenuItem[];
  /** Writes name/section/description/ingredients. Never the price. */
  onApplyDetails: (
    index: number,
    suggestion: { name: string; category: string; description: string; ingredients: string[] },
  ) => void;
  onSetModel: (index: number, model: DishModel | null) => void;
  onClearDetails: (index: number) => void;
  /** `full` is the published-menu editor; `compact` is the homepage sidebar. */
  variant?: "compact" | "full";
}) {
  const full = variant === "full";

  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, Math.max(0, items.length - 1));
  const item = items[index];

  const [fields, setFields] = useState<Suggestion>(EMPTY);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [fromAi, setFromAi] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [glb, setGlb] = useState("");
  const [poster, setPoster] = useState("");
  const [by, setBy] = useState("");
  const [modelError, setModelError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const withModel = useMemo(() => modelCount(items), [items]);
  const withCopy = useMemo(() => items.filter((row) => hasDish(row)).length, [items]);
  const share = items.length ? Math.round((withModel / items.length) * 100) : 0;

  // Load the selected row's stored words once per row, so switching dishes never
  // shows the previous dish's description in the box.
  const rowKey = item ? `${index}:${item.name}:${item.price}` : "none";
  if (item && loadedFor !== rowKey) {
    setLoadedFor(rowKey);
    setFields({
      name: item.name,
      category: item.category,
      description: item.dish?.description ?? "",
      ingredients: item.dish?.ingredients.join(", ") ?? "",
    });
    setGlb(item.model?.glb ?? "");
    setPoster(item.model?.poster ?? "");
    setBy(item.model?.by ?? "");
    setReadError(null);
    setModelError(null);
    setFromAi(null);
    setSaved(false);
  }

  const readPhoto = useCallback(async (file: File) => {
    setReading(true);
    setReadError(null);
    setSaved(false);

    const prepared = await prepareImage(file).catch(() => null);
    if (!prepared) {
      setReading(false);
      setReadError("That photo couldn't be read. A JPEG or PNG under 10 MB works best.");
      return;
    }

    const outcome = await requestDishVision({
      mimeType: prepared.mimeType,
      data: prepared.base64,
    });

    setReading(false);

    if (!outcome.ok) {
      setReadError(outcome.error.message);
      return;
    }

    const dish = outcome.dish;
    setFields({
      name: dish.name,
      category: dish.category,
      description: dish.description,
      ingredients: dish.ingredients.join(", "),
    });
    setFromAi(dish.presentation ? `${dish.presentation}` : outcome.model);
  }, []);

  const saveDetails = useCallback(() => {
    if (!item) return;
    onApplyDetails(index, {
      name: fields.name.trim(),
      category: fields.category.trim(),
      description: fields.description.trim(),
      ingredients: fields.ingredients
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    });
    setSaved(true);
    setFromAi(null);
    setTimeout(() => setSaved(false), 2500);
  }, [fields, index, item, onApplyDetails]);

  const clearDetails = useCallback(() => {
    if (!item) return;
    onClearDetails(index);
    setFields((current) => ({ ...current, description: "", ingredients: "" }));
    setSaved(false);
  }, [index, item, onClearDetails]);

  const saveModel = useCallback(() => {
    if (!item) return;
    const url = glb.trim();

    if (!url) {
      setModelError("Paste the URL of a .glb file — that's the model the viewer loads.");
      return;
    }
    if (!isAssetUrl(url, "model")) {
      setModelError(
        "That isn't a model URL. It needs to be an https link ending in .glb or .gltf.",
      );
      return;
    }
    if (poster.trim() && !isAssetUrl(poster.trim(), "image")) {
      setModelError("The poster needs to be an https link ending in .jpg, .png, .webp or .avif.");
      return;
    }

    setModelError(null);
    onSetModel(index, {
      glb: url,
      ...(poster.trim() ? { poster: poster.trim() } : {}),
      ...(by.trim() ? { by: by.trim().slice(0, DISH_LIMITS.by) } : {}),
    });
  }, [by, glb, index, item, onSetModel, poster]);

  const removeModel = useCallback(() => {
    if (!item) return;
    onSetModel(index, null);
    setGlb("");
    setPoster("");
    setBy("");
    setModelError(null);
    setPreview(false);
  }, [index, item, onSetModel]);

  const previewModel: DishModel | null =
    glb.trim() && isAssetUrl(glb.trim(), "model")
      ? {
          glb: glb.trim(),
          ...(poster.trim() && isAssetUrl(poster.trim(), "image") ? { poster: poster.trim() } : {}),
        }
      : (item?.model ?? null);

  const posterOk = poster.trim() && isAssetUrl(poster.trim(), "image");
  const modelInDraft = Boolean(item && item.model?.glb === glb.trim() && glb.trim());
  const chips = fields.ingredients
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, DISH_LIMITS.ingredients);

  if (!item) {
    return (
      <div className={full ? "card p-4 sm:p-5" : "hairline rounded-xl bg-white/70 p-4"}>
        <p className="text-[11px] leading-[1.6] text-espresso-500">
          Add a dish to the menu first — then it can have a description and a model.
        </p>
      </div>
    );
  }

  const shell = full ? "card p-4 sm:p-5" : "hairline rounded-xl bg-white/70 p-4";
  const eyebrow = full
    ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-espresso-400"
    : "text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400";
  const fieldLabel = full
    ? "text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-400"
    : "text-[9px] font-semibold uppercase tracking-[0.14em] text-espresso-400";
  const inputClass = full
    ? "mt-1 w-full rounded-lg border border-espresso-900/[0.14] bg-white/95 px-2.5 py-2 text-[12.5px] text-espresso-900 outline-none placeholder:text-espresso-400/70 focus-visible:border-caramel-500/60 focus-visible:ring-2 focus-visible:ring-caramel-500/25"
    : "mt-1 w-full rounded-lg border border-espresso-900/[0.14] bg-white/90 px-2 py-1.5 text-[11.5px] text-espresso-900 outline-none placeholder:text-espresso-400/70 focus-visible:border-caramel-500/60 focus-visible:ring-2 focus-visible:ring-caramel-500/25";
  const primaryButton = full
    ? "tap inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-espresso-900 px-3 py-2 text-[11.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
    : "tap inline-flex items-center gap-1 rounded-lg bg-espresso-900 px-2.5 py-1.5 text-[10.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45";
  const quietButton = full
    ? "tap inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-espresso-900/[0.14] px-3 py-2 text-[11.5px] font-semibold text-espresso-600 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
    : "tap inline-flex items-center gap-1 rounded-lg border border-espresso-900/[0.14] px-2 py-1.5 text-[10.5px] font-semibold text-espresso-600 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45";

  const wordsPanel = (
    <div
      className={
        full
          ? "rounded-xl border border-espresso-900/[0.08] bg-cream-50/60 p-3 sm:p-3.5"
          : "mt-3 rounded-lg border border-espresso-900/[0.08] bg-cream-50/70 p-2.5"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-espresso-700">
          <Camera className="h-3 w-3 text-caramel-600" aria-hidden />
          The words
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
          className="tap inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-espresso-900/[0.14] bg-white/80 px-2 py-1 text-[10px] font-semibold text-espresso-700 hover:border-espresso-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 disabled:opacity-50"
        >
          {reading ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-3 w-3" aria-hidden />
          )}
          {reading ? "Reading…" : "Read a photo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={`Read a photo of ${item.name || "this dish"}`} 
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void readPhoto(file);
          }}
        />
      </div>

      <p className="mt-1 text-[10px] leading-[1.55] text-espresso-500">
        One dish per photo, in daylight if you can. The photo is read and discarded — never
        stored, never published.
      </p>

      {reading && (
        <p role="status" className="mt-1.5 flex items-center gap-1.5 text-[10px] text-espresso-500">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Looking at the photo…
        </p>
      )}

      {readError && (
        <p
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-[1.5] text-espresso-700"
        >
          <AlertCircle className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600" aria-hidden />
          <span>{readError}</span>
        </p>
      )}

      {fromAi && !reading && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-[1.5] text-espresso-600">
          <Sparkles className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600" aria-hidden />
          <span>
            Suggestion only — check it, then save. Words that claim an allergen or a diet are
            dropped before they reach this box.
            {fromAi !== "model" ? ` Seen: ${fromAi}.` : ""}
          </span>
        </p>
      )}

      <div className={`mt-2.5 grid gap-2 ${full ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        <label className="block">
          <span className={fieldLabel}>Dish name</span>
          <input
            value={fields.name}
            maxLength={MAX_ITEM_NAME}
            onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>Section</span>
          <input
            list="dish-sections"
            value={fields.category}
            maxLength={MAX_CATEGORY}
            onChange={(event) =>
              setFields((current) => ({ ...current, category: event.target.value }))
            }
            className={inputClass}
          />
          <datalist id="dish-sections">
            {DISH_CATEGORIES.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="mt-2 block">
        <span className={`flex items-baseline justify-between ${fieldLabel}`}>
          Description
          <span className="font-normal normal-case tracking-normal text-espresso-400">
            {fields.description.length}/{DISH_LIMITS.description}
          </span>
        </span>
        <textarea
          value={fields.description}
          rows={full ? 3 : 2}
          maxLength={DISH_LIMITS.description}
          onChange={(event) =>
            setFields((current) => ({ ...current, description: event.target.value }))
          }
          className={`${inputClass} resize-none leading-[1.55]`}
        />
      </label>

      <label className="mt-2 block">
        <span className={`flex items-baseline justify-between ${fieldLabel}`}>
          Visible ingredients
          <span className="font-normal normal-case tracking-normal text-espresso-400">
            {chips.length}/{DISH_LIMITS.ingredients}
          </span>
        </span>
        <input
          value={fields.ingredients}
          maxLength={DISH_LIMITS.ingredients * (DISH_LIMITS.ingredient + 2)}
          placeholder="Milk, ginger, tea leaves"
          onChange={(event) =>
            setFields((current) => ({ ...current, ingredients: event.target.value }))
          }
          className={inputClass}
        />
      </label>

      {chips.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Ingredients as customers will see them">
          {chips.map((entry) => (
            <li
              key={entry}
              className="rounded-full border border-espresso-900/[0.1] bg-white/80 px-2 py-0.5 text-[9.5px] text-espresso-600"
            >
              {entry}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={saveDetails} className={primaryButton}>
          {saved ? <Check className="h-3 w-3" aria-hidden /> : null}
          {saved ? "Saved to the draft" : "Save details"}
        </button>

        {hasDish(item) && (
          <button type="button" onClick={clearDetails} className={quietButton}>
            <Trash2 className="h-3 w-3" aria-hidden />
            Clear words
          </button>
        )}
      </div>
    </div>
  );

  const modelPanel = (
    <div
      className={
        full
          ? "rounded-xl border border-espresso-900/[0.08] bg-cream-50/60 p-3 sm:p-3.5"
          : "mt-3 rounded-lg border border-espresso-900/[0.08] bg-cream-50/70 p-2.5"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-espresso-700">
          <Rotate3d className="h-3 w-3 text-caramel-600" aria-hidden />
          The model
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
            hasModel(item)
              ? "bg-sage-500/12 text-espresso-700"
              : "border border-espresso-900/[0.1] text-espresso-400"
          }`}
        >
          {modelInDraft ? "In this draft" : hasModel(item) ? "Live once saved" : "Not set"}
        </span>
      </div>

      <div className="mt-2 grid gap-2">
        <label className="block">
          <span className={fieldLabel}>GLB URL</span>
          <input
            value={glb}
            maxLength={DISH_LIMITS.url}
            placeholder="https://cdn.example.com/masala-chai.glb"
            inputMode="url"
            onChange={(event) => {
              setGlb(event.target.value);
              setModelError(null);
            }}
            className={inputClass}
          />
        </label>

        <div className={`grid gap-2 ${full ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
          <label className="block">
            <span className={fieldLabel}>Poster (optional)</span>
            <input
              value={poster}
              maxLength={DISH_LIMITS.url}
              placeholder="https://…/chai.jpg"
              inputMode="url"
              onChange={(event) => {
                setPoster(event.target.value);
                setModelError(null);
              }}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Made with (optional)</span>
            <input
              value={by}
              maxLength={DISH_LIMITS.by}
              placeholder="trellis-2"
              onChange={(event) => setBy(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {posterOk && (
        <div className="mt-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster.trim()}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="h-10 w-10 rounded-lg border border-espresso-900/[0.08] object-cover"
          />
          <p className="text-[9.5px] leading-[1.5] text-espresso-500">
            Shown if the model can&apos;t load — a still beats a blank box on a phone.
          </p>
        </div>
      )}

      {modelError && (
        <p
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-[1.5] text-espresso-700"
        >
          <AlertCircle className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600" aria-hidden />
          <span>{modelError}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={saveModel} className={primaryButton}>
          <Rotate3d className="h-3 w-3" aria-hidden />
          {hasModel(item) ? "Update 3D" : "Enable 3D"}
        </button>

        {previewModel && (
          <button type="button" onClick={() => setPreview(true)} className={quietButton}>
            Preview 3D
          </button>
        )}

        {hasModel(item) && (
          <button type="button" onClick={removeModel} className={quietButton}>
            <Trash2 className="h-3 w-3" aria-hidden />
            Remove model
          </button>
        )}
      </div>

      {hasModel(item) && (
        <p className="mt-1.5 text-[10px] leading-[1.55] text-espresso-500">
          Customers see a &ldquo;See it in 3D&rdquo; button on this dish, and only this dish.
        </p>
      )}

      <details className="group mt-2">
        <summary className="tap flex cursor-pointer list-none items-center gap-1 text-[10px] font-semibold text-espresso-600 hover:text-espresso-900 [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className="h-3 w-3 transition-transform group-open:rotate-180"
            aria-hidden
          />
          Where do I get a GLB?
        </summary>
        <div className="mt-1.5 space-y-1.5 text-[10px] leading-[1.55] text-espresso-500">
          <p>
            Nothing here generates geometry, and no hosted image-to-3D API is free — they all bill
            per model. The honest routes, all of which you run yourself and then upload the file:
          </p>
          <ul className="space-y-1 pl-3">
            <li>
              <strong className="font-semibold text-espresso-700">TRELLIS.2</strong> — MIT, best
              quality, wants about 24 GB of video memory.
            </li>
            <li>
              <strong className="font-semibold text-espresso-700">TripoSR</strong> — MIT, runs in
              6–8 GB, a second per dish.
            </li>
            <li>
              <strong className="font-semibold text-espresso-700">Stable Fast 3D</strong> — free
              under $1M revenue, textured and UV-unwrapped.
            </li>
          </ul>
          <p>
            Host the exported .glb anywhere that serves it over https with permissive CORS — a
            Supabase bucket, Cloudflare R2, or the café&apos;s own site. Compressing it with
            gltfpack or Draco makes it load in a fraction of the time.
          </p>
        </div>
      </details>
    </div>
  );

  return (
    <div className={shell}>
      {/* header + coverage ------------------------------------------------ */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={`flex items-center gap-1.5 ${eyebrow}`}>
          <Rotate3d className="h-3 w-3" aria-hidden />
          Dish details &amp; 3D
        </p>
        <p className="text-[10px] tabular-nums text-espresso-400">
          {withModel} of {items.length} {items.length === 1 ? "dish has" : "dishes have"} a model
          {withCopy > 0 ? ` · ${withCopy} with words` : ""}
        </p>
      </div>

      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-espresso-900/[0.07]"
        role="img"
        aria-label={`${withModel} of ${items.length} dishes have a 3D model`}
      >
        <div
          className="h-full rounded-full bg-espresso-900/70 transition-[width] duration-500"
          style={{ width: `${share}%` }}
        />
      </div>

      {full && (
        <p className="mt-2 text-[10.5px] leading-[1.6] text-espresso-500">
          Pick a dish, give it a line of copy and a model. Nothing here touches a price, and
          nothing goes live until you press <strong className="font-semibold">Save changes</strong>.
        </p>
      )}

      {/* dish chips ------------------------------------------------------ */}
      <div className="-mx-1 mt-2 flex snap-x gap-1.5 overflow-x-auto pb-1">
        {items.map((row, i) => {
          const active = i === index;
          return (
            <button
              key={`${row.name}-${i}`}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={active}
              aria-label={`${row.name || `Row ${i + 1}`}${hasModel(row) ? ", has a 3D model" : ""}`}
              className={`tap flex max-w-[180px] shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 ${
                active
                  ? "border-espresso-900 bg-espresso-900 text-cream-50"
                  : "border-espresso-900/[0.12] bg-white/70 text-espresso-700 hover:border-espresso-900/30"
              }`}
            >
              {hasModel(row) && (
                <Rotate3d
                  className={`h-2.5 w-2.5 shrink-0 ${active ? "text-cream-200" : "text-caramel-600"}`}
                  aria-hidden
                />
              )}
              {hasDish(row) && !hasModel(row) && (
                <Check
                  className={`h-2.5 w-2.5 shrink-0 ${active ? "text-cream-200" : "text-sage-500"}`}
                  aria-hidden
                />
              )}
              <span className="truncate">{row.name || `Row ${i + 1}`}</span>
            </button>
          );
        })}
      </div>

      {/* the two halves -------------------------------------------------- */}
      {full ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {wordsPanel}
          {modelPanel}
        </div>
      ) : (
        <>
          {wordsPanel}
          {modelPanel}
        </>
      )}

      {full && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-[1.55] text-espresso-400">
          <AlertCircle className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
          Prices stay exactly where they are — this panel has no field that can reach one.
        </p>
      )}

      {preview && previewModel && (
        <DishViewer
          key={previewModel.glb}
          name={fields.name.trim() || item.name}
          dish={
            fields.description.trim() || fields.ingredients.trim()
              ? {
                  description: fields.description.trim(),
                  ingredients: chips,
                  source: fromAi ? "ai" : "owner",
                }
              : undefined
          }
          model={previewModel}
          recommendations={recommendations(items, index)}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}
