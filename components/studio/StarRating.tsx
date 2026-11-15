"use client";

import { useRef, useState } from "react";
import { Star } from "lucide-react";

import { RATING_LABELS, type StarRating as Rating } from "@/lib/types";

const STARS: Rating[] = [1, 2, 3, 4, 5];

/**
 * Accessible 1–5 star picker.
 *
 * A radio group, not five buttons: arrow keys move the selection, `aria-checked`
 * announces the current value, and the star the pointer is over gets a preview
 * fill so the rating is obvious before it is committed. Each hit area is 44×44.
 */
export default function StarRating({
  value,
  onChange,
  disabled = false,
  describedBy,
}: {
  value: Rating | null;
  onChange: (rating: Rating) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const [hovered, setHovered] = useState<Rating | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const shown = hovered ?? value ?? 0;

  const move = (from: number, delta: number) => {
    const next = Math.min(4, Math.max(0, from + delta));
    const rating = STARS[next];
    onChange(rating);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Star rating the customer gave"
        aria-describedby={describedBy}
        className="flex items-center gap-1"
        onMouseLeave={() => setHovered(null)}
      >
        {STARS.map((star, index) => {
          const active = star <= shown;

          return (
            <button
              key={star}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} star${star > 1 ? "s" : ""} — ${RATING_LABELS[star].split(" · ")[1]}`}
              tabIndex={value === null ? (index === 0 ? 0 : -1) : value === star ? 0 : -1}
              disabled={disabled}
              onMouseEnter={() => setHovered(star)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(null)}
              onClick={() => onChange(star)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, 1);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, -1);
                }
              }}
              className="tap flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Star
                className={`h-[18px] w-[18px] transition-colors duration-150 ${
                  active ? "fill-caramel-500 text-caramel-500" : "text-espresso-300"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      <span
        className="text-[11px] font-medium text-espresso-500"
        aria-hidden
      >
        {value ? RATING_LABELS[value].split(" · ")[1] : "Pick a rating"}
      </span>
    </div>
  );
}
