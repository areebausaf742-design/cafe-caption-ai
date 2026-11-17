import type Lenis from "lenis";

/**
 * The page's scroll engine — if one is running.
 *
 * `Lenis` is created once, in `components/motion/SmoothScroll.tsx`, and is
 * deliberately optional: before hydration, and for anyone who asked their OS
 * for reduced motion, this stays `null` and every helper here falls back to the
 * browser's own scrolling. Keeping the instance in one module means no
 * component has to know which mode the page is in.
 */
let engine: Lenis | null = null;

export function setScrollEngine(next: Lenis | null) {
  engine = next;
}

/**
 * Bring something into view: glides while Lenis is in charge, and uses the
 * browser (instantly, for reduced-motion users) when it isn't.
 *
 * `offset` shifts the landing point up by that many pixels — handy when the
 * target would otherwise sit under the sticky header. Targets with a
 * `scroll-margin-top` are already handled, so most callers pass nothing.
 */
export function smoothScrollTo(target: Element | string, offset = 0) {
  if (engine) {
    engine.scrollTo(target, { offset, duration: 1 });
    return;
  }

  const element =
    typeof target === "string" ? document.querySelector(target) : target;
  if (!element) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "start",
  });
}
