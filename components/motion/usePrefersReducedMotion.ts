"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `prefers-reduced-motion`.
 *
 * Starts as `false` (the animation path) so the server and first client render
 * agree on markup; it only ever changes *timing*, never structure, so there is
 * nothing to flash or hydrate differently.
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}
