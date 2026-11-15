import { Check, Clock } from "lucide-react";

import Reveal from "@/components/motion/Reveal";
import TrackedLink from "@/components/TrackedLink";

import {
  PACKAGES,
  formatINR,
  whatsappUrl,
  CONTACT_EMAIL,
  type Package,
} from "@/lib/business";

export default function Packages() {
  return (
    <section id="packages" aria-labelledby="packages-title">
      <Reveal>
        <div className="max-w-2xl">
          <span className="label">Packages</span>
          <h2 id="packages-title" className="section-title mt-3">
            From one caption to a full launch.
          </h2>
          <p className="section-lead mt-4">
            Try the studio above for free. When you want the whole thing — the
            site, the menu, WhatsApp ordering and a month of captions — pick a
            starting point. Prices are fixed before we begin.
          </p>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
        {PACKAGES.map((pkg, index) => (
          <Reveal key={pkg.id} delay={index * 90} className="h-full">
            <PackageCard pkg={pkg} />
          </Reveal>
        ))}
      </div>

      <p className="mt-5 text-[11px] leading-[1.65] text-espresso-500">
        50% to book your slot, 50% on launch · UPI or bank transfer · Invoice
        included · Revisions as listed
      </p>
    </section>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  const dark = Boolean(pkg.featured);

  const surface = dark
    ? "border border-espresso-900 bg-espresso-900 text-cream-50 shadow-lift ring-1 ring-inset ring-caramel-300/20"
    : "hairline bg-cream-50/75 text-espresso-900";
  const muted = dark ? "text-cream-200/70" : "text-espresso-500";
  const listText = dark ? "text-cream-100/90" : "text-espresso-700";
  const divider = dark ? "border-cream-50/15" : "border-espresso-900/[0.08]";

  return (
    <div
      className={`flex h-full flex-col rounded-2xl p-5 backdrop-blur-sm transition-shadow duration-300 sm:p-6 ${
        dark ? surface : `${surface} hover:shadow-[0_24px_60px_-40px_rgba(36,24,18,0.6)]`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`font-display text-[18px] font-semibold leading-tight tracking-[-0.01em] ${
            dark ? "text-cream-50" : "text-espresso-900"
          }`}
        >
          {pkg.name}
        </h3>
        {pkg.badge && (
          <span className="shrink-0 rounded-full bg-caramel-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-espresso-900">
            {pkg.badge}
          </span>
        )}
      </div>

      <p className={`mt-2 text-[12px] leading-[1.65] ${muted}`}>{pkg.summary}</p>

      <div className={`mt-5 flex items-end gap-2 border-t pt-4 ${divider}`}>
        <span
          className={`font-display text-[1.85rem] font-semibold leading-none tracking-[-0.02em] ${
            dark ? "text-cream-50" : "text-espresso-900"
          }`}
        >
          {formatINR(pkg.price)}
        </span>
        <span className={`pb-0.5 text-[10.5px] ${muted}`}>{pkg.priceNote}</span>
      </div>

      <p className={`mt-2.5 inline-flex items-center gap-1.5 text-[10.5px] ${muted}`}>
        <Clock className="h-3 w-3" />
        {pkg.delivery}
      </p>

      <ul className="mt-4 space-y-2">
        {pkg.includes.map((item) => (
          <li key={item} className="flex gap-2">
            <Check
              className={`mt-0.5 h-3 w-3 shrink-0 ${
                dark ? "text-caramel-300" : "text-caramel-500"
              }`}
            />
            <span className={`text-[12px] leading-[1.6] ${listText}`}>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-5">
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
          className={`tap inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/50 ${
            dark
              ? "bg-cream-50 text-espresso-900 hover:bg-white hover:shadow-[0_12px_28px_-16px_rgba(255,251,245,0.6)]"
              : "bg-espresso-900 text-cream-50 hover:bg-espresso-800 hover:shadow-[0_14px_30px_-18px_rgba(36,24,18,0.8)]"
          }`}
        >
          Start with {pkg.name}
        </TrackedLink>
        <TrackedLink
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
            `Question about the ${pkg.name} package`,
          )}`}
          location="packages"
          label={`ask:${pkg.id}`}
          className={`inline-flex min-h-[44px] items-center justify-center text-center text-[10.5px] underline-offset-2 hover:underline ${
            dark ? "text-cream-200/60" : "text-espresso-500"
          }`}
        >
          Ask a question first
        </TrackedLink>
      </div>
    </div>
  );
}
