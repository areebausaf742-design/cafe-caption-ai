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

/**
 * Frosted-glass header: translucent cream + backdrop blur, closed off with a
 * hairline that fades at both ends instead of a hard grey rule.
 */
export default function SiteHeader() {
  return (
    // Frosted glass, at a radius the compositor can afford: the header re-blurs
    // whatever scrolls beneath it on every frame, and cost grows with the square
    // of the blur radius. 16px still reads as glass and is ~2x cheaper than 24.
    <header className="sticky top-0 z-40 bg-cream-100/80 backdrop-blur-lg backdrop-saturate-150 supports-[backdrop-filter]:bg-cream-100/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="group flex min-h-[44px] items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
          aria-label="CafeCaption — home"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-espresso-900 font-display text-[15px] font-semibold text-caramel-300 shadow-[0_6px_16px_-8px_rgba(36,24,18,0.8)] transition duration-200 group-hover:scale-[1.03] group-hover:bg-espresso-800">
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

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-[12.5px] font-medium text-espresso-600 transition duration-200 hover:bg-white/60 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
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

      {/* Hairline: warm at the centre, invisible at the edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-espresso-900/[0.14] to-transparent"
      />
    </header>
  );
}
