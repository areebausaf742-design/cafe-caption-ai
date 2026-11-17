"use client";

import type { ReactNode } from "react";
import * as m from "framer-motion/m";

import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";

/**
 * A slow, barely-there bob — the "this one is alive" cue on the featured card.
 *
 * Deliberately tiny (7px over 7s) and with a long ease, so it reads as weight
 * rather than movement. Under `prefers-reduced-motion` it renders at rest: same
 * markup, no animation, no layout shift.
 */
export default function Float({
  children,
  className,
  /** Travel in pixels; keep it single digits or it stops feeling like gravity. */
  distance = 7,
  /** Seconds for a full up-and-down cycle. */
  duration = 7,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  duration?: number;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <m.div
      className={className}
      animate={reduced ? { y: 0 } : { y: [0, -distance, 0] }}
      transition={
        reduced
          ? { duration: 0 }
          : {
              duration,
              times: [0, 0.5, 1],
              repeat: Infinity,
              ease: "easeInOut",
            }
      }
      style={{ willChange: reduced ? undefined : "transform" }}
    >
      {children}
    </m.div>
  );
}
