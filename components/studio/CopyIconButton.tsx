"use client";

import { Check, Copy, Hash } from "lucide-react";

/**
 * Square 44×44 copy control with a hover/focus tooltip.
 *
 * Icon-only saves the caption cards from a wall of buttons; the tooltip and the
 * `aria-label` keep it usable without a mouse, and the icon swaps to a tick for
 * a moment after a successful copy so the action is confirmed in place.
 */
export default function CopyIconButton({
  variant,
  tooltip,
  ariaLabel,
  copied,
  onClick,
  disabled = false,
}: {
  variant: "text" | "hashtags";
  tooltip: string;
  ariaLabel: string;
  copied: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = variant === "hashtags" ? Hash : Copy;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="tap group/icon hairline relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/60 text-espresso-700 transition hover:bg-white hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied ? (
        <Check className="h-[15px] w-[15px] text-sage-500" aria-hidden />
      ) : (
        <Icon className="h-[15px] w-[15px]" aria-hidden />
      )}
      <span
        role="tooltip"
        aria-hidden
        className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-md bg-espresso-900/95 px-2 py-1 text-[10.5px] font-medium text-cream-50 opacity-0 shadow-lg transition-opacity duration-150 group-hover/icon:opacity-100 group-focus-visible/icon:opacity-100"
      >
        {tooltip}
      </span>
    </button>
  );
}
