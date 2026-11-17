"use client";

import type { ReactNode } from "react";
import { LazyMotion } from "framer-motion";

import SmoothScroll from "@/components/motion/SmoothScroll";

const loadFeatures = () =>
  import("framer-motion").then((mod) => mod.domAnimation);

export default function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <SmoothScroll>{children}</SmoothScroll>
    </LazyMotion>
  );
}
