import { ArrowUpRight, CalendarDays, Mail, MessageCircle } from "lucide-react";

import AboutDeveloper from "@/components/AboutDeveloper";
import BookingLink from "@/components/BookingLink";
import CaptionStudio from "@/components/CaptionStudio";
import Faq from "@/components/Faq";
import LeadForm from "@/components/LeadForm";
import Packages from "@/components/Packages";
import Process from "@/components/Process";
import RecentWork from "@/components/RecentWork";
import TrackedLink from "@/components/TrackedLink";
import Reveal from "@/components/motion/Reveal";
import {
  BOOKING_NOTE,
  BOOKING_URL,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_DISPLAY,
  DEFAULT_WHATSAPP_MESSAGE,
  FAQS,
  PACKAGES,
  RESPONSE_NOTE,
  TESTIMONIALS,
  TRUST_POINTS,
  whatsappUrl,
} from "@/lib/business";
import { siteUrl } from "@/lib/site";

/* Structured data: the service + packages + FAQ, so Google can show prices. */
const serviceLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "CafeCaption",
  url: siteUrl,
  description:
    "Websites, digital menu and QR generation, Instagram captions and Google local SEO for independent cafés, in English and Hinglish.",
  email: CONTACT_EMAIL,
  telephone: `+${CONTACT_PHONE}`,
  areaServed: "IN",
  priceRange: "₹₹",
  makesOffer: PACKAGES.map((pkg) => ({
    "@type": "Offer",
    name: pkg.name,
    description: pkg.summary,
    price: String(pkg.price),
    priceCurrency: "INR",
    url: `${siteUrl}/#packages`,
  })),
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

/* One rhythm for the whole page: quiet on phones, generous on desktop. */
const SECTION = "mx-auto mt-16 w-full max-w-5xl px-4 sm:mt-28 sm:px-6";

