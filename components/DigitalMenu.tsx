"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  QrCode,
  RotateCcw,
  Sparkles,
  Store,
} from "lucide-react";
import * as m from "framer-motion/m";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";

import PhotoDropzone from "@/components/PhotoDropzone";
import TrackedLink from "@/components/TrackedLink";
import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";
import {
  ImagePrepError,
  prepareImage,
  releaseImage,
  type PreparedImage,
} from "@/lib/image";
import {
  requestGeneration,
  requestTranslations,
  retryAfterLabel,
  type StudioError,
} from "@/lib/studio-client";
import MenuCard from "@/components/menu/MenuCard";
import { track } from "@/lib/analytics";
import { smoothScrollTo } from "@/lib/smooth-scroll";
import { MENU_DEMO_URL } from "@/lib/business";
import { MAX_ITEMS, toDigitalMenu } from "@/lib/menu";
import {
  hasAnyTranslation,
  stitchTranslations,
  translatableLines,
} from "@/lib/menu-translate";
import {
  addItem,
  applyDishSuggestion,
  cafeNameProblem,
  checkDraft,
  removeItem,
  renameSection,
  setItemDish,
  setItemField,
  setItemModel,
} from "@/lib/menu-draft";
import {
  MAX_CAFE_NAME_LENGTH,
  type DigitalMenu as MenuData,
  type MenuItem,
} from "@/lib/types";

/** The dish studio pulls in photo compression and the 3D preview — fetched on
 *  first use, so a café that never opens it never downloads it. */
const DishStudio = dynamic(() => import("@/components/menu/DishStudio"), {
  ssr: false,
  loading: () => null,
});

type Status = "idle" | "loading" | "success" | "error";

/** Used for the empty-state preview and the QR name until a menu is read. */
const SAMPLE_MENU: MenuData = {
  items: [
    { category: "Beverages", name: "Masala Chai", price: "₹80" },
    { category: "Beverages", name: "Cappuccino", price: "₹160" },
    { category: "Beverages", name: "Cold Brew", price: "₹190" },
    { category: "Food", name: "Paneer Tikka Sandwich", price: "₹220" },
    { category: "Food", name: "Croissant", price: "₹120" },
    { category: "Desserts", name: "Tiramisu", price: "₹240" },
  ],
  categories: ["Beverages", "Food", "Desserts"],
  categoryCount: 3,
};

const QR_PNG_SIZE = 1024;

/**
 * The menu tab.
 *
 * `cafeName` is owned by `CaptionStudio` and shared with the other two tabs —
 * this component never keeps a copy, so typing here changes the caption tab and
 * the WhatsApp order line too. The name is required to publish, so the field
 * lives here rather than only behind the "Café details" accordion.
 */
