"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Info,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";

import MenuCard from "@/components/menu/MenuCard";
import { track } from "@/lib/analytics";
import {
  MAX_INSTRUCTIONS,
  MAX_LINES,
  MAX_QTY,
  buildOrder,
  cartSize,
  formatAmount,
  stepQuantity,
  whatsappOrderUrl,
  type Quantities,
} from "@/lib/order";
import type { DigitalMenu, MenuItem } from "@/lib/types";

/**
 * The cart: tap a plus, send the order to the café's own WhatsApp.
 *
 * There is no checkout, no payment and no server in the middle — the order is
 * assembled in the browser and handed to `wa.me`, which means the café reads it
 * in the app they already run their counter from. That is also why it works
 * without an account, an app install or a commission.
 *
 * The panel opens *in the page* rather than as a modal: no focus trap to get
 * wrong, and the menu stays visible behind it — which is what you want when
 * you're deciding what else to order.
 */

export default function MenuOrder({
  slug,
  cafeName,
  menu,
  items,
  whatsapp,
  updated,
}: {
  slug: string;
  cafeName: string;
  menu: DigitalMenu;
  items: MenuItem[];
  whatsapp: string;
  updated?: string | null;
}) {
  const [quantities, setQuantities] = useState<Quantities>({});
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [sent, setSent] = useState(false);
  const [limitHit, setLimitHit] = useState(false);

  const order = useMemo(
    () =>
      buildOrder({
        cafeName,
        items,
        quantities,
        instructions,
        menuLabel: `/menu/${slug}`,
      }),
    [cafeName, items, quantities, instructions, slug],
  );

  const size = cartSize(quantities);

  const step = useCallback(
    (index: number, delta: number) => {
      setSent(false);
      // `stepQuantity` hands back the same object when it refuses, which is how
      // the cart-holds-25-lines message knows to show itself.
      const next = stepQuantity(quantities, index, delta);
      if (next === quantities) {
        if (delta > 0) setLimitHit(true);
        return;
      }
      setLimitHit(false);
      setQuantities(next);
    },
    [quantities],
  );

  const clear = useCallback(() => {
    setQuantities({});
    setInstructions("");
    setSent(false);
    setOpen(false);
    setLimitHit(false);
  }, []);

  const send = useCallback(() => {
    setSent(true);
    track({
      name: "order_send",
      props: {
        items: order.itemCount,
        units: order.unitCount,
        has_note: order.text.includes("Note: "),
        total_known: order.total !== null,
      },
    });
  }, [order]);

  const totalLabel = order.total === null ? "—" : formatAmount(order.total);

  return (
    <>
      <MenuCard
        menu={menu}
        cafeName={cafeName}
        isSample={false}
        updated={updated}
        order={{ quantities, onStep: step }}
      />

      {/* The order sheet — in flow, so nothing is hidden behind an overlay. */}
      {open && (
        <section
          id="order"
          aria-label="Your order"
          className="card mt-3 scroll-mt-24 p-4 sm:p-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-espresso-900">
              <ShoppingBag className="h-3.5 w-3.5 text-espresso-500" aria-hidden />
              Your order
            </h2>
            <button
              type="button"
              onClick={clear}
              className="tap inline-flex items-center gap-1 text-[10.5px] font-medium text-espresso-500 hover:text-espresso-800"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              Clear
            </button>
          </div>

          <ul className="mt-3 space-y-2">
            {order.lines.map((line) => (
              <li key={line.index} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-espresso-900">
                  {line.name}
                  <span className="ml-1 tabular-nums text-espresso-400">
                    {line.unit === null ? "" : `· ${formatAmount(line.unit)}`}
                  </span>
                </span>

                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => step(line.index, -1)}
                    aria-label={`One less ${line.name}`}
                    className="tap flex h-8 w-7 items-center justify-center rounded-l-lg border border-espresso-900/[0.14] bg-white/70 text-espresso-700 hover:border-espresso-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
                  >
                    <Minus className="h-3 w-3" aria-hidden />
                  </button>
                  <span className="flex h-8 min-w-[24px] items-center justify-center border-y border-espresso-900/[0.14] bg-white/70 px-1 text-[11.5px] font-semibold tabular-nums text-espresso-900">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => step(line.index, 1)}
                    aria-label={`One more ${line.name}`}
                    className="tap flex h-8 w-7 items-center justify-center rounded-r-lg border border-espresso-900/[0.14] bg-white/70 text-espresso-700 hover:border-espresso-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                </span>

                <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums text-espresso-800">
                  {line.lineTotal === null ? "—" : formatAmount(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-espresso-900/[0.14] pt-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-espresso-500">
              Total
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-espresso-900">
              {totalLabel}
            </span>
          </div>

          {order.hasUnpricedLines && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-caramel-50/80 px-2.5 py-2 text-[10.5px] leading-[1.55] text-espresso-600">
              <Info className="mt-[1px] h-3 w-3 shrink-0 text-caramel-600" aria-hidden />
              <span>
                One of these prices isn&apos;t a single figure on the menu, so
                there&apos;s no total here — the café will confirm it at the
                counter.
              </span>
            </p>
          )}

          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-espresso-600">
              Anything the kitchen should know? — optional
            </span>
            <textarea
              className="input mt-1 min-h-[64px] resize-y text-[12.5px]"
              value={instructions}
              maxLength={MAX_INSTRUCTIONS}
              rows={2}
              placeholder="Less sugar, extra hot, no onion…"
              onChange={(event) => {
                setInstructions(event.target.value);
                setSent(false);
              }}
            />
            <span className="mt-1 block text-right text-[10px] tabular-nums text-espresso-400">
              {instructions.length} / {MAX_INSTRUCTIONS}
            </span>
          </label>

          <a
            href={whatsappOrderUrl(whatsapp, order.text)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={send}
            className="btn-primary tap mt-1 inline-flex w-full items-center justify-center gap-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Send order on WhatsApp
          </a>

          <p className="mt-2 text-center text-[10px] leading-[1.5] text-espresso-400">
            {sent
              ? "WhatsApp should be open with your order. Nothing is sent until you press send there."
              : "Opens WhatsApp with the order typed out. Pay at the counter — nothing is charged here."}
          </p>
        </section>
      )}

      {/* The bar: what a phone shows once something is in the cart. */}
      {size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
          <div className="card pointer-events-auto mx-auto flex max-w-xl items-center gap-3 p-2.5 pl-3.5">
            <span aria-live="polite" className="sr-only">
              {size} {size === 1 ? "item" : "items"} in your order
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold leading-tight text-espresso-900">
                {size} {size === 1 ? "item" : "items"}
                <span className="ml-1.5 font-normal text-espresso-500">
                  · {totalLabel}
                </span>
              </p>
              <p className="mt-0.5 truncate text-[10px] text-espresso-400">
                {limitHit
                  ? `One order holds up to ${MAX_LINES} different items (${MAX_QTY} of each).`
                  : "Pay at the counter when you collect."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="order"
              className="btn-dark tap inline-flex min-h-[42px] shrink-0 items-center gap-1.5 px-3.5 text-[12px]"
            >
              {open ? "Hide" : "Review order"}
              {!open && <ArrowUpRight className="h-3 w-3" aria-hidden />}
            </button>
          </div>
        </div>
      )}

      {/* Success nudge sits with the bar, not in a bubble nobody sees. */}
      {sent && !open && (
        <p className="fixed inset-x-0 bottom-[68px] z-40 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-espresso-900/95 px-3 py-1.5 text-[10.5px] font-medium text-cream-50">
          <Check className="h-3 w-3 text-sage-300" aria-hidden />
          Order opened in WhatsApp
        </p>
      )}
    </>
  );
}
