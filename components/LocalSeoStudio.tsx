"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Lightbulb,
  Loader2,
  MapPin,
  MessageSquareQuote,
  PenLine,
  RotateCcw,
  Sparkles,
  Store,
} from "lucide-react";
import * as m from "framer-motion/m";

import {
  GOOGLE_POST_MAX_CHARS,
  MAX_REVIEW_LENGTH,
  MAX_TOPIC_LENGTH,
  MIN_REVIEW_LENGTH,
  MIN_TOPIC_LENGTH,
  type GooglePost,
  type Language,
  type ReviewReply,
  type StarRating as Rating,
  type Tone,
} from "@/lib/types";
import { track } from "@/lib/analytics";
import { requestGeneration, retryAfterLabel, type StudioError } from "@/lib/studio-client";
import CopyIconButton from "@/components/studio/CopyIconButton";
import TrackedLink from "@/components/TrackedLink";
import StarPicker from "@/components/studio/StarRating";
import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";

type SeoTool = "review_reply" | "google_post";
type Status = "idle" | "loading" | "success" | "error";

const TOOLS: {
  id: SeoTool;
  label: string;
  blurb: string;
  icon: typeof PenLine;
}[] = [
  {
    id: "review_reply",
    label: "Review responder",
    blurb: "3 replies to a Google review",
    icon: MessageSquareQuote,
  },
  {
    id: "google_post",
    label: "Google post",
    blurb: "A 100–150 word update",
    icon: PenLine,
  },
];

const REVIEW_PLACEHOLDER =
  "Paste the review here — e.g. “Lovely place but my cold brew took 25 minutes and the staff seemed annoyed when I asked about it.”";

interface ReplyState {
  status: Status;
  replies: ReviewReply[];
  error: StudioError | null;
}

interface PostState {
  status: Status;
  post: GooglePost | null;
  error: StudioError | null;
}

