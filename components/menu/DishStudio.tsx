"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronDown,
  ImageIcon,
  Loader2,
  RefreshCw,
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
import { requestDishModel, requestDishVision } from "@/lib/studio-client";
import type { DishModel, MenuItem } from "@/lib/types";

/**
 * The owner's side of the 3D menu: one food photo, a line of copy, a model.
 *
 * Two shapes, one component: `compact` sits in the 248px column beside the menu
 * preview on the homepage, `full` is the card in the published-menu editor,
 * where an owner comes back weeks later to change one dish.
 *
 * The rules that shape every line here:
 *
 *  1. **One photo, two things it can do.** Read the words, or build a model.
 *     The owner picks a photo once and never sees a file format, a bucket, or a
 *     URL.
 *  2. **Nothing is invented.** A model appears only when a real mesh came back
 *     and was stored; otherwise the panel says what went wrong and offers a
 *     retry. There are no placeholder meshes and no fake progress.
 *  3. **Nothing is auto-saved.** A reading lands in local fields; a model lands
 *     in the draft. Both wait for the owner's Save.
 *  4. **The price is not here.** No control on this panel can reach it.
 *
 * `manualModels` is the operator's escape hatch — it reveals plain GLB/poster
 * fields for demos and catalogue shots. It is off for cafés.
 */

type Suggestion = {
  name: string;
  category: string;
  description: string;
  ingredients: string;
};

type Photo = {
  base64: string;
  mimeType: string;
  previewUrl: string;
  name: string;
  kb: number;
};

const EMPTY: Suggestion = { name: "", category: "", description: "", ingredients: "" };

