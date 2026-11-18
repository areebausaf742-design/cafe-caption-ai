import type { Metadata } from "next";

import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/lib/business";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What CafeCaption collects, how it is used, and how to have it removed.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "18 November 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <span className="label">Legal</span>
      <h1 className="mt-3 font-display text-[1.9rem] font-semibold leading-tight tracking-tight text-espresso-900 sm:text-4xl">
        Privacy policy
      </h1>
      <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-espresso-400">
        Last updated {LAST_UPDATED}
      </p>

      <div className="mt-7 space-y-6 text-[13px] leading-relaxed text-espresso-700">
        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            What this covers
          </h2>
          <p className="mt-1.5">
            CafeCaption is a small studio run by Areeb that builds websites,
            digital menus and Instagram caption systems for cafés. This page
            explains what happens to information you share while using this
            site.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            What we collect
          </h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li>
              <strong>Enquiry details</strong> — the name, café name, city, what
              you need and any notes you type into the quote form. Submitting
              the form does two things: it keeps a copy of those answers in our
              own database (Supabase), and it opens WhatsApp with them filled in.
              The copy exists so an enquiry is not lost when the tab is blocked
              — it is used only to reply to you.
            </li>
            <li>
              <strong>Photo descriptions</strong> — the text you type into the
              caption studio. It is sent to our caption provider to generate
              captions and is not saved by us.
            </li>
            <li>
              <strong>Published menus</strong> — if you publish a menu, the café
              name, the line under it, the items and prices, and the WhatsApp
              number you choose to show are stored in our database and shown on a
              public page. Editing is protected by a key that is created once and
              stored only as a hash, so we can&rsquo;t recover it for you. To take
              a menu down, use the contact details below and it will be removed.
            </li>
            <li>
              <strong>Menu languages</strong> — when a menu is published, the
              item and section names are sent once to Google&rsquo;s Gemini API
              so it can be read in Hindi and Hinglish. <strong>Prices are never
              sent</strong> — only names — so a translation cannot change what
              anything costs. The translated names are stored with the menu.
            </li>
            <li>
              <strong>Dish photos</strong> — a food photo you choose in the
              studio is shrunk in your browser and sent once to Google&rsquo;s
              Gemini API to suggest a name, a description and the ingredients
              visible in the picture. The photo is <strong>not stored</strong>,
              not attached to the menu and never shown publicly; only the words
              you approve are kept. Ingredient lists describe what is visible in
              the photo and are never a statement about allergens — ask the café.
            </li>
            <li>
              <strong>3D models</strong> — when you press <em>Generate 3D
              model</em>, the same food photo is sent once to an open-source
              image-to-3D model running on a shared, free GPU (a Hugging Face
              Space) and comes back as a 3D file. We store that model file on our
              own storage and serve it to customers from there; no photo is kept.
              The model is built from a single picture, so the back of a dish is
              the model&rsquo;s best guess, and a model is only saved when a real
              one came back — you will see an error, not a placeholder, if it
              does not.
            </li>
            <li>
              <strong>Menu orders</strong> — when someone orders from a menu,
              the cart is put together in their own browser and handed to
              WhatsApp. It never passes through this site&rsquo;s servers, so we
              never see what was ordered or the note that went with it. We record
              only that an order was sent, and how many items were in it.
            </li>
            <li>
              <strong>Technical basics</strong> — anonymised, hashed request
              counters used to keep the caption studio from being abused. We do
              not keep raw IP addresses.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            How it is used
          </h2>
          <p className="mt-1.5">
            Enquiry details are used to reply to you, quote your project and
            deliver the work. We do not sell data, run advertising trackers or
            add you to a marketing list without asking.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Who processes it
          </h2>
          <p className="mt-1.5">
            The site is hosted on Vercel, enquiries are stored in Supabase, and
            captions are generated using Google&apos;s Gemini API. Abuse
            protection keeps hashed counters in Upstash Redis, and published
            menus live in Supabase too. Product analytics
            run on PostHog. These providers process data on our behalf. No other
            third party receives your details.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Analytics
          </h2>
          <p className="mt-1.5">
            We use PostHog to count page views and a handful of product events:
            a caption, menu or Google reply generated, a photo uploaded, a QR
            downloaded, something copied, a quote form submitted, a menu
            published, a menu switched into another language, and a button
            clicked (with the button&apos;s location and
            label). These
            events never include names, phone numbers, email addresses or the
            text you type. PostHog runs in memory-only mode here, so no cookies
            or local storage are used, and nothing is kept after you close the
            tab. Visitors with &ldquo;Do Not Track&rdquo; enabled are not tracked
            at all.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            How long we keep it
          </h2>
          <p className="mt-1.5">
            Enquiries are kept for up to 24 months so we can pick up a
            conversation later. Ask us to delete yours at any time and it is
            removed within 7 days.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Your choices
          </h2>
          <p className="mt-1.5">
            You can request a copy of your details, ask for corrections, or ask
            us to delete everything by emailing{" "}
            <a
              className="underline decoration-caramel-400/60 decoration-2 underline-offset-2 hover:decoration-caramel-500"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>{" "}
            or messaging {CONTACT_PHONE_DISPLAY} on WhatsApp.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-semibold text-espresso-900">
            Cookies
          </h2>
          <p className="mt-1.5">
            This site does not set advertising or analytics cookies. Fonts are
            loaded from Google Fonts, which may log the request as part of
            normal delivery.
          </p>
        </section>
      </div>
    </main>
  );
}
