# CafeCaption

**Instagram captions, Google local SEO and digital menus for independent cafés —
and the studio behind them.**

One free studio, four tools: a photo or description → three captions + five
hashtags; a pasted Google review → three replies; a one-line brief → a 100–150
word Business Profile post (English or Hinglish); and a photo of a printed menu
→ a structured digital menu with a downloadable QR code. It doubles as the sales
page for websites, digital menus and caption systems, with packages, FAQs, lead
capture and WhatsApp/email contact.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**,
**Lucide icons**, **Google Gemini** and an optional **Supabase** lead store. The
Gemini key is read only inside a `server-only` Route Handler.

> **Taking this project over, or buying it?** Start with
> [`docs/HANDOVER.md`](docs/HANDOVER.md) — accounts to transfer, which migrations
> are applied, the known limitations, and a buyer's first day. This README is the
> developer's manual; that document is the handover.

---

## What's on the site

| Section | Purpose |
| --- | --- |
| Sticky header | Wordmark, anchor nav, WhatsApp CTA |
| Hero + studio | The free tool, in three tabs. **Instagram captions**: photo or description, café name, city, language, tone, copy buttons, regenerate, one-tap examples and a sample result before the first click. **Google Local SEO**: review responder (paste a review + 1–5★ → three replies with different strategies) and Google post generator (one-line brief → 100–150 word local post with a character meter). **Digital menu**: a photo of the printed menu → categories, items and prices as a mobile-first preview you can **correct in place** (rename a section, fix a price, add or remove a row) before publishing, plus a QR code you can download as a PNG |
| Packages | Three fixed-price offers (₹4,999 / **₹10,000 “Most popular”** / ₹18,500), each with a WhatsApp CTA |
| How it works | Three-step process with a “book a free call” link |
| FAQ | Native `<details>` accordion, also emitted as FAQ structured data |
| Contact | Book a call, WhatsApp and email cards, plus the **“Get a quote in 24h”** form that opens a prefilled WhatsApp message |
| Recent work | Case study for this site + two honestly labelled “coming soon” builds |
| About | Who you’re hiring: photo placeholder, short bio, location, reply time |
| Analytics | PostHog page views + `generate`, `seo_generate`, `menu_generate`, `qr_download`, `copy`, `lead_submit`, `cta_click` |
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
| `npm run build` | Production build (`cross-env NODE_ENV=production next build`) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests (Vitest, `tests/**/*.test.ts`) |
| `npm run test:watch` | The same, in watch mode while you edit |
| `npm run check:contrast` | WCAG AA check on every text colour the UI uses |
| `npm run check:prod` | Probe a deployment: rate-limit fail-closed behaviour (no quota spent) and that `anon` can no longer INSERT |

### Package manager and dependencies

- **Fonts are self-hosted.** `app/layout.tsx` imports the two variable families
  from `@fontsource-variable/*`, so the woff2 files are fingerprinted into
  `/_next/static` and served from our own origin. There is no Google Fonts
  stylesheet on the critical path, and the enforced CSP allows no third-party
  font host at all (`font-src 'self' data:`, `style-src 'self' 'unsafe-inline'`).
- **Node 20 or newer** (`engines.node`). The build script sets `NODE_ENV` through
  `cross-env`, so `npm run build` works in Windows `cmd`/PowerShell as well as a
  POSIX shell — `NODE_ENV=production next build` is a syntax error in the former.
  `cross-env` requires Node 20+, which is also what the deployment runtime uses.
- **One lockfile: `package-lock.json`, one tool: `npm`.** `npm ci` installs exactly
  the locked tree; anything else (yarn, pnpm, bun) will silently produce a
  different tree and break the lockfile discipline the CI relies on.
- `npm audit --omit=dev` currently reports two advisories, both inside Next's own
  bundled `postcss` (`GHSA-qx2v-qp2m-jg93` and friends). The only fix npm offers
  is `next@16`, a major upgrade; the exposure is a build-time CSS transform, not
  a request path in this app, so it is tracked rather than force-upgraded. Re-run
  `npm audit --omit=dev` after any dependency bump.
- Dependencies are pinned to `^` ranges on current majors; a model id, an API
  shape or a CSS token changing upstream is a build-time failure here, not a
  runtime surprise, because `npm run typecheck` covers all of it.

### Tests

`npm test` runs the pure logic — the parts where a bug is silent rather than
loud: menu validation and limits, reserved slugs, WhatsApp normalisation, price
parsing, translation stitching, JSON extraction, body-size limits, image type
detection, lead validation, the SSRF guard on Space downloads, and `clientIp`
with and without `TRUST_PROXY`. No network, no database, no browser: a failure
is a real logic failure, not a flaky environment.

New behaviour that can be judged from inputs alone belongs in `tests/`. Anything
that needs a real request belongs in the manual checklist at the end of this
file.

`tests/tap-targets.test.ts` is a structural guard rather than a unit test: every
`<input type="file">` in the app must be a full-size transparent overlay on its
own label (never `sr-only` next to a button), because a 1×1 input is a tap
target that phones — and tap-target audits — cannot hit.

---

## Configuration

### 1. Caption engine (required)

`GEMINI_API_KEY` in `.env.local` and in Vercel → Settings → Environment Variables.
Get a free key at [aistudio.google.com](https://aistudio.google.com/app/apikey).
Optional model overrides, all read from the environment so a retired id is a
config change rather than a deploy: `GEMINI_MODEL` (default `gemini-2.5-flash`),
`GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`) and
`GEMINI_LAST_RESORT_MODEL` (default `gemini-3.8-flash`).

> The three defaults are the ids that were current when this was written; they
> cannot be verified without a live key. Before a launch, check them against
> `https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY`.

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

**Email:** `CONTACT_EMAIL` is **`areebausaf742@gmail.com`** — a real inbox, not a
placeholder. The site previously used `hello@cafecaption.tech`, which only
receives once the domain is live *and* a mailbox or forwarding rule exists for
it; until then anything sent there vanished silently. Swap this one line once
that mailbox exists. It feeds the contact section, footer, `/privacy`, `/terms`
and the Organization/Person JSON-LD, so there is nothing else to edit.

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

