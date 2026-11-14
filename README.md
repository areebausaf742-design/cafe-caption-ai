# ☕ CafeCaption AI

**Turn café photos into Instagram captions that sell.** Describe a photo in one
line and get three scroll-stopping captions — each with five trending hashtags —
in about ten seconds. English or Hinglish.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**,
**Lucide icons** and **Google Gemini**. The Gemini API key is read only inside a
server-only Route Handler, so it never reaches the browser.

---

## ✨ Features

- Warm, premium café aesthetic (cream + amber + espresso), mobile-first layout
- Three distinct captions per idea — storytelling, punchy/aesthetic, and
  call-to-action — with five fresh hashtags each
- **Copy buttons per field**: copy just the caption or just the hashtags, with a
  “Copied!” confirmation (plus “Copy all” and a clipboard fallback for older
  mobile browsers)
- **Regenerate** instantly for fresh takes, plus “Start over”
- **Optional café details** — café name, city and caption language
  (English / Hinglish) are woven into the AI prompt
- Four tone presets: Cozy, Aesthetic, Playful, Promo
- Staged loading messages, indeterminate progress bar and shimmer skeletons;
  inline errors with retry, hints and rate-limit countdowns
- Contact banner with **email + WhatsApp** buttons (single constants to edit)
- **SEO**: metadata, canonical, Open Graph + Twitter cards, a generated
  `opengraph-image`, `sitemap.xml`, `robots.txt`, web manifest and JSON-LD
- Secure server-only Gemini call, input validation, **per-IP rate limiting**
  with `X-RateLimit-*` / `Retry-After` headers, and defensive JSON cleanup
- Accessible labels, live regions, visible focus rings, reduced-motion support

---

## 🚀 Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local

# 3. Open .env.local and paste your Gemini API key
#    GEMINI_API_KEY=AIza...   (free key: https://aistudio.google.com/app/apikey)

# 4. Start the dev server
npm run dev
```

Open <http://localhost:3000>.

> **Windows PowerShell:** use `Copy-Item .env.example .env.local` instead of `cp`.
> Env changes only apply after restarting `npm run dev`.

### Scripts

| Command             | What it does                      |
| ------------------- | --------------------------------- |
| `npm run dev`       | Start the dev server on port 3000 |
| `npm run build`     | Production build                  |
| `npm run start`     | Serve the production build        |
| `npm run lint`      | ESLint (`next/core-web-vitals`)   |
| `npm run typecheck` | TypeScript check without emitting |

---

## ✏️ The values you need to edit

| What               | File                                             | Look for |
| ------------------ | ------------------------------------------------ | -------- |
| **Gemini API key** | `.env.local` + Vercel env vars                   | `GEMINI_API_KEY=your_gemini_api_key_here` |
| **Your email**     | `app/page.tsx` (top of file)                     | `const CONTACT_EMAIL = "areebausaf742@gmail.com";` |
| **WhatsApp**       | `app/page.tsx` (top of file)                     | `const CONTACT_PHONE = "910000000000";` |
| **Public URL**     | `.env.local` + Vercel env vars (optional)        | `NEXT_PUBLIC_SITE_URL=https://your-domain.com` |

`CONTACT_PHONE` must be **digits only, with the country code** (e.g.
`919876543210` for India) — it becomes the `https://wa.me/<number>` link.
`CONTACT_PHONE` currently holds a placeholder, so replace it before launch.
`NEXT_PUBLIC_SITE_URL` only affects SEO output (canonical URL, sitemap, OG
image) and is safe to expose — it starts with `NEXT_PUBLIC_` on purpose.

> ⚠️ Never prefix the **API key** with `NEXT_PUBLIC_`. That would bundle it into
> client JavaScript. `app/api/generate/route.ts` starts with
> `import "server-only"`, so the build fails loudly if it is ever imported from a
> Client Component.

---

## 🔌 API

`POST /api/generate`

```json
{
  "description": "Iced latte with a croissant on a wooden table",
  "tone": "cozy",
  "cafeName": "The Daily Grind",
  "city": "Lucknow",
  "language": "hinglish"
}
```

