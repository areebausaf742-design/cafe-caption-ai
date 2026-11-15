import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock, MapPin, MessageCircle } from "lucide-react";

import Reveal from "@/components/motion/Reveal";
import { ABOUT, CONTACT_NAME, RESPONSE_SHORT, whatsappUrl } from "@/lib/business";

/**
 * "About the developer" — the last section before the footer.
 *
 * Buyers of a ₹10,000 package want to know who they're dealing with. A face,
 * a city and a real sentence do more than any badge. Set `ABOUT.photo` in
 * lib/business.ts once you have a square photo; the initials avatar renders
 * until then.
 */
export default function AboutDeveloper() {
  return (
    <section
      id="about"
      aria-labelledby="about-title"
      className="mx-auto mt-16 w-full max-w-5xl px-4 sm:mt-28 sm:px-6"
    >
      <Reveal>
        <span className="label">Who you&apos;re working with</span>
      </Reveal>

      <Reveal delay={80}>
      <div className="hairline mt-4 overflow-hidden rounded-2xl bg-cream-50/75">
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:gap-7 sm:p-8">
          {/* ---------------------------- portrait ---------------------------- */}
          <div className="flex items-start gap-4 sm:block">
            {ABOUT.photo ? (
              <Image
                src={ABOUT.photo}
                alt={`${ABOUT.name}, ${ABOUT.role.toLowerCase()}`}
                width={104}
                height={104}
                className="h-[88px] w-[88px] rounded-2xl object-cover ring-1 ring-espresso-900/10 sm:h-[104px] sm:w-[104px]"
              />
            ) : (
              <div className="relative grid h-[88px] w-[88px] place-items-center rounded-2xl bg-espresso-900 font-display text-[30px] font-semibold text-caramel-300 ring-1 ring-espresso-900/10 sm:h-[104px] sm:w-[104px] sm:text-[34px]">
                {ABOUT.name.charAt(0)}
                <span
                  aria-hidden
                  className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full border border-cream-100 bg-caramel-300 text-[10px] font-bold text-espresso-900"
                >
                  ✳
                </span>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-espresso-500 sm:mt-2.5">
              <span className="block font-semibold text-espresso-700">
                {ABOUT.name}
              </span>
              {ABOUT.role}
            </p>
          </div>

          {/* ------------------------------ copy ------------------------------ */}
          <div className="min-w-0">
            <h2
              id="about-title"
              className="font-display text-[20px] font-semibold leading-[1.2] tracking-[-0.015em] text-espresso-900 sm:text-[25px]"
            >
              Hi, I&apos;m {ABOUT.name}.
            </h2>

            <p className="mt-3 max-w-[62ch] text-pretty text-[13px] leading-[1.7] text-espresso-700 sm:text-[13.5px]">
              {ABOUT.bio}
            </p>

            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-espresso-900/10 pt-3.5">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-caramel-600" />
                <dt className="sr-only">{ABOUT.facts[0].label}</dt>
                <dd className="text-[11px] text-espresso-600">
                  {ABOUT.facts[0].value}
                </dd>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-caramel-600" />
                <dt className="sr-only">{ABOUT.facts[1].label}</dt>
                <dd className="text-[11px] text-espresso-600">
                  {RESPONSE_SHORT}
                </dd>
              </div>

              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-sage-500"
                />
                <dt className="sr-only">{ABOUT.facts[2].label}</dt>
                <dd className="text-[11px] text-espresso-600">
                  {ABOUT.facts[2].value}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={whatsappUrl(
                  `Hi ${CONTACT_NAME}, I saw your site and wanted to ask about a project.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-espresso-900/15 bg-white/70 px-3.5 py-2 text-[11.5px] font-semibold text-espresso-800 hover:border-espresso-900/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Say hello on WhatsApp
              </a>
              <Link
                href="/#work"
                className="inline-flex min-h-[44px] items-center gap-1 text-[11.5px] font-semibold text-espresso-600 underline decoration-caramel-500/40 underline-offset-4 transition hover:text-espresso-900 hover:decoration-caramel-500"
              >
                See recent work
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
      </Reveal>
    </section>
  );
}
