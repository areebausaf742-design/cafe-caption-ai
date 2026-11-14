"use client";

import { ArrowUpRight, CalendarDays } from "lucide-react";

import { track } from "@/lib/analytics";
import { BOOKING_LABEL, BOOKING_URL } from "@/lib/business";

type Variant = "primary" | "outline" | "inline";

const VARIANTS: Record<Variant, string> = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-espresso-900 px-4 py-2.5 text-[12.5px] font-semibold text-cream-50 shadow-sm transition hover:bg-espresso-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40",
  outline:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-espresso-900/15 bg-white/60 px-4 py-2.5 text-[12.5px] font-semibold text-espresso-800 transition hover:border-espresso-900/30 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40",
  inline:
    "inline-flex items-center gap-1.5 text-[12px] font-semibold text-espresso-800 underline decoration-caramel-500/40 decoration-1 underline-offset-4 transition hover:text-espresso-900 hover:decoration-caramel-500",
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
