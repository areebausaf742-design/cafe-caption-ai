# Anvik — product & build plan

**Status:** plan only. No application code written.
**Branch:** `arena/650b8631-cafe-caption-ai`
**Date:** 14 November 2026

---

## 1. The one-sentence product

> **Anvik is a place where anyone can ask a question in their own language and get an answer that makes sense — free, on any phone, without an account.**

What it is not: a model, a fine-tune, a Claude clone, a developer tool, or a B2B product.

### Who it's for

A first-year student in Lucknow, a shopkeeper in Aminabad, a farmer in Barabanki — people who already have a question and a phone, and who bounce off ChatGPT because it answers in English, assumes a credit card, and looks like a cockpit.

### The wedge (why anyone switches)

Four doors, none of which the incumbents open:

| Door | What it looks like |
| --- | --- |
| **Language** | Ask in Hindi/Hinglish, get answered in Hindi/Hinglish — not translated, *written* that way |
| **One field** | A box and a button. No model picker, no sidebar, no settings |
| **Free + UPI** | No foreign card, no login wall before the first answer |
| **Shareable** | Every good answer becomes a WhatsApp card and a public page |

---

## 2. Brand

**Name:** Anvik (`अन्विक`)
**From:** *Anvikshiki* (आन्वीक्षिकी), the classical Indian discipline of critical inquiry — called in Kautilya's *Arthashastra* "the lamp that illuminates all other branches of knowledge."
**Say:** UN-vik. Five letters, one spelling, no ambiguity on a phone call.

**Wordmark:** `anvik`, lowercase, display serif, one weight, +2% tracking. No icon, no rounded-square monogram.

**Voice:** plain, warm, unhurried, never clever at the user's expense. Short sentences. No "As an AI language model…". No emoji in answers unless the user uses them first.

**Tagline:** *Poochho kuch bhi.* (Ask anything.)

---

## 3. Design system

Derived from the two references analysed earlier — the *grammar* borrowed (whitespace, one accent, hairline elevation), the *identity* deliberately not.

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `paper` | `#FAF7F2` | Page ground — warmth in the surface, not borrowed from a photo |
| `surface` | `#FFFFFF` | Cards, answer panels |
| `ink` | `#14120F` | Primary text |
| `ink-2` | `#55504A` | Secondary text |
| `ink-3` | `#8C857C` | Labels, hints, timestamps |
| `line` | `#E7E1D8` | 1px hairlines |
| `accent` | `#1F5F4B` | Primary action, links, focus ring |
| `accent-hover` | `#184C3C` | Pressed / hover |
| `saffron` | `#C1701F` | The single flourish: "thinking" state, active nav |
| `danger` | `#A8332A` | Errors only |

Two saturated colours, used on under 2% of any screen. No gradients except the thinking pulse.

### Type

| Role | Face | Sizes |
| --- | --- | --- |
| Display | **Fraunces** (open licence) | 44/30, line-height 1.1 |
| UI / body | **Manrope** | 18 / 16 / 14 / 12, line-height 1.6 body, 1.2 UI |
| Devanagari | **Mukta** (falls back to Noto Sans Devanagari) | matched optically to Manrope |

Fraunces is a different lineage from any reference — different skeleton, different terminals, recognisably not theirs. Devanagari is chosen deliberately, because most AI products in India bolt it on later and the line-height breaks.

### Shape & space

- Radius family: **14** (fields, inputs) · **20** (cards, answer panels) · **999** (pills)
- Touch targets: **48px** minimum (mass-market, thumb-first)
- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96
- Elevation: `0 1px 2px rgba(20,18,15,.04)` resting, `0 8px 24px rgba(20,18,15,.06)` raised
- Motion: 120ms (state) / 180ms (enter), ease-out, **no bounce**; `prefers-reduced-motion` respected everywhere

### The "not copied" checklist

Kept from the references: one-job screens, generous emptiness, hairline cards, three-step text ramp, one accent.
Deliberately changed: logo, both accent hues, both typefaces, radius signature, button height, and **no photograph** — the single strongest copy-signal in the reference set is its hero photo, so there isn't one.

---

## 4. Screens (7)

