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
  Store,
} from "lucide-react";

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

const LOADING_STEPS = [
  "Reading the details…",
  "Writing three captions…",
  "Choosing the hashtags…",
] as const;

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
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<Tone>("cozy");
  const [language, setLanguage] = useState<Language>("english");
  const [cafeName, setCafeName] = useState("");
  const [city, setCity] = useState("");
  const [showDetails, setShowDetails] = useState(false);

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

  const detailCount = useMemo(
    () =>
      [cafeName.trim(), city.trim()].filter(Boolean).length +
      (language === "hinglish" ? 1 : 0),
    [cafeName, city, language],
  );

  /* ----------------------------- generation ----------------------------- */

  const generate = useCallback(
    async (override?: { description?: string; tone?: Tone }) => {
      const text = (override?.description ?? description).trim();
      const activeTone = override?.tone ?? tone;

      if (text.length < 5) {
        setError({
          message: "Tell us a little about the photo first.",
          hint: "For example: “Iced latte with a croissant on a wooden table”.",
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
      const timeout = setTimeout(() => controller.abort(), 45_000);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: text,
            tone: activeTone,
            language,
            cafeName: cafeName.trim() || undefined,
            city: city.trim() || undefined,
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
        if (!payload?.captions?.length) {
          setError({
            message:
              "The response came back empty. Try rephrasing the description.",
          });
          setStatus("error");
          return;
        }

        setCaptions(payload.captions);
        setStatus("success");
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
    [description, tone, language, cafeName, city],
  );

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
      setLoadingStep((step) => Math.min(step + 1, LOADING_STEPS.length - 1));
    }, 2400);
    return () => clearInterval(id);
  }, [isLoading]);

  /* -------------------------------- copy -------------------------------- */

  const copy = useCallback(async (text: string, key: string) => {
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
  }, []);

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
    void copy(text, "all");
  };

  const runExample = (example: string) => {
    setDescription(example);
    void generate({ description: example });
  };

  /* -------------------------------- view -------------------------------- */

  return (
    <div id="studio" className="paper relative p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-espresso-400">
            Caption studio
          </p>
          <h2 className="mt-1 font-display text-[17px] font-semibold leading-snug tracking-tight text-espresso-900 sm:text-xl">
            Three options, ready to post.
          </h2>
        </div>
        <span className="tag hidden shrink-0 sm:inline-flex">Free · no account</span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!isLoading) void generate();
        }}
        noValidate
      >
        {/* description */}
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <label
              htmlFor="photo-description"
              className="text-[12px] font-semibold text-espresso-800 sm:text-[13px]"
            >
              Describe the photo
            </label>
            <span
              className={`shrink-0 text-[10.5px] tabular-nums ${
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
            placeholder="e.g. An iced latte beside a croissant on a walnut table…"
            className="field pretty-scroll min-h-[96px]"
            aria-describedby="description-help"
            disabled={isLoading}
          />
          <p
            id="description-help"
            className="mt-1.5 text-[10.5px] leading-snug text-espresso-500/90"
          >
            One line is enough. Props, light and mood help.
          </p>
        </div>

        {/* one-tap examples */}
        <div className="mt-3.5">
          <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
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
                className="pill px-2.5 py-1 text-[11px] disabled:opacity-50"
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        {/* optional details */}
        <div className="mt-3.5 overflow-hidden rounded-xl border border-espresso-900/10 bg-white/45">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            aria-expanded={showDetails}
            aria-controls="cafe-details"
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
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
                className={`h-3.5 w-3.5 text-espresso-500 transition-transform ${
                  showDetails ? "rotate-180" : ""
                }`}
              />
            </span>
          </button>

          {showDetails && (
            <div
              id="cafe-details"
              className="grid animate-fade-in gap-2.5 border-t border-espresso-900/10 px-3 py-3 sm:grid-cols-2"
            >
              <div className="min-w-0">
                <label
                  htmlFor="cafe-name"
                  className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
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
                  className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
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
                <span className="mb-1 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500">
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
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 ${
                          selected
                            ? "border-espresso-900 bg-espresso-900 text-cream-50"
                            : "border-espresso-900/10 bg-white/70 text-espresso-700 hover:border-espresso-900/25"
                        }`}
                      >
                        <span className="block text-[11.5px] font-semibold leading-tight">
                          {option.label}
                        </span>
                        <span
                          className={`block text-[9.5px] leading-tight ${
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
        <fieldset className="mt-3.5">
          <legend className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
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
                  className={`min-w-0 rounded-lg border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 ${
                    selected
                      ? "border-espresso-900 bg-espresso-900 text-cream-50"
                      : "border-espresso-900/10 bg-white/60 text-espresso-700 hover:border-espresso-900/25"
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
        <div className="mt-4">
          <button type="submit" disabled={isLoading} className="btn-primary group">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Writing your captions…
              </>
            ) : (
              <>
                Write my captions
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[10.5px] text-espresso-500/80">
            Free to try · No account · Your description isn&apos;t stored
          </p>
        </div>
      </form>

      {/* ------------------------------- errors ------------------------------- */}
      {status === "error" && error && (
        <div
          role="alert"
          className="mt-4 animate-fade-up rounded-xl border border-[#E4C6B8] bg-[#FBEEE8] p-3"
        >
          <div className="flex gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9C4527]" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold leading-snug text-[#7A3520]">
                {error.message}
              </p>
              {error.hint && (
                <p className="mt-1 break-words text-[11.5px] leading-relaxed text-[#93604B]">
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#7A3520] px-2.5 py-1.5 text-[11px] font-semibold text-cream-50 transition hover:bg-[#612A19] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A3520]/40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => textareaRef.current?.focus()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8B4A4] px-2.5 py-1.5 text-[11px] font-semibold text-[#7A3520] transition hover:bg-[#F5DCD1]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A3520]/30"
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
        {isLoading
          ? LOADING_STEPS[loadingStep]
          : status === "success"
            ? `${captions.length} captions ready.`
            : status === "error" && error
              ? error.message
              : ""}
      </p>

      <div ref={resultsRef} aria-busy={isLoading}>
        {/* idle: show the shape of the output */}
        {status === "idle" && (
          <div className="mt-4 rounded-xl border border-dashed border-espresso-900/15 bg-white/35 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                Example output
              </span>
              <span className="text-[10px] text-espresso-400">
                3 options · 5 hashtags each
              </span>
            </div>
            <p className="mt-2 font-display text-[13.5px] leading-relaxed text-espresso-700 sm:text-[14.5px]">
              {SAMPLE.caption}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {SAMPLE.hashtags.map((tag) => (
                <span key={tag} className="hashtag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-caramel-500" />
              <span className="text-[11.5px] font-medium text-espresso-700">
                {LOADING_STEPS[loadingStep]}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-espresso-900/10">
              <div className="h-full w-1/3 animate-slide rounded-full bg-caramel-500" />
            </div>

            <div className="mt-3 space-y-2">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="relative overflow-hidden rounded-xl border border-espresso-900/10 bg-white/60 p-3.5"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <div className="space-y-2">
                    <div className="h-2 w-1/4 rounded-full bg-espresso-900/10" />
                    <div className="h-2 w-full rounded-full bg-espresso-900/[0.07]" />
                    <div className="h-2 w-4/5 rounded-full bg-espresso-900/[0.07]" />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <div className="h-4 w-14 rounded bg-caramel-200/60" />
                      <div className="h-4 w-16 rounded bg-caramel-200/60" />
                      <div className="h-4 w-12 rounded bg-caramel-200/60" />
                    </div>
                  </div>
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                </div>
              ))}
            </div>
          </div>
        )}

        {status === "success" && captions.length > 0 && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Check className="h-3.5 w-3.5 shrink-0 text-sage-500" />
              <span className="text-[11.5px] font-semibold text-espresso-800">
                {captions.length} options
              </span>
              <span className="tag">{tone}</span>
              <span className="tag">{language}</span>
              <button
                type="button"
                onClick={copyAll}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-espresso-900/10 bg-white/60 px-2.5 py-1 text-[10.5px] font-semibold text-espresso-600 transition hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                {copiedKey === "all" ? (
                  <>
                    <Check className="h-3 w-3 text-sage-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy all
                  </>
                )}
              </button>
            </div>

            <div className="mt-2.5 space-y-2">
              {captions.map((item, index) => (
                <CaptionCard
                  key={`${index}-${item.caption.slice(0, 16)}`}
                  item={item}
                  index={index}
                  copiedKey={copiedKey}
                  onCopy={copy}
                  delay={index * 80}
                />
              ))}
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void generate()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-espresso-900 px-3 py-2.5 text-[11.5px] font-semibold text-cream-50 transition hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Generate again
              </button>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/60 px-3 py-2.5 text-[11.5px] font-semibold text-espresso-700 transition hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </button>
            </div>

            <a
              href="#packages"
              className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-espresso-900/10 bg-white/45 px-3 py-2.5 transition hover:border-espresso-900/20 hover:bg-white/70"
            >
              <span className="text-[11.5px] text-espresso-600">
                Want a month of these, written for you?
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-espresso-900">
                See packages
                <ArrowRight className="h-3 w-3" />
              </span>
            </a>
          </div>
        )}
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
  delay = 0,
}: {
  item: Caption;
  index: number;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  delay?: number;
}) {
  const captionKey = `caption-${index}`;
  const tagsKey = `hashtags-${index}`;

  return (
    <article
      className="animate-fade-up rounded-xl border border-espresso-900/10 bg-white/70 p-3.5 transition hover:border-espresso-900/20 sm:p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[9.5px] font-semibold tabular-nums tracking-[0.1em] text-espresso-400">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="h-px w-4 bg-espresso-900/15" />
        <span className="text-[9.5px] uppercase tracking-[0.12em] text-espresso-400">
          Option
        </span>
      </div>

      <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-espresso-900 sm:text-[14.5px]">
        {item.caption}
      </p>

      {item.hashtags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-dashed border-espresso-900/10 pt-2.5">
          <Hash className="h-3 w-3 shrink-0 text-espresso-300" />
          {item.hashtags.map((tag) => (
            <span key={tag} className="hashtag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <CopyButton
          copied={copiedKey === captionKey}
          label="Copy caption"
          onClick={() => onCopy(item.caption, captionKey)}
          ariaLabel={`Copy caption ${index + 1}`}
        />
        <CopyButton
          copied={copiedKey === tagsKey}
          label="Copy hashtags"
          onClick={() => onCopy(item.hashtags.join(" "), tagsKey)}
          ariaLabel={`Copy hashtags for caption ${index + 1}`}
          disabled={item.hashtags.length === 0}
        />
      </div>
    </article>
  );
}

function CopyButton({
  copied,
  label,
  onClick,
  ariaLabel,
  disabled = false,
}: {
  copied: boolean;
  label: string;
  onClick: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto ${
        copied
          ? "border-sage-500/30 bg-sage-100 text-sage-500"
          : "border-espresso-900/10 bg-white/70 text-espresso-600 hover:border-espresso-900/25 hover:text-espresso-900"
      }`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 animate-pop" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {label}
        </>
      )}
    </button>
  );
}