### 4. 3D models (optional — free, but needs two accounts)

Missing either half degrades honestly: without a Space the panel says 3D
generation isn't switched on, and without storage it refuses **before** spending
GPU time. Nothing else in the product depends on these.

```bash
# The generator: a Hugging Face Space running open weights (TripoSR / SF3D /
# TRELLIS) with ZeroGPU hardware. "Duplicate this Space" on any image-to-3D
# Space gives you your own URL; paste it here.
THREED_SPACE_URL=https://your-user-dish-3d.hf.space
THREED_SPACE_API=/predict          # whichever api_name the Space exposes
HF_TOKEN=hf_...                    # a free read token; raises your GPU quota
THREED_PROVIDER_NAME=triposr       # the credit shown beside the model

# Storage: Cloudflare R2 (free tier, 10 GB, no egress fees). Create a bucket,
# an API token with object read+write, and either an r2.dev subdomain or a
# custom domain as the public base URL.
R2_ACCOUNT_ID=...
R2_BUCKET=dish-models
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=https://pub-xxxx.r2.dev

# Operator only: reveals plain GLB/poster/credit fields in the studio.
# Leave unset for cafés — they should never see a file format.
NEXT_PUBLIC_DISH_MANUAL_MODEL=1
```

Free ZeroGPU accounts are limited (verified email, account >30 days old, two
Spaces, **5 GPU-minutes a day** shared per account); that is a few dish models a
day, and the UI says so rather than pretending otherwise.

### 5. Lead capture (WhatsApp by default, Supabase optional)

The quote form uses **two channels, in this order**. On submit it validates the
four answers, POSTs a copy to `/api/leads`, and *then* opens WhatsApp with the
same answers written out — the chat is how a café owner actually replies, the
row in the database is what stops an enquiry disappearing when the tab is
blocked, closed, or opened inside an in-app browser.

The POST is deliberately not awaited: `window.open` only survives popup blocking
while it runs inside the same user gesture, so nothing may sit between the click
and the tab. It uses `keepalive: true`, and a failure changes nothing the visitor
sees. `app/privacy` says all of this in the same words.

To actually keep the copy, ten minutes of setup:

1. Run **`supabase/schema.sql`** in Supabase → SQL Editor. It creates
   `public.leads` and `public.menus` with RLS on, **no INSERT privilege for
   `anon`**, and the three capability-key functions.
2. Add to your environment:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon or publishable key>      # reads + capability RPCs
SUPABASE_SERVICE_ROLE_KEY=<service_role key>     # writes only, server only
# SUPABASE_LEADS_TABLE=leads
```

**Two keys, two jobs, no fallback.** The publishable key reaches browsers (the
public menu page needs it), so nothing it can do may be write access. Every
INSERT — the lead row, the published menu — is done server-side with
`SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS and is never prefixed
`NEXT_PUBLIC_*`, never logged, and never imported by client code. `lib/supabase-config.ts`
holds both reads and refuses `writeHeaders()` when the service key is missing,
when it is byte-identical to the publishable key, or when its JWT `role` claim is
not `service_role` — the three ways a "server write" silently becomes an anon
write. A refuse means **503**: `/api/leads` returns `STORE_UNAVAILABLE` and
`/api/menus` returns `PUBLISHING_DISABLED`. There is deliberately no
`SERVICE_ROLE ?? ANON` expression anywhere in the codebase.

Upgrading an existing database (one that was created before this): run
`supabase/migrations/20261114120000_lock_anon_inserts.sql` **after** the
deployment that has the service key is live — it revokes INSERT on both tables,
drops `leads_insert_only` and `menus_insert_only`, keeps RLS on, and re-asserts
the `menu_public` / `menu_read` / `menu_save` grants so public pages and the
capability-key editor are untouched. Then `npm run check:prod` proves it: it
attempts a direct anon INSERT into both tables and expects a refusal.

The same three variables also switch on **hosted menus** (`/menu/[slug]`), which
need the `menus` half of the same schema file. A published menu with a WhatsApp
number gets cart ordering automatically — the number is stored dialled, with the
country code, so the `wa.me` link actually opens. Without them the form still opens WhatsApp with every answer already written —
the client is fire-and-forget and never reads the response — but the API answers
`503 STORE_UNAVAILABLE` rather than pretending the row was saved. The server log
names the missing variable once (`[supabase] SUPABASE_SERVICE_ROLE_KEY is not
set`), never a value.

Enquiries store: name, café, city, WhatsApp, email, interest, message, source and
referring page. Read them in the Supabase table editor:

```sql
select created_at, name, cafe_name, city, whatsapp, interest
from public.leads order by created_at desc;
```

---

## API

### `POST /api/generate`

One endpoint, four tools, picked by `type` (defaults to `captions`).

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

```json
{
  "type": "digital_menu",
  "cafeName": "The Daily Grind",
  "image": { "mimeType": "image/jpeg", "data": "<base64, no data: prefix>" }
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
{ "tool": "digital_menu", "menu": { "items": [{ "category": "Beverages", "name": "Masala Chai", "price": "₹80" }], "categories": ["Beverages"], "categoryCount": 1 }, "meta": { … } }
```

`image` is optional for captions and **required** for `digital_menu`. For
captions, **either `description` or `image` is required** — with a photo, the
description becomes an optional note (“focus on the pastries”) that the model
treats as extra context rather than the whole brief. A photo sent with
`review_reply` or `google_post` is rejected with `400`.

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

**Shared, not per-instance.** On Vercel every request can land on a different
isolate, so a module-scope `Map` is only a per-instance counter — a burst spread
across cold starts walks straight past it, which is exactly the abuse that costs
money upstream. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
(free tier) and the limiter runs a fixed window in Redis over its REST API — no
SDK, one `fetch`, `INCR` + `PEXPIRE NX` + `PTTL` in a single pipeline.

**Fail closed where it costs money, open where it doesn't.** The two cases are
not symmetric, so they don't behave the same way:

Two shared backends, tried in order: **Upstash** if configured, then **Postgres**
through `rate_limit_hit()` (which every deployment already has, since Supabase is
required for menus). Upstash is an accelerator — faster, and keeps counters out
of the primary database — not a prerequisite.

