/**
 * ✏️  EDIT ME — your business details, offer and copy.
 *
 * Everything customer-facing that isn't inside a component lives here:
 * contact details, packages, process, FAQs and the footer note.
 * Change a value once and it updates across the whole site.
 */

/* -------------------------------------------------------------------------- */
/*  CONTACT                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Your email — shown in the contact section, footer, legal pages and the
 * Organization/Person structured data.
 *
 * A Gmail address on purpose, not as a placeholder: `hello@cafecaption.tech`
 * only receives once the domain is live *and* a mailbox or forwarding rule
 * exists for it, and until then every enquiry sent there disappears with no
 * bounce to warn anyone. This one always arrives.
 *
 * When the domain mailbox exists, change this single line (and the README's
 * note) — every link, mailto: and schema block reads from here.
 */
export const CONTACT_EMAIL = "areebausaf742@gmail.com";

/** Your WhatsApp number: digits only, with country code, no "+" or spaces. */
export const CONTACT_PHONE = "919044996869";

/** The same number, formatted for humans. */
export const CONTACT_PHONE_DISPLAY = "+91 90449 96869";

export const CONTACT_NAME = "Areeb";

/**
 * Shown under the contact cards. Kept deliberately honest: a 24-hour promise
 * that survives school hours beats a 2-hour promise that doesn't.
 */
export const RESPONSE_NOTE = "Replies within 24 hours · 10am–9pm IST";

/** Same promise, short form, for places that need a single line. */
export const RESPONSE_SHORT = "Replies within 24 hours";

/**
 * ✏️  REPLACE THIS — your Cal.com link.
 *
 * Every "book a call" button on the site reads this constant, so changing it
 * here updates the hero, the process section, the contact card and the footer.
 * While it still says "your-handle" it is a placeholder.
 */
export const BOOKING_URL = "https://cal.com/areeb/discovery-call";

/** Button text for booking CTAs. */
export const BOOKING_LABEL = "Book a free call";

/** Small print under booking CTAs. */
export const BOOKING_NOTE = "20 minutes · no slides, no pressure";

/**
 * Where the generated QR code points.
 *
 * Built from a path plus the site's own public origin instead of a hardcoded
 * domain, so the QR resolves on whichever host is actually serving the app.
 * (`NEXT_PUBLIC_SITE_URL` is inlined at build time on both server and client,
 * so the server HTML and the hydrated QR never disagree.)
 *
 * `app/menu/demo/page.tsx` is a real page: scanning the demo QR now lands on a
 * working menu instead of a 404. A real order puts the café's own live menu URL
 * here instead — that is part of the ₹10,000 Café Launch Kit — so keep it as one
 * constant.
 */
export const MENU_DEMO_PATH = "/menu/demo";

/**
 * The public origin, in the same order `lib/site.ts` resolves it:
 * explicit → Vercel's own deployment URL → localhost **only in development**.
 *
 * It used to end at `http://localhost:3000` unconditionally, which is how a
 * production demo QR could encode a URL no phone can reach. A missing origin in
 * production now yields an empty string, and the callers use the page's own
 * origin instead of printing a lie.
 */
const PUBLIC_SITE_ORIGIN = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  // Vercel exposes the deployment URL as NEXT_PUBLIC_VERCEL_URL, so this works
  // in the browser as well as on the server.
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : "";
})();

/** The demo menu link, on the configured origin or on `origin` when given. */
export function demoMenuUrl(origin?: string): string {
  const base = (origin ?? PUBLIC_SITE_ORIGIN).replace(/\/$/, "");
  return `${base}${MENU_DEMO_PATH}`;
}

/**
 * Build-time value, or an empty string when this deployment hasn't been told
 * its origin. Empty — not a bare `/menu/demo` — so callers can tell "I have an
 * absolute URL" from "I have a path" and fall back to the live origin.
 */
export const MENU_DEMO_URL = PUBLIC_SITE_ORIGIN ? demoMenuUrl() : "";

/** Build a WhatsApp deep link with a pre-filled message. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(message)}`;
}

export const DEFAULT_WHATSAPP_MESSAGE =
  `Hi ${CONTACT_NAME}, I'd like a website and/or Instagram caption system for my café.`;

export const QUOTE_WHATSAPP_MESSAGE =
  `Hi ${CONTACT_NAME}, I'd like a quote for my café.`;

/* -------------------------------------------------------------------------- */
/*  OFFER                                                                     */
/* -------------------------------------------------------------------------- */

export interface Package {
  id: string;
  name: string;
  /** Short positioning line. */
  summary: string;
  price: number;
  /** "one-time" | "per month" | etc. */
  priceNote: string;
  /** Optional struck-through anchor price. */
  compareAt?: number;
  featured?: boolean;
  badge?: string;
  delivery: string;
  includes: string[];
}

