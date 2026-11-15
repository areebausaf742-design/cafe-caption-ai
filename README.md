# CafeCaption

**Instagram captions and Google local SEO for independent cafés — and the studio
behind them.**

One free studio, three tools: a photo or description → three captions + five
hashtags; a pasted Google review → three replies; a one-line brief → a 100–150
word Business Profile post (English or Hinglish). It doubles as the sales page
for websites, digital menus and caption systems, with packages, FAQs, lead
capture and WhatsApp/email contact.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**,
**Lucide icons**, **Google Gemini** and an optional **Supabase** lead store. The
Gemini key is read only inside a `server-only` Route Handler.

---

## What's on the site

| Section | Purpose |
| --- | --- |
| Sticky header | Wordmark, anchor nav, WhatsApp CTA |
| Hero + studio | The free tool, in two tabs. **Instagram captions**: photo or description, café name, city, language, tone, copy buttons, regenerate, one-tap examples and a sample result before the first click. **Google Local SEO**: review responder (paste a review + 1–5★ → three replies with different strategies) and Google post generator (one-line brief → 100–150 word local post with a character meter) |
| Packages | Three fixed-price offers (₹4,999 / **₹10,000 “Most popular”** / ₹18,500), each with a WhatsApp CTA |
| How it works | Three-step process with a “book a free call” link |
| FAQ | Native `<details>` accordion, also emitted as FAQ structured data |
| Contact | Book a call, WhatsApp and email cards, plus the **“Get a quote in 24h”** form that opens a prefilled WhatsApp message |
| Recent work | Case study for this site + two honestly labelled “coming soon” builds |
| About | Who you’re hiring: photo placeholder, short bio, location, reply time |
| Analytics | PostHog page views + `generate`, `seo_generate`, `copy`, `lead_submit`, `cta_click` |
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

One endpoint, three tools, picked by `type` (defaults to `captions`).

```json
{
  "type": "captions",
  "description": "Iced latte with a croissant on a wooden table",
  "tone": "cozy",
  "cafeName": "The Daily Grind",
  "city": "Lucknow",
  "language": "hinglish",
  "image": { "mimeType": "image/jpeg", "data": "<base64, no data: prefix>" }
}
```

```json
{
  "type": "review_reply",
  "review": "Lovely place but my cold brew took 25 minutes and the staff seemed annoyed.",
  "rating": 2,
  "contact": "hello@yourcafe.in",
  "cafeName": "The Daily Grind",
  "city": "Lucknow",
  "language": "english"
}
```

```json
{
  "type": "google_post",
  "topic": "New winter menu launch",
  "tone": "promo",
  "cafeName": "The Daily Grind",
  "city": "Lucknow",
  "language": "english"
}
```

`tone` = `cozy | aesthetic | playful | promo`, `language` = `english | hinglish`,
`rating` = `1 | 2 | 3 | 4 | 5`. Optional café fields are sanitised (trimmed,
control characters stripped, length-capped). `description` is capped at 400
characters, `review` at 1,500, `topic` at 200, `contact` at 120.

Responses are a **discriminated union on `tool`**, so a client can't read
`replies` off a captions response:

```json
{ "tool": "captions", "captions": [{ "caption": "…", "hashtags": ["#cafe"] }], "meta": { "model": "…", "tone": "cozy", "language": "english", "hasImage": false } }
{ "tool": "review_reply", "replies": [{ "label": "Warm & Inviting", "text": "…" }], "meta": { … } }
{ "tool": "google_post", "post": { "heading": "…", "body": "…", "callToAction": "…", "keywords": ["best cafe in Lucknow"], "characters": 812 }, "meta": { … } }
```

`image` is optional. **Either `description` or `image` is required** — with a
photo, the description becomes an optional note (“focus on the pastries”) that
the model treats as extra context rather than the whole brief.

Errors carry a machine-readable `code` **and** a short `reason` tag, so a
failure is never a mystery:

