"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  Globe,
  Hash,
  Heart,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
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

/* ========================================================================== */
/*  ✏️  EDIT ME — your contact details                                         */
/* ========================================================================== */
/**
 * 1. CONTACT_EMAIL → your real email. Drives the banner text and mailto link.
 * 2. CONTACT_PHONE → your WhatsApp number in international format,
 *    DIGITS ONLY, including the country code. Example: "919876543210"
 *    (91 = India, then the 10-digit number, no +, no spaces, no leading 0).
 */
const CONTACT_EMAIL = "areebausaf742@gmail.com";
const CONTACT_PHONE = "910000000000";
/* ========================================================================== */

const WHATSAPP_TEXT =
  "Hi Areeb! I found CafeCaption AI and I'd like a custom website or AI bot for my business.";

const LOADING_STEPS = [
  "Reading your photo description…",
  "Warming up the espresso machine…",
  "Writing three caption options…",
  "Sprinkling the hashtags on top…",
] as const;

type Status = "idle" | "loading" | "success" | "error";

interface UiError {
  message: string;
  hint?: string;
  retryAfter?: number;
}

export default function HomePage() {
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

  const generate = useCallback(async () => {
    const trimmed = description.trim();

    if (trimmed.length < 5) {
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
          description: trimmed,
          tone,
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
            "The AI returned an empty response. Try rephrasing your description.",
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
        hint: aborted
          ? "Gemini occasionally slows down during peak hours."
          : undefined,
      });
      setStatus("error");
    } finally {
      clearTimeout(timeout);
    }
  }, [description, tone, language, cafeName, city]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLoading) void generate();
  };

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
      setLoadingStep((step) =>
        Math.min(step + 1, LOADING_STEPS.length - 1),
      );
    }, 2400);
    return () => clearInterval(id);
  }, [isLoading]);

  /* -------------------------------- copy -------------------------------- */

  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older mobile browsers / non-secure contexts.
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

  const detailsSummary =
    [cafeName.trim(), city.trim()].filter(Boolean).join(" · ") || "Optional";

  /* -------------------------------- view -------------------------------- */

  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden">
      {/* Ambient warmth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-caramel-300/40 blur-3xl sm:h-96 sm:w-96" />
        <div className="absolute -right-24 top-24 h-64 w-64 rounded-full bg-sage-300/35 blur-3xl sm:h-80 sm:w-80" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-caramel-400/20 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-7 sm:px-6 sm:pb-16 sm:pt-12">
        {/* ------------------------------ header ------------------------------ */}
        <header className="mb-6 flex flex-col items-center text-center sm:mb-9">
          <div className="mb-4 flex items-center gap-2.5 sm:mb-5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-espresso-900 text-caramel-300 shadow-lift sm:h-10 sm:w-10">
              <Coffee className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.9} />
            </span>
            <span className="font-display text-[17px] font-semibold tracking-tight text-espresso-900 sm:text-lg">
              CafeCaption <span className="text-caramel-600">AI</span>
            </span>
          </div>

          <span className="mb-3.5 inline-flex items-center gap-1.5 rounded-full border border-espresso-900/10 bg-cream-50/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-espresso-500 backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em]">
            <Sparkles className="h-3 w-3 text-caramel-500 sm:h-3.5 sm:w-3.5" />
            Caption studio for café owners
          </span>

          <h1 className="max-w-lg text-balance font-display text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-espresso-900 sm:max-w-xl sm:text-5xl">
            Turn your café photos into{" "}
            <span className="italic text-caramel-600">captions that sell</span>.
          </h1>

          <p className="mt-3 max-w-md text-pretty text-[13px] leading-relaxed text-espresso-500 sm:mt-3.5 sm:max-w-lg sm:text-[15px]">
            Describe a photo in one line. Get three scroll-stopping Instagram
            captions, each with five hashtags — in English or Hinglish.
          </p>
        </header>

        {/* ------------------------------- card ------------------------------- */}
        <section className="paper relative overflow-hidden p-3.5 sm:p-6">
          <form onSubmit={handleSubmit} noValidate>
            {/* input */}
            <div className="relative">
              <div className="mb-2 flex items-end justify-between gap-3">
                <label
                  htmlFor="photo-description"
                  className="text-[13px] font-semibold text-espresso-800 sm:text-sm"
                >
                  Describe your photo
                </label>
                <span
                  className={`shrink-0 text-[11px] tabular-nums ${
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
                  setDescription(
                    event.target.value.slice(0, MAX_DESCRIPTION_LENGTH),
                  )
                }
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (!isLoading) void generate();
                  }
                }}
                rows={3}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="e.g. Iced latte with a croissant on a wooden table…"
                className="field pretty-scroll min-h-[100px] sm:min-h-[104px]"
                aria-describedby="description-help"
                disabled={isLoading}
              />
              <p
                id="description-help"
                className="mt-1.5 text-[11px] leading-snug text-espresso-500/90"
              >
                The more specific, the better — light, props, vibe, any offer.
              </p>
            </div>

            {/* examples */}
            <div className="mt-3.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-espresso-500/80">
                Quick start
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setDescription(example);
                      textareaRef.current?.focus();
                    }}
                    className="pill max-w-full text-left text-[11px] sm:text-xs"
                    disabled={isLoading}
                  >
                    <span className="max-w-[200px] truncate sm:max-w-none">
                      {example}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* optional cafe details */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-espresso-900/10 bg-white/40">
              <button
                type="button"
                onClick={() => setShowDetails((open) => !open)}
                aria-expanded={showDetails}
                aria-controls="cafe-details"
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Store className="h-3.5 w-3.5 shrink-0 text-caramel-600" />
                  <span className="text-[12.5px] font-semibold text-espresso-800">
                    Café details
                  </span>
                  <span className="truncate text-[11px] text-espresso-500/70">
                    {showDetails ? "optional" : detailsSummary}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {detailCount > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-caramel-500 px-1 text-[9.5px] font-bold text-white">
                      {detailCount}
                    </span>
                  )}
                  <ChevronDown
                    className={`h-4 w-4 text-espresso-500 transition-transform ${
                      showDetails ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {showDetails && (
                <div
                  id="cafe-details"
                  className="animate-fade-in grid gap-3 border-t border-dashed border-espresso-900/10 px-3.5 py-3 sm:grid-cols-2"
                >
                  <div className="min-w-0">
                    <label
                      htmlFor="cafe-name"
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-espresso-500/80"
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
                        placeholder="e.g. The Daily Grind"
                        className="field !py-2.5 pl-9 pr-3 text-base sm:text-[14px]"
                        disabled={isLoading}
                        autoComplete="organization"
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor="cafe-city"
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-espresso-500/80"
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
                        placeholder="e.g. Lucknow"
                        className="field !py-2.5 pl-9 pr-3 text-base sm:text-[14px]"
                        disabled={isLoading}
                        autoComplete="address-level2"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 sm:col-span-2">
                    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-espresso-500/80">
                      <Globe className="h-3 w-3" />
                      Caption language
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
                            className={`rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 ${
                              selected
                                ? "border-caramel-500/60 bg-caramel-100/80 text-espresso-900"
                                : "border-espresso-900/10 bg-white/60 text-espresso-700 hover:border-caramel-400/60"
                            }`}
                          >
                            <span className="block text-[12.5px] font-semibold leading-tight">
                              {option.label}
                            </span>
                            <span className="block text-[10.5px] leading-tight text-espresso-500/80">
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
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-espresso-500/80">
                Pick a vibe
              </legend>
              <div
                role="radiogroup"
                aria-label="Caption tone"
                className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2"
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
                      className={`group flex min-w-0 flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 sm:px-3 ${
                        selected
                          ? "border-espresso-900 bg-espresso-900 text-cream-50 shadow-lift"
                          : "border-espresso-900/10 bg-white/55 text-espresso-700 hover:border-caramel-400/60 hover:bg-caramel-100/60"
                      }`}
                    >
                      <span className="truncate text-[12.5px] font-semibold sm:text-[13px]">
                        {option.emoji} {option.label}
                      </span>
                      <span
                        className={`hidden text-[10.5px] leading-tight sm:block ${
                          selected ? "text-cream-200/75" : "text-espresso-500/90"
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
            <div className="mt-4 sm:mt-5">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary group"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                    Brewing your captions…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-[18px] w-[18px] text-caramel-300 transition group-hover:rotate-12 group-hover:text-caramel-200" />
                    Generate captions
                    <ArrowRight className="hidden h-4 w-4 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100 sm:block" />
                  </>
                )}
              </button>
              <p className="mt-2.5 text-center text-[11px] text-espresso-500/80">
                Free · No signup · Your description isn&apos;t stored
              </p>
            </div>
          </form>

          {/* ------------------------------ errors ------------------------------ */}
          {status === "error" && error && (
            <div
              role="alert"
              className="mt-5 animate-fade-up overflow-hidden rounded-2xl border border-[#E8C4B8] bg-[#FCEFE9]"
            >
              <div className="flex gap-2.5 p-3.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F6D8CD]">
                  <AlertCircle className="h-4 w-4 text-[#A8452C]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-[#7E3320]">
                    {error.message}
                  </p>
                  {error.hint && (
                    <p className="mt-1 break-words text-[12px] leading-relaxed text-[#9A5A45]">
                      {error.hint}
                    </p>
                  )}
                  {typeof error.retryAfter === "number" && (
                    <p className="mt-1 text-[11.5px] font-medium text-[#9A5A45]">
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E3320] px-2.5 py-1.5 text-[11.5px] font-semibold text-cream-50 transition hover:bg-[#652718] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E3320]/40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => textareaRef.current?.focus()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D9B3A4] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#7E3320] transition hover:bg-[#F6D8CD]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E3320]/30"
                    >
                      Edit description
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ----------------------------- results ----------------------------- */}
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
            {isLoading && (
              <div className="mt-5">
                <div className="flex items-center gap-2 px-0.5">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-caramel-500" />
                  <span className="text-[12px] font-medium text-espresso-700">
                    {LOADING_STEPS[loadingStep]}
                  </span>
                </div>

                {/* indeterminate progress bar */}
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-espresso-900/10">
                  <div className="h-full w-1/3 animate-slide rounded-full bg-caramel-500" />
                </div>

                <div className="mt-3 space-y-2.5">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="relative overflow-hidden rounded-2xl border border-espresso-900/10 bg-white/60 p-3.5 sm:p-4"
                      style={{ animationDelay: `${index * 90}ms` }}
                    >
                      <div className="space-y-2.5">
                        <div className="h-2.5 w-1/3 rounded-full bg-espresso-900/10" />
                        <div className="h-2.5 w-full rounded-full bg-espresso-900/[0.07]" />
                        <div className="h-2.5 w-4/5 rounded-full bg-espresso-900/[0.07]" />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <div className="h-5 w-16 rounded-md bg-caramel-200/60" />
                          <div className="h-5 w-20 rounded-md bg-caramel-200/60" />
                          <div className="h-5 w-14 rounded-md bg-caramel-200/60" />
                        </div>
                      </div>
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {status === "success" && captions.length > 0 && (
              <div className="mt-5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-0.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-sage-500" />
                  <span className="text-[12px] font-semibold text-espresso-700">
                    {captions.length} captions ready
                  </span>
                  <span className="rounded-full bg-caramel-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-caramel-600">
                    {tone}
                  </span>
                  <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sage-500">
                    {language}
                  </span>
                  <button
                    type="button"
                    onClick={copyAll}
                    className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-espresso-900/10 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-espresso-600 transition hover:border-caramel-400/60 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                  >
                    {copiedKey === "all" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-sage-500" />
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

                <div className="mt-2.5 space-y-2.5">
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

                {/* regenerate / reset */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void generate()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-espresso-900 px-3 py-2.5 text-[12px] font-semibold text-cream-50 shadow-sm transition hover:-translate-y-0.5 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 active:translate-y-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/60 px-3 py-2.5 text-[12px] font-semibold text-espresso-700 transition hover:border-caramel-400/60 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Start over
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ----------------------- marketing banner ----------------------- */}
          <div className="relative mt-6 overflow-hidden rounded-2xl bg-espresso-900 p-3.5 text-cream-100 sm:mt-7 sm:rounded-3xl sm:p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-grain opacity-[0.18] mix-blend-overlay"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-caramel-500/25 blur-2xl"
            />

            <div className="relative">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-300 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage-300" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-200/75">
                  Available for projects
                </span>
              </div>

              <p className="text-pretty font-display text-[15px] font-semibold leading-snug text-cream-50 sm:text-base">
                Want a custom AI bot or website for your business?
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-cream-200/70">
                AI tools, landing pages and menus that load fast and look
                sharp.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                    "CafeCaption AI — custom website or AI bot enquiry",
                  )}`}
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-cream-50 px-3 py-2.5 text-center text-[12px] font-semibold leading-tight text-espresso-900 shadow-lift transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-300 focus-visible:ring-offset-2 focus-visible:ring-offset-espresso-900 active:translate-y-0 sm:text-[12.5px]"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0 text-caramel-600" />
                  <span className="min-w-0 break-all">
                    Contact Areeb at{" "}
                    <span className="underline decoration-caramel-400/60 decoration-2 underline-offset-2">
                      {CONTACT_EMAIL}
                    </span>
                  </span>
                </a>

                <a
                  href={`https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(
                    WHATSAPP_TEXT,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Message Areeb on WhatsApp"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/15 px-3 py-2.5 text-[12px] font-semibold text-cream-50 transition hover:-translate-y-0.5 hover:border-[#25D366]/70 hover:bg-[#25D366]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-espresso-900 active:translate-y-0 sm:text-[12.5px]"
                >
                  <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[#4ADE80]" />
                  WhatsApp Areeb
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------ footer ------------------------------ */}
        <footer className="mt-5 flex flex-col items-center gap-1.5 text-center sm:mt-6">
          <div className="flex items-center gap-2 text-[11px] text-espresso-500/90">
            <Heart className="h-3.5 w-3.5" />
            <span>Made for independent cafés, bakeries &amp; coffee carts</span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-espresso-500/70">
            Powered by Google Gemini · Captions are AI-generated, give them a
            quick read before posting.
          </p>
        </footer>
      </div>
    </main>
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
  const captionCopied = copiedKey === captionKey;
  const tagsCopied = copiedKey === tagsKey;

  return (
    <article
      className="animate-fade-up rounded-2xl border border-espresso-900/10 bg-white/75 p-3.5 shadow-sm transition hover:border-caramel-400/40 hover:shadow-card sm:p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-espresso-900/5 text-[10px] font-bold tabular-nums text-espresso-500">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-espresso-500/70">
          Caption option
        </span>
      </div>

      <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-espresso-900 sm:text-[15px]">
        {item.caption}
      </p>

      {item.hashtags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-dashed border-espresso-900/10 pt-3">
          <Hash className="h-3 w-3 shrink-0 text-caramel-500" />
          {item.hashtags.map((tag) => (
            <span key={tag} className="hashtag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <CopyButton
          copied={captionCopied}
          label="Copy caption"
          onClick={() => onCopy(item.caption, captionKey)}
          ariaLabel={`Copy caption ${index + 1}`}
        />
        <CopyButton
          copied={tagsCopied}
          label="Copy hashtags"
          copiedLabel="Copied!"
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
  copiedLabel = "Copied!",
  onClick,
  ariaLabel,
  disabled = false,
}: {
  copied: boolean;
  label: string;
  copiedLabel?: string;
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
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5 ${
        copied
          ? "border-sage-500/30 bg-sage-100 text-sage-500"
          : "border-espresso-900/10 bg-white/70 text-espresso-600 hover:border-caramel-400/60 hover:text-espresso-900"
      }`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 animate-pop" />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  );
}