export default function DigitalMenuStudio({
  cafeName,
  onCafeName,
}: {
  cafeName: string;
  onCafeName: (value: string) => void;
}) {
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  // The error appears once the field has been visited or publishing has been
  // blocked — not before a person has typed anything.
  const [nameTouched, setNameTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // The rows, not the card: categories and section counts are derived from them
  // (`toDigitalMenu`), so renaming a section can never leave the preview out of
  // step with what `POST /api/menus` receives.
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<StudioError | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const menu = useMemo<MenuData | null>(
    () => (items ? toDigitalMenu(items) : null),
    [items],
  );

  // Everything that would be truncated or dropped by the publish route, in one
  // place. Null until a menu has been read.
  const draft = useMemo(() => (items ? checkDraft(items) : null), [items]);

  // The WhatsApp number lives here, not in the order panel, so re-reading a
  // photo doesn't wipe what the owner just typed.
  const [orderNumber, setOrderNumber] = useState("");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderRequested, setOrderRequested] = useState(false);

  // Publishing: once a menu is live, the QR encodes its own URL instead of the
  // demo one. Kept here rather than in a child because the export canvas needs
  // the same value.
  const [published, setPublished] = useState<{
    slug: string;
    url: string;
    editUrl: string;
  } | null>(null);
  // What actually went live, so editing afterwards can say so instead of
  // letting an unsaved change look saved.
  const [publishedItems, setPublishedItems] = useState<MenuItem[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Translating happens inside the publish click: it's part of publishing, not a
  // separate chore, and a failure never stops the menu going live.
  const [translating, setTranslating] = useState(false);
  const [translationNote, setTranslationNote] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [editCopied, setEditCopied] = useState(false);
  const editCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduced = usePrefersReducedMotion();
  const resultsRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const downloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = status === "loading";

  useEffect(() => {
    return () => {
      if (downloadTimer.current) clearTimeout(downloadTimer.current);
    };
  }, []);

  /* ------------------------------- photo -------------------------------- */

  // Same guard as the caption tab: two photos in quick succession decode on
  // their own schedule, and the slower one must not win.
  const uploadSeq = useRef(0);

  const handlePhoto = useCallback(async (file: File) => {
    const seq = ++uploadSeq.current;

    setImageError(null);
    setPreparing(true);

    try {
      const prepared = await prepareImage(file);
      if (seq !== uploadSeq.current) {
        releaseImage(prepared);
        return;
      }
      setImage((previous) => {
        releaseImage(previous);
        return prepared;
      });
      // A new photo means the old menu is stale.
      setStatus("idle");
      setItems(null);
      setError(null);
      track({ name: "photo_upload", props: { outcome: "ready" } });
    } catch (err) {
      if (seq !== uploadSeq.current) return;
      setImageError(
        err instanceof ImagePrepError
          ? err.message
          : "That photo couldn't be processed. Try another one.",
      );
      track({ name: "photo_upload", props: { outcome: "rejected" } });
    } finally {
      if (seq === uploadSeq.current) setPreparing(false);
    }
  }, []);

  const removePhoto = useCallback(() => {
    // Invalidate anything still decoding, so it can't re-attach itself.
    uploadSeq.current += 1;
    setImage((previous) => {
      releaseImage(previous);
      return null;
    });
    setImageError(null);
    setPreparing(false);
    setStatus("idle");
    setItems(null);
    setError(null);
  }, []);

  // Revoke the last preview URL on unmount so blobs don't leak.
  const imageRef = useRef<PreparedImage | null>(null);
  useEffect(() => {
    imageRef.current = image;
  }, [image]);
  useEffect(() => () => releaseImage(imageRef.current), []);

  /* ----------------------------- generation ----------------------------- */

  const generate = useCallback(async () => {
    if (!image) {
      setStatus("error");
      setError({
        message: "Upload a photo of your menu first.",
        hint: "One page at a time, straight-on and well lit, reads best.",
        status: 400,
      });
      return;
    }

    setStatus("loading");
    setError(null);
    setItems(null);

    const outcome = await requestGeneration({
      type: "digital_menu",
      image: { mimeType: image.mimeType, data: image.base64 },
      cafeName: cafeName.trim() || undefined,
    });

    if (!outcome.ok) {
      setStatus("error");
      setError(outcome.error);
      return;
    }

    if (outcome.data.tool !== "digital_menu" || !outcome.data.menu.items.length) {
      setStatus("error");
      setError({
        message:
          "We couldn't read a menu in that photo. Try a straight-on shot with the whole page in frame.",
        status: 502,
      });
      return;
    }

    setItems(outcome.data.menu.items);
    setStatus("success");

    track({
      name: "menu_generate",
      props: {
        items: outcome.data.menu.items.length,
        categories: outcome.data.menu.categoryCount,
      },
    });
  }, [image, cafeName]);

  const reset = () => {
    setItems(null);
    setError(null);
    setStatus("idle");
    // A new menu is a new menu: the old URL stays live, but this session goes
    // back to the demo code rather than quietly reusing it.
    setPublished(null);
    setPublishedItems(null);
    setPublishError(null);
  };

  /* ------------------------- editing the draft ---------------------------- */
  // Every setter is pure over `items` (see `lib/menu-draft`) and clamps to the
  // limits `POST /api/menus` enforces, so the studio can't build a value the
  // server would quietly cut. Clearing `publishError` keeps a stale complaint
  // from outliving the row that caused it.

  const editField = useCallback(
    (index: number, field: "name" | "price", value: string) => {
      setItems((current) =>
        current ? setItemField(current, index, field, value) : current,
      );
      setPublishError(null);
    },
    [],
  );

  const editRemove = useCallback((index: number) => {
    setItems((current) => (current ? removeItem(current, index) : current));
    setPublishError(null);
  }, []);

  const editAdd = useCallback((category: string) => {
    setItems((current) => (current ? addItem(current, category) : current));
    setPublishError(null);
  }, []);

  const editSection = useCallback((from: string, to: string) => {
    setItems((current) => (current ? renameSection(current, from, to) : current));
    setPublishError(null);
  }, []);

  /* ------------------------ dishes: words and models ---------------------- */
  // Three writers, all price-blind by construction: the suggestion path moves
  // name/section/copy, the dish path moves copy, the model path moves a URL.

  const applyDish = useCallback(
    (
      index: number,
      suggestion: { name: string; category: string; description: string; ingredients: string[] },
    ) => {
      setItems((current) => (current ? applyDishSuggestion(current, index, suggestion) : current));
      setPublishError(null);
    },
    [],
  );

  const clearDish = useCallback((index: number) => {
    setItems((current) => (current ? setItemDish(current, index, null) : current));
  }, []);

  const attachModel = useCallback((index: number, model: MenuItem["model"] | null) => {
    setItems((current) => (current ? setItemModel(current, index, model ?? null) : current));
    setPublishError(null);
  }, []);

  /* --------------------------- WhatsApp ordering -------------------------- */

  const orderDigits = normalizePhone(orderNumber);
  const orderLink =
    orderRequested && orderDigits ? orderLinkFor(orderDigits) : null;

  const generateOrderLink = () => {
    if (!orderDigits) {
      setOrderError(
        "That doesn't look like a mobile number. Ten digits, starting 6–9.",
      );
      return;
    }
    setOrderError(null);
    setOrderRequested(true);
  };

  const changeOrderNumber = (value: string) => {
    setOrderNumber(value.slice(0, 16));
    setOrderError(null);
  };

  /* ------------------------------ Publishing ------------------------------ */

  const publish = useCallback(async () => {
    if (!menu || !draft || publishing) return;

    // The API would drop or truncate these rows without saying so. Say so here
    // instead, before anything is sent.
    if (!draft.canPublish) {
      setPublishError(draft.message);
      return;
    }

    const nameIssue = cafeNameProblem(cafeName);
    if (nameIssue) {
      // The field is at the top of this tab with its own message; sending the
      // person there is more useful than a line of red beside the button.
      setNameTouched(true);
      nameRef.current?.focus();
      return;
    }

    setPublishing(true);
    setPublishError(null);

    // Hindi and Hinglish are written once, here, and stored with the items — so
    // a customer switching language on the table never waits for a model.
    let publishItems = menu.items;
    if (!hasAnyTranslation(publishItems)) {
      setTranslating(true);
      const outcome = await requestTranslations(translatableLines(publishItems));
      setTranslating(false);

      if (outcome.ok) {
        publishItems = stitchTranslations(publishItems, outcome.translations);
        setItems(publishItems);
        setTranslationNote(null);
      } else {
        // Publish in English rather than hold a café's menu hostage to a model.
        setTranslationNote(
          `${outcome.error.message} Publishing in English — the language switch will be added next time.`,
        );
      }
    }

    try {
      const response = await fetch("/api/menus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cafeName: cafeName.trim(),
          whatsapp: orderDigits,
          items: publishItems,
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPublishError(
          body?.error ??
            "That didn't publish. Your menu is still here — try again in a moment.",
        );
        return;
      }

      setPublished({ slug: body.slug, url: body.url, editUrl: body.editUrl });
      setPublishedItems(publishItems);
      track({
        name: "menu_publish",
        props: {
          items: menu.items.length,
          categories: menu.categoryCount,
          attempt: published ? "again" : "first",
          translated: hasAnyTranslation(publishItems),
        },
      });
    } catch {
      setPublishError("Couldn't reach the server. Your menu is still here.");
    } finally {
      setPublishing(false);
      setTranslating(false);
    }
  }, [menu, draft, publishing, cafeName, orderDigits, published]);

  const copyEditLink = useCallback(async () => {
    if (!published) return;
    try {
      await navigator.clipboard.writeText(published.editUrl);
      setEditCopied(true);
      if (editCopyTimer.current) clearTimeout(editCopyTimer.current);
      editCopyTimer.current = setTimeout(() => setEditCopied(false), 2200);
    } catch {
      // Clipboard permission can be refused; the field stays selectable.
    }
  }, [published]);

  /* ------------------------------ QR code ------------------------------- */

  /**
   * Export the QR as a PNG.
   *
   * The visible code is an SVG (crisp at any size); a separate 1024px canvas is
   * mounted off-screen purely for export, because print shops and WhatsApp
   * both want a raster file. Nothing is embedded in the code, so the canvas is
   * never tainted and `toBlob` can't throw a security error.
   */
  const downloadQr = useCallback(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;

    const slug =
      cafeName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "cafe";

    const fileName = `${published?.slug ?? slug}-menu-qr.png`;

    const save = (href: string) => {
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const finish = () => {
      track({ name: "qr_download", props: { target: published ? "own" : "demo" } });
      setDownloaded(true);
      if (downloadTimer.current) clearTimeout(downloadTimer.current);
      downloadTimer.current = setTimeout(() => setDownloaded(false), 2400);
    };

    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => {
        if (!blob) {
          // Safari can refuse `toBlob` on a huge canvas; the data URL always
          // works, so fall back rather than leave the button dead.
          save(canvas.toDataURL("image/png"));
          finish();
          return;
        }
        const url = URL.createObjectURL(blob);
        save(url);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        finish();
      }, "image/png");
      return;
    }

    save(canvas.toDataURL("image/png"));
    finish();
  }, [cafeName, published]);

  // On phones the menu lands below the fold — bring it into view.
  useEffect(() => {
    if (status !== "success") return;
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    const id = window.setTimeout(() => {
      if (resultsRef.current) smoothScrollTo(resultsRef.current);
    }, 120);
    return () => window.clearTimeout(id);
  }, [status]);

  const nameProblem = cafeNameProblem(cafeName);
  const showNameError = Boolean(nameProblem) && nameTouched;

  const shown = menu ?? SAMPLE_MENU;
  const isSample = !menu;
  const itemCount = shown.items.length;
  // The QR encodes the published menu when there is one, the demo otherwise.
  const qrUrl = published?.url ?? MENU_DEMO_URL;
  // Editing after publishing doesn't touch the live page — the editor link does
  // that — so say it rather than let the change look saved.
  const editedSincePublish = Boolean(
    publishedItems &&
      items &&
      JSON.stringify(items) !== JSON.stringify(publishedItems),
  );

  /* -------------------------------- view -------------------------------- */

  return (
    <div>
      <CafeNameField
        value={cafeName}
        problem={nameProblem}
        showError={showNameError}
        inputRef={nameRef}
        onChange={(value) => {
          onCafeName(value.slice(0, MAX_CAFE_NAME_LENGTH));
          setPublishError(null);
        }}
        onBlur={() => {
          // Visiting the field with something invalid in it is what turns the
          // message on; an untouched empty field stays quiet.
          if (cafeName.trim().length > 0) setNameTouched(true);
        }}
      />

      <PhotoDropzone
        image={image}
        preparing={preparing}
        error={imageError}
        disabled={isLoading}
        title="Upload a photo of your physical menu. We'll digitize it instantly."
        hint="One page at a time · JPG, PNG or WebP · up to 5 MB · compressed in your browser"
        showFallbackHint={false}
        onSelect={(file) => void handlePhoto(file)}
        onRemove={removePhoto}
      />

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={isLoading || preparing}
          className="btn-primary group"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Digitizing your menu…
            </>
          ) : (
            <>
              Generate Digital Menu
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
        <p className="mt-2.5 text-center text-[10.5px] text-espresso-500/80">
          Free to try · No account · Your menu photo isn&apos;t stored
        </p>
      </div>

      {/* -------------------------------- errors ------------------------------- */}
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
                  Try again in {retryAfterLabel(error.retryAfter)}.
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
                  onClick={removePhoto}
                  className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#D8B4A4] px-3 py-2 text-[11.5px] font-semibold text-[#7A3520] hover:bg-[#F5DCD1]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A3520]/30"
                >
                  Change photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------- results ------------------------------ */}
      <p role="status" aria-live="polite" className="sr-only">
        {preparing
          ? "Preparing your photo…"
          : isLoading
            ? "Reading your menu photo…"
            : status === "success" && menu
              ? `Menu ready: ${menu.items.length} items in ${menu.categoryCount} categories.`
              : status === "error" && error
                ? error.message
                : ""}
      </p>

      <div ref={resultsRef} aria-busy={isLoading}>
        {isLoading && (
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:200ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caramel-500 [animation-delay:400ms]" />
              </span>
              <span className="text-[11.5px] font-medium text-espresso-700">
                Reading categories, items and prices…
              </span>
            </div>
            <MenuSkeleton />
          </div>
        )}

        {(status === "idle" || (status === "success" && menu)) && !isLoading && (
          <m.div
            className="mt-5"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {isSample ? (
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-espresso-400" />
              ) : (
                <Check className="h-3.5 w-3.5 shrink-0 text-sage-500" />
              )}
              <span className="text-[11.5px] font-semibold text-espresso-800">
                {isSample ? "Sample result" : "Your digital menu"}
              </span>
              <span className="tag">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
              <span className="tag">{shown.categoryCount} sections</span>
              {!isSample && hasAnyTranslation(items ?? []) && (
                <span className="tag" lang="hi">
                  हिंदी + Hinglish
                </span>
              )}
              {!isSample && (
                <button
                  type="button"
                  onClick={reset}
                  className="tap ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-espresso-900/[0.1] bg-white/60 px-3.5 py-2 text-[10.5px] font-semibold text-espresso-600 hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Start over
                </button>
              )}
            </div>

            {!isSample && (
              <p className="mt-2 text-[10.5px] leading-[1.6] text-espresso-500">
                Tap any name, price or section heading to fix what the photo got
                wrong. Add or remove rows here — this is exactly what gets
                published. A published menu holds up to {MAX_ITEMS} items.
              </p>
            )}

            {!isSample && draft?.message && (
              <p
                role="status"
                className="mt-2 flex items-start gap-1.5 rounded-lg bg-caramel-50/80 px-2.5 py-2 text-[10.5px] leading-[1.55] text-espresso-800"
              >
                <AlertCircle
                  className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600"
                  aria-hidden
                />
                <span>{draft.message}</span>
              </p>
            )}

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_248px]">
              <MenuCard
                menu={shown}
                cafeName={cafeName.trim()}
                isSample={isSample}
                edit={
                  isSample
                    ? undefined
                    : {
                        onField: editField,
                        onRemove: editRemove,
                        onAdd: editAdd,
                        onRenameCategory: editSection,
                        flagged: draft?.flawed,
                        canAdd: draft?.canAdd ?? false,
                      }
                }
              />

              <div className="space-y-3">
                {!isSample && shown.items.length > 0 && (
                  <DishStudio
                    items={shown.items}
                    manualModels={process.env.NEXT_PUBLIC_DISH_MANUAL_MODEL === "1"}
                    onApplyDetails={applyDish}
                    onSetModel={attachModel}
                    onClearDetails={clearDish}
                  />
                )}

                <div className="hairline relative rounded-xl bg-white/70 p-4 text-center">
                  <p className="flex items-center justify-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                    <QrCode className="h-3 w-3" aria-hidden />
                    Scan for the menu
                  </p>

                  <div className="mt-3 flex justify-center">
                    <div className="rounded-lg bg-cream-50 p-2 shadow-[0_10px_24px_-18px_rgba(36,24,18,0.6)]">
                      <QRCodeSVG
                        value={qrUrl}
                        size={148}
                        level="M"
                        marginSize={2}
                        bgColor="#FFFBF5"
                        fgColor="#241812"
                        title="QR code linking to the digital menu"
                        className="h-[148px] w-[148px]"
                      />
                    </div>
                  </div>

                  <p className="mt-2.5 break-all text-[9.5px] leading-tight text-espresso-500/80">
                    {qrUrl.replace(/^https?:\/\//, "")}
                  </p>

                  <button
                    type="button"
                    onClick={downloadQr}
                    className="tap mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-espresso-900/[0.12] bg-white/70 px-3 text-[11.5px] font-semibold text-espresso-700 hover:border-espresso-900/30 hover:bg-white hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                  >
                    {downloaded ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-sage-500" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Download QR Code
                      </>
                    )}
                  </button>

                  {translationNote && (
                    <p
                      role="status"
                      className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-caramel-50/80 px-2.5 py-2 text-left text-[9.5px] leading-[1.5] text-espresso-800"
                    >
                      <AlertCircle
                        className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600"
                        aria-hidden
                      />
                      <span>{translationNote}</span>
                    </p>
                  )}

                  {published ? (
                    <div className="mt-3 space-y-2 text-left">
                      <p className="flex items-start gap-1.5 rounded-lg bg-sage-100/80 px-2.5 py-2 text-[10px] leading-[1.5] text-espresso-700">
                        <Check
                          className="mt-[1px] h-3 w-3 shrink-0 text-sage-500"
                          aria-hidden
                        />
                        <span>
                          Live. This code now opens{" "}
                          <strong className="font-semibold text-espresso-900">
                            your
                          </strong>{" "}
                          menu
                          {orderDigits
                            ? " — customers can build a cart and send the order to your WhatsApp."
                            : "."}
                        </span>
                      </p>

                      {editedSincePublish && (
                        <p className="flex items-start gap-1.5 rounded-lg bg-caramel-50/80 px-2.5 py-2 text-[10px] leading-[1.5] text-espresso-800">
                          <AlertCircle
                            className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600"
                            aria-hidden
                          />
                          <span>
                            This menu has changed since it was published. Open
                            the editor link and save to update the live page.
                          </span>
                        </p>
                      )}

                      <a
                        href={published.editUrl}
                        className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-espresso-800 underline decoration-espresso-900/25 underline-offset-2 hover:decoration-espresso-900/60"
                      >
                        Edit this menu
                        <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                      </a>

                      <button
                        type="button"
                        onClick={copyEditLink}
                        className="flex w-full items-center justify-center gap-1 rounded-lg border border-espresso-900/[0.12] bg-white/70 px-2 py-1.5 text-[10px] font-medium text-espresso-600 hover:border-espresso-900/25 hover:text-espresso-900"
                      >
                        {editCopied ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-sage-500" />
                            Editor link copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" />
                            Copy editor link
                          </>
                        )}
                      </button>

                      <p className="text-[9px] leading-[1.5] text-espresso-500/80">
                        The editor link is the only way back in — bookmark it. No
                        account, no password reset.
                      </p>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={publish}
                        disabled={publishing || !menu}
                        className="tap mt-2.5 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-espresso-900 px-3 text-[11.5px] font-semibold text-cream-50 hover:bg-espresso-800 disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
                      >
                        {publishing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {translating ? "Adding हिंदी + Hinglish…" : "Publishing…"}
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Publish this menu
                          </>
                        )}
                      </button>

                      {publishError ? (
                        <p className="mt-2 text-[9.5px] leading-[1.5] text-espresso-800">
                          {publishError}
                        </p>
                      ) : (
                        <p className="mt-2 text-[9.5px] leading-[1.5] text-espresso-500/70">
                          {menu
                            ? "Puts it live on its own link, with Hindi and Hinglish for customers who need them. No account needed."
                            : "Read a menu photo first, then publish it."}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <p className="flex items-start gap-1.5 rounded-xl bg-sage-100/70 px-3 py-2.5 text-[10.5px] leading-[1.55] text-espresso-700">
                  <Check className="mt-[2px] h-3 w-3 shrink-0 text-sage-500" aria-hidden />
                  <span>
                    This digital menu is included in your{" "}
                    <strong className="font-semibold text-espresso-900">
                      ₹10,000 Café Launch Kit
                    </strong>
                    .
                  </span>
                </p>
              </div>
            </div>

            {!isSample && (
              <OrderPanel
                number={orderNumber}
                error={orderError}
                link={orderLink}
                onNumberChange={changeOrderNumber}
                onGenerate={generateOrderLink}
              />
            )}

            {!isSample && (
              <button
                type="button"
                onClick={() => void generate()}
                className="tap mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/60 px-3 py-2.5 text-[11.5px] font-semibold text-espresso-700 hover:border-espresso-900/25 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 sm:w-auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Read this photo again
              </button>
            )}
          </m.div>
        )}
      </div>

      <ValueAnchor />

      {/* 1024px canvas used only for the PNG export — never displayed. */}
      <div aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
        <QRCodeCanvas
          ref={qrCanvasRef}
          value={qrUrl}
          size={QR_PNG_SIZE}
          level="M"
          // 4 modules is the quiet zone the QR spec asks for — print shops
          // will trim the PNG to its edges.
          marginSize={4}
          bgColor="#FFFBF5"
          fgColor="#241812"
        />
      </div>
    </div>
  );
}

