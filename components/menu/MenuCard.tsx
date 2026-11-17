import { Minus, Plus, QrCode, Trash2, UtensilsCrossed } from "lucide-react";

import { MAX_CATEGORY, MAX_ITEM_NAME, MAX_PRICE } from "@/lib/menu";
import type { DigitalMenu as MenuData, MenuItem } from "@/lib/types";

/**
 * Everything the card needs to become orderable. Optional: without it the card
 * is exactly what the demo page and the live menu render.
 */
export interface MenuOrderControl {
  quantities: Record<number, number>;
  onStep: (index: number, delta: number) => void;
}

/**
 * Editing, while the menu is still a draft in the studio.
 *
 * Never passed on a published menu — the public page gets `order` instead, and
 * the two never appear together. Typing into the preview is the point: what you
 * see here is literally what `POST /api/menus` receives.
 */
export interface MenuEditControl {
  onField: (index: number, field: "name" | "price", value: string) => void;
  onRemove: (index: number) => void;
  onAdd: (category: string) => void;
  onRenameCategory: (from: string, to: string) => void;
  /** Rows that won't publish as they stand, so they can be marked. */
  flagged?: readonly number[];
  canAdd: boolean;
}

/**
 * The menu itself: mobile-first, one column, dotted leaders between an item and
 * its price (the thing that makes a list read as a menu), and section headings
 * that survive long names on a 320px screen.
 *
 * Shared by the studio preview, the public `app/menu/demo` page the QR code
 * points at, and every live menu. Presentational only — no hooks, no browser
 * APIs — so it renders on the server just as happily as in the client studio.
 */
