import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Camera, Pencil, QrCode } from "lucide-react";

import MenuQr from "@/components/menu/MenuQr";
import MenuCard from "@/components/menu/MenuCard";
import { BOOKING_URL, MENU_DEMO_URL } from "@/lib/business";
import type { DigitalMenu } from "@/lib/types";

/**
 * The page the demo QR code points at.
 *
 * The studio's digital-menu tab prints a QR into its preview; before this page
 * existed that QR encoded a URL with nothing behind it, so the one moment a
 * café owner tests the tool ended in a 404. Now it lands here: a real menu, a
 * QR you can scan with a phone, and a straight explanation of what a paid
 * version gives you (your own link, editable without reprinting).
 *
 * Deliberately a server component with one tiny client island for the QR — the
 * page has no interactivity worth shipping JavaScript for.
 */

export const metadata: Metadata = {
  title: "Demo digital menu",
  description:
    "A sample cafe digital menu built from a photo of a printed card — the page behind the CafeCaption QR code.",
  // A sample menu shouldn't compete with real client menus in search.
  robots: { index: false, follow: true },
};

const DEMO_MENU: DigitalMenu = {
  items: [
    { category: "Coffee & chai", name: "Masala Chai", price: "₹80" },
    { category: "Coffee & chai", name: "Cappuccino", price: "₹160" },
    { category: "Coffee & chai", name: "Cold Brew", price: "₹190" },
    { category: "Coffee & chai", name: "Filter Kaapi", price: "₹120" },
    { category: "Small plates", name: "Paneer Tikka Sandwich", price: "₹220" },
    { category: "Small plates", name: "Masala Maggi", price: "₹110" },
    { category: "Small plates", name: "Croissant", price: "₹120" },
    { category: "Small plates", name: "Chilli Cheese Toast", price: "₹150" },
    { category: "Desserts", name: "Tiramisu", price: "₹240" },
    { category: "Desserts", name: "Gulab Jamun Cheesecake", price: "₹260" },
    { category: "Desserts", name: "Brownie & Ice Cream", price: "₹210" },
  ],
  categories: ["Coffee & chai", "Small plates", "Desserts"],
  categoryCount: 3,
};

const WHAT_YOU_GET = [
  "A photo of your printed menu, read into clean categories, items and prices.",
  "Your own link — not this demo one — that you can print on every table.",
  "Prices you can change in ten seconds, without reprinting the tents.",
  "A cart on the menu itself: customers pick quantities and send the order straight to your WhatsApp.",
];

export default function MenuDemoPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <div className="max-w-2xl">
        <span className="label">Digital menu · demo</span>
        <h1 className="mt-3 font-display text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.02em] text-espresso-900 sm:text-[2.3rem]">
          This is what a digitised menu looks like.
        </h1>
        <p className="section-lead mt-4">
          A sample café menu, read from a photo of the printed card and laid out
          for a phone. The QR on the right points at this page — scan it and you
          get the same menu, full width, no app.
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_264px] lg:items-start">
        <MenuCard menu={DEMO_MENU} cafeName="Chai & Chapter" isSample />

        <div className="space-y-3">
          <div className="hairline relative rounded-xl bg-white/70 p-4 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
              <QrCode className="h-3 w-3" aria-hidden />
              Scan for the menu
            </p>
            <div className="mt-3 flex justify-center">
              <MenuQr url={MENU_DEMO_URL} />
            </div>
            <p className="mt-3 break-all text-[9.5px] font-medium tracking-[0.01em] text-espresso-400">
              {MENU_DEMO_URL.replace(/^https?:\/\//, "")}
            </p>
          </div>

          <div className="card p-4">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
              On a paid menu
            </p>
            <ul className="mt-2 space-y-2">
              {WHAT_YOU_GET.map((line) => (
                <li
                  key={line}
                  className="flex gap-2 text-[11.5px] leading-[1.6] text-espresso-600"
                >
                  <span
                    aria-hidden
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-caramel-400"
                  />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/#studio"
          className="card tap flex items-start gap-3 p-4 hover:border-caramel-400/55"
        >
          <Camera className="mt-0.5 h-4 w-4 shrink-0 text-espresso-700" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-espresso-900">
              Try it with your own menu photo
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-[1.6] text-espresso-600">
              Free, no account. Open the studio, pick the Menu tab, upload one
              page of your printed card.
            </span>
          </span>
          <ArrowUpRight
            className="ml-auto h-3.5 w-3.5 shrink-0 text-espresso-400"
            aria-hidden
          />
        </Link>

        <a
          href={BOOKING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="card tap flex items-start gap-3 p-4 hover:border-caramel-400/55"
        >
          <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-espresso-700" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-espresso-900">
              Or have it set up for you
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-[1.6] text-espresso-600">
              Multi-page menus, WhatsApp ordering and table QR standees are part
              of the Café Launch Kit.
            </span>
          </span>
          <ArrowUpRight
            className="ml-auto h-3.5 w-3.5 shrink-0 text-espresso-400"
            aria-hidden
          />
        </a>
      </div>

      <p className="mt-6 text-[10.5px] leading-[1.7] text-espresso-500">
        Chai &amp; Chapter is a sample café and these are sample prices — nothing
        here is for sale. Your own menu stays private until you publish it, and
        you can edit it any time.
      </p>
    </main>
  );
}