| Shared store | Paid routes (`generate`, `translate`, `dish-vision`, `dish-model`) | Free routes (`leads`, publish, edit) |
| --- | --- | --- |
| Supabase (default) | shared counter, enforced across every isolate | shared counter |
| Upstash configured | Upstash counter, one `fetch` per request | same |
| none, production | **`503 RATE_LIMIT_NOT_CONFIGURED`** (no `Retry-After`: retrying will not help) | in-memory map |
| none, development | in-memory map, one `console.warn` | in-memory map |
| configured, unreachable | **`503 RATE_LIMIT_UNAVAILABLE`**, `Retry-After: 30` (or the override, below) | in-memory map |

A per-instance counter under a limit of six isn't a limit once a burst can spread
across isolates — an unmetered paid endpoint is worse than half a minute of
honest downtime, and in production "no limiter at all" is worse than both, which
is why production refuses rather than falling back.

**The one override.** `RATE_LIMIT_ALLOW_MEMORY_LIMITS=1` puts a deployment back
on per-instance limits, deliberately and visibly: it logs a warning on every boot
and deleting the variable restores the strict behaviour. It now covers two cases
— no shared store at all, and the shared store being unreachable — so it is also
the safe way to deploy *before* `20261121100000_rate_limit_store.sql` has been
applied. Not a long-term setting.

**The Postgres store needs no account.** A fixed window in a table, incremented
by a single `insert … on conflict do update … returning` (atomic, so two isolates
cannot both read 5 and both write 6), behind `service_role`-only functions. One
migration, no dashboard, no second outage mode. The free routes keep the fallback, because a broken counter must
never be the reason a visitor can't save a menu. The 503 is distinguishable from
the 429 on purpose: nothing about the caller's usage is wrong. So the paid routes
should have Upstash configured; without it they still work, but the numbers only
hold per instance.

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

### Digital menu prompts (`app/api/generate/prompts.ts`)

Extraction, not copywriting — so it is judged on fidelity. The system prompt
treats the photo as **evidence, never instructions**, and is absolute about the
things owners notice first:

| rule | why |
| --- | --- |
| Read only what is printed; never translate, reword, reprice or "improve" | a merged or reworded dish is a menu the owner has to fix |
| Keep Indian item names and `₹` exactly as printed | translating "Adrak Chai" or rewriting `₹180/-` loses trust instantly |
| One row per purchasable item; sizes become `Cappuccino (Large)` | the owner can't act on "Small / Large" in a single cell |
| Skip anything illegible instead of guessing | a wrong price is worse than a missing line |
| Use the menu's own headings, never merge sections | sections are how a customer scans a menu |
| Ignore café name, address, FSSAI/GST numbers, legends, QR codes, page furniture | they are not food |
| Return raw JSON only — no markdown, no commentary | the payload goes straight into a renderer |

Structured output still has to be an **object** at the root (Gemini's
`responseSchema` requires it), so the schema asks for `{ items: [...] }` where
each object has exactly `category`, `name`, `price`; the parser also accepts a
bare array, which is how most models actually answer a "return a JSON array"
instruction.

`normalizeMenu()` then does the unglamorous work: strips markdown fences and
bullet glyphs, collapses whitespace, de-duplicates identical rows, caps names at
80 characters and prices at 24, groups categories in printed order, and gives a
bare number the `₹` the café would have printed anyway (`"160"` → `"₹160"`,
`"Rs. 190"` → `"₹190"`).

**Graceful failure is part of the feature.** Fewer than three readable items
throws inside the parser, so the attempt ladder retries on the next model rung
and, if it still fails, the visitor gets *"We couldn't read a menu in that photo.
Try a straight-on shot with the whole page in frame and good light."* — never a
half-empty menu or a stack trace.

### QR codes

`qrcode.react` renders the code in the browser, so no menu data ever leaves the
page for this step:

- **On screen** it is an `QRCodeSVG` (sharp at any size, no raster blur)
- **For download** a separate 1024px `QRCodeCanvas` is mounted off-screen and
  exported with `canvas.toBlob()` → `<a download="cafe-menu-qr.png">`, with a
  `toDataURL` fallback for browsers that refuse `toBlob` on large canvases
- The URL lives in `MENU_DEMO_URL` (`lib/business.ts`), built from
  `MENU_DEMO_PATH` + `NEXT_PUBLIC_SITE_URL` rather than a hardcoded domain, so
  the code resolves on whichever host is serving the app. It points at
  **`/menu/demo`**, which is a real page (`app/menu/demo/page.tsx`) — scanning
  the demo QR lands on a working sample menu instead of the 404 it used to.
- Once an owner presses **Publish this menu**, the same QR switches to their own
  live URL — the code, the URL printed under it and the downloaded PNG all read
  one derived value (`published?.url ?? MENU_DEMO_URL`), so they can never
  disagree

### Hosted menus (`/menu/[slug]`)

Photographing a printed card produced a preview and a QR that pointed at a demo.
Now the preview can go live: **Publish this menu** creates a real page at
`/menu/<slug>`, and the QR, the printed link and the downloaded PNG all follow it.

The whole flow is `app/api/menus/route.ts` → `lib/menu-store.ts` →
three SQL functions in `supabase/schema.sql`. There is **no login**. Publishing
returns two links:

| link | what it's for |
| --- | --- |
| `/menu/<slug>` | the public menu — what the QR on the table encodes |
| `/menu/<slug>/edit#<key>` | the editor. The key sits in the **fragment**, so it never reaches a server, an access log, a referrer or a CDN |

The key is generated in the browser-safe `lib/menu.ts` (24 random bytes), and
only its SHA-256 is stored — the database compares hashes, so a dump of the
`menus` table hands out no editing rights, and there is nothing to reset. The
route computes the hash; the client sends the key as an `x-menu-key` header.
Losing the link means losing the editor, which the UI says before you can close
the page.

Why the database does so little: RLS is on, `anon` gets **insert and nothing
else**, and reads/writes go through `menu_public()`, `menu_read()` and
`menu_save()`, all `security definer`. So drafts can't be listed, an unpublished
menu is invisible to the public while its owner can still open it, and prices
change only through a request that presents the right key.

