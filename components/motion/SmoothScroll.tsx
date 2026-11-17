"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import type Lenis from "lenis";

import { setScrollEngine } from "@/lib/smooth-scroll";

/**
 * How quickly the page catches up to the wheel. Lower is floatier, higher is
 * tighter; 0.1 is the point where a notch feels weighted but the page still
 * stops when your hand stops.
 */
const LERP = 0.1;

/**
 * Inertial wheel scrolling for the whole page, plus smooth anchor jumps.
 *
 * Why this and not "scroll hijacking": Lenis drives the *real* document scroll
 * (`window.scrollTo`) from a `requestAnimationFrame` loop, so the page is never
 * translated around behind the browser's back. Sticky headers, the scrollbar,
 * keyboard paging, text selection, hash links and `scroll-margin-top` all keep
 * working exactly as before — we only soften the wheel's hard 100px steps into
 * a lerp.
 *
 * Three deliberate limits:
 *  - `syncTouch: false` — phones keep their native, GPU-composited momentum.
 *    Synthesising touch inertia is where most "smooth scroll" sites fall apart.
 *  - `allowNestedScroll: true` — an overflowing textarea (long caption) keeps
 *    the wheel until it hits its own end, then hands back to the page.
 *  - `prefers-reduced-motion: reduce` — no engine at all, so nothing animates.
 *
 * The library itself is a dynamic import: it is ~6 kB gzipped and only needed
 * once the page is interactive, so it never delays the first paint.
 */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let engine: Lenis | null = null;
    let alive = true;

    /**
     * In-page anchors only (`#packages`, `/#contact` from anywhere else on the
     * site): hand the jump to the engine so it eases instead of teleporting.
     * Cross-document links are left completely alone.
     */
    const onClick = (event: MouseEvent) => {
      if (!engine || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const url = new URL(anchor.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        !url.hash ||
        url.hash === "#"
      ) {
        return;
      }

      const target = document.getElementById(
        decodeURIComponent(url.hash.slice(1)),
      );
      if (!target) return;

      event.preventDefault();
      // Target offsets come from the element's own `scroll-margin-top`.
      engine.scrollTo(target, { duration: 1 });
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    };

    const stop = () => {
      document.removeEventListener("click", onClick);
      setScrollEngine(null);
      engine?.destroy();
      engine = null;
    };

    const start = async () => {
      if (engine) return;
      const { default: LenisEngine } = await import("lenis");
      if (!alive || engine) return;

      engine = new LenisEngine({
        lerp: LERP,
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 1,
        allowNestedScroll: true,
        autoRaf: true,
      });

      setScrollEngine(engine);
      document.addEventListener("click", onClick);
    };

    // Somebody can flip the OS setting while the page is open: follow them.
    const sync = () => {
      if (reduced.matches) stop();
      else void start();
    };

    sync();
    reduced.addEventListener("change", sync);

    return () => {
      alive = false;
      reduced.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return <>{children}</>;
}