export default function DishStudio({
  items,
  onApplyDetails,
  onSetModel,
  onClearDetails,
  variant = "compact",
  manualModels = false,
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
  /** Operator-only: show the plain GLB fields. Off for café owners. */
  manualModels?: boolean;
}) {
  const full = variant === "full";

  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, Math.max(0, items.length - 1));
  const item = items[index];

  const [fields, setFields] = useState<Suggestion>(EMPTY);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [fromAi, setFromAi] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genSeconds, setGenSeconds] = useState(0);
  const [genError, setGenError] = useState<{ message: string; hint?: string } | null>(null);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  // Operator-only fields.
  const [glb, setGlb] = useState("");
  const [poster, setPoster] = useState("");
  const [by, setBy] = useState("");
  const [modelError, setModelError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * One counter for the two requests this panel can have in flight. A result is
   * only allowed to touch state when it still owns the current number — so
   * switching dish mid-generation, or unmounting, can never write the previous
   * dish's model into the new one.
   */
  const jobRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const withModel = useMemo(() => modelCount(items), [items]);
  const withCopy = useMemo(() => items.filter((row) => hasDish(row)).length, [items]);
  const share = items.length ? Math.round((withModel / items.length) * 100) : 0;

  // An object URL lives exactly as long as the photo it belongs to: swapping or
  // clearing the photo, or closing the panel, frees it. Never during render.
  useEffect(() => {
    if (!photo) return;
    const url = photo.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Load the selected row's stored words when the *row* changes — keyed on the
  // index only. Keying on the name or price (as this used to) meant that typing
  // a new dish name into the field reloaded the row underneath you and threw
  // away the description, the ingredients and the photo that was just uploaded.
  useEffect(() => {
    const row = items[index];
    if (!row) return;

    setFields({
      name: row.name,
      category: row.category,
      description: row.dish?.description ?? "",
      ingredients: row.dish?.ingredients.join(", ") ?? "",
    });
    setGlb(row.model?.glb ?? "");
    setPoster(row.model?.poster ?? "");
    setBy(row.model?.by ?? "");
    setReadError(null);
    setModelError(null);
    setFromAi(null);
    setSaved(false);
    setGenError(null);
    setGenNote(null);
    setGenerating(false);
    setPhoto(null);
    // `items` is read only to hydrate the row at mount; the row's own edits must
    // not re-trigger this, which is exactly what excluding it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Switching dish (or closing the panel) cancels whatever was running, so a
  // slow generation never lands on a row the owner has moved on from.
  useEffect(() => {
    return () => {
      jobRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [index]);

  // An honest clock: the number shown is real elapsed time, not a progress bar
  // guessing at a GPU queue.
  useEffect(() => {
    if (!generating) return;
    const started = Date.now();
    setGenSeconds(0);
    const id = window.setInterval(() => {
      setGenSeconds(Math.round((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [generating]);

  const choosePhoto = useCallback(
    async (file: File) => {
      setPreparingPhoto(true);
      setReadError(null);
      setGenError(null);
      setGenNote(null);

      const prepared = await prepareImage(file).catch(() => null);
      setPreparingPhoto(false);

      if (!prepared) {
        setReadError("That photo couldn't be read. A JPEG or PNG under 10 MB works best.");
        return;
      }

      // The previous preview URL is revoked by the effect that owns it.
      setPhoto({
        base64: prepared.base64,
        mimeType: prepared.mimeType,
        previewUrl: prepared.previewUrl,
        name: prepared.fileName,
        kb: Math.round(prepared.bytes / 1024),
      });
    },
    [],
  );

  const readWords = useCallback(async () => {
    if (!photo) return;

    const token = ++jobRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setReading(true);
    setReadError(null);
    setSaved(false);

    const outcome = await requestDishVision(
      { mimeType: photo.mimeType, data: photo.base64 },
      { signal: controller.signal },
    );

    // A stale answer belongs to a dish the owner has already left.
    if (token !== jobRef.current) return;
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
    setFromAi(dish.presentation ? dish.presentation : "the photo");
  }, [photo]);

  const buildModel = useCallback(async () => {
    if (!photo || generating) return;

    // The token is what makes "still wanted?" answerable after an await.
    const token = ++jobRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const rowIndex = index;

    setGenerating(true);
    setGenError(null);
    setGenNote(null);
    setModelError(null);

    const outcome = await requestDishModel(
      { mimeType: photo.mimeType, data: photo.base64 },
      { signal: controller.signal },
    );

    if (token !== jobRef.current) return; // row changed or panel closed
    setGenerating(false);

    if (!outcome.ok) {
      setGenError({ message: outcome.error.message, hint: outcome.error.hint });
      return;
    }

    // The model belongs to the row whose photo produced it, not to whatever is
    // selected by the time the GPU answers.
    onSetModel(rowIndex, outcome.model);
    setGenNote(
      `Model built from your photo in ${outcome.meta.seconds}s on a ${outcome.meta.via}. It's in this draft — Save changes to put it on the menu.`,
    );
  }, [generating, index, onSetModel, photo]);

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

  const saveManualModel = useCallback(() => {
    if (!item) return;
    const url = glb.trim();

    if (!url) {
      setModelError("Paste the URL of a .glb file — that's the model the viewer loads.");
      return;
    }
    if (!isAssetUrl(url, "model")) {
      setModelError("That isn't a model URL. It needs to be an https link ending in .glb or .gltf.");
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
    setGenError(null);
    setGenNote("Model removed from this draft. Save changes to take it off the menu.");
    setPreview(false);
  }, [index, item, onSetModel]);

  const previewModel: DishModel | null = item?.model ?? null;
  const posterOk = manualModels && poster.trim() && isAssetUrl(poster.trim(), "image");
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
    ? "tap inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-espresso-900 px-3 py-2 text-[12px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 disabled:opacity-50"
    : "tap inline-flex items-center gap-1 rounded-lg bg-espresso-900 px-2.5 py-1.5 text-[10.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 disabled:opacity-50";
  const quietButton = full
    ? "tap inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-espresso-900/[0.14] px-3 py-2 text-[12px] font-semibold text-espresso-600 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 disabled:opacity-50"
    : "tap inline-flex items-center gap-1 rounded-lg border border-espresso-900/[0.14] px-2 py-1.5 text-[10.5px] font-semibold text-espresso-600 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 disabled:opacity-50";

  /* ------------------------------- the photo ----------------------------- */

  const photoPanel = (
    <div
      className={
        full
          ? "rounded-xl border border-espresso-900/[0.08] bg-cream-50/60 p-3 sm:p-3.5"
          : "mt-3 rounded-lg border border-espresso-900/[0.08] bg-cream-50/70 p-2.5"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-espresso-700">
          <Camera className="h-3 w-3 text-caramel-600" aria-hidden />
          One photo of this dish
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={preparingPhoto || generating}
          className="tap inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-espresso-900/[0.14] bg-white/80 px-2.5 py-1 text-[10.5px] font-semibold text-espresso-700 hover:border-espresso-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 disabled:opacity-50"
        >
          {preparingPhoto ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-3 w-3" aria-hidden />
          )}
          {photo ? "Change" : preparingPhoto ? "Preparing…" : "Choose photo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={`Choose a photo of ${item.name || "this dish"}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void choosePhoto(file);
          }}
        />
      </div>

      {photo ? (
        <div className="mt-2 flex items-start gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.previewUrl}
            alt={`Photo of ${fields.name || item.name}`}
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-lg border border-espresso-900/[0.08] object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-medium text-espresso-700">{photo.name}</p>
            <p className="text-[9.5px] text-espresso-400">{photo.kb} KB after compression</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void readWords()}
                disabled={reading || generating}
                className={quietButton}
              >
                {reading ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3 w-3" aria-hidden />
                )}
                {reading ? "Reading…" : "Read the words"}
              </button>
              <button
                type="button"
                onClick={() => void buildModel()}
                disabled={generating || reading || preparingPhoto}
                className={primaryButton}
              >
                {generating ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Rotate3d className="h-3 w-3" aria-hidden />
                )}
                {generating
                  ? `Building 3D… ${genSeconds}s`
                  : hasModel(item)
                    ? "Regenerate 3D"
                    : "Generate 3D model"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-[1.55] text-espresso-500">
          <ImageIcon className="mt-[1px] h-3 w-3 shrink-0 text-espresso-400" aria-hidden />
          <span>
            Pick one photo of the dish on its own — daylight, plain background. The same photo can
            write the description and build the model. It&apos;s sent for those two jobs and never
            stored or published.
          </span>
        </p>
      )}

      {preparingPhoto && (
        <p role="status" className="mt-1.5 flex items-center gap-1.5 text-[10px] text-espresso-500">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Shrinking the photo in your browser…
        </p>
      )}

      {generating && (
        <p role="status" className="mt-2 text-[10px] leading-[1.55] text-espresso-600">
          Building real geometry from the photo. Free GPUs are shared, so this can take a minute or
          two and sometimes waits in a queue. Nothing is charged, and nothing is saved until a model
          actually comes back.
        </p>
      )}

      {genError && (
        <div role="alert" className="mt-2 rounded-lg bg-[#FBEEE8] px-2.5 py-2">
          <p className="flex items-start gap-1.5 text-[10.5px] leading-[1.55] text-[#7A3520]">
            <AlertCircle className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
            <span>{genError.message}</span>
          </p>
          {genError.hint && (
            <p className="mt-1 pl-[18px] text-[10px] leading-[1.5] text-[#93604B]">{genError.hint}</p>
          )}
          {photo && (
            <button type="button" onClick={() => void buildModel()} className={`${quietButton} mt-1.5`}>
              <RefreshCw className="h-3 w-3" aria-hidden />
              Try again
            </button>
          )}
        </div>
      )}

      {genNote && (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 rounded-lg bg-sage-500/10 px-2.5 py-2 text-[10.5px] leading-[1.55] text-espresso-700"
        >
          <Check className="mt-[1px] h-3 w-3 shrink-0 text-sage-500" aria-hidden />
          <span>{genNote}</span>
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
    </div>
  );

  /* ------------------------------ the words ------------------------------ */

  const wordsPanel = (
    <div
      className={
        full
          ? "rounded-xl border border-espresso-900/[0.08] bg-white/70 p-3 sm:p-3.5"
          : "mt-3 rounded-lg border border-espresso-900/[0.08] bg-white/70 p-2.5"
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10.5px] font-semibold text-espresso-700">The words</p>
        {fromAi && (
          <span className="rounded-full bg-caramel-50 px-2 py-0.5 text-[9px] font-semibold text-caramel-600">
            from the photo — check it
          </span>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
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

  /* ------------------------------- the model ----------------------------- */

  const modelPanel = (
    <div
      className={
        full
          ? "rounded-xl border border-espresso-900/[0.08] bg-white/70 p-3 sm:p-3.5"
          : "mt-3 rounded-lg border border-espresso-900/[0.08] bg-white/70 p-2.5"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-espresso-700">
          <Rotate3d className="h-3 w-3 text-caramel-600" aria-hidden />
          3D model
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
            hasModel(item)
              ? "bg-sage-500/12 text-espresso-700"
              : "border border-espresso-900/[0.1] text-espresso-400"
          }`}
        >
          {hasModel(item) ? "Attached to this dish" : "Not built yet"}
        </span>
      </div>

      {hasModel(item) ? (
        <>
          <p className="mt-1.5 text-[10px] leading-[1.55] text-espresso-500">
            Customers see a &ldquo;See it in 3D&rdquo; button on this dish, and only this dish — a
            real mesh they can turn, pinch and open fullscreen
            {item.model?.by ? ` (built with ${item.model.by})` : ""}.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {previewModel && (
              <button type="button" onClick={() => setPreview(true)} className={primaryButton}>
                <Rotate3d className="h-3 w-3" aria-hidden />
                Open the viewer
              </button>
            )}
            {photo && (
              <button
                type="button"
                onClick={() => void buildModel()}
                disabled={generating}
                className={quietButton}
              >
                <RefreshCw className="h-3 w-3" aria-hidden />
                {generating ? "Rebuilding…" : "Regenerate"}
              </button>
            )}
            <button type="button" onClick={removeModel} className={quietButton}>
              <Trash2 className="h-3 w-3" aria-hidden />
              Remove model
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[10px] leading-[1.55] text-espresso-500">
            {photo
              ? "Press Generate 3D model above. The mesh is built from your photo on a free shared GPU."
              : "A model starts with one photo of the dish — that photo is the only input."}
          </p>
          {!photo && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={preparingPhoto || generating}
              className={`${quietButton} mt-2`}
            >
              <Camera className="h-3 w-3" aria-hidden />
              Add a photo to build the model
            </button>
          )}
          <ol className="mt-1.5 space-y-0.5 pl-3.5 text-[10px] leading-[1.55] text-espresso-500">
            <li className="list-decimal">One photo of the dish, on its own.</li>
            <li className="list-decimal">Generate — a minute or two on a free GPU.</li>
            <li className="list-decimal">Save changes to put it on the menu.</li>
          </ol>
        </>
      )}

      {manualModels && (
        <details className="group mt-2.5 rounded-lg bg-cream-50/80 p-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-espresso-400 hover:text-espresso-700 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
            Operator: attach a file directly
          </summary>

          <label className="mt-2 block">
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
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                Shown if the model can&apos;t load — a still beats a blank box.
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

          <button type="button" onClick={saveManualModel} className={`${primaryButton} mt-2`}>
            <Rotate3d className="h-3 w-3" aria-hidden />
            {hasModel(item) ? "Update from URL" : "Attach from URL"}
          </button>
        </details>
      )}

      <details className="group mt-2">
        <summary className="tap flex cursor-pointer list-none items-center gap-1 text-[10px] font-semibold text-espresso-600 hover:text-espresso-900 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
          How free 3D works here
        </summary>
        <div className="mt-1.5 space-y-1.5 text-[10px] leading-[1.55] text-espresso-500">
          <p>
            Your photo goes to an open-source model (TripoSR, MIT) running on a free shared GPU. It
            returns a real mesh with depth — not a picture laid flat — which is why it can be turned
            and lit.
          </p>
          <p>
            Free GPU time is small: a few models a day for the whole app, shared with everyone else.
            If the queue is full, the panel says so and you can try again later. Nothing is charged,
            ever, and nothing is generated unless a real model comes back.
          </p>
          <p>
            One photo can&apos;t show what a dish looks like from behind, so the back of the mesh is
            the model&apos;s best guess. A plain background with one dish gives the best result.
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
          Pick a dish, give it a photo, and press Generate. Nothing here touches a price, and
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

      {/* the halves ------------------------------------------------------ */}
      {full ? (
        <>
          <div className="mt-2">{photoPanel}</div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {wordsPanel}
            {modelPanel}
          </div>
        </>
      ) : (
        <>
          {photoPanel}
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