Limits, all enforced server-side: 120 items, 64 KB bodies, **5 publishes and 20
saves per 10 minutes per IP** (Redis-backed when Upstash is configured), and the
same `robots: { index: false }` on every menu until there's a moderation step.

```bash
# publish (no auth today — publishing is rate-limited, not gated)
curl -s -X POST localhost:3000/api/menus -H 'Content-Type: application/json' \
  -d '{"cafeName":"Chai & Chapter","items":[{"category":"Coffee","name":"Masala Chai","price":"₹80"}]}'
# → { ok, slug, url, editUrl, key }   ← the key is returned once

# read / save with that key
curl -s localhost:3000/api/menus/chai-chapter -H "x-menu-key: $KEY"
curl -s -X PATCH localhost:3000/api/menus/chai-chapter -H "x-menu-key: $KEY" \
  -H 'Content-Type: application/json' -d '{"cafeName":"Chai & Chapter","items":[…] }'
```

To take a menu down without deleting it:

```sql
update public.menus set published = false where slug = 'chai-and-chapter';
```

**Search visibility is opt-in, per menu.** Every menu page is `noindex, follow`
by default, and `/sitemap.xml` lists only our own pages. To let one menu into
search — after actually reading it — approve the row and it appears in the
sitemap within the hour and switches to `index, follow`:

```sql
update public.menus set indexable = true where slug = 'chai-and-chapter';
```

`indexable` arrives with `supabase/migrations/20261114130000_menu_indexing.sql`
(`menu_public()` returns it, and `menu_indexable()` is what the sitemap reads).
Both directions degrade safely: with the migration unapplied, the page stays
`noindex` and the sitemap ships its page list instead of failing.

**Known limitation, stated plainly:** publishing is open to anyone who finds the
page, because there is no billing or accounts yet. It is rate-limited, the pages
are `noindex` until approved, and a menu can be unpublished with one SQL
statement. If this
becomes the paid product the plan describes, the gate goes at the top of
`POST /api/menus` — the rest of the path doesn't change.

### WhatsApp cart ordering

A published menu stops being a poster. Each row gets a **+**, a fixed bar keeps
the running count and total, **Review order** opens a sheet in the page (no
modal, no focus trap) and **Send order on WhatsApp** opens `wa.me` with the whole
order typed out:

```
New order for Chai & Chapter
2 × Masala Chai — ₹160
1 × Cappuccino — ₹160
1 × Thali — 2 × priced in store
Total: confirmed at the counter (one price wasn't a single figure)
Note: less sugar, extra hot
Ordered from /menu/chai-and-chapter
```

Nothing here touches our servers: the cart lives in the component, the message
is built in the browser, and the order arrives in the café's own WhatsApp. No
account, no app, no commission, no payment — the customer pays at the counter,
and the page says so rather than implying checkout.

**The rule that shapes the code:** *never invent a total.* Prices on a digitised
menu are strings a person typed. `parsePrice()` in `lib/order.ts` reads `₹80`,
`80`, `₹1,200`, `Rs. 80`, `80/-` — and refuses `₹80 / ₹120`, `80 120`, `market
price`. If **any** selected line can't be read as one fixed number, the order
goes out without a total and says the café will confirm it, instead of quietly
adding up the wrong thing.

| guard | value |
| --- | --- |
| max per line | 20 |
| max different lines per order | 25 (the bar says so when you hit it) |
| instructions | 200 characters, control characters stripped |
| ordering UI | only on a menu whose café set a WhatsApp number |
| test coverage | `parsePrice`, totals, caps, phone normalisation and URL encoding are asserted in a 11-check Node script run against the compiled module |

The number is normalised **on the way in**, at publish time: `9876543210` or
`098765 43210` are stored as `919876543210`, because a `wa.me` link without a
country code doesn't dial. A menu published before this would have carried ten
digits and produced a dead link.

Analytics record that an order was sent and how many items were in it — never
the items, the note or the total. `/privacy` says this in the same words.

> **Pricing note.** The business case for this is a hypothesis, not revenue: the
> proposal is to include cart ordering in a ₹499–₹999/month plan and test whether
> cafés pay for it. Nothing on the site claims otherwise, and publishing stays
> free and ungated until there is a decision about billing.

### WhatsApp ordering

Under a generated menu the owner can type the café's number and press **Generate
Order Link**. `normalizePhone()` accepts what people actually paste — `+91 98765
43210`, `098765 43210`, `9876543210` — and returns the ten digits, or `null` when
it isn't a usable Indian mobile (`6–9` prefix, ten digits). The link is then
`https://wa.me/91<digits>?text=…` with *"Hi, I'd like to order from your digital
menu"* pre-filled, rendered as a real `wa.me` button plus the raw URL so the
owner can paste it on their own site. Pure client-side, nothing is sent anywhere,
and the event is a normal `cta_click { location: "menu_studio", label:
"whatsapp_order" }` — no phone number is ever tracked.

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
the lead when Supabase is configured. `whatsapp` is optional — the form has no
phone field (the number arrives with the chat), and an enforced `NOT NULL` only
ever turned a usable enquiry into a rejected one. Rate limit: **6 / 10 min per
IP**, shared across instances when Upstash is configured. Always returns
`200 { ok: true, stored }` for a valid submission so the UI can offer the
WhatsApp handoff.

### Menu languages (Hindi + Hinglish)

Menus carry an optional overlay per line: `translations: { hi: { category,
name }, hinglish: { category, name } }`. The printed name stays the base, so a
row with no translation — an old menu, a row renamed in the editor, a model that
declined — reads in the original language instead of going blank.

Translation happens **once, at publish time**, in `POST /api/translate`, and the
result is stored with the items by `POST /api/menus`. The customer's switcher is
then pure client state (`components/menu/MenuLanguages.tsx`): no request, no
spinner, no cost per scan, and switching language never resets a cart because
the switcher, the card and the cart live in one island.

```jsonc
// what is sent — note the absence of a price field
{ "items": [{ "category": "Beverages", "name": "Masala Chai" }] }

// what comes back
{ "translations": {
    "hi":       [{ "category": "पेय", "name": "मसाला चाय" }],
    "hinglish": [{ "category": "Beverages", "name": "Masala Chai" }] } }
```