1. **Landing / empty state** — serif line ("Poochho kuch bhi."), one input card, four example chips, tiny footer (Privacy · Terms · भाषा). Nothing else above the fold.
2. **Answer view** — the question as a quiet line, the answer streaming below in 18px/1.7, actions: copy, share as card, "aur samjhao" (explain more), thumbs down.
3. **Public answer page** — `/prashn/<slug>`, server-rendered, shareable, indexed only if reviewed. The growth engine.
4. **History** — signed-in only; grouped by day; delete one, delete all.
5. **Sign in** — email OTP. Reached *after* value, never before. No password.
6. **Limits / paywall** — plain-language state ("Aaj ke 10 sawaal poore ho gaye"), reset time, optional upgrade.
7. **Trust pages** — Privacy, Terms, AI disclosure ("answers can be wrong; verify anything about money or health").

States designed explicitly: empty, streaming, long answer, refusal, rate-limited, offline, error.

---

## 5. Architecture

```
Browser (Next.js App Router, RSC)
   │
   ├─ /api/ask        → stream SSE/plain text, no server state
   │     ├─ 1. rate limit   (per-IP + per-user, shared Postgres window)
   │     ├─ 2. global ceiling (daily rupee budget)
   │     ├─ 3. language detect (script + stopword heuristic, no model call)
   │     ├─ 4. cache lookup (normalised question + language)
   │     ├─ 5. model call   (ladder: flash → fallback)
   │     └─ 6. persist      (only for signed-in users; cache all)
   │
   └─ Supabase: Auth (OTP), Postgres, RLS
```

**Stack:** Next.js 15 (App Router) · Supabase (Postgres + Auth) · Vercel · Gemini flash-class model. **No GPU. No fine-tune. No training.** The model is a commodity; the product is the language handling, the cache, and the distribution.

**Reuse from CafeCaption:** the Postgres rate-limit store (`rate_limit_hit` / `rate_limit_peek`), the service-role-only write pattern, error boundaries, CSP, CI gate, and the release verification discipline. Those are proven; don't rewrite them.

**New repo.** A separate product deserves a separate deploy, secrets and blast radius. Copy the primitives across.

### Data model (v1)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profiles` | one row per user | `id`, `created_at`, `lang_pref` |
| `conversations` | a thread | `id`, `user_id`, `title`, `lang`, `created_at` |
| `messages` | turns | `id`, `conversation_id`, `role`, `content`, `tokens_in`, `tokens_out`, `cost_paise`, `created_at` |
| `answer_cache` | dedupe the long tail | `question_norm`, `lang`, `answer`, `model`, `hits`, `created_at` |
| `public_answers` | reviewed, indexable pages | `slug`, `question`, `answer`, `lang`, `reviewed_by`, `published_at` |
| `usage_daily` | caps + spend ceiling | `day`, `user_id`, `answers`, `cost_paise` |
| `reports` | user flags | `message_id`, `reason`, `status` |

RLS on everything user-scoped; `answer_cache` and `public_answers` read by service role only.

---

## 6. Language policy

- **Detect on script first** (Devanagari ⇒ Hindi), then on a stopword list for romanised Hinglish (`kya`, `hai`, `kaise`, `kitna`, `mujhe`, `batao`). No model call — this must be free and instant.
- **Answer in the language asked.** Mixed input gets mixed output; that is correct Hinglish, not a failure.
- **Never translate technical nouns** that Indians say in English (GST, SIP, UPSC, EMI).
- Register: *aap* by default, not *tum*.
- Unknown language ⇒ answer in English, with one line offering Hindi.

---

## 7. Cost model (rupees, not vibes)

| Item | Assumption | Cost |
| --- | --- | --- |
| One answer | ~250 output tokens, flash-class | **₹0.08 – ₹0.15** |
| Cache hit | identical/normalised question | **₹0** |
| Realistic session | 3 questions, 40% cache hit | **₹0.20** |
| 1,000 daily users × 3 q | 3,000 answers/day | **₹240 – ₹450/day** |
| Monthly at that scale | — | **₹7,000 – ₹13,500** |
| Hosting | Vercel Pro + Supabase free→pro | ₹2,000 – ₹4,000/mo |
| Domain | `.ai` + `.in` | ₹8,000 – ₹12,000/yr |

