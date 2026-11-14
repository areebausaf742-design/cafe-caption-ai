import Link from "next/link";
import { MessageCircle } from "lucide-react";

import TrackedLink from "@/components/TrackedLink";
import {
  DEFAULT_WHATSAPP_MESSAGE,
  whatsappUrl,
} from "@/lib/business";

const NAV = [
  { href: "/#studio", label: "Caption studio" },
  { href: "/#packages", label: "Packages" },
  { href: "/#process", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-espresso-900/10 bg-cream-100/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
          aria-label="CafeCaption — home"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-espresso-900 font-display text-[15px] font-semibold text-caramel-300 shadow-sm transition group-hover:bg-espresso-800">
            C
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-semibold tracking-tight text-espresso-900 sm:text-base">
              CafeCaption
            </span>
            <span className="mt-0.5 hidden text-[9.5px] font-medium uppercase tracking-[0.16em] text-espresso-400 sm:block">
              Instagram studio
            </span>
          </span>
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center gap-7 md:flex"
        >
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[12.5px] font-medium text-espresso-600 transition hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <TrackedLink
          href={whatsappUrl(DEFAULT_WHATSAPP_MESSAGE)}
          location="header"
          label="whatsapp"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-dark"
        >
          <MessageCircle className="h-3.5 w-3.5 text-[#4ADE80]" />
          <span className="hidden sm:inline">Talk to Areeb</span>
          <span className="sm:hidden">WhatsApp</span>
        </TrackedLink>
      </div>
    </header>
  );
}
