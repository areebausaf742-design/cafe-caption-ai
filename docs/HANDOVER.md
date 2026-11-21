# Handover

Everything someone needs to take this project over and run it without asking the
original author a single question. Written for a sale, a hand-off to another
developer, or just future-you in six months.

If you are evaluating this project, read **§2 (what actually works)** and
**§9 (known limitations)** first. Those two sections are the honest ones.

---

## 1. What this is

A marketing site for a café-focused studio, with three working tools built into
it:

- **Caption studio** — a café's description or photo becomes Instagram captions,
  hashtags and review replies (Gemini, server-side).
- **Digital menu** — a photo of a printed menu becomes a live, mobile-first menu
  page with a QR code the owner can print, plus an edit link that never expires.
- **Dish 3D** — a dish photo becomes a GLB a customer can spin (free ZeroGPU
  Space, optional Cloudflare R2 for storage).

Stack: Next.js 15 (App Router), React 19, Tailwind 3, Supabase (Postgres),
Google Gemini, Framer Motion, PostHog, self-hosted variable fonts. No accounts, no
payments — see §2.

---

## 2. What actually works

| Area | State | Notes |
| --- | --- | --- |
| Landing page, privacy, terms | Working | Static, no database |
| Caption studio | Working | Needs `GEMINI_API_KEY` |
| Menu publish → public page → QR | Working | Needs Supabase + `SUPABASE_SERVICE_ROLE_KEY` |
| Menu editing with the owner key | Working | Key lives in the URL fragment, never sent to us |
| Menu translation | Working | Gemini |
| Dish 3D | Working where ZeroGPU is available | Degrades to a poster; see §9 |
| Lead form | Working | WhatsApp is the real channel; the database row is a backup |
| Accounts, login, billing | **Not built** | Publishing is open to anyone who finds the page |
| Admin dashboard | **Not built** | Menus are managed with SQL (see §8) |
| Email | **Not built** | No transactional mail at all |

---

## 3. Repo map

```
app/                 routes; api/ is server-only
  api/generate/      captions, hashtags, reviews, posts (+ prompts.ts)
  api/menus/         publish, keyed read, keyed save
  api/leads/         lead intake
  api/dish-vision/   photo → menu lines
  api/dish-model/    photo → GLB (Space + optional R2)
components/          UI; components/menu/* is the menu product
lib/                 logic worth testing: limits, rate-limit, csp, stores, menu
supabase/            schema.sql + migrations (see §8)
scripts/             check-contrast, check-prod, verify-production
tests/               vitest, no DOM tests — every test is logic or structural
```

---

## 4. Running it locally

```bash
npm ci
cp .env.example .env.local     # fill in what you need; everything is optional
npm run dev                    # http://localhost:3000
```

With no environment variables at all the marketing site and the caption studio's
UI still render — the tools answer with a clear "not configured" error instead of
crashing. That property is enforced by CI (`npm run build` with no secrets).

---

## 5. Environment variables

Names only. Values live in the Vercel project, never in this repo.

| Variable | Needed for | If missing |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, sitemap, OG | Falls back to localhost — wrong share cards |
| `GEMINI_API_KEY` | Caption studio, menu translation, dish vision | Those routes answer 503 |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Reading published menus | Menus answer "not configured" |
| `SUPABASE_SERVICE_ROLE_KEY` | **All writes** | Publishing and leads answer 503 (never a downgrade) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared rate limiting | Production refuses paid routes (see §9.3) |
| `RATE_LIMIT_ALLOW_MEMORY_LIMITS` | Override for the above | — |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Analytics | Nothing; events are no-ops |
| `R2_*`, `NEXT_PUBLIC_ASSET_HOSTS` | Persistent 3D model storage | Models are ephemeral |
| `GENERATION_DISABLED` | Kill switch for paid generation | — |

---

## 6. Accounts to transfer

A sale that does not transfer these transfers nothing:

- [ ] **Domain** — registrar account or an auth code
- [ ] **Vercel** project `cafe-caption-ai` (or a fresh project + the same repo)
- [ ] **Supabase** project (database, keys, backups)
- [ ] **Upstash** Redis database (if configured)
- [ ] **Google AI Studio** — the Gemini key's billing account
- [ ] **PostHog** project
- [ ] **Cloudflare R2** bucket (if 3D storage is used)
- [ ] **GitHub** repository + the ability to add a collaborator
- [ ] **WhatsApp** business number used in the CTAs
- [ ] The brand name, if it is worth anything to the buyer