`tone` (`cozy` | `aesthetic` | `playful` | `promo`) and `language` (`english` |
`hinglish`) are optional and validated server-side; `cafeName` and `city` are
optional (trimmed, control characters stripped, length-capped).

Success `200`:

```json
{
  "captions": [
    { "caption": "…", "hashtags": ["#cafelife", "#latteart", "…"] }
  ],
  "meta": { "model": "gemini-2.5-flash", "tone": "cozy", "language": "hinglish" }
}
```

Errors return `{ "error": "human readable message", "code": "…", "hint?": "…", "retryAfter?": 60 }`:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` | Bad input |
| 422 | `BLOCKED` | Gemini safety filter |
| 429 | `RATE_LIMITED`, `UPSTREAM_RATE_LIMITED` | Too many requests (includes `Retry-After`) |
| 500 | `MISSING_API_KEY` | `GEMINI_API_KEY` not configured |
| 502 | `UPSTREAM_AUTH`, `UPSTREAM_MODEL_NOT_FOUND`, `GENERATION_FAILED` | Gemini failure |

Rate limiting is **12 requests / 10 minutes per IP** (SHA-256 hashed IPs, in
memory). Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset`. On serverless this is per instance — for strict global
limits back it with Upstash Redis or Vercel KV.

---

## 🔍 SEO

| Route | What it serves |
| --- | --- |
| `/opengraph-image` | 1200×630 branded preview (also used by Twitter) |
| `/sitemap.xml` | `app/sitemap.ts` |
| `/robots.txt` | `app/robots.ts` (blocks `/api/`) |
| `/manifest.webmanifest` | `app/manifest.ts` (installable, standalone) |

Metadata lives in `app/layout.tsx` (title template, description, keywords,
Open Graph, Twitter, robots, canonical, JSON-LD `WebApplication`).
Set `NEXT_PUBLIC_SITE_URL` in production so absolute URLs are correct.

---

## ☁️ Deploy to Vercel

```bash
git remote add origin https://github.com/<your-username>/cafe-caption-ai.git
git push -u origin main
```

1. Import the repo at [vercel.com/new](https://vercel.com/new) — Next.js is
   auto-detected.
2. **Settings → Environment Variables**: add `GEMINI_API_KEY` and (recommended)
   `NEXT_PUBLIC_SITE_URL`.
3. **Deploy** (redeploy if you added env vars after the first build).

---

## 🧩 Project structure

```
app/
  api/generate/route.ts   # Server-only POST endpoint → Gemini
  globals.css             # Design tokens, base styles, component classes
  icon.svg                # Favicon
  layout.tsx              # Fonts, SEO metadata, JSON-LD
  manifest.ts             # PWA manifest
  opengraph-image.tsx     # Generated OG/Twitter preview
  page.tsx                # Client UI: form, states, results, banner
  robots.ts / sitemap.ts  # Crawler files
lib/
  site.ts                 # Public site URL + SEO copy
  types.ts                # Shared types, tones, languages, limits
tailwind.config.ts        # Café palette, shadows, animations
eslint.config.mjs         # Flat ESLint config
```

---

## 📱 Mobile notes

Tested at a 360 px viewport: fluid widths only (no fixed widths above 200 px),
banner buttons stack full-width, the email address wraps with `break-all`,
tap targets are ≥ 40 px, and form fields use 16 px text on mobile so iOS Safari
does not zoom on focus.

---

## 🛠 Troubleshooting

| Symptom | Fix |
| --- | --- |
| “The server is missing its Gemini API key…” | Add `GEMINI_API_KEY` to `.env.local`, restart `npm run dev`. On Vercel, add it and redeploy. |
| `502` / “Gemini rejected the request” | Invalid or restricted key — create a fresh one at [aistudio.google.com](https://aistudio.google.com/app/apikey). |
| `429` | Free-tier quota, or the built-in 12 / 10 min limit. Wait for the countdown shown in the error card. |
| `404` model not found | Your key lacks that model — set `GEMINI_MODEL` to one you can use. |
| WhatsApp button opens a blank chat | `CONTACT_PHONE` is still the placeholder — set your number with country code, digits only. |

---

Crafted for independent cafés, bakeries and coffee carts. AI-generated copy —
give it a quick read before posting.