**Prices are never sent to the translator**, so a translation cannot change what
anything costs — the guarantee is structural, not a prompt instruction. A
language whose list comes back the wrong length is dropped whole rather than
shifted by one row, because the wrong Hindi beside a price is worse than English.
For the same reason each language is judged on its own: a model that fumbles the
Roman-script pass still leaves the café its Hindi, and a language that only half
a menu got is dropped entirely rather than offered thin. Where a language covers
part of the menu, the switcher says so in words — "हिंदी covers 18 of 24 items —
the rest stay in the printed language" — before the customer taps.

If translation fails, the studio publishes in English and says so: a translator
outage must never stop a café going live. The editor can add the languages later
("Translate" in the Items card) and drops the overlay on any row whose printed
name has changed, so stale Hindi never appears beside a renamed dish.

`POST /api/translate` takes `{ items: [{ category, name }] }` (≤ 120 lines,
32 KB), is rate limited to **6 / 10 min per IP**, and returns `503
GENERATION_DISABLED` without a Gemini key, `502 TRANSLATION_FAILED` when every
model attempt fails.

### Dish details and 3D models

A menu line can carry two optional companions, both stored inside the same items
JSON as everything else — **no migration, no new table**:

```jsonc
{
  "category": "Beverages",
  "name": "Masala Chai",
  "price": "₹80",
  "dish":  { "description": "Slow-brewed with crushed ginger.", "ingredients": ["Milk", "Ginger"], "source": "ai" },
  "model": { "glb": "https://cdn.example.com/chai.glb", "poster": "https://cdn.example.com/chai.jpg", "by": "triposr" }
}
```

That `model.glb` normally comes out of the app itself: the owner picks a photo,
presses **Generate 3D model**, and gets a URL on the app's own storage. The owner
never types a URL — see **Photo → 3D** below.

`lib/dish.ts` owns the rules. A `model` survives normalisation only if its `glb`
is an `https` URL whose path ends in `.glb`/`.gltf`; a poster, if present, must be
`.jpg`/`.png`/`.webp`/`.avif`. An unusable model is dropped from the row and
**the row is never dropped** — a café's price and name are not collateral damage
from a broken link. `components/menu/MenuCard.tsx` grows a "See it in 3D" button
only for rows with a real model, so a menu with no 3D looks exactly as it did
before this shipped.

**Prices.** A suggestion can write a name, a section, a description and an
ingredient list. It cannot write a price: `applyDishSuggestion` in
`lib/menu-draft.ts` builds the next row from those four values and the untouched
rest, so there is no code path from a photo, a model or a prompt to `price`. Copy
that mentions money is discarded too (`scrubCopy` drops any sentence with a
currency amount), because "Chai for ₹999" beside the real ₹80 is worse than no
description.

**Accuracy.** A model reading a photo can only see so much, and the honest
failure is a sentence that sounds authoritative. `statesAClaim`/`scrubCopy`
delete whole sentences that assert allergens or diets — gluten-free, vegan,
nut-free, healthy, organic, halal and friends — rather than rewriting them, and
the ingredients list is framed as "on the plate" with the caveat to ask the
counter about allergens. Nothing in the UI presents an allergen as verified.

**Owner control.** `components/menu/DishStudio.tsx` (lazy — a studio that never
opens costs nothing) takes **one photo** and offers two jobs from it: *Read the
words* (name, section, description, visible ingredients, all editable) and
*Generate 3D model*. It writes nothing until the owner presses Save. There is no
file format, no bucket, no URL and no "made with" field anywhere in the café's
view; `DISH_LIMITS` caps description at 320 characters and ingredients at 8 × 40.

It ships in two places, from one component:

- **`variant="compact"`** — the 248px column beside the menu preview on the
  homepage, for a café building its menu for the first time.
- **`variant="full"`** — a card in the owner editor at `/menu/[slug]/edit`,
  between Items and the save bar. This is where an owner comes back weeks later,
  so it gets the whole story: a coverage bar, per-dish chips that show which
  dishes already have a model, a live elapsed-seconds clock while generating,
  preview / regenerate / remove, and copy that says outright that nothing goes
  live until **Save changes**.

`manualModels` is the one exception, and it is not for cafés: an operator sets
`NEXT_PUBLIC_DISH_MANUAL_MODEL=1` to reveal a collapsed "attach a file directly"
block (GLB URL, poster, credit) for demos and catalogue photography. Off by
default, absent from every café-facing string, asserted in the render tests.

The editor wires it to the same three price-blind writers as the homepage
(`applyDishSuggestion`, `setItemDish`, `setItemModel`), so a model added from the
edit link round-trips through `PATCH /api/menus/[slug]` exactly like one added
during publishing — verified end to end against a mock database: model, poster,
credit and copy survive the round trip, an `http://` model is stripped, and both
prices come back byte-identical.

#### Photo → 3D: a free shared GPU

The requirement was honest 3D for ₹0, so the pipeline was chosen by what is
actually free rather than by what is convenient:

| Option | Cost for the café | Verdict |
| --- | --- | --- |
| Meshy / Tripo / Rodin / fal.ai APIs | $0.16–$0.48 per model, paid plans only | ❌ bills per generation |
| Free hosted tiers (Meshy 100 credits, Tripo 200–300) | free, but outputs are public, non-commercial or CC BY | ❌ unusable for a café's own menu |
| **Open weights on a Hugging Face ZeroGPU Space** | **₹0** — shared GPU, 5 GPU-min/day on a free account | ✅ shipped |
| Browser-local triplane/WebGPU models | free, but 6 GB+ and desktop-class GPUs | ❌ not a phone |

So the app calls a **ZeroGPU Space** that runs **TripoSR** (MIT, ~6 GB VRAM)
through its Gradio HTTP API — `/gradio_api/call/<api>` to submit, the returned
`event_id` streamed back as SSE, then the produced file downloaded as bytes. No
client library, no queue of our own, no billing anywhere.

