import { ArrowRight, Check, Clock, ShieldCheck } from "lucide-react";

import Float from "@/components/motion/Float";
import Reveal from "@/components/motion/Reveal";
import TrackedLink from "@/components/TrackedLink";

import {
  PACKAGES,
  formatINR,
  whatsappUrl,
  CONTACT_EMAIL,
  type Package,
} from "@/lib/business";

/**
 * Pricing, built around one card.
 *
 * The ₹10,000 Café Launch Kit is what most cafés should leave with, so it holds
 * the middle of the row on desktop and the middle of the stack on a phone —
 * dark, glowing, floating a few pixels above everything else. The two side
 * cards stay on paper: thin borders, warm hover, no competition.
 */
export default function Packages() {
  const featured = PACKAGES.find((pkg) => pkg.featured);
  const sides = PACKAGES.filter((pkg) => !pkg.featured);

  // Middle, always — independent of the order the data happens to be written in.
  const ordered =
    featured && sides.length === 2 ? [sides[0], featured, sides[1]] : PACKAGES;

  return (
    <section id="packages" aria-labelledby="packages-title">
      <Reveal>
        <div className="max-w-2xl">
          <span className="label">Packages</span>
          <h2 id="packages-title" className="section-title mt-3">
            From one caption to a full launch.
          </h2>
          <p className="section-lead mt-4">
            Choose a package below, or book a free call to customize. No hidden
            fees. 50% to start, 50% on launch.
          </p>
        </div>
      </Reveal>

      <div className="mt-9 grid items-stretch gap-4 md:mt-10 md:grid-cols-3">
        {ordered.map((pkg, index) => (
          <Reveal
            key={pkg.id}
            delay={index * 110}
            y={22}
            className="h-full min-w-0"
          >
            {pkg.featured ? (
              <Float className="h-full">
                <FeaturedCard pkg={pkg} />
              </Float>
            ) : (
              <SideCard pkg={pkg} />
            )}
          </Reveal>
        ))}
      </div>

      <TrustBadge />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Featured card — ₹10,000                                                    */
/* -------------------------------------------------------------------------- */

function FeaturedCard({ pkg }: { pkg: Package }) {
  return (
    // Two layers: a 1.5px gradient "wire" that carries the amber glow, and the
    // espresso surface inside it. The glow is a shadow, never a positioned
    // element with negative insets, so it can't widen the page on a phone.
    <div className="relative h-full rounded-[1.5rem] bg-[linear-gradient(135deg,#FBE7C6_0%,#E2A25C_26%,#C9803C_48%,#8B5A2B_70%,#F3CD96_100%)] p-[1.5px] shadow-[0_30px_70px_-42px_rgba(201,128,60,0.85),0_2px_10px_-6px_rgba(36,24,18,0.35)] transition-shadow duration-500 md:shadow-[0_46px_96px_-50px_rgba(201,128,60,0.95),0_2px_12px_-6px_rgba(36,24,18,0.35)]">
      <span className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[linear-gradient(180deg,#FBEFD6_0%,#EFC17F_45%,#E2A25C_100%)] px-3 py-[5px] text-[9px] font-bold uppercase tracking-[0.16em] text-espresso-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-1px_0_rgba(139,90,43,0.25),0_8px_20px_-8px_rgba(201,128,60,0.95)] ring-1 ring-espresso-900/[0.12]">
        {pkg.badge ?? "Most popular"}
      </span>

      <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-espresso-900 px-5 pb-5 pt-8 text-cream-50 sm:px-6 sm:pb-6 sm:pt-9">
        {/* clipped inside the card, so the warmth can't spill onto the page */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-caramel-500/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-caramel-300/70 to-transparent"
        />

        <div className="relative">
          <h3 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.01em] text-cream-50">
            {pkg.name}
          </h3>
          <p className="mt-1.5 text-[12px] leading-[1.65] text-cream-200/75">
            {pkg.summary}
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-x-2 gap-y-1 border-t border-cream-50/[0.12] pt-4">
            <span className="font-display text-[2.05rem] font-semibold leading-none tracking-[-0.025em] text-cream-50">
              {formatINR(pkg.price)}
            </span>
            <span className="pb-0.5 text-[10.5px] text-cream-200/60">
              {pkg.priceNote}
            </span>
          </div>

          <p className="mt-2.5 inline-flex items-center gap-1.5 text-[10.5px] text-cream-200/70">
            <Clock className="h-3 w-3" strokeWidth={1.6} aria-hidden />
            {pkg.delivery}
          </p>

          <ul className="mt-4 space-y-2.5">
            {pkg.includes.map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 text-caramel-300"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {/* Light-on-dark needs a touch more weight than the cream
                    cards to look equally solid. */}
                <span className="text-[12.5px] font-semibold leading-[1.55] text-cream-100/90">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-auto flex flex-col gap-1 pt-6">
          <TrackedLink
            href={whatsappUrl(
              `Hi Areeb, I'm interested in the ${pkg.name} package (${formatINR(
                pkg.price,
              )}) for my café.`,
            )}
            location="packages"
            label={`package:${pkg.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tap group inline-flex min-h-[48px] origin-center items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(180deg,#FFFBF5_0%,#F7EAD8_100%)] leading-tight px-3 py-2.5 text-[12px] font-semibold text-espresso-900 shadow-[0_10px_26px_-16px_rgba(255,251,245,0.55)] transition-[transform,box-shadow] duration-300 ease-out will-change-transform hover:scale-[1.05] hover:shadow-[0_20px_48px_-16px_rgba(226,162,92,0.95)] focus-visible:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-300/70 active:scale-[1.01]"
          >
            Start with {pkg.name}
            <ArrowRight
              aria-hidden
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </TrackedLink>

          <TrackedLink
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
              `Question about the ${pkg.name} package`,
            )}`}
            location="packages"
            label={`ask:${pkg.id}`}
            className="inline-flex min-h-[44px] items-center justify-center text-center text-[10.5px] text-cream-200/60 underline-offset-2 transition-colors hover:text-cream-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-300/50"
          >
            Ask a question first
          </TrackedLink>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Side cards — ₹4,999 · ₹18,500                                              */
/* -------------------------------------------------------------------------- */

function SideCard({ pkg }: { pkg: Package }) {
  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-espresso-900/[0.13] bg-cream-50/80 px-5 py-5 backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-caramel-400/80 hover:shadow-[0_26px_48px_-32px_rgba(36,24,18,0.45)] focus-within:-translate-y-1 focus-within:border-caramel-400/80 sm:px-6 sm:py-6">
      <h3 className="font-display text-[19px] font-semibold leading-tight tracking-[-0.01em] text-espresso-900">
        {pkg.name}
      </h3>
      <p className="mt-1.5 text-[12px] leading-[1.65] text-espresso-500">
        {pkg.summary}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-x-2 gap-y-1 border-t border-espresso-900/[0.09] pt-4">
        <span className="font-display text-[2rem] font-semibold leading-none tracking-[-0.025em] text-espresso-900">
          {formatINR(pkg.price)}
        </span>
        <span className="pb-0.5 text-[10.5px] text-espresso-500">
          {pkg.priceNote}
        </span>
      </div>

      <p className="mt-2.5 inline-flex items-center gap-1.5 text-[10.5px] text-espresso-500">
        <Clock className="h-3 w-3" strokeWidth={1.6} aria-hidden />
        {pkg.delivery}
      </p>

      <ul className="mt-4 space-y-2.5">
        {pkg.includes.map((item) => (
          <li key={item} className="flex gap-2.5">
            <Check
              className="mt-[3px] h-3.5 w-3.5 shrink-0 text-caramel-600"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="text-[12.5px] font-medium leading-[1.55] text-espresso-800">
              {item}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-1 pt-6">
        <TrackedLink
          href={whatsappUrl(
            `Hi Areeb, I'm interested in the ${pkg.name} package (${formatINR(
              pkg.price,
            )}) for my café.`,
          )}
          location="packages"
          label={`package:${pkg.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="tap group inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-espresso-900 leading-tight px-3 py-2.5 text-[12px] font-semibold text-cream-50 transition-[background-color,box-shadow] duration-300 hover:bg-espresso-800 hover:shadow-[0_16px_32px_-20px_rgba(36,24,18,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/50"
        >
          Start with {pkg.name}
          <ArrowRight
            aria-hidden
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </TrackedLink>

        <TrackedLink
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
            `Question about the ${pkg.name} package`,
          )}`}
          location="packages"
          label={`ask:${pkg.id}`}
          className="inline-flex min-h-[44px] items-center justify-center text-center text-[10.5px] text-espresso-500 underline-offset-2 transition-colors hover:text-espresso-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
        >
          Ask a question first
        </TrackedLink>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Guarantee                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The thing people actually want to know before sending money: what happens if
 * it isn't right. The claim is tied to the terms we already publish — two
 * rounds of revisions, half on booking, half on launch — so it stays honest.
 */
function TrustBadge() {
  return (
    <Reveal delay={140}>
      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-sage-500/25 bg-sage-100/60 px-3.5 py-1.5">
          <ShieldCheck
            className="h-3.5 w-3.5 text-sage-500"
            strokeWidth={1.7}
            aria-hidden
          />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-espresso-800">
            100% satisfaction guarantee
          </span>
        </span>

        <p className="max-w-[48ch] text-pretty text-[11.5px] leading-[1.7] text-espresso-500">
          Two rounds of revisions on every package. If it still isn&apos;t right
          on launch day, you don&apos;t pay the 50% balance.
        </p>

        <p className="text-[10.5px] leading-[1.65] text-espresso-500/80">
          50% to book your slot, 50% on launch · UPI or bank transfer · Invoice
          included
        </p>
      </div>
    </Reveal>
  );
}
