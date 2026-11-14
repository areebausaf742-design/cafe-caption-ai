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

/** Your email — shown in the contact section, footer and quote form fallback. */
export const CONTACT_EMAIL = "areebausaf742@gmail.com";

/** Your WhatsApp number: digits only, with country code, no "+" or spaces. */
export const CONTACT_PHONE = "919044996869";

/** The same number, formatted for humans. */
export const CONTACT_PHONE_DISPLAY = "+91 90449 96869";

export const CONTACT_NAME = "Areeb";

/** Shown under the contact cards. Edit to match your real availability. */
export const RESPONSE_NOTE = "Replies within a few hours · 10am–9pm IST";

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
  "Built for independent cafés",
  "English & Hinglish",
  "Fixed pricing",
  "No apps to install",
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
