import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";

import {
  CONTACT_EMAIL,
  CONTACT_NAME,
  CONTACT_PHONE_DISPLAY,
  FOOTER_NOTE,
  DEFAULT_WHATSAPP_MESSAGE,
  whatsappUrl,
} from "@/lib/business";

export default function SiteFooter() {
  return (
    <footer className="mt-14 border-t border-espresso-900/10 bg-cream-50/60">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-espresso-900 font-display text-[15px] font-semibold text-caramel-300">
                C
              </span>
              <span className="font-display text-base font-semibold tracking-tight text-espresso-900">
                CafeCaption
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[12.5px] leading-relaxed text-espresso-600">
              Websites, menus and Instagram captions for independent cafés.
              Made in Lucknow, working with cafés everywhere.
            </p>
          </div>

          <nav aria-label="Footer" className="text-[12.5px]">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
              Studio
            </p>
            <ul className="space-y-2">
              {[
                { href: "/#studio", label: "Caption studio" },
                { href: "/#packages", label: "Packages" },
                { href: "/#process", label: "How it works" },
                { href: "/#faq", label: "FAQ" },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-espresso-600 transition hover:text-espresso-900"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="text-[12.5px]">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-espresso-400">
              Contact
            </p>
            <ul className="space-y-2">
              <li>
                <a
                  href={whatsappUrl(DEFAULT_WHATSAPP_MESSAGE)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-espresso-600 transition hover:text-espresso-900"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 break-all text-espresso-600 transition hover:text-espresso-900"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="pt-1">
                <Link
                  href="/privacy"
                  className="text-espresso-500 transition hover:text-espresso-900"
                >
                  Privacy
                </Link>
                <span className="px-2 text-espresso-300">·</span>
                <Link
                  href="/terms"
                  className="text-espresso-500 transition hover:text-espresso-900"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-espresso-900/10 pt-5 text-[10.5px] leading-relaxed text-espresso-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} CafeCaption. All rights reserved.
          </p>
          <p className="max-w-md sm:text-right">{FOOTER_NOTE}</p>
        </div>
        <p className="mt-1.5 text-[10.5px] text-espresso-400">
          Built by {CONTACT_NAME}, Lucknow.
        </p>
      </div>
    </footer>
  );
}
