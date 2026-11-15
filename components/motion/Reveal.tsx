"use client";

import type { ReactNode } from "react";
import * as m from "framer-motion/m";

import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type RevealTag = "div" | "li" | "section" | "figure";

/**
 * Staggered fade-up on scroll-into-view.
 *
 * Uses framer-motion's lightweight `m` components, so the heavy animation
 * feature bundle (`domAnimation`) is fetched from its own async chunk and never
 * blocks the first paint. Under `prefers-reduced-motion` the same element
 * renders with a zero-duration transition — the markup stays identical.
 */
export default function Reveal({
  children,
  /** Stagger offset in milliseconds. */
  delay = 0,
  /** Travel distance in pixels. */
  y = 18,
  /** Element to render — keeps list/grid semantics intact. */
  as = "div",
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  as?: RevealTag;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();

  const shared = {
    "data-reveal": "",
    className,
    initial: { opacity: 0, y },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15, margin: "0px 0px -8% 0px" },
    transition: {
      duration: reduced ? 0 : 0.6,
      delay: reduced ? 0 : delay / 1000,
      ease: EASE,
    },
  };

  if (as === "li") return <m.li {...shared}>{children}</m.li>;
  if (as === "section") return <m.section {...shared}>{children}</m.section>;
  if (as === "figure") return <m.figure {...shared}>{children}</m.figure>;
  return <m.div {...shared}>{children}</m.div>;
}