```
photo (JPEG/PNG/WebP, ≤ 4.5 MB)
  → POST /api/dish-model
    → rate limit (6 / 30 min per IP)
    → ZeroGPU Space  ── submit → poll stream → download file
    → check the first four bytes are "glTF" (a PNG is not a model)
    → PUT to Cloudflare R2 under dish-models/<sha256[0:40]>.glb
  ← { ok: true, model: { glb, by }, meta: { provider, via, bytes, seconds } }
```

**Storage is Cloudflare R2**, not Supabase Storage: the free tier's 1 GB and 5 GB
of egress would be spent by one café's menu being opened a few hundred times,
while R2 charges nothing for egress on 10 GB. Objects are **content-addressed**
(`sha256` of the bytes, first 40 hex characters), so regenerating the same dish
stores one object and a URL that has been published once can never change meaning
underneath it. They are served `Cache-Control: immutable` and
`Content-Type: model/gltf-binary`. Anything over 40 MB is refused rather than
shipped to a phone on 4G.

**The honest limits, surfaced in the UI, not buried here:**

- Free ZeroGPU accounts get **5 GPU-minutes a day** (2 minutes unauthenticated,
  pooled per account). A cold Space takes 30–90 s to wake. That is a handful of
  models a day for the whole deployment — fine for a café adding three dishes,
  not for a hundred.
- When the quota is gone, the Space answers 429 and the route returns
  `429 GENERATION_BUSY` with `Retry-After`; the panel says the free GPU is busy
  and offers **Try again**, with an elapsed-seconds clock so the wait is visible.
  It never fabricates a model, a progress bar that means nothing, or a preview.
- The back of a single-photo mesh is the model's best guess. The panel says so.
- Nothing is written to storage until a real `glTF` container came back: a
  picture, an HTML error page or an empty body is a `502 BAD_OUTPUT`, and the
  dish keeps the model it already had.

`model.by` records the real generator (`triposr`, or whatever
`THREED_PROVIDER_NAME` says) and travels with the model, so a credit is never
invented.

#### `POST /api/dish-model`

`{ image: { mimeType, data } }` — base64 JPEG/PNG/WebP, raw with no `data:`
prefix, already downscaled in the browser. `400 BAD_PHOTO` for a format or a stub
that can't be sent, `413 REQUEST_TOO_LARGE` past 4.5 MB, `429 RATE_LIMITED` past
six generations in thirty minutes, `503 GENERATION_DISABLED` when
`THREED_SPACE_URL` is unset, `503 STORAGE_DISABLED` when the `R2_*` variables are
missing (checked **before** the GPU is spent), `429 GENERATION_BUSY` on a quota
wall, `502 GENERATION_FAILED` when the Space errors, `502 BAD_OUTPUT` when the
file it returned is not a mesh, `502 STORAGE_FAILED` when the upload is refused.
Every failure is `{ error, code, hint?, retryAfter? }` and every one of them
leaves the menu untouched. `GET` answers `405` with `{ provider, storage }` so a
deployment can be health-checked without spending GPU time (`maxDuration = 300`).

`lib/space-3d.ts` owns the Gradio conversation; `lib/model-store.ts` owns R2. Both
are `server-only`, so no bucket name or access key can reach a bundle.

#### The viewer

`components/menu/DishViewer.tsx` is a real three.js scene — `GLTFLoader`,
`OrbitControls` with damping and clamped distance, `RoomEnvironment` for
reflections, key/rim/ambient lights, a shadow-catching floor, ACES tone mapping —
and it is loaded only when a customer asks for it: `next/dynamic` for the panel,
`await import("three")` inside the effect for the library. A published menu page
that nobody inspects ships none of three.js (`three` lands in an async chunk of
its own). Models are auto-centred, scaled to ~1.9 units and stood on the floor;
the scene is disposed on close, rotation stops under `prefers-reduced-motion`,
and every load failure has its own sentence (including the Draco one) with the
poster as a fallback.

#### `POST /api/dish-vision`

`{ image: { mimeType, data } }` with a base64 JPEG/PNG/WebP up to 4 MB, and
`image/jpeg` only after the client's compressor has run. Returns
`{ ok, dish: { name, category, description, ingredients, presentation }, meta }`,
rate limited to **8 / 10 min per IP**, `503 GENERATION_DISABLED` without a
Gemini key, `502 VISION_FAILED` when every model attempt fails, `400` for a
missing or unsupported photo, `413` for an oversized body, `405` on `GET`.

The photo is read and discarded: it is never stored, never attached to the menu
and never shown publicly. See `app/privacy/page.tsx`.

### `POST /api/menus`

Publishes a menu and returns `{ ok, slug, url, editUrl, key }` — `201`, and the
key never comes back. `503 PUBLISHING_DISABLED` when Supabase isn't configured
(the studio shows the hint verbatim), `400` with `field` for a menu with no
usable items, `409 SLUG_EXHAUSTED` after five name collisions, `429` past five
publishes in ten minutes.

### `GET` / `PATCH /api/menus/[slug]`

Both need `x-menu-key`. `GET` returns the full document including unpublished
menus; `PATCH` saves `{ cafeName, tagline, whatsapp, items, published }` and
returns `{ ok, updatedAt }`. `401 BAD_KEY` for a missing or malformed key, `403
FORBIDDEN` for the wrong one, `503 STORE_UNAVAILABLE` when the database is down —
never a 500, and never a partial write. Every response is `no-store`.

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
| `seo_generate` | A Local SEO tool (review reply or Google post) succeeds | `tool`, `rating` |
| `menu_generate` | A menu photo is read into lines | `items`, `categories` |
| `qr_download` | A QR code is downloaded | `target` (`demo` / `own`) |
| `menu_publish` | A menu goes live | `items`, `categories`, `attempt`, `translated` |
| `order_send` | A cart is handed to WhatsApp | `items`, `units`, `has_note`, `total_known` |
| `menu_language` | A customer switches the menu's language | `language` |
| `dish_3d_open` | A dish is opened in the 3D viewer | `had_poster` — never which dish |

