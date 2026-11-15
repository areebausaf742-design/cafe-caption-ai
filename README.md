# CafeCaption

**Instagram captions for independent cafés — and the studio behind them.**

A free caption tool (describe a photo → three captions + five hashtags, English or
Hinglish) that doubles as the sales page for websites, digital menus and caption
systems, with packages, FAQs, lead capture and WhatsApp/email contact.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**,
**Lucide icons**, **Google Gemini** and an optional **Supabase** lead store. The
Gemini key is read only inside a `server-only` Route Handler.

---

## What's on the site

| Section | Purpose |
| --- | --- |
| Sticky header | Wordmark, anchor nav, WhatsApp CTA |
| Hero + caption studio | The free tool: photo description, café name, city, language, tone, copy buttons, regenerate, plus one-tap examples and a sample result shown before the first click |
| Packages | Three fixed-price offers (₹4,999 / **₹10,000 “Most popular”** / ₹18,500), each with a WhatsApp CTA |
| How it works | Three-step process with a “book a free call” link |
| FAQ | Native `<details>` accordion, also emitted as FAQ structured data |
| Contact | Book a call, WhatsApp and email cards, plus the **“Get a quote in 24h”** form that opens a prefilled WhatsApp message |
| Recent work | Case study for this site + two honestly labelled “coming soon” builds |
| About | Who you’re hiring: photo placeholder, short bio, location, reply time |
| Analytics | PostHog page views + `generate`, `copy`, `lead_submit`, `cta_click` |
| Footer | Contact details, legal links, plain-language disclosure |

Every customer-facing string (packages, FAQs, phone, email, process) lives in
**`lib/business.ts`** — edit once, update everywhere.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm run typecheck` | TypeScript, no emit |

---

## Configuration

### 1. Caption engine (required)

`GEMINI_API_KEY` in `.env.local` and in Vercel → Settings → Environment Variables.
Get a free key at [aistudio.google.com](https://aistudio.google.com/app/apikey).
Optional: `GEMINI_MODEL` (defaults to `gemini-2.5-flash`).

> ⚠️ Never prefix the key with `NEXT_PUBLIC_`. `app/api/generate/route.ts` starts
> with `import "server-only"`, so the build fails if it is ever imported into a
> Client Component.

### 2. Your details and offer

Everything is in **`lib/business.ts`**:

```ts
export const CONTACT_EMAIL = "areebausaf742@gmail.com";
export const CONTACT_PHONE = "919044996869";        // digits only + country code
export const CONTACT_PHONE_DISPLAY = "+91 90449 96869";
export const BOOKING_URL = "https://cal.com/areeb/discovery-call"; // ✏️ replace
export const BOOKING_LABEL = "Book a free call";
export const BOOKING_NOTE = "20 minutes · no slides, no pressure";
export const PACKAGES = [ … ];                      // prices, features, badges
export const FAQS = [ … ];
export const TESTIMONIALS = [];                     // hidden until you add real ones
```

`BOOKING_URL` is the **single source** for every booking button — hero, process
section, contact card and footer all read it, so one edit updates all four. The
value above is a placeholder; swap in your real Cal.com (or Calendly) link.

**Email:** `CONTACT_EMAIL` is `hello@cafecaption.tech`. That address only works
once the domain is live *and* a mailbox or forwarding rule exists for it — until
then, messages sent there vanish silently. Point it back at your Gmail for launch
week if forwarding isn’t ready.

**About + recent work:** `ABOUT` and `RECENT_WORK` live in the same file. Set
`ABOUT.photo` to a file in `public/` (e.g. `"/areeb.jpg"`) once you have a square
photo; the initials avatar renders until then. Work items with
`status: "soon"` render a “Coming soon” card — never relabel one as a finished
client project.

**Prices** come from `PACKAGES` in the same file. The middle package carries
`featured: true` and `badge: "Most popular"`, which is what gives it the dark
treatment and the badge on the site.

### 3. Public URL (recommended)

`NEXT_PUBLIC_SITE_URL=https://your-domain.com` — used for canonical URLs,
`sitemap.xml`, `robots.txt`, structured data and the Open Graph image.