export default function MenuCard({
  menu,
  cafeName,
  isSample,
  updated,
  order,
  edit,
}: {
  menu: MenuData;
  cafeName: string;
  isSample: boolean;
  /** "Prices last updated 14 Nov" — only the live menu has one. */
  updated?: string | null;
  /** Present only on a live menu that has an order number. */
  order?: MenuOrderControl;
  /** Present only in the studio, before publishing. */
  edit?: MenuEditControl;
}) {
  // Index-preserving grouping: the cart is keyed by position in `menu.items`,
  // and an editable row has to keep editing the row it was rendered from.
  const indexed = menu.items.map((item, index) => ({ item, index }));
  const grouped = menu.categories.map((category, sectionIndex) => ({
    category,
    sectionIndex,
    rows: indexed.filter((row) => row.item.category === category),
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
          // Keyed by position, not by the category string: renaming a section
          // would otherwise remount it and drop focus mid-word.
          <section key={section.sectionIndex}>
            <h4 className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-espresso-500">
              {edit ? (
                <input
                  value={section.category}
                  onChange={(event) =>
                    edit.onRenameCategory(section.category, event.target.value)
                  }
                  aria-label={`Section name for ${section.rows.length} item${section.rows.length === 1 ? "" : "s"}`}
                  placeholder="Section name"
                  maxLength={MAX_CATEGORY}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-espresso-500 outline-none transition placeholder:text-espresso-400/70 hover:border-espresso-900/15 focus:border-caramel-400 focus:bg-white/80 focus:text-espresso-900 focus:ring-2 focus:ring-caramel-400/15 sm:text-[9.5px]"
                />
              ) : (
                <span className="shrink-0">{section.category}</span>
              )}

              {!edit && (
                <span aria-hidden className="h-px flex-1 bg-espresso-900/[0.12]" />
              )}

              <span className="shrink-0 text-[9px] font-medium tabular-nums tracking-normal text-espresso-400">
                {section.rows.length}
              </span>
            </h4>

            <ul className="mt-1.5 space-y-1">
              {section.rows.map(({ item, index }) => (
                // Positional key for the same reason — the name changes on
                // every keystroke.
                <MenuRow
                  key={index}
                  item={item}
                  index={index}
                  order={order}
                  edit={edit}
                />
              ))}
            </ul>

            {edit && (
              <button
                type="button"
                onClick={() => edit.onAdd(section.category)}
                disabled={!edit.canAdd}
                className="tap mt-1.5 flex min-h-[38px] w-full items-center justify-center gap-1 rounded-lg border border-dashed border-espresso-900/20 bg-white/40 text-[10px] font-semibold text-espresso-500 transition hover:border-espresso-900/35 hover:bg-white/70 hover:text-espresso-900 disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <Plus className="h-3 w-3" aria-hidden />
                Add item
              </button>
            )}
          </section>
        ))}

        {grouped.length === 0 && (
          <div className="py-5 text-center">
            <p className="text-[11.5px] text-espresso-500">
              {edit ? "No items yet." : "This menu has no items."}
            </p>
            {edit && (
              <button
                type="button"
                onClick={() => edit.onAdd("Menu")}
                disabled={!edit.canAdd}
                className="tap mt-2 inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-dashed border-espresso-900/25 bg-white/60 px-3 text-[10.5px] font-semibold text-espresso-600 transition hover:border-espresso-900/40 hover:text-espresso-900 disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <Plus className="h-3 w-3" aria-hidden />
                Add your first item
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-dashed border-espresso-900/[0.12] pt-2.5">
        <span className="text-[9px] uppercase tracking-[0.16em] text-espresso-400">
          {isSample ? "Digitised in seconds" : "Digitised with CafeCaption"}
        </span>
        {updated ? (
          <span className="text-[9px] font-medium text-espresso-500">
            Updated {updated}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-semibold text-espresso-500">
            Scan the QR
            <QrCode className="h-2.5 w-2.5" aria-hidden />
          </span>
        )}
      </footer>
    </article>
  );
}

function MenuRow({
  item,
  index,
  order,
  edit,
}: {
  item: MenuItem;
  index: number;
  order?: MenuOrderControl;
  edit?: MenuEditControl;
}) {
  if (edit) {
    return <EditableRow item={item} index={index} edit={edit} />;
  }

  const qty = order ? order.quantities[index] ?? 0 : 0;

  return (
    <li
      className={`flex items-center gap-1.5 ${
        qty > 0 ? "-mx-1.5 rounded-lg bg-caramel-50/70 px-1.5" : ""
      }`}
    >
      <span className="min-w-0 flex-1 break-words py-[3px] text-[12.5px] leading-[1.5] text-espresso-900 sm:text-[13px]">
        {item.name}
      </span>
      <span
        aria-hidden
        className="mb-[3px] h-px min-w-[10px] flex-1 border-b border-dotted border-espresso-900/[0.28]"
      />
      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-espresso-800 sm:text-[12.5px]">
        {item.price}
      </span>

      {order && (
        <span className="ml-0.5 flex shrink-0 items-center">
          {qty > 0 ? (
            <>
              <button
                type="button"
                onClick={() => order.onStep(index, -1)}
                aria-label={`One less ${item.name}`}
                className="tap flex h-9 w-8 items-center justify-center rounded-l-lg border border-espresso-900/[0.14] bg-white/70 text-espresso-700 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
              >
                <Minus className="h-3 w-3" aria-hidden />
              </button>
              <span className="flex h-9 min-w-[26px] items-center justify-center border-y border-espresso-900/[0.14] bg-white/70 px-1 text-[12px] font-semibold tabular-nums text-espresso-900">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => order.onStep(index, 1)}
                aria-label={`One more ${item.name}`}
                className="tap flex h-9 w-8 items-center justify-center rounded-r-lg border border-espresso-900/[0.14] bg-white/70 text-espresso-700 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
              >
                <Plus className="h-3 w-3" aria-hidden />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => order.onStep(index, 1)}
              aria-label={`Add ${item.name} to your order`}
              className="tap flex h-9 w-9 items-center justify-center rounded-lg border border-espresso-900/[0.14] bg-white/70 text-espresso-700 hover:border-espresso-900/30 hover:bg-white hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </span>
      )}
    </li>
  );
}

/**
 * One row, open for editing.
 *
 * The name and price keep `.input`'s mobile trick — 16px on small screens, so
 * iOS doesn't zoom the page when the field takes focus — then drop to the
 * menu's own type scale from `sm` up, where the card is a preview again.
 */
function EditableRow({
  item,
  index,
  edit,
}: {
  item: MenuItem;
  index: number;
  edit: MenuEditControl;
}) {
  const flagged = edit.flagged?.includes(index) ?? false;
  const nameMissing = !item.name.trim();
  const priceMissing = !item.price.trim();

  const fieldClass = (invalid: boolean) =>
    [
      "min-w-0 rounded-md border bg-transparent outline-none transition",
      "hover:border-espresso-900/15 focus:border-caramel-400 focus:bg-white/85 focus:ring-2 focus:ring-caramel-400/20",
      invalid
        ? "border-caramel-400/70 bg-caramel-50/50"
        : "border-transparent",
    ].join(" ");

  return (
    <li className="flex items-center gap-1">
      <input
        value={item.name}
        onChange={(event) => edit.onField(index, "name", event.target.value)}
        aria-label={`Name for item ${index + 1}`}
        aria-invalid={flagged || undefined}
        placeholder="Item name"
        maxLength={MAX_ITEM_NAME}
        className={`${fieldClass(nameMissing)} flex-1 px-1 py-[3px] text-base leading-[1.5] text-espresso-900 placeholder:text-espresso-400/80 sm:text-[12.5px]`}
      />

      <span
        aria-hidden
        className="mb-[3px] hidden h-px min-w-[8px] flex-1 border-b border-dotted border-espresso-900/[0.28] sm:block"
      />

      <input
        value={item.price}
        onChange={(event) => edit.onField(index, "price", event.target.value)}
        aria-label={`Price for item ${index + 1}`}
        aria-invalid={flagged || undefined}
        placeholder="₹80"
        maxLength={MAX_PRICE}
        inputMode="text"
        className={`${fieldClass(priceMissing)} w-[58px] shrink-0 px-1 py-[3px] text-right text-base font-semibold tabular-nums text-espresso-800 placeholder:font-normal placeholder:text-espresso-400/80 sm:w-[62px] sm:text-[12px]`}
      />

      <button
        type="button"
        onClick={() => edit.onRemove(index)}
        aria-label={`Remove ${item.name.trim() || `item ${index + 1}`}`}
        className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-espresso-400 transition hover:border-espresso-900/15 hover:bg-white/70 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 sm:h-8 sm:w-8"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}
