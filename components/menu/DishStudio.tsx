"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
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
 * Three rules shape this screen:
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
 *     The panel says where free ones come from instead of implying a button
 *     exists.
 */

type Suggestion = {
  name: string;
  category: string;
  description: string;
  ingredients: string;
  presentation?: string;
};

const EMPTY: Suggestion = { name: "", category: "", description: "", ingredients: "" };

export default function DishStudio({
  items,
  onApplyDetails,
  onSetModel,
  onClearDetails,
}: {
  items: MenuItem[];
  /** Writes name/section/description/ingredients. Never the price. */
  onApplyDetails: (
    index: number,
    suggestion: { name: string; category: string; description: string; ingredients: string[] },
  ) => void;
  onSetModel: (index: number, model: DishModel | null) => void;
  onClearDetails: (index: number) => void;
}) {
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

  const ready = useMemo(() => modelCount(items), [items]);

  // Load the selected row's existing words once per row, so switching dishes
  // never shows the previous dish's description in the box.
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

  const readPhoto = useCallback(
    async (file: File) => {
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
    },
    [],
  );

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

  if (!item) {
    return (
      <div className="hairline rounded-xl bg-white/70 p-4">
        <p className="text-[11px] text-espresso-500">
          Add a dish to the menu first — then it can have a description and a model.
        </p>
      </div>
    );
  }

  const previewModel: DishModel | null =
    glb.trim() && isAssetUrl(glb.trim(), "model")
      ? { glb: glb.trim(), ...(poster.trim() && isAssetUrl(poster.trim(), "image") ? { poster: poster.trim() } : {}) }
      : (item.model ?? null);

  return (
    <div className="hairline rounded-xl bg-white/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
          <Rotate3d className="h-3 w-3" aria-hidden />
          Dish details &amp; 3D
        </p>
        <p className="text-[10px] text-espresso-400">
          {ready} of {items.length} {items.length === 1 ? "dish has" : "dishes have"} a model
        </p>
      </div>

      {/* Pick a dish. Chips, not a dropdown: the whole menu stays visible. */}
      <div className="-mx-1 mt-2 flex snap-x gap-1.5 overflow-x-auto pb-1">
        {items.map((row, i) => {
          const active = i === index;
          const complete = hasModel(row);
          return (
            <button
              key={`${row.name}-${i}`}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={active}
              className={`tap flex max-w-[160px] shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 ${
                active
                  ? "border-espresso-900 bg-espresso-900 text-cream-50"
                  : "border-espresso-900/[0.12] bg-white/70 text-espresso-700 hover:border-espresso-900/30"
              }`}
            >
              {complete && <Check className="h-2.5 w-2.5 shrink-0" aria-hidden />}
              <span className="truncate">{row.name || `Row ${i + 1}`}</span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------- photo ------------------------------ */}
      <div className="mt-3 rounded-lg border border-espresso-900/[0.08] bg-cream-50/70 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-espresso-700">
            <Camera className="h-3 w-3 text-caramel-600" aria-hidden />
            Read a photo
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="tap inline-flex items-center gap-1 rounded-lg border border-espresso-900/[0.14] bg-white/80 px-2 py-1 text-[10px] font-semibold text-espresso-700 hover:border-espresso-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
          >
            <Upload className="h-3 w-3" aria-hidden />
            {reading ? "Reading…" : "Choose photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void readPhoto(file);
            }}
          />
        </div>

        {reading && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-espresso-500" role="status">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Looking at the photo…
          </p>
        )}

        {readError && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-[1.5] text-espresso-700">
            <AlertCircle className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600" aria-hidden />
            <span>{readError}</span>
          </p>
        )}

        {fromAi && !reading && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-[1.5] text-espresso-600">
            <Sparkles className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600" aria-hidden />
            <span>
              Suggestion only — check it, then save. The photo is read and discarded; it isn&apos;t
              stored or published.
            </span>
          </p>
        )}
      </div>

      {/* ------------------------------ fields ------------------------------ */}
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <Field
          label="Dish name"
          value={fields.name}
          max={MAX_ITEM_NAME}
          onChange={(value) => setFields((current) => ({ ...current, name: value }))}
        />
        <label className="block">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-espresso-400">
            Section
          </span>
          <input
            list="dish-sections"
            value={fields.category}
            maxLength={MAX_CATEGORY}
            onChange={(event) =>
              setFields((current) => ({ ...current, category: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-espresso-900/[0.14] bg-white/90 px-2 py-1.5 text-[11.5px] text-espresso-900 outline-none focus-visible:border-caramel-500/60 focus-visible:ring-2 focus-visible:ring-caramel-500/25"
          />
          <datalist id="dish-sections">
            {DISH_CATEGORIES.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="mt-2 block">
        <span className="flex items-baseline justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-espresso-400">
          Description
          <span className="font-normal tracking-normal normal-case text-espresso-400">
            {fields.description.length}/{DISH_LIMITS.description}
          </span>
        </span>
        <textarea
          value={fields.description}
          rows={2}
          maxLength={DISH_LIMITS.description}
          onChange={(event) =>
            setFields((current) => ({ ...current, description: event.target.value }))
          }
          className="mt-1 w-full resize-none rounded-lg border border-espresso-900/[0.14] bg-white/90 px-2 py-1.5 text-[11.5px] leading-[1.55] text-espresso-900 outline-none focus-visible:border-caramel-500/60 focus-visible:ring-2 focus-visible:ring-caramel-500/25"
        />
      </label>

      <Field
        label="Visible ingredients (comma separated)"
        value={fields.ingredients}
        max={DISH_LIMITS.ingredients * (DISH_LIMITS.ingredient + 2)}
        onChange={(value) => setFields((current) => ({ ...current, ingredients: value }))}
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={saveDetails}
          className="tap inline-flex items-center gap-1 rounded-lg bg-espresso-900 px-2.5 py-1.5 text-[10.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
        >
          {saved ? <Check className="h-3 w-3" aria-hidden /> : null}
          {saved ? "Saved to the draft" : "Save details"}
        </button>

        {item.dish && (
          <button
            type="button"
            onClick={() => {
              onClearDetails(index);
              setFields((current) => ({ ...current, description: "", ingredients: "" }));
            }}
            className="tap inline-flex items-center gap-1 rounded-lg border border-espresso-900/[0.14] px-2 py-1.5 text-[10.5px] font-semibold text-espresso-600 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Clear words
          </button>
        )}
      </div>

      {/* -------------------------------- 3D -------------------------------- */}
      <div className="mt-3 rounded-lg border border-espresso-900/[0.08] bg-cream-50/70 p-2.5">
        <p className="text-[10.5px] font-semibold text-espresso-700">3D model</p>
        <p className="mt-0.5 text-[10px] leading-[1.5] text-espresso-500">
          Paste a link to a GLB you host. We never generate geometry — every hosted image-to-3D
          service bills per model. A free, real route: run Microsoft TRELLIS.2 or TripoSR (both
          MIT) on your own GPU, export a GLB, host it anywhere.
        </p>

        <div className="mt-2 grid gap-2">
          <Field
            label="GLB URL"
            value={glb}
            max={DISH_LIMITS.url}
            placeholder="https://cdn.example.com/masala-chai.glb"
            onChange={setGlb}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="Poster (optional)"
              value={poster}
              max={DISH_LIMITS.url}
              placeholder="https://…/chai.jpg"
              onChange={setPoster}
            />
            <Field
              label="Made with (optional)"
              value={by}
              max={DISH_LIMITS.by}
              placeholder="trellis"
              onChange={setBy}
            />
          </div>
        </div>

        {modelError && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-[1.5] text-espresso-700">
            <AlertCircle className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600" aria-hidden />
            <span>{modelError}</span>
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={saveModel}
            className="tap inline-flex items-center gap-1 rounded-lg bg-espresso-900 px-2.5 py-1.5 text-[10.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
          >
            <Rotate3d className="h-3 w-3" aria-hidden />
            {hasModel(item) ? "Update 3D" : "Enable 3D"}
          </button>

          {previewModel && (
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="tap rounded-lg border border-espresso-900/[0.14] px-2 py-1.5 text-[10.5px] font-semibold text-espresso-700 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
            >
              Preview
            </button>
          )}

          {hasModel(item) && (
            <button
              type="button"
              onClick={() => {
                onSetModel(index, null);
                setGlb("");
                setPoster("");
                setBy("");
              }}
              className="tap inline-flex items-center gap-1 rounded-lg border border-espresso-900/[0.14] px-2 py-1.5 text-[10.5px] font-semibold text-espresso-600 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              Remove
            </button>
          )}
        </div>
      </div>

      {preview && previewModel && (
        <DishViewer
          key={previewModel.glb}
          name={fields.name.trim() || item.name}
          dish={
            fields.description.trim() || fields.ingredients.trim()
              ? {
                  description: fields.description.trim(),
                  ingredients: fields.ingredients
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
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

function Field({
  label,
  value,
  max,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-2 block">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-espresso-400">
        {label}
      </span>
      <input
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-espresso-900/[0.14] bg-white/90 px-2 py-1.5 text-[11.5px] text-espresso-900 outline-none placeholder:text-espresso-400/70 focus-visible:border-caramel-500/60 focus-visible:ring-2 focus-visible:ring-caramel-500/25"
      />
    </label>
  );
}