### 4. Lead capture (WhatsApp by default, Supabase optional)

The quote form needs **no backend**. On submit it validates the four answers,
builds a WhatsApp message containing the visitor's name, café, city and what
they need, and opens it in a new tab — the visitor presses send, and you reply
in a normal chat. Nothing is stored anywhere, which is also what the form tells
visitors.

If you later want a database copy, `POST /api/leads` is already built and
rate-limited:

1. Run **`supabase/schema.sql`** in Supabase → SQL Editor. It creates
   `public.leads` with insert-only RLS (no public reads).
2. Add to your environment:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon or publishable key>
# SUPABASE_LEADS_TABLE=leads
```

Without these the form still submits successfully: the visitor is shown a
one-tap **“Send it on WhatsApp”** handoff instead of an error, so no enquiry is
lost — you just don't keep a database record. Check the server log for
`[leads] Supabase is not configured` to confirm.

The form does not call this endpoint today — it hands straight to WhatsApp.
Wire it back by posting the same fields from `components/LeadForm.tsx` if you
want rows in a table.

Enquiries store: name, café, city, WhatsApp, email, interest, message, source and
referring page. Read them in the Supabase table editor:

```sql
select created_at, name, cafe_name, city, whatsapp, interest
from public.leads order by created_at desc;
```

---

## API

### `POST /api/generate`

```json
{
  "description": "Iced latte with a croissant on a wooden table",
  "tone": "cozy",
  "cafeName": "The Daily Grind",
  "city": "Lucknow",
  "language": "hinglish"
}
```

`tone` = `cozy | aesthetic | playful | promo`, `language` = `english | hinglish`.
Optional café fields are sanitised (trimmed, control characters stripped,
length-capped). Returns three captions with up to five normalised hashtags each.

Errors: `400 VALIDATION_ERROR / INVALID_JSON`, `422 BLOCKED`, `429 RATE_LIMITED`
(+`Retry-After`), `500 MISSING_API_KEY`, `504 TIMEOUT`, `502 UPSTREAM_* /
GENERATION_FAILED`.

**Timeouts.** Every attempt is wrapped in an `AbortController`: the first gets
**8 s**, a single retry gets **20 s** (28 s total, inside `maxDuration = 30`). If
both fail the route returns `504 TIMEOUT` with a hint instead of a hung function.
Deterministic failures (bad key, malformed request) are **not** retried — only
timeouts, `429`, `5xx` and network errors are.

Rate limit: **12 requests / 10 min per IP**. Responses carry
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### `POST /api/leads`

Accepts the contact form payload, validates it, rejects honeypot hits and stores
the lead when Supabase is configured. Rate limit: **6 / 10 min per IP**.
Always returns `200 { ok: true, stored }` for a valid submission so the UI can
offer the WhatsApp handoff.

---

## Analytics (PostHog)

`posthog-js` is installed and initialised once by
`components/AnalyticsProvider.tsx`, wrapped around the app in `app/layout.tsx`.
Set the key and the site starts collecting; leave it blank and everything still
works (events fall back to console logs in development).

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or https://eu.i.posthog.com
```

Every event is declared in `lib/analytics.ts` and fired through `track()`:

| Event | Fires when | Properties |
| --- | --- | --- |
| `generate` | A caption set comes back successfully | `tone`, `source` (`example` / `form`) |
| `copy` | A caption, hashtag set or “copy all” succeeds | `kind` |
| `lead_submit` | The quote form is submitted | `interest` |
| `cta_click` | Any WhatsApp, email, booking or package CTA | `location`, `label` |

Page views are captured too (`capture_pageview: true`).

**Privacy defaults** — chosen deliberately, documented on `/privacy`:

- `persistence: "memory"` → no cookies, no localStorage, so no consent banner.
- `person_profiles: "identified_only"` → anonymous visitors stay anonymous.
- `autocapture: false` → only the four declared events, never form contents.
- `disable_session_recording: true` → no screen recording.
- `respect_dnt: true` → visitors sending Do Not Track are ignored entirely.

