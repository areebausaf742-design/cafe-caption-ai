"use client";

import { Camera, MapPin, UtensilsCrossed } from "lucide-react";
import * as m from "framer-motion/m";

import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";

export type StudioTab = "captions" | "seo" | "menu";

const TABS: {
  id: StudioTab;
  label: string;
  shortLabel: string;
  icon: typeof Camera;
}[] = [
  {
    id: "captions",
    label: "Instagram captions",
    shortLabel: "Captions",
    icon: Camera,
  },
  {
    id: "seo",
    label: "Google Local SEO",
    shortLabel: "Google",
    icon: MapPin,
  },
  {
    id: "menu",
    label: "Digital menu",
    shortLabel: "Menu",
    icon: UtensilsCrossed,
  },
];

/** Column index of each tab, for the sliding pill. */
const INDEX: Record<StudioTab, number> = { captions: 0, seo: 1, menu: 2 };

/**
 * Segmented tab switcher for the studio.
 *
 * The pill is one element that slides between three equal columns with a spring
 * (`x: 0% → 100% → 200%`, where 100% is its own width, i.e. exactly one column),
 * rather than three backgrounds cross-fading — cheaper, and it reads as one
 * physical control. It deliberately uses a transform instead of
 * `layoutId`: the app loads the `domAnimation` feature set through `LazyMotion`
 * (see `components/motion/MotionRoot.tsx`), which does not include layout
 * projection, so a `layout`-based pill would snap instead of slide.
 *
 * `initial={false}` means the correct position is already in the server HTML —
 * no flash of the pill sitting under the wrong tab after hydration.
 */
export default function StudioTabs({
  active,
  onChange,
}: {
  active: StudioTab;
  onChange: (tab: StudioTab) => void;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="Studio tools"
      className="hairline relative mb-4 rounded-full bg-white/55 p-1"
    >
      <div className="relative">
        <m.span
          aria-hidden
          initial={false}
          animate={{ x: `${INDEX[active] * 100}%` }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 34 }
          }
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-full bg-espresso-900 shadow-[0_10px_24px_-16px_rgba(36,24,18,0.9)]"
        />

        <div className="relative grid grid-cols-3">
          {TABS.map((tab) => {
            const selected = active === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`studio-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`studio-panel-${tab.id}`}
                onClick={() => onChange(tab.id)}
                className={`tap relative flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-1.5 text-[11px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 sm:px-2 sm:text-[12px] ${
                  selected
                    ? "text-cream-50"
                    : "text-espresso-600 hover:text-espresso-900"
                }`}
              >
                <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden />
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