Rotate every key on transfer. Assume anything that lived in the old owner's
Vercel project is compromised the moment the sale closes.

---

## 7. Deploy and roll back

Deploy = merge to `main`. Vercel builds and promotes automatically; the alias is
`cafe-caption-ai.vercel.app`.

Roll back = promote the previous deployment in the Vercel dashboard. No database
migration is destructive, so a rollback does not need a data restore — see §8.

**A variable change is not live until you redeploy.** Adding an env var to Vercel
does nothing to running functions.

---

## 8. Database

`supabase/schema.sql` is the desired state; `supabase/migrations/*.sql` are the
incremental steps, applied by hand in the Supabase SQL editor.

| Migration | Purpose | Applied? |
| --- | --- | --- |
| `20261114120000_lock_anon_inserts.sql` | Revoke anon INSERT on `leads`/`menus`; writes become service-role only | **No** — check before assuming |
| `20261114130000_menu_indexing.sql` | `indexable` column, `menu_public()` returns it, `menu_indexable()` for the sitemap | **No** — check before assuming |

Both are idempotent and safe to run twice. Until the first is applied, anyone with
the publishable key can insert rows directly. Until the second is applied, every
menu stays `noindex` and the sitemap lists no menus.

Verify after applying:

```sql
select slug, published, indexable from public.menus order by updated_at desc;
select public.menu_indexable();
```

---

## 9. Known limitations — read this before buying

1. **No accounts and no billing.** `POST /api/menus` is rate-limited but otherwise
   open. There is no way to charge anyone today.
2. **Anon INSERT is still open** until the migration in §8 runs.
3. **Rate limiting runs on a per-instance map in production right now**, because
   `RATE_LIMIT_ALLOW_MEMORY_LIMITS=1` is set as a deliberate stopgap. A burst
   across isolates can exceed the intended limit. Fix: add Upstash, delete the
   variable. The strict behaviour (refuse paid routes with `503
   RATE_LIMIT_NOT_CONFIGURED`) is already written and tested.
4. **Menu pages are `noindex` by default.** Only rows with `indexable = true`
   reach the sitemap.
5. **Dish 3D depends on a third party.** A free ZeroGPU Space can be asleep, rate
   limited or withdrawn; the UI falls back to a poster.
6. **One Gemini key, one budget.** Costs scale with traffic and nothing caps total
   spend, only per-IP request rates.
7. **Vercel Hobby is not licensed for commercial use.** A business running this
   needs Vercel Pro (~$20/month).
8. **Test data in production.** Two menus (`rollout-check`, `rollout-check-2`) and
   one lead are verification artefacts. Delete them:
   `delete from public.menus where slug in ('rollout-check','rollout-check-2');`
9. **No email anywhere.** A lead is a database row plus a WhatsApp handoff.

---

## 10. Verifying a deployment

```bash
npm run typecheck && npm run lint && npm test && npm run build   # the gate
npm run check:contrast        # WCAG contrast of the palette
npm run check:prod            # read-only checks against a deployed URL
npm run verify:release        # writes two test rows; prints cleanup SQL
```

CI (`.github/workflows/ci.yml`) runs the first line on every push and pull
request. `verify-production.yml` is manual because it writes to the real database.

---

## 11. Monthly running cost (orders of magnitude, at low volume)

| Item | Cost |
| --- | --- |
| Vercel | $0 Hobby (not licensed commercially) / $20 Pro |
| Supabase | $0 free tier, then $25 |
| Upstash | $0 free tier |
| Gemini | cents at low volume; the risk is a single viral day |
| PostHog | $0 free tier |
| R2 | pennies |
| Domain | ~$12/year |

Expect **$0–$25/month** until there is real traffic, plus variable Gemini spend.

---

## 12. A buyer's first day

1. Rotate every key (§6). Do not reuse the previous owner's credentials.
2. Add Upstash, then delete `RATE_LIMIT_ALLOW_MEMORY_LIMITS` (§9.3).
3. Apply both migrations (§8) and verify with the two queries.
4. Delete the verification rows (§9.8).
5. Point the real domain at the project and set `NEXT_PUBLIC_SITE_URL`.
6. Run `npm run verify:release` against the live URL and read the report.
7. Cancel the previous owner's PostHog/Gemini billing if you are not using them.

---

## 13. What would make this worth more

Not features — revenue. In order of leverage: billing and plan gating, an owner
analytics dashboard, then multi-outlet support. Until a café pays, the honest
valuation of this repository is the cost of rebuilding it, not a multiple of a
business. See the README's "Known limitation, stated plainly" section for the same
statement in the product's own words.