Add an event by extending the `AnalyticsEvent` union in `lib/analytics.ts` — the
compiler then requires every call site to pass the right properties.

---

## SEO

`app/layout.tsx` holds metadata (title template, description, keywords, Open
Graph, Twitter, robots, canonical), **Organization / WebSite / Person** JSON-LD.
`app/page.tsx` adds **ProfessionalService** (with offer prices) and **FAQPage**
structured data.

| Route | Serves |
| --- | --- |
| `/opengraph-image` | 1200×630 preview (also used by Twitter) |
| `/sitemap.xml` | `/`, `/privacy`, `/terms` |
| `/robots.txt` | allows pages, disallows `/api/` |
| `/manifest.webmanifest` | Installable app metadata |

`/privacy` and `/terms` are plain-language pages — review them before launch so
they match how you actually operate (payments, refunds, data retention).

---

## Project structure

```
app/
  api/generate/route.ts    # server-only Gemini endpoint
  api/leads/route.ts       # lead intake (Supabase + graceful fallback)
  layout.tsx               # shell: fonts, SEO, header/footer, JSON-LD, analytics
  page.tsx                 # hero, studio, packages, process, FAQ, contact
  privacy/, terms/         # legal pages
  opengraph-image.tsx      # generated social card
  robots.ts, sitemap.ts, manifest.ts
components/
  motion/MotionRoot.tsx    # LazyMotion provider — animation features load async
  motion/Reveal.tsx        # staggered fade-up on scroll-into-view (framer-motion)
  CaptionStudio.tsx        # the client tool (form, states, results, copy)
  LeadForm.tsx             # "Get a quote in 24h" → prefilled WhatsApp message
  BookingLink.tsx          # every "book a call" button, reads BOOKING_URL
  RecentWork.tsx           # case study + "coming soon" grid, above Packages
  AboutDeveloper.tsx       # bio block above the footer
  AnalyticsProvider.tsx    # initialises PostHog once, privacy-first defaults
  TrackedLink.tsx          # <a> that reports a cta_click event
  Packages.tsx, Process.tsx, Faq.tsx
  SiteHeader.tsx, SiteFooter.tsx
lib/
  business.ts              # ✏️ contact details, packages, booking link, copy
  analytics.ts             # typed event catalogue → PostHog
  types.ts                 # shared request/response types, tones, languages
  leads.ts                 # lead validation shared by client + server
  rate-limit.ts            # hashed-IP limiter used by both API routes
  site.ts                  # site URL + SEO copy
supabase/schema.sql        # leads table + insert-only RLS
```

---

## Design system (the "premium" layer)

The visual language is defined in `app/globals.css` + `tailwind.config.ts`, so a
restyle means editing two files, not thirty components.

**Type & rhythm**

| Token | Use |
| --- | --- |
| `.label` | eyebrow: 10px, `0.2em` tracking, hairline dash before it |
| `.section-title` | 1.8rem → 2.4rem display serif, `-0.02em` tracking, 1.08 leading |
| `.section-lead` | 14 → 15.5px, 1.7 line-height, capped at `46ch` for readability |
| `.body-sm` | 13 → 13.5px body copy inside dense surfaces |
| Sections | `mt-16` mobile / `mt-28` desktop (`SECTION` const in `app/page.tsx`) |

**Surface & light**

- `.hairline` — 1px ring painted with a warm gradient (caramel at the top-left,
  fading to near-nothing) via a `mask-composite` pseudo-element. Used on cards,
  panels and the studio, in place of flat grey borders.
- `.paper` — the studio surface: translucent cream + `backdrop-blur-xl` and a
  three-layer diffused shadow (contact shadow + soft spread + amber bloom).
- `.glow-warm` — the soft caramel pool behind the hero headline.
- Header — frosted glass (`bg-cream-100/70 backdrop-blur-xl backdrop-saturate-150`)
  closed with a gradient hairline.

**Motion**