| code | status | meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` / `INVALID_JSON` | 400 | the request was unusable |
| `INVALID_IMAGE` | 400 | the photo wasn't valid base64 / had no data |
| `UNSUPPORTED_IMAGE` | 415 | not a JPEG, PNG, WebP, HEIC or HEIF |
| `IMAGE_TOO_LARGE` | 413 | base64 payload over ~1.5 MB (compression was skipped) |
| `BLOCKED` | 422 | Gemini refused the description (safety) |
| `RATE_LIMITED` | 429 | this visitor's 12/10 min budget ran out |
| `MISSING_API_KEY` | 500 | `GEMINI_API_KEY` isn't set |
| `TIMEOUT` | 504 | every attempt ran out of time |
| `UPSTREAM_RATE_LIMITED` | 429 | Google is throttling this key |
| `UPSTREAM_AUTH` | 502 | the key was rejected (invalid / API not enabled) |
| `UPSTREAM_BAD_REQUEST` | 502 | the model rejected the request shape |
| `UPSTREAM_MODEL_NOT_FOUND` | 502 | no configured model exists on this key |
| `UPSTREAM_UNAVAILABLE` | 502 | Google is having a bad day (`503`) |
| `EMPTY_OUTPUT` | 502 | a 200 with nothing postable in it (usually a truncated reply) |
| `GENERATION_FAILED` | 502 | anything else |

**Attempt ladder.** Every call is wrapped in an `AbortController`, and photo
requests get more time on each rung because image tokens take longer to read:

| rung | model | text | photo |
| --- | --- | --- | --- |
| 1 | `GEMINI_MODEL` (default `gemini-2.5-flash`) | 8 s | 12 s |
| 2 | same model | 12 s | 16 s |
| 3 | `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`) | 10 s | 12 s |

30 s for text and 40 s for photos, inside `maxDuration = 45` (the browser waits
70 s, so the server always gets to answer with a real error code first). If every
model 404s — a retired id, a typo in `GEMINI_MODEL` — one extra attempt goes to
`gemini-3.8-flash`, but only while there is budget left.

Every rung is multimodal, so photo upload needs no separate vision model.

What gets retried: timeouts, `429`, `5xx`, network errors, empty replies and
half-written JSON. What doesn't: a safety block, or a rejected key (`400/403`
with "API key not valid") — retrying those just burns the budget and quota.

**Thinking budget.** Gemini 2.5 models charge reasoning tokens to the same
`maxOutputTokens` budget as the answer, which is how a request can return
`finishReason: MAX_TOKENS` with no usable JSON. Captions don't need
chain-of-thought, so `thinkingConfig.thinkingBudget` is set to `0` for 2.5
models and `maxOutputTokens` is 2048. If an API version rejects
`thinkingConfig`, the route drops it and retries immediately.

**Testing without spending quota.** Set `GEMINI_BASE_URL` (ignored in
production) to a local mock and the SDK will call it instead of Google — that's
how every rung of the ladder above was verified, including overloads, empty
payloads and retired models.

Rate limit: **12 requests / 10 min per IP**, plus a tighter **6 photo requests
/ 10 min** bucket, because images cost far more upstream quota than text.
Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Google Local SEO prompts (`app/api/generate/prompts.ts`)

All prompts, schemas and normalisers live in one server-only module, so the
route handler stays about transport and the copy quality lives in one file.

**Review responder.** The system prompt is written as a reputation manager with
hard rules, not vibes:

| rule | why it matters |
| --- | --- |
| Never defensive, never explain away the complaint | the reply is read by every future customer, not just the reviewer |
| 1–2★ → apologise, own it, offer one concrete fix, invite them back | recovery is the whole point of replying to a bad review |
| Ask unhappy reviewers to continue privately (`contact`, e.g. an email) | refunds and details don't belong in public |
| 4–5★ → thank them warmly and **name the specific items they praised** | proves a human read it |
| 3★ → acknowledge both the good and the bad | the balanced case most tools get wrong |
| No invented facts, no discounts, no legal admissions on serious claims | a reply is a public commitment |
| Same language as the review, 50–90 words, no hashtags, no links, at most one emoji | paste-and-publish |

Three replies come back with **three different strategies** — the label sets
switch with the rating (`Professional & Grateful` / `Warm & Inviting` /
`Apologetic & Solution-Oriented` for 1–2★, and warmer variants for 3★+), so the
owner picks a tone rather than re-rolling the dice. Replies are plain text:
markdown, quotes and "Dear reviewer" scaffolding are stripped server-side.

**Google post generator.** Written as a local SEO specialist:

- 100–150 words (the model is asked for a hook, a concrete detail, a local line
  and a CTA); responses under 80 words are rejected and retried rather than
  shipped thin
- local-intent phrasing woven into sentences — *“the best cafe in {city}”*,
  *“freshly baked pastries near me”* — one phrase per sentence, never stacked
- a heading under 60 characters, 2–4 emojis, no hashtags (Google posts don't
  use them) and one clear call to action
- the whole post is clamped to Google's 1,500-character ceiling, trimming at a
  sentence boundary rather than mid-word; `characters` is returned so the UI can
  show a live meter
- the model reports the local phrases it actually used, so the UI can show them
  as chips and the owner can see the SEO work

Because `/api/generate` runs the same attempt ladder for every tool, a slow or
overloaded model degrades exactly the same way for a review reply as it does for
a caption.

### Photo upload (vision)

The visitor can upload a photo instead of typing. The heavy lifting happens in
the browser (`lib/image.ts`) before anything is sent:

| step | detail |
| --- | --- |
| type check | must be `image/*`; SVG is rejected |
| size check | 5 MB hard limit on the original file |
| decode | `createImageBitmap`, falling back to `<img>` for stubborn formats |
| downscale | long edge → **1024 px** (Gemini tiles larger images; extra pixels cost tokens and add nothing) |
| compress | JPEG at quality 0.82 → 0.70 → 0.60 → 0.50, then 820 / 640 / 384 px if needed, until under **1 MB** |
| send | base64 JPEG as an `inlineData` part, image first and instructions second |

A 12 MP phone photo typically lands at 150–400 KB, i.e. well under Vercel's
4.5 MB request-body limit — which is the whole point: the original file would
have been a 413 or a timeout.

The server never trusts that. It re-checks the MIME type against an allowlist,
verifies the payload really is base64, tolerates (and strips) a stray
`data:` prefix, and rejects anything over ~1.5 MB with `413 IMAGE_TOO_LARGE`.

The prompt switches with the input: for a photo the model is told to *look*
first — noting the food, the light, the setting, the mood — to ground every
caption in what is visibly there, and never to invent dishes, prices or events.
The image is treated as evidence, never as instructions, so text baked into a
photo can't hijack the prompt.

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
| `generate` | A caption set comes back successfully | `tone`, `source` (`example` / `form`), `has_image` |
| `photo_upload` | A photo is accepted (or rejected) by the dropzone | `outcome` (`ready` / `rejected`) |
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
  api/generate/route.ts    # server-only Gemini endpoint: transport, ladder, errors
  api/generate/prompts.ts  # every prompt, schema and normaliser (captions/reviews/posts)
  api/leads/route.ts       # lead intake (Supabase + graceful fallback)
  layout.tsx               # shell: fonts, SEO, header/footer, JSON-LD, analytics
  page.tsx                 # hero, studio, packages, process, FAQ, contact
  privacy/, terms/         # legal pages
  opengraph-image.tsx      # generated social card
  robots.ts, sitemap.ts, manifest.ts
components/
  motion/MotionRoot.tsx    # LazyMotion provider — animation features load async
  motion/Reveal.tsx        # staggered fade-up on scroll-into-view (framer-motion)
  CaptionStudio.tsx        # studio shell: tabs, café details shared by both tools
  LocalSeoStudio.tsx       # Google tab: review responder + post generator
  studio/StudioTabs.tsx    # shared-element tab switcher (framer-motion layoutId)
  studio/StarRating.tsx    # accessible 1–5★ radio group, 44px targets
  studio/CopyIconButton.tsx# 44×44 copy control with tooltip + tick
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
  studio-client.ts         # one fetch helper for all three tools (70s abort, typed errors)
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