export default function HomePage() {
  return (
    <main className="pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      {/* -------------------------------- hero -------------------------------- */}
      <section className="relative isolate mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6 sm:pt-16">
        {/* Warm light: three soft pools of caramel & amber behind the headline.
            Purely decorative, so it stays out of the accessibility tree. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 flex justify-center select-none"
        >
          <div className="glow-warm h-[22rem] w-[min(46rem,96vw)] rounded-[50%] opacity-70" />
          <div className="absolute left-[6%] top-24 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(226,162,92,0.35),transparent)] blur-2xl sm:h-52 sm:w-52" />
          <div className="absolute right-[4%] top-16 h-36 w-36 rounded-full bg-[radial-gradient(closest-side,rgba(183,199,165,0.42),transparent)] blur-2xl sm:h-48 sm:w-48" />
        </div>

        <div className="text-center">
          <span className="label animate-fade-up">
            Caption studio & Google local SEO for cafés
          </span>

          <h1
            className="animate-fade-up mx-auto mt-5 max-w-[19ch] text-balance font-display text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.025em] text-espresso-900 text-shadow-soft sm:max-w-2xl sm:text-[3.4rem]"
            style={{ animationDelay: "60ms" }}
          >
            Captions that make people{" "}
            <span className="italic text-caramel-600">walk in.</span>
          </h1>

          <p
            className="animate-fade-up mx-auto mt-5 max-w-[46ch] text-pretty text-[14px] leading-[1.7] text-espresso-600 sm:text-[15.5px]"
            style={{ animationDelay: "120ms" }}
          >
            Three tools, one studio. Upload a photo — or just describe it — for
            three considered captions. Paste a Google review for three replies,
            write a Business Profile post that ranks locally, or turn a photo of
            your printed menu into a digital one with its own QR code. English or
            Hinglish, ready to post.
          </p>
        </div>

        <div
          className="animate-fade-up mt-7 flex flex-wrap items-center justify-center gap-2.5"
          style={{ animationDelay: "180ms" }}
        >
          <BookingLink location="hero" variant="primary" />
          <TrackedLink
            href="#contact"
            location="hero"
            label="quote_form"
            className="tap inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/50 px-4 py-2.5 text-[12.5px] font-semibold text-espresso-800 hover:border-espresso-900/30 hover:bg-white/80 hover:shadow-[0_8px_24px_-16px_rgba(36,24,18,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
          >
            Get a quote in 24h
            <ArrowUpRight className="h-3.5 w-3.5" />
          </TrackedLink>
        </div>

        <div
          className="animate-fade-up mt-8 sm:mt-10"
          style={{ animationDelay: "240ms" }}
        >
          <CaptionStudio />
        </div>

        <ul
          className="animate-fade-up mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10.5px] tracking-[0.01em] text-espresso-500"
          style={{ animationDelay: "300ms" }}
        >
          {TRUST_POINTS.map((point, index) => (
            <li key={point} className="flex items-center gap-3">
              {index > 0 && (
                <span aria-hidden className="h-1 w-1 rounded-full bg-espresso-300" />
              )}
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------- recent work ---------------------------- */}
      <div className={`${SECTION}`}>
        <RecentWork />
      </div>

      {/* ------------------------------ packages ------------------------------ */}
      <div className={`${SECTION}`}>
        <Packages />
      </div>

      {/* ------------------------------- process ------------------------------ */}
      <div className={`${SECTION}`}>
        <Process />
      </div>

      {/* ----------------------------- testimonials --------------------------- */}
      {TESTIMONIALS.length > 0 && (
        <div className={`${SECTION}`}>
          <span className="label">Words from the counter</span>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {TESTIMONIALS.map((item, index) => (
              <Reveal key={item.name} delay={index * 80} className="h-full">
                <figure className="card h-full p-5 sm:p-6">
                  <blockquote className="font-display text-[15px] leading-[1.7] text-espresso-800">
                    “{item.quote}”
                  </blockquote>
                  <figcaption className="mt-3 text-[11px] text-espresso-500">
                    <span className="font-semibold text-espresso-700">
                      {item.name}
                    </span>{" "}
                    · {item.cafe}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------- faq -------------------------------- */}
      <div className={`${SECTION}`}>
        <Faq />
      </div>

      {/* ------------------------------- contact ------------------------------ */}
      <section id="contact" aria-labelledby="contact-title" className={SECTION}>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <Reveal>
            <span className="label">Contact</span>
            <h2 id="contact-title" className="section-title mt-3">
              Tell me about your café.
            </h2>
            <p className="section-lead mt-4">
              A 20-minute call is usually enough to know if this is a fit. Send
              a message and you&apos;ll get a straight answer and a fixed price
              — no pitch deck.
            </p>

            <div className="mt-6 space-y-2.5">
              <TrackedLink
                href={BOOKING_URL}
                location="contact"
                label="booking"
                target="_blank"
                rel="noopener noreferrer"
                className="tap group flex min-h-[60px] items-center gap-3 rounded-xl border border-espresso-900/[0.08] bg-white/70 px-3.5 py-3 hover:border-espresso-900/20 hover:bg-white hover:shadow-[0_12px_30px_-22px_rgba(36,24,18,0.5)]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-caramel-300/60">
                  <CalendarDays className="h-4 w-4 text-espresso-800" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-espresso-900">
                    Book a free call
                  </span>
                  <span className="block text-[11px] leading-[1.5] text-espresso-600">
                    {BOOKING_NOTE}
                  </span>
                </span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-espresso-400 transition group-hover:text-espresso-700" />
              </TrackedLink>

              <TrackedLink
                href={whatsappUrl(DEFAULT_WHATSAPP_MESSAGE)}
                location="contact"
                label="whatsapp"
                target="_blank"
                rel="noopener noreferrer"
                className="tap group flex min-h-[60px] items-center gap-3 rounded-xl border border-espresso-900/[0.08] bg-cream-50/70 px-3.5 py-3 hover:border-espresso-900/20 hover:bg-white/80 hover:shadow-[0_12px_30px_-22px_rgba(36,24,18,0.5)]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#25D366]/15">
                  <MessageCircle className="h-4 w-4 text-[#128C4B]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-espresso-900">
                    WhatsApp
                  </span>
                  <span className="block text-[11px] leading-[1.5] text-espresso-600">
                    {CONTACT_PHONE_DISPLAY}
                  </span>
                </span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-espresso-400 transition group-hover:text-espresso-700" />
              </TrackedLink>

              <TrackedLink
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                  "Café website enquiry",
                )}`}
                location="contact"
                label="email"
                className="tap group flex min-h-[60px] items-center gap-3 rounded-xl border border-espresso-900/[0.08] bg-cream-50/70 px-3.5 py-3 hover:border-espresso-900/20 hover:bg-white/80 hover:shadow-[0_12px_30px_-22px_rgba(36,24,18,0.5)]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-espresso-900/5">
                  <Mail className="h-4 w-4 text-espresso-700" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-espresso-900">
                    Email
                  </span>
                  <span className="block break-all text-[11px] leading-[1.5] text-espresso-600">
                    {CONTACT_EMAIL}
                  </span>
                </span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-espresso-400 transition group-hover:text-espresso-700" />
              </TrackedLink>
            </div>

            <p className="mt-4 text-[10.5px] text-espresso-500">{RESPONSE_NOTE}</p>
          </Reveal>

          <Reveal delay={100}>
            <LeadForm />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------- about -------------------------------- */}
      <AboutDeveloper />
    </main>
  );
}