- `framer-motion` is installed but **never** blocks first paint: `MotionRoot`
  wraps the app in `LazyMotion` with `features={() => import("framer-motion")}`,
  so only the ~18 kB `m` renderer is in the initial JS and the ~70 kB (gzip)
  animation feature bundle arrives in its own async chunk.
- `Reveal` gives sections their staggered fade-up (`whileInView`, `once: true`).
  The hero is CSS-only on purpose: above-the-fold content should paint with the
  stylesheet, not wait for JavaScript.
- Every interactive control carries a press state (`active:scale-[0.97]`, or
  `whileTap` for the copy buttons), `prefers-reduced-motion` is honoured in both
  CSS and the `Reveal`/`usePrefersReducedMotion` pair, and `<noscript>` keeps
  revealed sections visible if JavaScript never runs.
- Loading states are shimmering skeletons shaped like the real caption cards —
  header line, three body lines, five hashtag pills, two action circles.

**Mobile**

- The studio is full-bleed below `sm` (`-mx-4 rounded-none`), so it fills the
  screen the way a native sheet would.
- Every tap target is at least 44×44 px: copy buttons (`h-11 w-11`), tone chips,
  language buttons, package CTAs, nav and footer links, inputs (`.input`).

**Bundle budget** — `npm run build` after this overhaul:

```
Route (app)                                 Size  First Load JS
┌ ○ /                                    21.1 kB         140 kB
+ First Load JS shared by all             103 kB
```

Baseline before the overhaul was 14.8 kB / 122 kB. The +18 kB is framer-motion's
`m` renderer only; the feature bundle (200 kB raw / 70 kB gzip) is an async
chunk, and PostHog (356 kB) is still loaded lazily. If you ever need the 122 kB
back, swap `Reveal` for a CSS + `IntersectionObserver` component — it is the
only file that imports framer-motion apart from `MotionRoot` and the copy buttons.

---

## Deploy to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Add `GEMINI_API_KEY`, `NEXT_PUBLIC_SITE_URL` (and the Supabase pair if you're
   using lead storage).
3. Deploy. Environment changes only apply to **new** deployments — redeploy
   after adding or editing variables.

### Custom domain (do this before selling)

A `*.vercel.app` link costs trust. Buy something short and sayable —
`cafecaption.in` or `cafecaption.com` (~₹800/year) — then:

1. **Vercel → Project → Settings → Domains → Add**, and enter the domain.
2. Vercel shows the DNS records to create at your registrar:
   - apex (`cafecaption.in`) → `A 76.76.21.21`
   - `www` → `CNAME cname.vercel-dns.com`
   Some registrars need only a nameserver change; Vercel prints the exact rows.
3. Wait for **Valid Configuration** (SSL is issued automatically, usually in
   minutes).
4. Set `NEXT_PUBLIC_SITE_URL=https://cafecaption.in` in **Settings → Environment
   Variables**, then **redeploy** — canonical URLs, `sitemap.xml`, `robots.txt`,
   JSON-LD and the Open Graph image all read it.
5. Pick one canonical host and let Vercel redirect the other (add
   `www` → apex as a redirect, or the reverse — just be consistent in links).

Nothing in the code hardcodes the Vercel URL: `lib/site.ts` reads
`NEXT_PUBLIC_SITE_URL` and falls back to `VERCEL_PROJECT_PRODUCTION_URL`, so the
switch is an environment change, not a code change.

---

## Before you sell

- [ ] Replace the placeholder-free `CONTACT_PHONE` if it ever changes, and test
      the WhatsApp button from a phone.
- [ ] Adjust `PACKAGES` prices/features and confirm they match what you deliver.
- [ ] Read `/privacy` and `/terms`; add GST details, refund policy or business
      address if you need them.
- [ ] Add real testimonials to `TESTIMONIALS` (the section stays hidden until
      there is at least one).
- [ ] Set `NEXT_PUBLIC_SITE_URL` and check the link preview in WhatsApp.
- [ ] Add a custom domain — it's the single biggest credibility upgrade.