**Rules that keep this survivable:**
1. **Global daily ceiling** — a rupee budget per day (start ₹300). Hit it, everyone sees "aaj ki limit poori ho gayi", not a broken app. This is the single most important control.
2. **Per-IP + per-user caps** on the shared counter: 10/day anonymous, 25/day signed in.
3. **Cache first.** Boilerplate questions dominate early traffic; the cache is the only reason the maths works.
4. **Short by default** (250 words), longer on request.
5. **Never silent-fail open.** If the limiter store is down, refuse the expensive call, don't serve it free.

Ads cannot pay for this (₹20–60 per thousand impressions vs ~₹0.10 per answer used). Monetisation is a later decision, not a v1 feature.

---

## 8. Safety, moderation, legal

- **Refusal policy:** no medical diagnosis, no dosage, no legal advice on a live matter, no self-harm instructions (with helpline), no sexual content involving minors, no election misinformation. Written down, tested with 200 samples before launch.
- **Report button** on every answer; reports land in `reports` with a 24-hour triage expectation.
- **AI disclosure** on every answer: a single quiet line, not a banner.
- **DPDP Act:** store the minimum, say what you store, offer delete-my-history and delete-my-account, no data sale, no training on user data.
- **18+ or 13+?** Recommend 13+ with a parental note, and no account required to read.
- **Never** publish an unreviewed AI answer as an indexed page. Thin-content penalties are domain-wide and permanent.

---

## 9. Growth (the actual hard part)

1. **WhatsApp share card** — question + 3-line answer + link, generated as an OG image. India spreads through forwarding, not feeds.
2. **Public pages** — `/prashn/sip-kya-hai`. Reviewed answers only, one page per genuine question, sitemap, no thin pages. This is the only organic channel that compounds.
3. **Seeding** — one campus, one district, one exam. "Everyone" is not a launch plan; *"first-year students at Lucknow University"* is.
4. **Do not** launch on Product Hunt. Wrong audience, wrong country, wrong product.

---

## 10. Ten weeks

| Week | Ship | Done means |
| --- | --- | --- |
| 1 | 30 real questions written down; 3 people interviewed | You can name the person and the question |
| 2 | Landing + streaming answer, no login, hard daily cap, deployed | 5 strangers use it unprompted |
| 3 | Language detect + answer in-language; share card | Someone forwards an answer in a WhatsApp group |
| 4 | Per-IP and per-user caps on the shared store; global ceiling; kill switch | One bad day cannot produce a surprise bill |
| 5 | Email OTP, history, answer cache with hit tracking | Repeat users > 20% of daily |
| 6 | Public answer pages + review workflow + sitemap | First impressions in Search Console |
| 7 | Moderation pass, refusal policy, report queue | No unsafe answer in a 200-sample audit |
| 8 | Limits/paywall screen + Razorpay (only if the free tier is genuinely used) | First ₹99 |
| 9 | Performance pass on a ₹8,000 Android over 4G | First answer starts < 1.2s; LCP < 2s |
| 10 | Launch to three named communities | 100 daily users |

**Kill criteria, agreed now:** if 50 weekly users haven't emerged from the first 200 people told by week 6, the wedge is wrong. Change the audience, not the features.

---

## 11. Decisions I need before writing code

Defaults in bold — say "go" and I'll build to them.

1. **First language:** **Hindi/Hinglish-first**, English second. (Alternative: English-first, Hindi later.)
2. **URL:** `anvik.ai` if free, **`anvik.in` as the guaranteed fallback**, `getanvik.com` as the long option. I cannot check availability — buy them the same day you approve.
3. **Launch audience:** **students in one city**, expanding outward. (Alternative: café owners, reusing CafeCaption.)
4. **Money:** **free for the first three months**, paid tier only after 100 daily users. (Alternative: ₹99 from day one — which suppresses growth at this stage.)

---

## 12. What would make this fail

- Building before 30 real questions exist.
- No global daily ceiling — one Hacker News link and you're paying for strangers.
- Publishing unreviewed AI pages and burning the domain's search trust.
- Adding accounts, settings, models, files, voice before week 5.
- Calling it "Anvik AI" and copying Gemini's empty state pixel for pixel. The layout grammar is shared; the identity is not.

---

## 13. Approval

Nothing below this line happens until you say go:

- write any application code
- create accounts, domains, or buy anything
- commit a scaffold
- deploy anything