Page views are captured too (`capture_pageview: true`) — except on the editor.
The owner's capability key lives in the URL *fragment*, and PostHog builds
`$current_url` from `window.location.href`, so a pageview from
`/menu/<slug>/edit#<key>` would hand the key to a third party. Two defences, both
in `components/AnalyticsProvider.tsx`: `sanitize_properties` strips the fragment
from every URL-shaped property (so a `capture()` from anywhere is covered), and
`before_send` drops pageviews whose path is an editor route (so the path stops
being reported at all). `isPrivatePath()` is a prefix match, so `/menu/x/edit`
and `/menu/x/edit#…` are both caught while the public `/menu/x` is still counted.

**Privacy defaults** — chosen deliberately, documented on `/privacy`:

- `persistence: "memory"` → no cookies, no localStorage, so no consent banner.
- `person_profiles: "identified_only"` → anonymous visitors stay anonymous.
- `autocapture: false` → only the declared events above, never form contents.
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
| `/sitemap.xml` | `/`, `/privacy`, `/terms`, plus every menu marked `indexable` |
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
  api/menus/route.ts       # publish a menu → public URL + one-time edit link
  api/menus/[slug]/route.ts# keyed read + save for one menu
  api/dish-vision/route.ts # photo → words (Gemini), never touches a price
  api/dish-model/route.ts  # photo → real GLB: free ZeroGPU Space + R2
  layout.tsx               # shell: fonts, SEO, header/footer, JSON-LD, analytics
  page.tsx                 # hero, studio, packages, process, FAQ, contact
  menu/demo/page.tsx       # the page the demo QR points at (server component)
  menu/[slug]/page.tsx     # a café's live menu — what its QR encodes (own OG/Twitter card)
  menu/[slug]/edit/page.tsx# owner editor shell (key lives in the fragment)
  privacy/, terms/         # legal pages
  opengraph-image.tsx      # generated social card
  robots.ts, sitemap.ts, manifest.ts
components/
  motion/MotionRoot.tsx    # LazyMotion provider — animation features load async
  motion/Reveal.tsx        # staggered fade-up on scroll-into-view (framer-motion)
  motion/SmoothScroll.tsx  # Lenis inertial wheel + eased in-page anchors
  CaptionStudio.tsx        # studio shell: tabs, café details shared by both tools
  LocalSeoStudio.tsx       # Google tab: review responder + post generator
  DigitalMenu.tsx          # menu tab: photo → editable preview + QR PNG download
  menu/MenuCard.tsx        # menu layout, shared by studio, demo and live menus
                           #   (takes an optional `edit` prop to become inputs)
  menu/MenuQr.tsx          # the QR island (demo page, editor, any menu URL)
  menu/MenuEditor.tsx      # the editor: fields, item rows, 3D panel, save, editor link
  menu/MenuOrder.tsx       # the cart: steppers, order sheet, wa.me handoff
  menu/MenuLanguages.tsx   # language switcher + card + cart, one island
  menu/DishViewer.tsx      # three.js viewer (lazy; three is an async chunk)
  menu/DishStudio.tsx      # owner panel: photo reading, model URL, preview
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
  menu.ts                  # menu contract, slugs, capability keys (shared)
  menu-store.ts            # Supabase RPC reads/writes — server only
  order.ts                 # cart maths, price parsing, the WhatsApp message
  dish.ts                  # dish/model limits, URL safety, claim + price scrubbing
  space-3d.ts              # photo → mesh on a free ZeroGPU Space (Gradio + SSE)
  model-store.ts           # content-addressed GLB storage on Cloudflare R2
  image.ts                 # browser-side photo validation, downscale, JPEG encode
  menu-draft.ts            # the price-blind item writers (suggestions, dish, model)
  menu-translate.ts        # languages, coverage, sticky-original overlay
  rate-limit.ts            # hashed-IP limiter used by both API routes
  studio-client.ts         # one fetch helper for all three tools (70s abort, typed errors)
  site.ts                  # site URL + SEO copy
  smooth-scroll.ts         # the one Lenis instance (null when not in use)
supabase/schema.sql        # leads + menus tables, RLS, and the menu functions
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
- `.paper` — the studio surface: 94% opaque cream plus a three-layer diffused
  shadow (contact shadow + soft spread + amber bloom). Deliberately *not*
  frosted: a backdrop-filter that large has to be re-blurred on every scroll
  frame, which is a hidden per-frame cost on mid-range phones.
- `.glow-warm` — the soft caramel pool behind the hero headline. A plain
  radial-gradient, no `filter: blur()` — the gradient already fades to nothing,
  and the filter only bought an offscreen buffer the compositor had to keep.
- Body background — three warm gradients on a `position: fixed` layer
  (`body::before`), not `background-attachment: fixed`: the old property forces
  a full-viewport repaint on every scroll frame. `<html>` carries the cream so
  the layer can sit above it and below the content.
- Header — frosted glass (`bg-cream-100/80 backdrop-blur-lg backdrop-saturate-150`,
  16px blur instead of 24px: cost scales with the square of the radius) closed
  with a gradient hairline.

**Smooth scrolling**

