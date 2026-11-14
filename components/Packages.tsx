import { Check, Clock } from "lucide-react";

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
      <div className="max-w-2xl">
        <span className="label">Packages</span>
        <h2 id="packages-title" className="section-title mt-2.5">
          From one caption to a full launch.
        </h2>
        <p className="section-lead mt-3">
          Try the studio above for free. When you want the whole thing — the
          site, the menu, WhatsApp ordering and a month of captions — pick a
          starting point. Prices are fixed before we begin.
        </p>
      </div>

      <div className="mt-7 grid gap-3 md:grid-cols-3 md:gap-4">
        {PACKAGES.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-espresso-500">
        50% to book your slot, 50% on launch · UPI or bank transfer · Invoice
        included · Revisions as listed
      </p>
    </section>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  const dark = Boolean(pkg.featured);

  const surface = dark
    ? "border-espresso-900 bg-espresso-900 text-cream-50 shadow-lift"
    : "border-espresso-900/10 bg-cream-50/70 text-espresso-900";
  const muted = dark ? "text-cream-200/70" : "text-espresso-500";
  const listText = dark ? "text-cream-100/90" : "text-espresso-700";
  const divider = dark ? "border-cream-50/15" : "border-espresso-900/10";

  return (
    <div
      className={`flex flex-col rounded-2xl border p-4 backdrop-blur-sm sm:p-5 ${surface}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`font-display text-[17px] font-semibold leading-tight tracking-tight ${
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

      <p className={`mt-1.5 text-[11.5px] leading-relaxed ${muted}`}>
        {pkg.summary}
      </p>

      <div className={`mt-4 flex items-end gap-2 border-t pt-3.5 ${divider}`}>
        <span
          className={`font-display text-[1.7rem] font-semibold leading-none tracking-tight ${
            dark ? "text-cream-50" : "text-espresso-900"
          }`}
        >
          {formatINR(pkg.price)}
        </span>
        <span className={`pb-0.5 text-[10.5px] ${muted}`}>{pkg.priceNote}</span>
      </div>

      <p
        className={`mt-2 inline-flex items-center gap-1.5 text-[10.5px] ${muted}`}
      >
        <Clock className="h-3 w-3" />
        {pkg.delivery}
      </p>

      <ul className="mt-3.5 space-y-1.5">
        {pkg.includes.map((item) => (
          <li key={item} className="flex gap-2">
            <Check
              className={`mt-0.5 h-3 w-3 shrink-0 ${
                dark ? "text-caramel-300" : "text-caramel-500"
              }`}
            />
            <span className={`text-[11.5px] leading-relaxed ${listText}`}>
              {item}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-1.5 pt-1">
        <a
          href={whatsappUrl(
            `Hi Areeb, I'm interested in the ${pkg.name} package (${formatINR(
              pkg.price,
            )}) for my café.`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/50 ${
            dark
              ? "bg-cream-50 text-espresso-900 hover:bg-white"
              : "bg-espresso-900 text-cream-50 hover:bg-espresso-800"
          }`}
        >
          Start with {pkg.name}
        </a>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
            `Question about the ${pkg.name} package`,
          )}`}
          className={`text-center text-[10.5px] underline-offset-2 hover:underline ${
            dark ? "text-cream-200/60" : "text-espresso-500"
          }`}
        >
          Ask a question first
        </a>
      </div>
    </div>
  );
}
