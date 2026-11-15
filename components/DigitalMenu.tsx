"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  Loader2,
  MessageCircle,
  QrCode,
  RotateCcw,
  Sparkles,
  UtensilsCrossed,
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
  retryAfterLabel,
  type StudioError,
} from "@/lib/studio-client";
import { track } from "@/lib/analytics";
import { MENU_DEMO_URL } from "@/lib/business";
import type { DigitalMenu as MenuData, MenuItem } from "@/lib/types";

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

export default function DigitalMenuStudio({ cafeName }: { cafeName: string }) {
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [error, setError] = useState<StudioError | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  // The WhatsApp number lives here, not in the order panel, so re-reading a
  // photo doesn't wipe what the owner just typed.
  const [orderNumber, setOrderNumber] = useState("");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderRequested, setOrderRequested] = useState(false);

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

  const handlePhoto = useCallback(async (file: File) => {
    setImageError(null);
    setPreparing(true);

    try {
      const prepared = await prepareImage(file);
      setImage((previous) => {
        releaseImage(previous);
        return prepared;
      });
      // A new photo means the old menu is stale.
      setStatus("idle");
      setMenu(null);
      setError(null);
      track({ name: "photo_upload", props: { outcome: "ready" } });
    } catch (err) {
      setImageError(
        err instanceof ImagePrepError
          ? err.message
          : "That photo couldn't be processed. Try another one.",
      );
      track({ name: "photo_upload", props: { outcome: "rejected" } });
    } finally {
      setPreparing(false);
    }
  }, []);

  const removePhoto = useCallback(() => {
    setImage((previous) => {
      releaseImage(previous);
      return null;
    });
    setImageError(null);
    setStatus("idle");
    setMenu(null);
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
    setMenu(null);

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

    setMenu(outcome.data.menu);
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
    setMenu(null);
    setError(null);
    setStatus("idle");
  };

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

    const fileName = `${slug}-menu-qr.png`;

    const save = (href: string) => {
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const finish = () => {
      track({ name: "qr_download", props: { target: "demo" } });
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
  }, [cafeName]);

  // On phones the menu lands below the fold — bring it into view.
  useEffect(() => {
    if (status !== "success") return;
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    const id = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [status]);

  const shown = menu ?? SAMPLE_MENU;
  const isSample = !menu;
  const itemCount = shown.items.length;

  /* -------------------------------- view -------------------------------- */

  return (
    <div>
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

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_248px]">
              <MenuCard
                menu={shown}
                cafeName={cafeName.trim()}
                isSample={isSample}
              />

              <div className="space-y-3">
                <div className="hairline relative rounded-xl bg-white/70 p-4 text-center">
                  <p className="flex items-center justify-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
                    <QrCode className="h-3 w-3" aria-hidden />
                    Scan for the menu
                  </p>

                  <div className="mt-3 flex justify-center">
                    <div className="rounded-lg bg-cream-50 p-2 shadow-[0_10px_24px_-18px_rgba(36,24,18,0.6)]">
                      <QRCodeSVG
                        value={MENU_DEMO_URL}
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
                    {MENU_DEMO_URL.replace(/^https?:\/\//, "")}
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

                  <p className="mt-2 text-[9.5px] leading-[1.5] text-espresso-500/70">
                    Demo link for now — your own menu URL goes live with the kit.
                  </p>
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
          value={MENU_DEMO_URL}
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

/* -------------------------------------------------------------------------- */
/*  Menu preview                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The menu itself: mobile-first, one column, dotted leaders between an item and
 * its price (the thing that makes a list read as a menu), and section headings
 * that survive long names on a 320px screen.
 */
function MenuCard({
  menu,
  cafeName,
  isSample,
}: {
  menu: MenuData;
  cafeName: string;
  isSample: boolean;
}) {
  const grouped = menu.categories.map((category) => ({
    category,
    items: menu.items.filter((item) => item.category === category),
  }));

  return (
    <article className="paper relative overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
      <header className="text-center">
        <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-caramel-600">
          {isSample ? "Sample café" : "Digital menu"}
        </p>
        <h3 className="mt-1 break-words font-display text-[19px] font-semibold leading-tight tracking-[-0.01em] text-espresso-900 sm:text-[22px]">
          {cafeName || "Your Café"}
        </h3>
        <div className="mx-auto mt-2 flex items-center justify-center gap-2">
          <span className="h-px w-8 bg-espresso-900/15" />
          <UtensilsCrossed className="h-3 w-3 text-espresso-300" aria-hidden />
          <span className="h-px w-8 bg-espresso-900/15" />
        </div>
      </header>

      <div className="mt-4 space-y-4">
        {grouped.map((section) => (
          <section key={section.category}>
            <h4 className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-espresso-500">
              <span className="shrink-0">{section.category}</span>
              <span aria-hidden className="h-px flex-1 bg-espresso-900/[0.12]" />
              <span className="shrink-0 text-[9px] font-medium tabular-nums tracking-normal text-espresso-400">
                {section.items.length}
              </span>
            </h4>

            <ul className="mt-1.5 space-y-1">
              {section.items.map((item, index) => (
                <MenuRow key={`${item.name}-${index}`} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-dashed border-espresso-900/[0.12] pt-2.5">
        <span className="text-[9px] uppercase tracking-[0.16em] text-espresso-400">
          {isSample ? "Digitised in seconds" : "Digitised with CafeCaption"}
        </span>
        <span className="flex items-center gap-1 text-[9px] font-semibold text-espresso-500">
          Scan the QR
          <QrCode className="h-2.5 w-2.5" aria-hidden />
        </span>
      </footer>
    </article>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <span className="min-w-0 break-words text-[12.5px] leading-[1.5] text-espresso-900 sm:text-[13px]">
        {item.name}
      </span>
      <span
        aria-hidden
        className="mb-[3px] h-px min-w-[10px] flex-1 border-b border-dotted border-espresso-900/[0.28]"
      />
      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-espresso-800 sm:text-[12.5px]">
        {item.price}
      </span>
    </li>
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
