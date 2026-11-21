import type { Metadata } from "next";
import Link from "next/link";

/**
 * A 404 is the page a visitor is most likely to see by accident and the one the
 * default `next` page handles worst — a bare "This page could not be found" on
 * white, with no way back. Every menu QR points at `/menu/<slug>`, so a mistyped
 * or retired slug lands here, and it should still feel like the product.
 *
 * Deliberately a server component with no client JS: the one thing a visitor on
 * a bad connection does not need is a bundle for the page that says "no".
 */

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

const LINKS = [
  {
    href: "/",
    label: "Back to the studio",
    detail: "Captions, hashtags and digital menus, all on one page.",
  },
  {
    href: "/menu/demo",
    label: "See a live menu",
    detail: "What a café's QR code actually opens.",
  },
] as const;

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
      <p className="label">404</p>

      <h1 className="mt-4 font-display text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.02em] text-espresso-900 sm:text-[2.4rem]">
        This page has been taken off the menu.
      </h1>

      <p className="section-lead mt-4 max-w-md">
        The link is broken, the menu it pointed at was unpublished, or the address
        has a typo in it. Nothing is lost — your QR code still works if the café
        published the menu.
      </p>

      <ul className="mt-8 grid gap-3">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="card group flex min-h-[44px] items-center justify-between gap-4 px-4 py-3.5 no-underline transition-colors hover:border-espresso-300"
            >
              <span>
                <span className="block text-[13.5px] font-medium text-espresso-900">
                  {link.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.6] text-espresso-500">
                  {link.detail}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="text-espresso-300 transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-[11.5px] leading-[1.7] text-espresso-500">
        Own the menu this link was meant to open?{" "}
        <Link href="/#contact" className="underline underline-offset-2 hover:text-espresso-800">
          Write to us
        </Link>{" "}
        and we will send you a fresh edit link.
      </p>
    </main>
  );
}
