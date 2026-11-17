import { QrCode, UtensilsCrossed } from "lucide-react";

import type { DigitalMenu as MenuData, MenuItem } from "@/lib/types";

/**
 * The menu itself: mobile-first, one column, dotted leaders between an item and
 * its price (the thing that makes a list read as a menu), and section headings
 * that survive long names on a 320px screen.
 *
 * Shared by the studio preview and by the public `app/menu/demo` page the QR
 * code points at. Presentational only — no hooks, no browser APIs — so it
 * renders on the server just as happily as in the client-side studio.
 */

export default function MenuCard({
  menu,
  cafeName,
  isSample,
}: {
  menu: MenuData;
  cafeName: string;
  isSample: boolean;
}) {
  const grouped = menu.categories.map((category) => ({
    category,
    items: menu.items.filter((item) => item.category === category),
  }));

  return (
    <article className="paper relative overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
      <header className="text-center">
        <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-caramel-600">
          {isSample ? "Sample café" : "Digital menu"}
        </p>
        <h3 className="mt-1 break-words font-display text-[19px] font-semibold leading-tight tracking-[-0.01em] text-espresso-900 sm:text-[22px]">
          {cafeName || "Your Café"}
        </h3>
        <div className="mx-auto mt-2 flex items-center justify-center gap-2">
          <span className="h-px w-8 bg-espresso-900/15" />
          <UtensilsCrossed className="h-3 w-3 text-espresso-300" aria-hidden />
          <span className="h-px w-8 bg-espresso-900/15" />
        </div>
      </header>

      <div className="mt-4 space-y-4">
        {grouped.map((section) => (
          <section key={section.category}>
            <h4 className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-espresso-500">
              <span className="shrink-0">{section.category}</span>
              <span aria-hidden className="h-px flex-1 bg-espresso-900/[0.12]" />
              <span className="shrink-0 text-[9px] font-medium tabular-nums tracking-normal text-espresso-400">
                {section.items.length}
              </span>
            </h4>

            <ul className="mt-1.5 space-y-1">
              {section.items.map((item, index) => (
                <MenuRow key={`${item.name}-${index}`} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-dashed border-espresso-900/[0.12] pt-2.5">
        <span className="text-[9px] uppercase tracking-[0.16em] text-espresso-400">
          {isSample ? "Digitised in seconds" : "Digitised with CafeCaption"}
        </span>
        <span className="flex items-center gap-1 text-[9px] font-semibold text-espresso-500">
          Scan the QR
          <QrCode className="h-2.5 w-2.5" aria-hidden />
        </span>
      </footer>
    </article>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <span className="min-w-0 break-words text-[12.5px] leading-[1.5] text-espresso-900 sm:text-[13px]">
        {item.name}
      </span>
      <span
        aria-hidden
        className="mb-[3px] h-px min-w-[10px] flex-1 border-b border-dotted border-espresso-900/[0.28]"
      />
      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-espresso-800 sm:text-[12.5px]">
        {item.price}
      </span>
    </li>
  );
}
