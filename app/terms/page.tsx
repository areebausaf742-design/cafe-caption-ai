import type { Metadata } from "next";

import { CONTACT_EMAIL } from "@/lib/business";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "Plain-language terms for CafeCaption's caption studio and studio services.",
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "14 November 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <span className="label">Legal</span>
      <h1 className="mt-3 font-display text-[1.9rem] font-semibold leading-tight tracking-tight text-espresso-900 sm:text-4xl">
        Terms of service
      </h1>
      <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-espresso-400">
        Last updated {LAST_UPDATED}
      </p>

      <div className="mt-7 space-y-6 text-[13px] leading-relaxed text-espresso-700">
        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            The caption studio
          </h2>
          <p className="mt-1.5">
            The caption studio on this site is free to use. Captions are
            generated drafts based on the details you provide — read and edit
            them before posting. They are suggestions, not guaranteed marketing
            results, and you are responsible for what you publish.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Fair use
          </h2>
          <p className="mt-1.5">
            Requests are rate limited to keep the tool available for everyone.
            Please don&apos;t attempt to bypass limits, scrape the service, or
            use it to generate unlawful or misleading content.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Studio services and pricing
          </h2>
          <p className="mt-1.5">
            Package prices shown on this site are starting points for the scope
            listed. A quote is confirmed in writing before work begins and is
            valid for 14 days. Unless agreed otherwise, 50% is payable to book
            your slot and 50% on launch.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Delivery and revisions
          </h2>
          <p className="mt-1.5">
            Delivery times are counted from the day we receive your content
            (menu, photos, logo and text). Each package includes the number of
            revision rounds listed. Extra rounds or new scope are quoted
            separately before we proceed.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Ownership
          </h2>
          <p className="mt-1.5">
            Once your final payment clears, the website, menu and written
            content produced for you belong to you. The domain is registered in
            your name. We may show the work in our portfolio unless you ask us
            not to.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Liability
          </h2>
          <p className="mt-1.5">
            We deliver work with reasonable skill and care, but we can&apos;t
            guarantee specific sales, footfall or social media growth. Our
            liability is limited to the fees paid for the service in question.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Governing law
          </h2>
          <p className="mt-1.5">
            These terms are governed by the laws of India, with jurisdiction in
            Lucknow, Uttar Pradesh. Questions? Email{" "}
            <a
              className="underline decoration-caramel-400/60 decoration-2 underline-offset-2 hover:decoration-caramel-500"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