export default function LocalSeoStudio({
  cafeName,
  city,
  language,
  tone,
  onCafeName,
  onCity,
  onLanguage,
}: {
  cafeName: string;
  city: string;
  language: Language;
  tone: Tone;
  onCafeName: (value: string) => void;
  onCity: (value: string) => void;
  onLanguage: (value: Language) => void;
}) {
  const [tool, setTool] = useState<SeoTool>("review_reply");

  const [review, setReview] = useState("");
  const [rating, setRating] = useState<Rating | null>(null);
  const [contact, setContact] = useState("");
  const [topic, setTopic] = useState("");

  const [replyState, setReplyState] = useState<ReplyState>({
    status: "idle",
    replies: [],
    error: null,
  });
  const [postState, setPostState] = useState<PostState>({
    status: "idle",
    post: null,
    error: null,
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLTextAreaElement>(null);
  const topicRef = useRef<HTMLInputElement>(null);

  const reduced = usePrefersReducedMotion();
  const active = tool === "review_reply" ? replyState : postState;
  const isLoading = active.status === "loading";

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  /* -------------------------------- copy -------------------------------- */

  const copy = useCallback(
    async (text: string, key: string, kind: "reply" | "post" | "post_cta") => {
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

  /* ----------------------------- generation ----------------------------- */

  const generateReplies = useCallback(async () => {
    const text = review.trim();

    if (text.length < MIN_REVIEW_LENGTH) {
      setReplyState({
        status: "error",
        replies: [],
        error: {
          message: "Paste the customer's review first.",
          hint: "Even a sentence is enough — copy it straight from your Google profile.",
          status: 400,
        },
      });
      reviewRef.current?.focus();
      return;
    }

    if (!rating) {
      setReplyState({
        status: "error",
        replies: [],
        error: {
          message: "Pick the star rating the customer gave.",
          hint: "The rating decides the strategy: 1–2★ gets an apology and a fix, 4–5★ gets a warm thank-you.",
          status: 400,
        },
      });
      return;
    }

    setReplyState({ status: "loading", replies: [], error: null });
    setCopiedKey(null);

    const outcome = await requestGeneration({
      type: "review_reply",
      review: text,
      rating,
      contact: contact.trim() || undefined,
      cafeName: cafeName.trim() || undefined,
      city: city.trim() || undefined,
      language,
      tone,
    });

    if (!outcome.ok) {
      setReplyState({ status: "error", replies: [], error: outcome.error });
      return;
    }

    if (outcome.data.tool !== "review_reply" || !outcome.data.replies.length) {
      setReplyState({
        status: "error",
        replies: [],
        error: {
          message: "The replies came back empty. Try again — the review was understood.",
          status: 502,
        },
      });
      return;
    }

    setReplyState({
      status: "success",
      replies: outcome.data.replies,
      error: null,
    });

    track({
      name: "seo_generate",
      props: { tool: "review_reply", rating },
    });
  }, [review, rating, contact, cafeName, city, language, tone]);

  const generatePost = useCallback(async () => {
    const brief = topic.trim();

    if (brief.length < MIN_TOPIC_LENGTH) {
      setPostState({
        status: "error",
        post: null,
        error: {
          message: "Tell us what the post is about.",
          hint: "One line is enough — “New winter menu launch”, “Live acoustic night on Friday”.",
          status: 400,
        },
      });
      topicRef.current?.focus();
      return;
    }

    setPostState({ status: "loading", post: null, error: null });
    setCopiedKey(null);

    const outcome = await requestGeneration({
      type: "google_post",
      topic: brief,
      cafeName: cafeName.trim() || undefined,
      city: city.trim() || undefined,
      language,
      tone,
    });

    if (!outcome.ok) {
      setPostState({ status: "error", post: null, error: outcome.error });
      return;
    }

    if (outcome.data.tool !== "google_post" || !outcome.data.post) {
      setPostState({
        status: "error",
        post: null,
        error: { message: "The post came back empty. Please try again.", status: 502 },
      });
      return;
    }

    setPostState({ status: "success", post: outcome.data.post, error: null });

    track({ name: "seo_generate", props: { tool: "google_post", rating: 0 } });
  }, [topic, cafeName, city, language, tone]);

  const retry = useCallback(() => {
    if (tool === "review_reply") void generateReplies();
    else void generatePost();
  }, [tool, generateReplies, generatePost]);

  const switchTool = (next: SeoTool) => {
    setTool(next);
    setCopiedKey(null);
  };

  const reset = () => {
    if (tool === "review_reply") {
      setReplyState({ status: "idle", replies: [], error: null });
      reviewRef.current?.focus();
    } else {
      setPostState({ status: "idle", post: null, error: null });
      topicRef.current?.focus();
    }
    setCopiedKey(null);
  };

  // On phones the results land below the fold — bring them into view.
  useEffect(() => {
    if (active.status !== "success") return;
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    const id = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [active.status, tool]);

  const reviewCharsLeft = MAX_REVIEW_LENGTH - review.length;

  /* -------------------------------- view -------------------------------- */

  return (
    <div>
      {/* tool toggle */}
      <div
        role="radiogroup"
        aria-label="Google tool"
        className="grid grid-cols-2 gap-2"
      >
        {TOOLS.map((option) => {
          const selected = tool === option.id;
          const Icon = option.icon;

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => switchTool(option.id)}
              disabled={isLoading}
              className={`tap relative flex min-h-[58px] items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 ${
                selected
                  ? "border-espresso-900 bg-espresso-900 text-cream-50 shadow-[0_10px_24px_-16px_rgba(36,24,18,0.9)]"
                  : "border-espresso-900/[0.1] bg-white/60 text-espresso-700 hover:border-espresso-900/25"
              }`}
            >
              <Icon
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  selected ? "text-caramel-300" : "text-espresso-400"
                }`}
                aria-hidden
              />
              <span className="min-w-0">
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
              </span>
            </button>
          );
        })}
      </div>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (isLoading) return;
          if (tool === "review_reply") void generateReplies();
          else void generatePost();
        }}
        noValidate
      >
        {tool === "review_reply" ? (
          <>
            <div className="mb-2 flex items-end justify-between gap-3">
              <label
                htmlFor="review-text"
                className="text-[12.5px] font-semibold text-espresso-800 sm:text-[13px]"
              >
                Paste the review
              </label>
              <span
                className={`shrink-0 text-[10.5px] tabular-nums transition-colors ${
                  reviewCharsLeft < 80 ? "text-caramel-600" : "text-espresso-500/70"
                }`}
              >
                {reviewCharsLeft < 80
                  ? `${reviewCharsLeft} left`
                  : `${review.length}/${MAX_REVIEW_LENGTH}`}
              </span>
            </div>

            <textarea
              id="review-text"
              ref={reviewRef}
              value={review}
              onChange={(event) =>
                setReview(event.target.value.slice(0, MAX_REVIEW_LENGTH))
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  if (!isLoading) void generateReplies();
                }
              }}
              rows={4}
              maxLength={MAX_REVIEW_LENGTH}
              placeholder={REVIEW_PLACEHOLDER}
              className="field pretty-scroll min-h-[112px]"
              aria-describedby="review-help"
              disabled={isLoading}
            />
            <p
              id="review-help"
              className="mt-2 text-[10.5px] leading-[1.6] text-espresso-500/90"
            >
              Nothing is posted automatically — you copy the reply you like into
              your Google profile.
            </p>

            <div className="mt-3.5">
              <span
                id="rating-label"
                className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400"
              >
                Star rating they gave
              </span>
              <StarPicker
                value={rating}
                onChange={setRating}
                disabled={isLoading}
                describedBy="rating-label"
              />
            </div>

            <div className="mt-3">
              <label
                htmlFor="review-contact"
                className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
              >
                Email for unhappy customers · optional
              </label>
              <input
                id="review-contact"
                type="text"
                value={contact}
                onChange={(event) => setContact(event.target.value.slice(0, 120))}
                maxLength={120}
                placeholder="hello@yourcafe.in"
                className="input py-2 text-base sm:text-[13.5px]"
                disabled={isLoading}
                autoComplete="email"
              />
              <p className="mt-1.5 text-[10px] leading-[1.55] text-espresso-500/80">
                Used only inside 1–2★ replies, so the reviewer has a private way
                to reach you.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-end justify-between gap-3">
              <label
                htmlFor="post-topic"
                className="text-[12.5px] font-semibold text-espresso-800 sm:text-[13px]"
              >
                What&apos;s the update?
              </label>
              <span className="shrink-0 text-[10.5px] tabular-nums text-espresso-500/70">
                {topic.length}/{MAX_TOPIC_LENGTH}
              </span>
            </div>

            <input
              id="post-topic"
              ref={topicRef}
              type="text"
              value={topic}
              onChange={(event) => setTopic(event.target.value.slice(0, MAX_TOPIC_LENGTH))}
              maxLength={MAX_TOPIC_LENGTH}
              placeholder="e.g. New winter menu launch"
              className="input py-2.5 text-base sm:text-[13.5px]"
              aria-describedby="post-help"
              disabled={isLoading}
            />
            <p
              id="post-help"
              className="mt-2 text-[10.5px] leading-[1.6] text-espresso-500/90"
            >
              One line is enough. We&apos;ll add local keywords, emojis and a call
              to action, and keep it under {GOOGLE_POST_MAX_CHARS.toLocaleString("en-IN")} characters.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {["New winter menu launch", "Live music Friday", "Fresh bakes at 8am"].map(
                (idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => setTopic(idea)}
                    disabled={isLoading}
                    className="pill px-3 text-[11px] disabled:opacity-50"
                  >
                    {idea}
                  </button>
                ),
              )}
            </div>
          </>
        )}

        {/* café details — shared by both tools */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <div className="min-w-0">
            <label
              htmlFor="seo-cafe-name"
              className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
            >
              Café name
            </label>
            <div className="relative">
              <Store className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-300" />
              <input
                id="seo-cafe-name"
                type="text"
                value={cafeName}
                onChange={(event) => onCafeName(event.target.value.slice(0, 60))}
                maxLength={60}
                placeholder="The Daily Grind"
                className="input py-2 pl-9 pr-3 text-base sm:text-[13.5px]"
                disabled={isLoading}
                autoComplete="organization"
              />
            </div>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="seo-cafe-city"
              className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
            >
              City
            </label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-300" />
              <input
                id="seo-cafe-city"
                type="text"
                value={city}
                onChange={(event) => onCity(event.target.value.slice(0, 60))}
                maxLength={60}
                placeholder="Lucknow"
                className="input py-2 pl-9 pr-3 text-base sm:text-[13.5px]"
                disabled={isLoading}
                autoComplete="address-level2"
              />
            </div>
          </div>
        </div>

        {/* language — matches the caption tab's setting */}
        <div className="mt-3">
          <div
            role="radiogroup"
            aria-label="Language"
            className="inline-flex rounded-full bg-white/55 p-0.5 hairline"
          >
            {(["english", "hinglish"] as Language[]).map((option) => {
              const selected = language === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onLanguage(option)}
                  disabled={isLoading}
                  className={`tap min-h-[44px] rounded-full px-3 text-[11px] font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 ${
                    selected
                      ? "bg-espresso-900 text-cream-50"
                      : "text-espresso-600 hover:text-espresso-900"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary group"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tool === "review_reply" ? "Writing three replies…" : "Writing your post…"}
              </>
            ) : (
              <>
                {tool === "review_reply" ? "Write 3 replies" : "Write the post"}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          <p className="mt-2.5 text-center text-[10.5px] text-espresso-500/80">
            Free to try · No account · Nothing is posted for you
          </p>
        </div>
      </form>

      {/* -------------------------------- errors ------------------------------- */}
      {active.status === "error" && active.error && (
        <div
          role="alert"
          className="mt-4 animate-fade-up rounded-xl border border-[#E4C6B8] bg-[#FBEEE8] p-3.5"
        >
          <div className="flex gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9C4527]" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold leading-snug text-[#7A3520]">
                {active.error.message}
              </p>
              {active.error.hint && (
                <p className="mt-1 break-words text-[11.5px] leading-[1.6] text-[#93604B]">
                  {active.error.hint}
                </p>
              )}
              {typeof active.error.retryAfter === "number" && (
                <p className="mt-1 text-[11px] font-medium text-[#93604B]">
                  Try again in {retryAfterLabel(active.error.retryAfter)}.
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={retry}
                  className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#7A3520] px-3 py-2 text-[11.5px] font-semibold text-cream-50 hover:bg-[#612A19] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A3520]/40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() =>
                    tool === "review_reply"
                      ? reviewRef.current?.focus()
                      : topicRef.current?.focus()
                  }
                  className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#D8B4A4] px-3 py-2 text-[11.5px] font-semibold text-[#7A3520] hover:bg-[#F5DCD1]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A3520]/30"
                >
                  Edit the details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------- results ------------------------------ */}
      <p role="status" aria-live="polite" className="sr-only">
        {isLoading
          ? tool === "review_reply"
            ? "Writing three replies…"
            : "Writing your Google post…"
          : active.status === "success"
            ? tool === "review_reply"
              ? `${replyState.replies.length} replies ready.`
              : `Post ready, ${postState.post?.characters ?? 0} characters.`
            : active.status === "error" && active.error
              ? active.error.message
              : ""}
      </p>

      <div ref={resultsRef} aria-busy={isLoading}>
        {/* idle: show the shape of the output */}
        {active.status === "idle" &&
          (tool === "review_reply" ? (
            <div className="hairline mt-5 rounded-xl bg-white/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                  Sample reply
                </span>
                <span className="text-[10px] text-espresso-400">
                  3 strategies · one per card
                </span>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-[1.65] text-espresso-700">
                “Thank you for taking the time to tell us, Aarti — a 25-minute
                wait isn&apos;t the experience we want to give anyone. We&apos;d
                love to make it right: please email us at hello@yourcafe.in and
                we&apos;ll sort it out. The cold brew is on us next time.”
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Professional & Grateful", "Warm & Inviting", "Apologetic & Solution-Oriented"].map(
                  (label) => (
                    <span key={label} className="hashtag">
                      {label}
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="hairline mt-5 rounded-xl bg-white/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                  Sample post
                </span>
                <span className="text-[10px] text-espresso-400">
                  100–150 words · under 1,500 characters
                </span>
              </div>
              <p className="mt-2.5 font-display text-[14px] leading-[1.6] text-espresso-800">
                Winter is here — and so is the new menu.
              </p>
              <p className="mt-1.5 text-[12px] leading-[1.65] text-espresso-600">
                Come in for a spiced jaggery latte and a warm cardamom bun, baked
                fresh every morning in our Hazratganj kitchen…
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["best cafe in Lucknow", "freshly baked pastries near me"].map((tag) => (
                  <span key={tag} className="hashtag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}

        {isLoading && (
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:200ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:400ms]" />
              </span>
              <span className="text-[11.5px] font-medium text-espresso-700">
                {tool === "review_reply"
                  ? "Reading the review and writing three angles…"
                  : "Writing a post Google will like…"}
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {tool === "review_reply"
                ? [0, 1, 2].map((index) => <ReplySkeleton key={index} index={index} />)
                : <PostSkeleton />}
            </div>
          </div>
        )}

        {/* ------------------------------ replies ------------------------------ */}
        {tool === "review_reply" &&
          replyState.status === "success" &&
          replyState.replies.length > 0 && (
            <m.div
              className="mt-5"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Check className="h-3.5 w-3.5 shrink-0 text-sage-500" />
                <span className="text-[11.5px] font-semibold text-espresso-800">
                  {replyState.replies.length} replies
                </span>
                {rating && (
                  <span className="tag">
                    {rating}★ {rating <= 2 ? "recovery" : rating === 3 ? "balanced" : "appreciation"}
                  </span>
                )}
                <span className="tag">{language}</span>
              </div>

              <div className="mt-3 space-y-2.5">
                {replyState.replies.map((reply, index) => (
                  <ReplyCard
                    key={`${index}-${reply.label}`}
                    reply={reply}
                    index={index}
                    copied={copiedKey === `reply-${index}`}
                    onCopy={() =>
                      void copy(reply.text, `reply-${index}`, "reply")
                    }
                    reduced={reduced}
                  />
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void generateReplies()}
                  className="tap inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-espresso-900 px-3 py-2.5 text-[11.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Three more
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="tap inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/60 px-3 py-2.5 text-[11.5px] font-semibold text-espresso-700 hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Next review
                </button>
              </div>
            </m.div>
          )}

        {/* -------------------------------- post -------------------------------- */}
        {tool === "google_post" && postState.status === "success" && postState.post && (
          <m.div
            className="mt-5"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Check className="h-3.5 w-3.5 shrink-0 text-sage-500" />
              <span className="text-[11.5px] font-semibold text-espresso-800">
                Post ready
              </span>
              <span className="tag">{language}</span>
              {postState.post.keywords[0] && (
                <span className="tag hidden sm:inline-flex">
                  local SEO
                </span>
              )}
            </div>

            <article className="hairline mt-3 rounded-xl bg-white/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-display text-[14.5px] font-semibold leading-snug text-espresso-900">
                  {postState.post.heading}
                </p>
                <CopyIconButton
                  variant="text"
                  tooltip="Copy post"
                  ariaLabel="Copy the Google post"
                  copied={copiedKey === "post-all"}
                  onClick={() => void copy(wholePost(postState.post!), "post-all", "post")}
                />
              </div>

              <p className="mt-2 whitespace-pre-line break-words text-[13px] leading-[1.7] text-espresso-900 sm:text-[13.5px]">
                {postState.post.body}
              </p>

              {postState.post.keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-dashed border-espresso-900/[0.09] pt-2.5">
                  <Sparkles className="h-3 w-3 shrink-0 text-espresso-300" />
                  {postState.post.keywords.map((keyword) => (
                    <span key={keyword} className="hashtag">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 border-t border-dashed border-espresso-900/[0.09] pt-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="h-1 overflow-hidden rounded-full bg-espresso-900/[0.08]">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${
                          postState.post.characters > 1_450
                            ? "bg-caramel-500"
                            : "bg-sage-500"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (postState.post.characters / GOOGLE_POST_MAX_CHARS) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] tabular-nums text-espresso-500/80">
                      {postState.post.characters.toLocaleString("en-IN")} /{" "}
                      {GOOGLE_POST_MAX_CHARS.toLocaleString("en-IN")} characters ·{" "}
                      {countWords(postState.post.body)} words
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void copy(postState.post!.callToAction, "post-cta", "post_cta")
                    }
                    className="tap inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-espresso-900/[0.1] bg-white/60 px-3 text-[10.5px] font-semibold text-espresso-600 hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                  >
                    {copiedKey === "post-cta" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-sage-500" />
                        Copied
                      </>
                    ) : (
                      <>Copy CTA</>
                    )}
                  </button>
                </div>
              </div>
            </article>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void generatePost()}
                className="tap inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-espresso-900 px-3 py-2.5 text-[11.5px] font-semibold text-cream-50 hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Another angle
              </button>
              <button
                type="button"
                onClick={reset}
                className="tap inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/60 px-3 py-2.5 text-[11.5px] font-semibold text-espresso-700 hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New post
              </button>
            </div>
          </m.div>
        )}
      </div>

      <ValueAnchor />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Reply card                                                                */
/* -------------------------------------------------------------------------- */

function ReplyCard({
  reply,
  index,
  copied,
  onCopy,
  reduced,
}: {
  reply: ReviewReply;
  index: number;
  copied: boolean;
  onCopy: () => void;
  reduced: boolean;
}) {
  return (
    <m.article
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0 : 0.4,
        delay: reduced ? 0 : index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="hairline relative rounded-xl bg-white/70 p-4 transition-shadow duration-300 hover:shadow-[0_18px_40px_-30px_rgba(36,24,18,0.55)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1">
          <span className="text-[9.5px] font-semibold tabular-nums tracking-[0.1em] text-espresso-400">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-espresso-500">
            {reply.label}
          </span>
        </div>
        <CopyIconButton
          variant="text"
          tooltip={copied ? "Copied" : "Copy reply"}
          ariaLabel={`Copy reply ${index + 1}: ${reply.label}`}
          copied={copied}
          onClick={onCopy}
        />
      </div>

      <p className="mt-2 whitespace-pre-line break-words text-[13px] leading-[1.7] text-espresso-900 sm:text-[13.5px]">
        {reply.text}
      </p>
    </m.article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Value anchor                                                              */
/* -------------------------------------------------------------------------- */

function ValueAnchor() {
  return (
    <div className="hairline mt-5 rounded-xl bg-white/45 p-3.5">
      <p className="flex gap-2 text-[11.5px] leading-[1.65] text-espresso-700">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-caramel-500" aria-hidden />
        <span>
          <strong className="font-semibold text-espresso-900">💡 Did you know?</strong>{" "}
          Businesses that reply to reviews are 2.5x more likely to be chosen by
          customers.
        </span>
      </p>
      <TrackedLink
        href="#packages"
        location="seo_studio"
        label="launch_kit"
        className="group mt-2.5 flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-espresso-900/[0.035] px-3 py-2.5 text-[11.5px] leading-[1.6] text-espresso-700 transition hover:bg-espresso-900/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
      >
        <span>
          Want me to manage your Google profile and post 4 times a month? This is
          included in the <strong className="font-semibold text-espresso-900">₹10,000 Café Launch Kit</strong>.
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-espresso-500 transition-transform duration-200 group-hover:translate-x-0.5" />
      </TrackedLink>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeletons                                                                 */
/* -------------------------------------------------------------------------- */

function ReplySkeleton({ index }: { index: number }) {
  return (
    <div
      aria-hidden
      className="shimmer hairline relative rounded-xl bg-white/55 p-4"
      style={{ animationDelay: `${index * 160}ms` }}
    >
      <div className="flex items-center gap-2">
        <div className="skeleton-block h-2 w-4" />
        <div className="skeleton-block h-2 w-24" />
        <div className="ml-auto h-8 w-8 rounded-full bg-espresso-900/[0.06]" />
      </div>
      <div className="mt-3.5 space-y-2">
        <div className="skeleton-block h-2.5 w-[95%]" />
        <div className="skeleton-block h-2.5 w-[88%]" />
        <div className="skeleton-block h-2.5 w-[64%]" />
      </div>
    </div>
  );
}

function PostSkeleton() {
  return (
    <div aria-hidden className="shimmer hairline relative rounded-xl bg-white/55 p-4">
      <div className="skeleton-block h-3 w-3/4" />
      <div className="mt-3.5 space-y-2">
        <div className="skeleton-block h-2.5 w-[96%]" />
        <div className="skeleton-block h-2.5 w-[93%]" />
        <div className="skeleton-block h-2.5 w-[88%]" />
        <div className="skeleton-block h-2.5 w-[91%]" />
        <div className="skeleton-block h-2.5 w-[52%]" />
      </div>
      <div className="mt-3 flex gap-1.5 border-t border-dashed border-espresso-900/[0.08] pt-2.5">
        <div className="h-[18px] w-28 rounded-md bg-caramel-200/55" />
        <div className="h-[18px] w-36 rounded-md bg-caramel-200/55" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Google posts are published as one block: heading, then body, then CTA. */
function wholePost(post: GooglePost): string {
  return `${post.heading}\n\n${post.body}`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
