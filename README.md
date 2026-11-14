# ☕ CafeCaption AI

**Turn café photos into Instagram captions that sell.** Describe a photo in one
line and get three scroll-stopping captions — each with five trending hashtags —
in about ten seconds.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**,
**Lucide icons** and **Google Gemini**. The Gemini API key is read only inside a
server-side Route Handler, so it never reaches the browser.

---

## ✨ Features

- Warm, premium café aesthetic (cream + amber + espresso) with a responsive,
  mobile-first layout
- Three distinct captions per idea — storytelling, punchy/aesthetic, and
  call-to-action — with five fresh hashtags each
- Four tone presets: Cozy, Aesthetic, Playful, Promo
- One-tap **copy** per caption (caption + hashtags) and **copy all**
- Shimmer loading skeletons, friendly error states, retry, and `⌘/Ctrl + Enter`
  to generate
- Secure server-side Gemini call, input validation, per-IP rate limiting, and
  defensive JSON parsing/cleanup of model output
- SEO + Open Graph metadata, accessible labels/live regions, reduced-motion
  support
- Marketing banner for custom AI/website work (single constant to edit)

---

## 🚀 Local setup

Run these from the project root:

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

Then open <http://localhost:3000>.

> **Windows PowerShell:** use `Copy-Item .env.example .env.local` instead of `cp`.
> Environment changes only apply after restarting `npm run dev`.

### Scripts

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the dev server on port 3000     |
| `npm run build`     | Production build                      |
| `npm run start`     | Serve the production build            |
| `npm run lint`      | ESLint (`next/core-web-vitals`)       |
| `npm run typecheck` | TypeScript check without emitting     |

---

## 🔑 Where to put your two values

| What                | File                          | Look for                                          |
| ------------------- | ----------------------------- | ------------------------------------------------- |
| **Gemini API key**  | `.env.local` (and Vercel env) | `GEMINI_API_KEY=your_gemini_api_key_here`         |
| **Your email**      | `app/page.tsx` (top of file)  | `const CONTACT_EMAIL = "hello@yourdomain.com";`   |

The email constant drives both the banner text and the `mailto:` link, so you
only change it in one place. Optionally set `GEMINI_MODEL` to override the
default model (`gemini-2.5-flash`).

> ⚠️ Never prefix the key with `NEXT_PUBLIC_`. That would bundle it into client
> JavaScript and expose it publicly. Backend code reads
> `process.env.GEMINI_API_KEY` only.

---

## ☁️ Deploy to Vercel

```bash
# Push to a new GitHub repo (if you haven't already)
git init
git add .
git commit -m "feat: CafeCaption AI"
git branch -M main
git remote add origin https://github.com/<your-username>/cafe-caption-ai.git
git push -u origin main
```

1. Go to [vercel.com/new](https://vercel.com/new) and import the repository
   (framework is auto-detected as Next.js — no build settings to change).
2. **Settings → Environment Variables** → add:
   - `GEMINI_API_KEY` = your key (Production + Preview + Development)
   - `NEXT_PUBLIC_SITE_URL` = `https://your-domain.com` (optional, improves OG URLs)
3. **Deploy**, then redeploy if you added the env vars after the first build.

---

## 🧩 Project structure

```
app/
  api/generate/route.ts   # Secure POST endpoint → Gemini (server only)
  globals.css             # Design tokens, base styles, component classes
  icon.svg                # Favicon
  layout.tsx              # Root layout, fonts, SEO metadata
  page.tsx                # Client UI: form, states, results, banner
lib/
  types.ts                # Shared request/response types, tones, examples
tailwind.config.ts        # Café color palette, shadows, animations
eslint.config.mjs         # Flat ESLint config
```

### API contract

`POST /api/generate`

```json
{ "description": "Iced latte with a croissant on a wooden table", "tone": "cozy" }
```

Success `200`:

```json
{
  "captions": [
    { "caption": "…", "hashtags": ["#cafelife", "#latteart", "…"] }
  ],
  "meta": { "model": "gemini-2.5-flash", "tone": "cozy" }
}
```

Errors return `{ "error": "human readable message", "code": "VALIDATION_ERROR", "hint?": "…" }`
with status `400`, `422`, `429`, `500` (missing key) or `502` (upstream failure).

---

## 🛠 Troubleshooting

| Symptom | Fix |
| --- | --- |
| “The server is missing its Gemini API key…” | Add `GEMINI_API_KEY` to `.env.local`, restart `npm run dev`. On Vercel, add it in Settings → Environment Variables and redeploy. |
| `502` / “Gemini rejected the request” | Key is invalid or restricted — create a fresh one at [aistudio.google.com](https://aistudio.google.com/app/apikey). |
| `429` | Gemini free-tier quota, or you hit the built-in limit (12 requests / 10 min / IP). Wait a moment. |
| `404` model not found | Your key doesn't have access to that model — set `GEMINI_MODEL` to one you can use. |
| Blank/odd captions | Model output is JSON-validated and hashtags are cleaned; regenerate for a different take. |

Rate limiting is intentionally in-memory (per serverless instance). For strict
production limits, back it with Upstash Redis or Vercel KV.

---

Crafted for independent cafés, bakeries and coffee carts. AI-generated copy —
give it a quick read before posting.
