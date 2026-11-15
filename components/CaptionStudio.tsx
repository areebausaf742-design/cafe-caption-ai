"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Globe,
  Hash,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Store,
} from "lucide-react";
import * as m from "framer-motion/m";

import {
  EXAMPLES,
  LANGUAGES,
  MAX_CAFE_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  TONES,
  type ApiError,
  type Caption,
  type GenerateResponse,
  type Language,
  type Tone,
} from "@/lib/types";
import { track } from "@/lib/analytics";
import PhotoDropzone from "@/components/PhotoDropzone";
import LocalSeoStudio from "@/components/LocalSeoStudio";
import StudioTabs, { type StudioTab } from "@/components/studio/StudioTabs";
import CopyIconButton from "@/components/studio/CopyIconButton";
import {
  ImagePrepError,
  prepareImage,
  releaseImage,
  type PreparedImage,
} from "@/lib/image";
import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";

const TEXT_LOADING_STEPS = [
  "Reading the details…",
  "Writing three captions…",
  "Choosing the hashtags…",
] as const;

const PHOTO_LOADING_STEPS = [
  "Looking at your photo…",
  "Writing three captions…",
  "Choosing the hashtags…",
] as const;

const LOADING_STEP_COUNT = TEXT_LOADING_STEPS.length;

const SAMPLE = {
  caption:
    "Slow mornings, strong coffee. The corner table is yours if you get here before nine.",
  hashtags: ["#cafelife", "#slowmornings", "#latteart", "#coffeelover", "#lucknowcafes"],
};

type Status = "idle" | "loading" | "success" | "error";

interface UiError {
  message: string;
  hint?: string;
  retryAfter?: number;
}

