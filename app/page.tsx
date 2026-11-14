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
    "Websites, digital menus and Instagram caption systems for independent cafés, in English and Hinglish.",
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
      <section className="mx-auto w-full max-w-3xl px-4 pt-9 sm:px-6 sm:pt-14">
        <div className="text-center">
          <span className="label">Instagram studio for independent cafés</span>
          <h1 className="mx-auto mt-4 max-w-2xl text-balance font-display text-[2.05rem] font-semibold leading-[1.06] tracking-[-0.015em] text-espresso-900 sm:text-[3.15rem]">
            Captions that make people{" "}
            <span className="italic text-caramel-600">walk in.</span>
          </h1>
          <p className="mx-auto mt-3.5 max-w-lg text-pretty text-[13px] leading-relaxed text-espresso-600 sm:text-[15px]">
            Describe a photo from your café. Get three considered captions and
            five researched hashtags — in English or Hinglish, ready to post.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <BookingLink location="hero" variant="primary" />
          <TrackedLink
            href="#contact"
            location="hero"
            label="quote_form"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/50 px-4 py-2.5 text-[12.5px] font-semibold text-espresso-800 transition hover:border-espresso-900/30 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
          >
            Get a quote in 24h
            <ArrowUpRight className="h-3.5 w-3.5" />
          </TrackedLink>
        </div>

        <div className="mt-6 sm:mt-8">
          <CaptionStudio />
        </div>

        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10.5px] text-espresso-500">
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
      <div className="mx-auto mt-14 w-full max-w-5xl px-4 sm:mt-20 sm:px-6">
        <RecentWork />
      </div>

      {/* ------------------------------ packages ------------------------------ */}
      <div className="mx-auto mt-14 w-full max-w-5xl px-4 sm:mt-20 sm:px-6">
        <Packages />
      </div>

      {/* ------------------------------- process ------------------------------ */}
      <div className="mx-auto mt-14 w-full max-w-5xl px-4 sm:mt-20 sm:px-6">
        <Process />
      </div>

      {/* ----------------------------- testimonials --------------------------- */}
      {TESTIMONIALS.length > 0 && (
        <div className="mx-auto mt-14 w-full max-w-5xl px-4 sm:mt-20 sm:px-6">
          <span className="label">Words from the counter</span>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {TESTIMONIALS.map((item) => (
              <figure key={item.name} className="card p-4 sm:p-5">
                <blockquote className="font-display text-[14.5px] leading-relaxed text-espresso-800">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-3 text-[11px] text-espresso-500">
                  <span className="font-semibold text-espresso-700">
                    {item.name}
                  </span>{" "}
                  · {item.cafe}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------- faq -------------------------------- */}
      <div className="mx-auto mt-14 w-full max-w-5xl px-4 sm:mt-20 sm:px-6">
        <Faq />
      </div>

      {/* ------------------------------- contact ------------------------------ */}
      <section
        id="contact"
        aria-labelledby="contact-title"
        className="mx-auto mt-14 w-full max-w-5xl px-4 sm:mt-20 sm:px-6"
      >
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div>
            <span className="label">Contact</span>
            <h2 id="contact-title" className="section-title mt-2.5">
              Tell me about your café.
            </h2>
            <p className="section-lead mt-3">
              A 20-minute call is usually enough to know if this is a fit. Send
              a message and you&apos;ll get a straight answer and a fixed price
              — no pitch deck.
            </p>

            <div className="mt-5 space-y-2">
              <TrackedLink
                href={BOOKING_URL}
                location="contact"
                label="booking"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-espresso-900/15 bg-white/70 px-3.5 py-3 transition hover:border-espresso-900/30 hover:bg-white"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-caramel-300/60">
                  <CalendarDays className="h-4 w-4 text-espresso-800" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-espresso-900">
                    Book a free call
                  </span>
                  <span className="block text-[11px] text-espresso-600">
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
                className="group flex items-center gap-3 rounded-xl border border-espresso-900/10 bg-cream-50/70 px-3.5 py-3 transition hover:border-espresso-900/25 hover:bg-white/70"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#25D366]/15">
                  <MessageCircle className="h-4 w-4 text-[#128C4B]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-espresso-900">
                    WhatsApp
                  </span>
                  <span className="block text-[11px] text-espresso-600">
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
                className="group flex items-center gap-3 rounded-xl border border-espresso-900/10 bg-cream-50/70 px-3.5 py-3 transition hover:border-espresso-900/25 hover:bg-white/70"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-espresso-900/5">
                  <Mail className="h-4 w-4 text-espresso-700" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-espresso-900">
                    Email
                  </span>
                  <span className="block break-all text-[11px] text-espresso-600">
                    {CONTACT_EMAIL}
                  </span>
                </span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-espresso-400 transition group-hover:text-espresso-700" />
              </TrackedLink>
            </div>

            <p className="mt-3 text-[10.5px] text-espresso-500">{RESPONSE_NOTE}</p>
          </div>

          <LeadForm />
        </div>
      </section>

      {/* ------------------------------- about -------------------------------- */}
      <AboutDeveloper />
    </main>
  );
}