export const PACKAGES: Package[] = [
  {
    id: "caption-vault",
    name: "Caption Vault",
    summary: "A month of captions, written for your café.",
    price: 4999,
    priceNote: "one-time",
    delivery: "Delivered in 3 days",
    includes: [
      "30 captions with 5 hashtags each",
      "English or Hinglish — your call",
      "Instagram bio + highlight titles",
      "30-day content calendar",
      "2 rounds of revisions",
    ],
  },
  {
    id: "launch-kit",
    name: "Café Launch Kit",
    summary: "The complete digital setup, ready before the weekend rush.",
    price: 10000,
    priceNote: "one-time",
    featured: true,
    badge: "Most popular",
    delivery: "Delivered in 5–7 days",
    includes: [
      "5-page mobile-first website",
      "Digital menu (QR code included)",
      "Caption studio configured for your café",
      "WhatsApp ordering button",
      "Google Business Profile setup",
      "Review replies + 4 local posts a month",
      "30 days of post-launch support",
    ],
  },
  {
    id: "signature",
    name: "Signature Studio",
    summary: "A full quarter of content and a site that keeps selling.",
    price: 18500,
    priceNote: "one-time",
    delivery: "Launch in 7 days",
    includes: [
      "Everything in the Café Launch Kit",
      "60 captions per month, for 3 months",
      "8 short-form video scripts",
      "Monthly content calendar",
      "Priority WhatsApp support",
    ],
  },
];

export const PROCESS_STEPS = [
  {
    title: "A 20-minute call",
    body: "We talk through your menu, your regulars and what a good weekend looks like. No jargon, no forms to fill.",
  },
  {
    title: "Build and review",
    body: "You get the site and the first captions within 5–7 days. Two rounds of revisions are included, so nothing ships that you don't like.",
  },
  {
    title: "Launch and support",
    body: "We go live together — domain, menu and WhatsApp ordering connected — and you get 30 days of fixes on the house.",
  },
];

/** Neutral, verifiable trust points — no invented statistics. */
export const TRUST_POINTS = [
  "Photo or text input",
  "Instagram, Google & menus",
  "Built for independent cafés",
  "English & Hinglish",
  "Fixed pricing",
];

/* -------------------------------------------------------------------------- */
/*  ABOUT THE DEVELOPER                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The section above the footer.
 *
 * To use a real photo: drop a square image in `public/` (e.g. `public/areeb.jpg`)
 * and set `photo: "/areeb.jpg"`. Until then the initials avatar is shown.
 */
export const ABOUT = {
  name: "Areeb",
  role: "Web developer & designer",
  location: "Lucknow, India",
  photo: null as string | null,
  bio: "Hi, I'm Areeb. I'm a 15-year-old web developer based in Lucknow, specializing in AI automation and modern web design. I build high-converting digital tools for local businesses. When I'm not coding, I'm studying or building my next project.",
  facts: [
    { label: "Based in", value: "Lucknow, India" },
    { label: "Replies within", value: "24 hours" },
    { label: "Working with", value: "Cafés across India" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/*  RECENT WORK                                                               */
/* -------------------------------------------------------------------------- */

export interface WorkItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  status: "live" | "soon";
  /** Optional link for live work. */
  href?: string;
}

/**
 * Honest social proof: one thing that actually exists, plus two in progress.
 * Never relabel a "soon" card as a finished client project.
 */
export const RECENT_WORK: WorkItem[] = [
  {
    id: "cafecaption",
    title: "CafeCaption",
    summary:
      "The site you're on. Caption studio, WhatsApp quote flow and three fixed-price packages, built and shipped in a week.",
    tags: ["Next.js", "Brand + copy", "This site"],
    status: "live",
    href: "/#studio",
  },
  {
    id: "bakery",
    title: "Boutique Bakery Website",
    summary:
      "A menu-first site with daily specials and Instagram ordering for a neighbourhood bakery.",
    tags: ["Website", "Menu", "Photography direction"],
    status: "soon",
  },
  {
    id: "gym",
    title: "Local Gym Booking System",
    summary:
      "Trial-session bookings, WhatsApp reminders and a simple owner dashboard for a neighbourhood gym.",
    tags: ["Booking", "Automation", "Dashboard"],
    status: "soon",
  },
];

/**
 * Real testimonials only. Add objects like:
 *   { quote: "…", name: "Priya", cafe: "Brew & Bloom, Lucknow" }
 * The section stays hidden while this array is empty.
 */
export const TESTIMONIALS: { quote: string; name: string; cafe: string }[] = [];

export const FAQS = [
  {
    q: "Do I need any technical knowledge?",
    a: "None. You send your menu, photos and logo; I handle the domain, hosting, menu, WhatsApp ordering and captions. You only need to approve what you see.",
  },
  {
    q: "Can the captions be in Hinglish?",
    a: "Yes. Every caption is written in English or Hinglish, and your café name, city and tone are built in, so the copy sounds like your counter, not a template.",
  },
  {
    q: "Can it digitise my printed menu?",
    a: "Yes. Take a photo of your menu in the studio and you get the categories, items and prices back as a clean digital menu, plus a QR code you can download and print for your tables. The Café Launch Kit includes it set up with your own menu link.",
  },
  {
    q: "What do you need from me to start?",
    a: "A menu (a photo is fine), 10–15 photos of your space and food, your logo if you have one, and 20 minutes on a call. If you don't have photos yet, we can work with what you have on your phone.",
  },
  {
    q: "How do payments work?",
    a: "50% to book your slot and 50% on launch. UPI or bank transfer, with an invoice for both. Nothing is charged until we've agreed the scope on the call.",
  },
  {
    q: "Will the captions sound generic?",
    a: "Captions are drafted from your inputs — café name, city, tone and the photo you describe — and you approve every one before posting. Anything that doesn't sound like you gets rewritten.",
  },
  {
    q: "Do I own the website and content?",
    a: "Yes. The domain is registered in your name and everything we write or build for you is yours to keep, with no lock-in.",
  },
];

export const FOOTER_NOTE =
  "Captions are drafted from the details you provide — read them before posting.";

/** Formats 10000 as "₹10,000". */
export function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}