export default function CaptionStudio() {
  const [tab, setTab] = useState<StudioTab>("captions");
  const reduced = usePrefersReducedMotion();

  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<Tone>("cozy");
  const [language, setLanguage] = useState<Language>("english");
  const [cafeName, setCafeName] = useState("");
  const [city, setCity] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const [image, setImage] = useState<PreparedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [error, setError] = useState<UiError | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = status === "loading";
  const remaining = MAX_DESCRIPTION_LENGTH - description.length;
  const hasPhoto = Boolean(image);
  const loadingSteps = hasPhoto ? PHOTO_LOADING_STEPS : TEXT_LOADING_STEPS;

  const detailCount = useMemo(
    () =>
      [cafeName.trim(), city.trim()].filter(Boolean).length +
      (language === "hinglish" ? 1 : 0),
    [cafeName, city, language],
  );

  /* ----------------------------- generation ----------------------------- */

  const generate = useCallback(
    async (override?: {
      description?: string;
      tone?: Tone;
      source?: "example" | "form";
    }) => {
      const text = (override?.description ?? description).trim();
      const activeTone = override?.tone ?? tone;
      // A photo carries the request on its own; text becomes optional context.
      const photo = image;

      if (!photo && text.length < 5) {
        setError({
          message: "Add a photo, or tell us a little about it.",
          hint: "Upload a shot from your café, or type something like “Iced latte with a croissant on a wooden table”.",
        });
        setStatus("error");
        textareaRef.current?.focus();
        return;
      }

      setStatus("loading");
      setError(null);
      setCaptions([]);
      setCopiedKey(null);
      setLoadingStep(0);

      const controller = new AbortController();
      // Longer than the server's 45s budget: the server should always get to
      // answer with a real error code before the browser gives up.
      const timeout = setTimeout(() => controller.abort(), 70_000);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "captions" as const,
            description: text || undefined,
            tone: activeTone,
            language,
            cafeName: cafeName.trim() || undefined,
            city: city.trim() || undefined,
            image: photo
              ? { mimeType: photo.mimeType, data: photo.base64 }
              : undefined,
          }),
          signal: controller.signal,
        });

        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const apiError = data as ApiError | null;
          const retryHeader = Number(response.headers.get("Retry-After"));
          const retryAfter =
            apiError?.retryAfter ??
            (Number.isFinite(retryHeader) && retryHeader > 0
              ? retryHeader
              : undefined);

          setError({
            message:
              apiError?.error ??
              `Something went wrong (${response.status}). Please try again.`,
            hint: apiError?.hint,
            retryAfter,
          });
          setStatus("error");
          return;
        }

        const payload = data as GenerateResponse | null;
        if (payload?.tool !== "captions" || !payload.captions.length) {
          setError({
            message:
              "The response came back empty. Try rephrasing the description.",
          });
          setStatus("error");
          return;
        }

        setCaptions(payload.captions);
        setStatus("success");
        track({
          name: "generate",
          props: {
            tone: activeTone,
            source: override?.source ?? "form",
            has_image: Boolean(photo),
          },
        });
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        setError({
          message: aborted
            ? "That took longer than expected. Please try again."
            : "Network hiccup — check your connection and try again.",
        });
        setStatus("error");
      } finally {
        clearTimeout(timeout);
      }
    },
    [description, tone, language, cafeName, city, image],
  );

  /* ------------------------------- photo -------------------------------- */

  const handlePhoto = useCallback(async (file: File) => {
    setImageError(null);
    setPreparingImage(true);

    try {
      const prepared = await prepareImage(file);
      setImage((previous) => {
        releaseImage(previous);
        return prepared;
      });
      track({ name: "photo_upload", props: { outcome: "ready" } });
    } catch (error) {
      setImageError(
        error instanceof ImagePrepError
          ? error.message
          : "That photo couldn't be processed. Try another one.",
      );
      track({ name: "photo_upload", props: { outcome: "rejected" } });
    } finally {
      setPreparingImage(false);
    }
  }, []);

  const removePhoto = useCallback(() => {
    setImage((previous) => {
      releaseImage(previous);
      return null;
    });
    setImageError(null);
  }, []);

  // Revoke the last preview URL when the studio unmounts, so blobs don't leak.
  const imageRef = useRef<PreparedImage | null>(null);
  useEffect(() => {
    imageRef.current = image;
  }, [image]);
  useEffect(() => () => releaseImage(imageRef.current), []);

  const reset = () => {
    setCaptions([]);
    setError(null);
    setStatus("idle");
    setCopiedKey(null);
    textareaRef.current?.focus();
  };

  /* ----------------------------- loading copy ---------------------------- */

  useEffect(() => {
    if (!isLoading) {
      setLoadingStep(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, LOADING_STEP_COUNT - 1));
    }, 2400);
    return () => clearInterval(id);
  }, [isLoading]);

  /* -------------------------------- copy -------------------------------- */

  const copy = useCallback(
    async (
      text: string,
      key: string,
      kind: "caption" | "hashtags" | "all" = "caption",
    ) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const scratch = document.createElement("textarea");
        scratch.value = text;
        scratch.setAttribute("readonly", "");
        scratch.style.position = "fixed";
        scratch.style.opacity = "0";
        document.body.appendChild(scratch);
        scratch.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(scratch);
        if (!ok) return;
      }

      setCopiedKey(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedKey(null), 2200);

      track({ name: "copy", props: { kind } });
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // On phones the results land below the fold — bring them into view.
  useEffect(() => {
    if (status !== "success") return;
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    const id = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [status]);

  const copyAll = () => {
    const text = captions
      .map(
        (item, index) =>
          `${index + 1}. ${item.caption}${
            item.hashtags.length ? `\n${item.hashtags.join(" ")}` : ""
          }`,
      )
      .join("\n\n———\n\n");
    void copy(text, "all", "all");
  };

  const runExample = (example: string) => {
    setDescription(example);
    void generate({ description: example, source: "example" });
  };

  /* -------------------------------- view -------------------------------- */

  return (
    <div
      id="studio"
      className="paper relative -mx-4 overflow-hidden rounded-none px-4 pb-5 pt-5 sm:mx-0 sm:rounded-[1.9rem] sm:px-6 sm:pb-6 sm:pt-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-espresso-400">
            Studio
          </p>
          <h2 className="mt-1.5 font-display text-[18px] font-semibold leading-snug tracking-[-0.01em] text-espresso-900 sm:text-[21px]">
            {tab === "captions"
              ? "Three options, ready to post."
              : "Win the local search."}
          </h2>
        </div>
        <span className="tag hidden shrink-0 sm:inline-flex">Free · no account</span>
      </div>

      <StudioTabs active={tab} onChange={setTab} />

      {tab === "captions" ? (
        <m.div
          key="captions"
          id="studio-panel-captions"
          role="tabpanel"
          aria-labelledby="studio-tab-captions"
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!isLoading) void generate();
            }}
            noValidate
          >
            {/* photo */}
            <PhotoDropzone
              image={image}
              preparing={preparingImage}
              error={imageError}
              disabled={isLoading}
              onSelect={(file) => void handlePhoto(file)}
              onRemove={removePhoto}
            />

            {/* description — optional once a photo is attached */}
            <div className="mt-4">
              <div className="mb-2 flex items-end justify-between gap-3">
                <label
                  htmlFor="photo-description"
                  className="text-[12.5px] font-semibold text-espresso-800 sm:text-[13px]"
                >
                  {hasPhoto ? "Anything to add?" : "Describe the photo"}{" "}
                  {hasPhoto && (
                    <span className="font-medium text-espresso-500/80">
                      optional
                    </span>
                  )}
                </label>
                <span
                  className={`shrink-0 text-[10.5px] tabular-nums transition-colors ${
                    remaining < 40 ? "text-caramel-600" : "text-espresso-500/70"
                  }`}
                >
                  {remaining < 40
                    ? `${remaining} left`
                    : `${description.length}/${MAX_DESCRIPTION_LENGTH}`}
                </span>
              </div>

              <textarea
                id="photo-description"
                ref={textareaRef}
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
                }
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (!isLoading) void generate();
                  }
                }}
                rows={3}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder={
                  hasPhoto
                    ? "e.g. Focus on the pastries, mention the quiet corner…"
                    : "e.g. An iced latte beside a croissant on a walnut table…"
                }
                className="field pretty-scroll min-h-[112px]"
                aria-describedby="description-help"
                disabled={isLoading}
              />
              <p
                id="description-help"
                className="mt-2 text-[10.5px] leading-[1.6] text-espresso-500/90"
              >
                {hasPhoto
                  ? "Optional. Your photo is doing the heavy lifting — add a detail only if you want it in the captions."
                  : "One line is enough. Props, light and mood help."}
              </p>
            </div>

            {/* one-tap examples */}
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                <Sparkles className="h-3 w-3" />
                Try one
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => runExample(example.text)}
                    disabled={isLoading}
                    title={example.text}
                    className="pill px-3 text-[11px] disabled:opacity-50"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>

            {/* optional details */}
            <div className="hairline mt-4 overflow-hidden rounded-xl bg-white/45">
              <button
                type="button"
                onClick={() => setShowDetails((open) => !open)}
                aria-expanded={showDetails}
                aria-controls="cafe-details"
                className="flex min-h-[46px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition duration-200 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-caramel-500/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Store className="h-3.5 w-3.5 shrink-0 text-espresso-400" />
                  <span className="text-[12px] font-semibold text-espresso-800">
                    Café details
                  </span>
                  <span className="truncate text-[10.5px] text-espresso-500/80">
                    optional
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {detailCount > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-espresso-900 px-1 text-[9px] font-bold text-cream-50">
                      {detailCount}
                    </span>
                  )}
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-espresso-500 transition-transform duration-200 ${
                      showDetails ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {showDetails && (
                <div
                  id="cafe-details"
                  className="grid animate-fade-in gap-3 border-t border-espresso-900/[0.08] px-3 py-3.5 sm:grid-cols-2"
                >
                  <div className="min-w-0">
                    <label
                      htmlFor="cafe-name"
                      className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
                    >
                      Café name
                    </label>
                    <div className="relative">
                      <Store className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-300" />
                      <input
                        id="cafe-name"
                        type="text"
                        value={cafeName}
                        onChange={(event) =>
                          setCafeName(
                            event.target.value.slice(0, MAX_CAFE_NAME_LENGTH),
                          )
                        }
                        maxLength={MAX_CAFE_NAME_LENGTH}
                        placeholder="The Daily Grind"
                        className="input py-2 pl-9 pr-3 text-base sm:text-[13.5px]"
                        disabled={isLoading}
                        autoComplete="organization"
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor="cafe-city"
                      className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
                    >
                      City
                    </label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-300" />
                      <input
                        id="cafe-city"
                        type="text"
                        value={city}
                        onChange={(event) =>
                          setCity(event.target.value.slice(0, MAX_CITY_LENGTH))
                        }
                        maxLength={MAX_CITY_LENGTH}
                        placeholder="Lucknow"
                        className="input py-2 pl-9 pr-3 text-base sm:text-[13.5px]"
                        disabled={isLoading}
                        autoComplete="address-level2"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 sm:col-span-2">
                    <span className="mb-1.5 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500">
                      <Globe className="h-3 w-3" />
                      Language
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Caption language"
                      className="grid grid-cols-2 gap-2"
                    >
                      {LANGUAGES.map((option) => {
                        const selected = language === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setLanguage(option.id)}
                            disabled={isLoading}
                            className={`tap flex min-h-[56px] flex-col justify-center rounded-lg border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 ${
                              selected
                                ? "border-espresso-900 bg-espresso-900 text-cream-50 shadow-[0_10px_24px_-16px_rgba(36,24,18,0.9)]"
                                : "border-espresso-900/[0.1] bg-white/70 text-espresso-700 hover:border-espresso-900/25"
                            }`}
                          >
                            <span className="block text-[11.5px] font-semibold leading-tight">
                              {option.label}
                            </span>
                            <span
                              className={`mt-0.5 block text-[9.5px] leading-tight ${
                                selected ? "text-cream-200/70" : "text-espresso-500/80"
                              }`}
                            >
                              {option.blurb}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* tone */}
            <fieldset className="mt-4">
              <legend className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                Tone
              </legend>
              <div
                role="radiogroup"
                aria-label="Caption tone"
                className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
              >
                {TONES.map((option) => {
                  const selected = tone === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTone(option.id)}
                      disabled={isLoading}
                      title={option.blurb}
                      className={`tap flex min-h-[44px] min-w-0 flex-col justify-center rounded-lg border px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 ${
                        selected
                          ? "border-espresso-900 bg-espresso-900 text-cream-50 shadow-[0_10px_24px_-16px_rgba(36,24,18,0.9)]"
                          : "border-espresso-900/[0.1] bg-white/60 text-espresso-700 hover:border-espresso-900/25"
                      }`}
                    >
                      <span className="block truncate text-[11.5px] font-semibold leading-tight">
                        {option.label}
                      </span>
                      <span
                        className={`block truncate text-[9.5px] leading-tight ${
                          selected ? "text-cream-200/70" : "text-espresso-500/80"
                        }`}
                      >
                        {option.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* submit */}
            <div className="mt-5">
              <button
                type="submit"
                disabled={isLoading || preparingImage}
                className="btn-primary group"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Writing your captions…
                  </>
                ) : (
                  <>
                    Write my captions
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
              <p className="mt-2.5 text-center text-[10.5px] text-espresso-500/80">
                Free to try · No account · Your photo and notes aren&apos;t stored
              </p>
            </div>
          </form>

          {/* ------------------------------- errors ------------------------------- */}
          {status === "error" && error && (
            <div
              role="alert"
              className="mt-4 animate-fade-up rounded-xl border border-[#E4C6B8] bg-[#FBEEE8] p-3.5"
            >
              <div className="flex gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9C4527]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold leading-snug text-[#7A3520]">
                    {error.message}
                  </p>
                  {error.hint && (
                    <p className="mt-1 break-words text-[11.5px] leading-[1.6] text-[#93604B]">
                      {error.hint}
                    </p>
                  )}
                  {typeof error.retryAfter === "number" && (
                    <p className="mt-1 text-[11px] font-medium text-[#93604B]">
                      Try again in about{" "}
                      {error.retryAfter < 60
                        ? `${error.retryAfter}s`
                        : `${Math.ceil(error.retryAfter / 60)} min`}
                      .
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void generate()}
                      className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#7A3520] px-3 py-2 text-[11.5px] font-semibold text-cream-50 hover:bg-[#612A19] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A3520]/40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => textareaRef.current?.focus()}
                      className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#D8B4A4] px-3 py-2 text-[11.5px] font-semibold text-[#7A3520] hover:bg-[#F5DCD1]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A3520]/30"
                    >
                      Edit description
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------- results ------------------------------ */}
          <p role="status" aria-live="polite" className="sr-only">
            {preparingImage
              ? "Preparing your photo…"
              : isLoading
                ? loadingSteps[loadingStep]
                : status === "success"
                  ? `${captions.length} captions ready.`
                  : status === "error" && error
                    ? error.message
                    : imageError
                      ? imageError
                      : ""}
          </p>

          <div ref={resultsRef} aria-busy={isLoading}>
            {/* idle: show the shape of the output */}
            {status === "idle" && (
              <div className="hairline mt-5 rounded-xl bg-white/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                    Sample result
                  </span>
                  <span className="text-[10px] text-espresso-400">
                    3 options · 5 hashtags each
                  </span>
                </div>
                <p className="mt-2.5 font-display text-[14px] leading-[1.65] text-espresso-700 sm:text-[15px]">
                  {SAMPLE.caption}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {SAMPLE.hashtags.map((tag) => (
                    <span key={tag} className="hashtag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isLoading && (
              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:200ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:400ms]" />
                  </span>
                  <span className="text-[11.5px] font-medium text-espresso-700">
                    {loadingSteps[loadingStep]}
                  </span>
                </div>

                {/* skeleton loaders shaped like the real results */}
                <div className="mt-3 space-y-2.5">
                  {[0, 1, 2].map((index) => (
                    <ResultSkeleton key={index} index={index} />
                  ))}
                </div>
              </div>
            )}

            {status === "success" && captions.length > 0 && (
              <m.div
                className="mt-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-sage-500" />
                  <span className="text-[11.5px] font-semibold text-espresso-800">
                    {captions.length} options
                  </span>
                  <span className="tag">{tone}</span>
                  <span className="tag">{language}</span>
                  {hasPhoto && <span className="tag">from photo</span>}
                  <button
                    type="button"
                    onClick={copyAll}
                    className="tap group/all relative ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-espresso-900/[0.1] bg-white/60 px-3.5 py-2 text-[10.5px] font-semibold text-espresso-600 hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                  >
                    {copiedKey === "all" ? (
                      <>
                        <Check className="h-3.5 w-3.5 animate-pop text-sage-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy all
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-3 space-y-2.5">
                  {captions.map((item, index) => (
                    <CaptionCard
                      key={`${index}-${item.caption.slice(0, 16)}`}
                      item={item}
                      index={index}
                      copiedKey={copiedKey}
                      onCopy={copy}
                    />
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void generate()}
                    className="tap inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-espresso-900 px-3 py-2.5 text-[11.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Generate again
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="tap inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/60 px-3 py-2.5 text-[11.5px] font-semibold text-espresso-700 hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Start over
                  </button>
                </div>

                <a
                  href="#packages"
                  className="hairline mt-3 flex min-h-[48px] items-center justify-between gap-3 rounded-xl bg-white/45 px-3.5 py-3 transition duration-200 hover:bg-white/75"
                >
                  <span className="text-[11.5px] leading-[1.6] text-espresso-600">
                    Want a month of these, written for you?
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-espresso-900">
                    See packages
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </a>
              </m.div>
            )}
          </div>
        </m.div>
      ) : (
        <m.div
          key="seo"
          id="studio-panel-seo"
          role="tabpanel"
          aria-labelledby="studio-tab-seo"
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <LocalSeoStudio
            cafeName={cafeName}
            city={city}
            language={language}
            tone={tone}
            onCafeName={setCafeName}
            onCity={setCity}
            onLanguage={setLanguage}
          />
        </m.div>
      )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton — shaped like a caption card, not a grey box                     */
/* -------------------------------------------------------------------------- */

const SKELETON_TAGS = [44, 58, 38, 64, 50];

function ResultSkeleton({ index }: { index: number }) {
  return (
    <div
      aria-hidden
      className="shimmer hairline relative rounded-xl bg-white/55 p-4"
      style={{ animationDelay: `${index * 160}ms` }}
    >
      <div className="flex items-center gap-2">
        <div className="skeleton-block h-2 w-4" />
        <span className="h-px w-4 bg-espresso-900/15" />
        <div className="skeleton-block h-2 w-9" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-espresso-900/[0.06]" />
          <div className="h-8 w-8 rounded-full bg-espresso-900/[0.06]" />
        </div>
      </div>

      <div className="mt-3.5 space-y-2">
        <div className="skeleton-block h-2.5 w-[94%]" />
        <div className="skeleton-block h-2.5 w-[87%]" />
        <div className="skeleton-block h-2.5 w-[58%]" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-espresso-900/[0.08] pt-2.5">
        {SKELETON_TAGS.map((width) => (
          <div
            key={width}
            className="h-[18px] rounded-md bg-caramel-200/55"
            style={{ width }}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Caption card                                                              */
/* -------------------------------------------------------------------------- */

function CaptionCard({
  item,
  index,
  copiedKey,
  onCopy,
}: {
  item: Caption;
  index: number;
  copiedKey: string | null;
  onCopy: (
    text: string,
    key: string,
    kind: "caption" | "hashtags" | "all",
  ) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const captionKey = `caption-${index}`;
  const tagsKey = `hashtags-${index}`;

  return (
    <m.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0 : 0.4,
        delay: reduced ? 0 : index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="hairline relative rounded-xl bg-white/70 p-4 transition-shadow duration-300 hover:shadow-[0_18px_40px_-30px_rgba(36,24,18,0.55)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[9.5px] font-semibold tabular-nums tracking-[0.1em] text-espresso-400">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="h-px w-4 bg-espresso-900/15" />
          <span className="text-[9.5px] uppercase tracking-[0.12em] text-espresso-400">
            Option
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <CopyIconButton
            variant="text"
            tooltip="Copy caption"
            ariaLabel={`Copy caption ${index + 1}`}
            copied={copiedKey === captionKey}
            onClick={() => onCopy(item.caption, captionKey, "caption")}
          />
          <CopyIconButton
            variant="hashtags"
            tooltip="Copy hashtags"
            ariaLabel={`Copy hashtags for caption ${index + 1}`}
            copied={copiedKey === tagsKey}
            onClick={() => onCopy(item.hashtags.join(" "), tagsKey, "hashtags")}
            disabled={item.hashtags.length === 0}
          />
        </div>
      </div>

      <p className="mt-2.5 whitespace-pre-line break-words text-[13.5px] leading-[1.65] text-espresso-900 sm:text-[14.5px]">
        {item.caption}
      </p>

      {item.hashtags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-dashed border-espresso-900/[0.09] pt-2.5">
          <Hash className="h-3 w-3 shrink-0 text-espresso-300" />
          {item.hashtags.map((tag) => (
            <span key={tag} className="hashtag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </m.article>
  );
}