/* The menu preview itself lives in `components/menu/MenuCard.tsx`, because the
   public demo page the QR code points at renders the same thing on the server. */

/* -------------------------------------------------------------------------- */
/*  Café name                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The café name field, in the open at the top of the menu tab.
 *
 * Split out of the studio so both states — the hint and the inline error — can
 * be rendered on their own, and so the field can be focused by the publish
 * guard. The value itself is a prop: `CaptionStudio` owns it.
 */
export function CafeNameField({
  value,
  problem,
  showError,
  inputRef,
  onChange,
  onBlur,
}: {
  value: string;
  problem: string | null;
  showError: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="mb-3.5">
      <label
        htmlFor="menu-cafe-name"
        className="mb-1.5 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
      >
        <Store className="h-3 w-3" aria-hidden />
        Café name
      </label>
      <input
        id="menu-cafe-name"
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        maxLength={MAX_CAFE_NAME_LENGTH}
        placeholder="The Daily Grind"
        autoComplete="organization"
        aria-invalid={showError || undefined}
        aria-describedby={
          showError ? "menu-cafe-name-error" : "menu-cafe-name-hint"
        }
        className={`input py-2 pr-3 text-base sm:text-[13.5px] ${
          showError
            ? "border-[#9C4527]/55 focus:border-[#9C4527] focus:ring-[#9C4527]/15"
            : ""
        }`}
      />

      {showError ? (
        <p
          id="menu-cafe-name-error"
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-[1.55] text-[#9C4527]"
        >
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{problem}</span>
        </p>
      ) : (
        <p
          id="menu-cafe-name-hint"
          className="mt-1.5 text-[10.5px] leading-[1.55] text-espresso-500"
        >
          Printed on the menu and sent with every WhatsApp order. The same name
          the other tabs use.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  WhatsApp ordering                                                         */
/* -------------------------------------------------------------------------- */

/** The message a customer sends when they tap the order button. */
const ORDER_MESSAGE = "Hi, I'd like to order from your digital menu";

/**
 * Accepts what people actually type or paste — "+91 98765 43210",
 * "098765 43210", "9876543210" — and returns the ten digits WhatsApp needs, or
 * null when it isn't a usable Indian mobile number.
 */
function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** `wa.me` deep link with the order message pre-filled. */
function orderLinkFor(digits: string): string {
  return `https://wa.me/91${digits}?text=${encodeURIComponent(ORDER_MESSAGE)}`;
}

/**
 * The paid alternative to a food-delivery aggregator, in one field: the number
 * is all we need to build a link the café can put on its menu, its Instagram
 * bio or its website — the order lands in the WhatsApp they already answer.
 */
function OrderPanel({
  number,
  error,
  link,
  onNumberChange,
  onGenerate,
}: {
  number: string;
  error: string | null;
  link: string | null;
  onNumberChange: (value: string) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="hairline mt-3 rounded-xl bg-white/55 p-3.5">
      <label
        htmlFor="menu-order-number"
        className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
      >
        <MessageCircle className="h-3 w-3 shrink-0 text-caramel-500" aria-hidden />
        Café&apos;s WhatsApp number
      </label>

      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-espresso-400"
          >
            +91
          </span>
          <input
            id="menu-order-number"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={number}
            onChange={(event) => onNumberChange(event.target.value)}
            placeholder="98765 43210"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "menu-order-error" : "menu-order-hint"}
            className="input py-2.5 pl-12 text-base sm:text-[13.5px]"
          />
        </div>

        <button
          type="button"
          onClick={onGenerate}
          className="tap inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/70 px-3.5 text-[11.5px] font-semibold text-espresso-700 transition hover:border-espresso-900/30 hover:bg-white hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
        >
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          Generate Order Link
        </button>
      </div>

      {error ? (
        <p
          id="menu-order-error"
          role="alert"
          className="mt-1.5 text-[10.5px] font-medium leading-[1.5] text-[#9C4527]"
        >
          {error}
        </p>
      ) : (
        <p
          id="menu-order-hint"
          className="mt-1.5 text-[10px] leading-[1.55] text-espresso-500/80"
        >
          Ten digits — we add the +91. Nothing is sent anywhere.
        </p>
      )}

      {link && (
        <div className="mt-3 animate-fade-up">
          <TrackedLink
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            location="menu_studio"
            label="whatsapp_order"
            className="group flex min-h-[48px] items-center justify-between gap-2 rounded-xl bg-espresso-900 px-3.5 py-3 text-cream-50 transition hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/50"
          >
            <span className="flex items-center gap-2 text-[12px] font-semibold">
              <MessageCircle className="h-4 w-4 text-sage-300" aria-hidden />
              Order on WhatsApp
            </span>
            <ArrowUpRight
              aria-hidden
              className="h-3.5 w-3.5 opacity-70 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </TrackedLink>

          <p className="mt-1.5 break-all text-[9.5px] leading-[1.5] text-espresso-500/80">
            {link}
          </p>

          <p className="mt-2 text-[10.5px] leading-[1.6] text-espresso-600">
            Put this button on your digital menu so customers can order directly
            without paying Zomato commissions.
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Value anchor                                                              */
/* -------------------------------------------------------------------------- */

function ValueAnchor() {
  return (
    <div className="hairline mt-5 rounded-xl bg-white/45 p-3.5">
      <p className="flex gap-2 text-[11.5px] leading-[1.65] text-espresso-700">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-caramel-500" aria-hidden />
        <span>
          <strong className="font-semibold text-espresso-900">
            Stop paying designers to update your menu.
          </strong>{" "}
          Update your prices in seconds.
        </span>
      </p>
      <TrackedLink
        href="#packages"
        location="menu_studio"
        label="launch_kit"
        className="group mt-2.5 flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-espresso-900/[0.035] px-3 py-2.5 text-[11.5px] leading-[1.6] text-espresso-700 transition hover:bg-espresso-900/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
      >
        <span>
          Want this live on your own website? It&apos;s included in the{" "}
          <strong className="font-semibold text-espresso-900">
            ₹10,000 Café Launch Kit
          </strong>
          .
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-espresso-500 transition-transform duration-200 group-hover:translate-x-0.5" />
      </TrackedLink>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                  */
/* -------------------------------------------------------------------------- */

function MenuSkeleton() {
  return (
    <div
      aria-hidden
      className="shimmer hairline relative mt-3 rounded-xl bg-white/55 p-4"
    >
      <div className="mx-auto h-3 w-28 rounded bg-espresso-900/[0.07]" />
      <div className="mx-auto mt-2 h-2 w-16 rounded bg-espresso-900/[0.05]" />

      <div className="mt-4 space-y-3">
        {[0, 1].map((section) => (
          <div key={section}>
            <div className="skeleton-block h-2 w-20" />
            <div className="mt-2 space-y-1.5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-2">
                  <div className="skeleton-block h-2.5 flex-1" style={{ maxWidth: `${58 - row * 8}%` }} />
                  <div className="h-px flex-1 border-b border-dotted border-espresso-900/[0.15]" />
                  <div className="skeleton-block h-2.5 w-9" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
