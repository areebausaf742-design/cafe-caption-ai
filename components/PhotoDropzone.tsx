"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  ImagePlus,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import * as m from "framer-motion/m";

import {
  formatBytes,
  MAX_UPLOAD_BYTES,
  type PreparedImage,
} from "@/lib/image";
import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";

export interface PhotoDropzoneProps {
  /** The prepared photo, or null when the visitor hasn't added one. */
  image: PreparedImage | null;
  /** True while the browser is decoding/compressing a freshly picked file. */
  preparing: boolean;
  /** Friendly copy for a rejected file (wrong type, too big, unreadable). */
  error: string | null;
  disabled?: boolean;
  /** Overrides the idle headline (default: the generic upload copy). */
  title?: string;
  /** Replaces the idle sub-line under the headline. */
  hint?: string;
  /**
   * The generic picker offers "describe it instead" — wrong for tools where a
   * photo is mandatory (the menu digitiser), so that footer can be dropped.
   */
  showFallbackHint?: boolean;
  /** Receives the raw File; the parent runs it through `prepareImage`. */
  onSelect: (file: File) => void;
  onRemove: () => void;
}

/**
 * Photo picker for the caption studio.
 *
 * Three states, all the same height so the form never jumps:
 *   idle    → dashed target, camera icon, "Click to upload or drag & drop"
 *   working → shimmer + "Preparing your photo…"
 *   ready   → thumbnail, size before/after, replace + remove
 *
 * Keyboard: it's a real <button>, so Enter/Space opens the picker. Drag & drop
 * and paste both work; `accept="image/*"` opens the camera roll on iOS/Android.
 */
export default function PhotoDropzone({
  image,
  preparing,
  error,
  disabled = false,
  title,
  hint,
  showFallbackHint = true,
  onSelect,
  onRemove,
}: PhotoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const reduced = usePrefersReducedMotion();
  const inputId = useId();
  const helpId = `${inputId}-help`;

  const accept = useCallback(
    (files: FileList | null | undefined) => {
      const file = files?.[0];
      if (file) onSelect(file);
    },
    [onSelect],
  );

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-espresso-800 sm:text-[13px]">
          Photo{" "}
          <span className="font-medium text-espresso-500">optional</span>
        </span>
        {image && (
          <span className="shrink-0 text-[10.5px] tabular-nums text-espresso-500">
            {image.width}×{image.height}
          </span>
        )}
      </div>


      {image ? (
        <m.div
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="hairline relative flex items-center gap-3 rounded-xl bg-white/70 p-2.5"
        >
          {/* Thumbnail is the exact compressed image sent to Gemini. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.previewUrl}
            alt={`Preview of ${image.fileName}`}
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-lg border border-espresso-900/[0.08] object-cover shadow-sm"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-semibold text-espresso-900">
              {image.fileName}
            </p>
            <p className="mt-0.5 truncate text-[10.5px] tabular-nums text-espresso-500">
              {formatBytes(image.originalBytes)} →{" "}
              <span className="font-semibold text-caramel-600">
                {formatBytes(image.bytes)}
              </span>{" "}
              · ready to send
            </p>
            {/*
              The input *is* the control: a 44px-tall transparent overlay
              covering this label, so the tap target is the whole "Replace"
              strip and the browser opens the picker natively. A 1×1 `sr-only`
              input next to a button is the pattern tap-target audits flag.
            */}
            <label
              className={`relative mt-1 inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded text-[10.5px] font-semibold text-espresso-600 underline decoration-espresso-900/25 underline-offset-2 focus-within:ring-2 focus-within:ring-caramel-500/40 ${
                disabled || preparing ? "cursor-not-allowed opacity-50" : "hover:text-espresso-900"
              }`}
            >
              <input
                type="file"
                accept="image/*"
                aria-label="Replace the photo"
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                disabled={disabled || preparing}
                onChange={(event) => {
                  accept(event.target.files);
                  event.target.value = "";
                }}
              />
              <RefreshCw className="h-3 w-3" />
              Replace
            </label>
          </div>

          <button
            type="button"
            onClick={onRemove}
            disabled={disabled || preparing}
            aria-label="Remove photo"
            title="Remove photo"
            className="tap grid h-11 w-11 shrink-0 place-items-center rounded-full border border-espresso-900/[0.1] bg-white/80 text-espresso-500 hover:border-[#D8B4A4] hover:bg-[#FBEEE8] hover:text-[#9C4527] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </m.div>
      ) : (
        <label
          onDragOver={(event) => {
            if (disabled || preparing) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragEnter={(event) => {
            if (disabled || preparing) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (disabled || preparing) return;
            accept(event.dataTransfer?.files);
          }}
          onPaste={(event) => {
            if (disabled || preparing) return;
            const pasted = Array.from(event.clipboardData?.files ?? []);
            const firstImage = pasted.find((file) =>
              file.type.startsWith("image/"),
            );
            if (firstImage) {
              event.preventDefault();
              onSelect(firstImage);
            }
          }}
          className="group relative block"
        >
          {/*
            The whole zone is the file input: transparent, covering the dashed
            box, so the browser opens the picker natively and every audit that
            measures this element sees 116px × full width rather than a 1×1
            `sr-only` stub. Nothing is hidden from assistive tech — the input is
            the labelled control, and the copy below describes it.
          */}
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label="Upload a photo of your café or food"
            aria-describedby={helpId}
            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer rounded-xl opacity-0 disabled:cursor-not-allowed"
            disabled={disabled || preparing}
            onChange={(event) => {
              accept(event.target.files);
              // Reset so picking the same file twice still fires onChange.
              event.target.value = "";
            }}
          />

          <div
            className={`flex min-h-[116px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-[border-color,background-color,transform,box-shadow] duration-200 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-caramel-500/40 ${
              dragging
                ? "scale-[1.01] border-caramel-500 bg-caramel-100/70 shadow-[0_16px_36px_-24px_rgba(201,128,60,0.85)]"
                : "border-espresso-900/[0.18] bg-white/40 group-hover:border-caramel-400/70 group-hover:bg-white/70"
            } ${disabled || preparing ? "cursor-not-allowed opacity-60" : ""}`}
          >
          <span
            className={`grid h-10 w-10 place-items-center rounded-full transition duration-200 ${
              dragging
                ? "bg-caramel-500 text-cream-50"
                : "bg-caramel-100 text-caramel-600 group-hover:bg-caramel-200/80"
            }`}
          >
            {preparing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </span>

          <span className="text-[12.5px] font-semibold leading-snug text-espresso-800">
            {preparing
              ? "Preparing your photo…"
              : dragging
                ? "Drop it here"
                : (title ?? "Click to upload or drag & drop a photo")}
          </span>

          <span
            id={helpId}
            className="max-w-[34ch] text-[10.5px] leading-[1.55] text-espresso-500"
          >
            {preparing
              ? "Shrinking it in your browser so it uploads fast."
              : (hint ??
                `JPG, PNG or WebP · up to ${Math.round(
                  MAX_UPLOAD_BYTES / (1024 * 1024),
                )} MB · we downscale it before sending`)}
          </span>

          {preparing && (
            <span
              aria-hidden
              className="shimmer mt-1 block h-1 w-24 overflow-hidden rounded-full bg-espresso-900/[0.08]"
            />
          )}
          </div>
        </label>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-[11px] leading-[1.55] text-[#9C4527]"
        >
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {!image && !error && !preparing && showFallbackHint && (
        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] leading-[1.55] text-espresso-500">
          <ImagePlus className="h-3 w-3 shrink-0" />
          No photo handy? Just describe it below — no upload needed.
        </p>
      )}
    </div>
  );
}
