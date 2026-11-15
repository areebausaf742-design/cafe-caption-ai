"use client";

import { ArrowUpRight, CalendarDays } from "lucide-react";

import { track } from "@/lib/analytics";
import { BOOKING_LABEL, BOOKING_URL } from "@/lib/business";

type Variant = "primary" | "outline" | "inline";

const VARIANTS: Record<Variant, string> = {
  primary:
    "inline-flex min-h-[44px] origin-center items-center justify-center gap-2 rounded-xl bg-espresso-900 px-4 py-2.5 text-[12.5px] font-semibold text-cream-50 shadow-[0_10px_26px_-16px_rgba(36,24,18,0.85)] transition-[transform,background-color,box-shadow] duration-200 ease-out hover:scale-[1.02] hover:bg-espresso-800 hover:shadow-[0_16px_34px_-16px_rgba(201,128,60,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 active:scale-[0.97] active:duration-100",
  outline:
    "inline-flex min-h-[44px] origin-center items-center justify-center gap-2 rounded-xl border border-espresso-900/15 bg-white/60 px-4 py-2.5 text-[12.5px] font-semibold text-espresso-800 transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out hover:scale-[1.02] hover:border-espresso-900/30 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 active:scale-[0.97] active:duration-100",
  inline:
    "inline-flex min-h-[44px] items-center gap-1.5 text-[12px] font-semibold text-espresso-800 underline decoration-caramel-500/40 decoration-1 underline-offset-4 transition hover:text-espresso-900 hover:decoration-caramel-500",
};

/**
 * "Book a free call" — points at BOOKING_URL in lib/business.ts.
 * Until that constant holds a real Cal.com link the placeholder is used, so
 * swap it there and every booking button updates at once.
 */
export default function BookingLink({
  location,
  variant = "primary",
  label = BOOKING_LABEL,
}: {
  location: string;
  variant?: Variant;
  label?: string;
}) {
  return (
    <a
      href={BOOKING_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        track({ name: "cta_click", props: { location, label: "booking" } })
      }
      className={VARIANTS[variant]}
    >
      {variant !== "inline" && <CalendarDays className="h-3.5 w-3.5" />}
      {label}
      {variant === "inline" && <ArrowUpRight className="h-3.5 w-3.5" />}
    </a>
  );
}