- `components/motion/SmoothScroll.tsx` runs [Lenis](https://github.com/darkroomengineering/lenis)
  over the real document scroll (`window.scrollTo`), so the wheel stops landing
  in hard 100px steps. Nothing is translated behind the browser's back: sticky
  positioning, the scrollbar, keyboard paging, text selection, hash links and
  `scroll-margin-top` all behave exactly as before.
- `syncTouch: false` — phones keep native, GPU-composited momentum. Synthesised
  touch inertia is where most "smooth scroll" sites fall apart.
- `allowNestedScroll: true` — an overflowing textarea (a long caption) keeps the
  wheel until it hits its own end, then hands back to the page.
- In-page anchors (`#packages`, `/#contact`) are eased instead of jumping, and
  the sticky header offset comes from the existing `[id] { scroll-margin-top }`.
- Lenis is a **dynamic import** (~5.4 kB gzip in its own chunk, absent from the
  first load) and is never created at all under `prefers-reduced-motion: reduce`.
  `html:not(.lenis)` keeps native smooth anchor scrolling as the fallback.
- `lib/smooth-scroll.ts` holds the single instance, so any component can ask for
  `smoothScrollTo(element)` without knowing whether smoothing is active.

**Motion**

- `framer-motion` is installed but **never** blocks first paint: `MotionRoot`
  wraps the app in `LazyMotion` with `features={() => import("framer-motion")}`,
  so only the ~18 kB `m` renderer is in the initial JS and the ~70 kB (gzip)
  animation feature bundle arrives in its own async chunk.
- `Reveal` gives sections their staggered fade-up (`whileInView`, `once: true`,
  0.7s on an expo-out curve — a longer tail reads as weight).
  The hero is CSS-only on purpose: above-the-fold content should paint with the
  stylesheet, not wait for JavaScript.
- Every interactive control carries a press state (`active:scale-[0.97]`, or
  `whileTap` for the copy buttons), `prefers-reduced-motion` is honoured in both
  CSS and the `Reveal`/`usePrefersReducedMotion` pair, and `<noscript>` keeps
  revealed sections visible if JavaScript never runs.
- Taps get out of the browser's way: `-webkit-tap-highlight-color: transparent`
  and `touch-action: manipulation` on links and buttons, so there is no grey
  flash and no double-tap delay — the press state is the only feedback.
- The studio's tab panels animate *to* a resting hidden state while they are
  hidden, so revisiting a tab eases in from the same place the first visit did
  rather than snapping (the panels stay mounted by design — see the perf notes).
- Loading states are shimmering skeletons shaped like the real caption cards —
  header line, three body lines, five hashtag pills, two action circles.

**Mobile**

- The studio is full-bleed below `sm` (`-mx-4 rounded-none`), so it fills the
  screen the way a native sheet would.
- Every tap target is at least 44×44 px: copy buttons (`h-11 w-11`), tone chips,
  language buttons, package CTAs, nav and footer links, inputs (`.input`).

**Bundle budget** — `npm run build` after the scroll/motion pass:

```
Route (app)                                 Size  First Load JS
┌ ○ /                                    26.6 kB         145 kB
+ First Load JS shared by all             103 kB
```

Lenis lives in its own 18.7 kB chunk (5.4 kB gzip) and is only fetched once the
page is interactive, so it is not part of that 145 kB.

Baseline before the overhaul was 14.8 kB / 122 kB. The +18 kB is framer-motion's
`m` renderer only; the feature bundle (200 kB raw / 70 kB gzip) is an async
chunk, and PostHog (356 kB) is still loaded lazily. If you ever need the 122 kB
back, swap `Reveal` for a CSS + `IntersectionObserver` component — it is the
only file that imports framer-motion apart from `MotionRoot` and the copy buttons.

---

## Deploy to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Add `GEMINI_API_KEY` and `NEXT_PUBLIC_SITE_URL`. Strongly recommended:
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (shared rate limits) and
   `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
   (lead storage and publishing — **mark that last one Sensitive**, it must never
   be readable by a client). Without it, publishing and lead storage answer 503
   instead of writing with the publishable key.
   If the site sits behind **your own** proxy rather than Vercel's edge, set
   `TRUST_PROXY=1` so the rate limiter sees real client IPs — and only then,
   because it states that the proxy overwrites `x-real-ip`/`x-forwarded-for`.
   `NEXT_PUBLIC_ASSET_HOSTS` (comma-separated) pins where menu 3D models and
   posters may be loaded from; leave it unset only if menus may reference any
   https host.
3. Deploy. Environment changes only apply to **new** deployments — redeploy
   after adding or editing variables.

### Security headers

`next.config.mjs` sets the boring, unconditional ones (nosniff, referrer policy,
permissions policy, HSTS, production `X-Frame-Options: DENY`). `middleware.ts`
applies a split Content-Security-Policy, built in `lib/csp.ts` so it can be
unit-tested (`tests/csp.test.ts`):

- **Enforced:** `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
  `form-action 'self'`, `upgrade-insecure-requests`, and explicit allowlists for
  `style-src` (`'self' 'unsafe-inline'` + `https://fonts.googleapis.com`),
  `font-src` (`'self' data:` + `https://fonts.gstatic.com`), and `img-src` /
  `media-src` / `connect-src` (this origin, blob/data previews, the configured
  asset hosts, PostHog's API and `-assets` host). **Every source is a literal
  origin — no `https:`, no `*`.**
- **Report-Only:** `script-src` (plus `worker-src`, which PostHog's recorder
  uses). A nonce has to be generated per request and threaded into every inline
  tag — including the three JSON-LD blocks that live on statically rendered
  pages — which would force those pages to render dynamically. Until that pass
  happens, script violations are reported rather than blocked, and everything
  else is already enforced.

Two rules that are easy to get wrong, and are now asserted rather than assumed:

1. `upgrade-insecure-requests` is ignored in a report-only policy (the browser
   says so in the console), so it lives **only** in the enforced one.
2. The fonts are loaded from Google by `<link>` in `app/layout.tsx`. If those two
   origins are missing from `style-src`/`font-src`, the entire site silently
   renders in fallback serif. `tests/csp.test.ts` fails the build if they go
   missing. (Moving to `next/font/google` would self-host them and drop the
   entries, but it fetches at build time — a Google outage would then fail a
   deploy, and the build has no such dependency today.)

### Text contrast

`npm run check:contrast` reads the palette from `tailwind.config.ts`, finds every
`text-*` utility used in `app/` and `components/`, and checks each against the
worst light surface it can land on (cream, white, caramel chips, the error tint)
using the WCAG AA 4.5:1 rule. Tokens that are only ever icons, or only ever on
the dark espresso panels, are listed in the script with a reason. It exits
non-zero on a failure, so a palette tweak can't quietly break legibility.

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

Work through [`docs/HANDOVER.md`](docs/HANDOVER.md) §6 and §12 as well — the
accounts and the migrations are what a buyer's diligence actually checks.

- [ ] Replace the placeholder-free `CONTACT_PHONE` if it ever changes, and test
      the WhatsApp button from a phone.
- [ ] Adjust `PACKAGES` prices/features and confirm they match what you deliver.
- [ ] Read `/privacy` and `/terms`; add GST details, refund policy or business
      address if you need them.
- [ ] Add real testimonials to `TESTIMONIALS` (the section stays hidden until
      there is at least one).
- [ ] Set `NEXT_PUBLIC_SITE_URL` and check the link preview in WhatsApp.
- [ ] Add a custom domain — it's the single biggest credibility upgrade.
