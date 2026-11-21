import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Clock } from "lucide-react";

import MenuLanguages from "@/components/menu/MenuLanguages";
import { SLUG_RE, type MenuDoc } from "@/lib/menu";
import { menuStoreConfigured, readPublicMenu } from "@/lib/menu-store";
import { siteName, siteUrl } from "@/lib/site";

/**
 * A café's live menu — the page the QR on the table points at.
 *
 * Server-rendered on every request rather than cached: an owner who fixes a
 * price at 11am should see it fixed at 11am, and a menu page is a few hundred
 * bytes of HTML. When Supabase isn't configured the page says so instead of
 * 404-ing, because "your menu doesn't exist" is a confusing thing to read while
 * you're still setting the database up.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const route = `/menu/${slug}`;
  const url = `${siteUrl}${route}`;

  let menu: MenuDoc | null = null;
  if (SLUG_RE.test(slug) && menuStoreConfigured()) {
    try {
      menu = await readPublicMenu(slug);
    } catch {
      // A slow database shouldn't cost the page its title.
    }
  }

  const cafeName = menu?.cafeName ?? "";
  const title = cafeName ? `${cafeName} — menu` : "Live menu";
  const description = cafeName
    ? `${cafeName}'s menu, with prices, kept up to date — scan, read, order.`
    : "A digitised café menu with prices, kept up to date.";

  // Indexing is opt-in per menu (`public.menus.indexable`), set after someone
  // has actually looked at the row — see the moderation note in schema.sql.
  // Everything else stays `noindex, follow`: a QR on a table is not a search
  // result, and an unreviewed row is not something to put in front of Google.
  const indexable = menu?.indexable === true;

  return {
    title,
    description,
    alternates: { canonical: route },
    // Without these, a café pasting their menu link into WhatsApp gets the
    // CafeCaption homepage card: wrong title, wrong description, wrong URL.
    openGraph: {
      type: "website",
      siteName,
      url,
      title,
      description,
      images: [
        {
          url: `${siteUrl}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: cafeName ? `${cafeName} — live menu` : "CafeCaption live menu",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/opengraph-image`],
    },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function MenuPage({ params }: Props) {
  const { slug } = await params;

  if (!SLUG_RE.test(slug)) notFound();

  if (!menuStoreConfigured()) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-xl px-4 pt-16 pb-20 text-center sm:px-6">
        <p className="label">Menus</p>
        <h1 className="mt-3 font-display text-[1.7rem] font-semibold leading-tight text-espresso-900">
          Live menus aren&apos;t switched on yet.
        </h1>
        <p className="section-lead mt-3">
          This site has the whole publishing path built, but no database to
          publish into. Set <code className="text-espresso-900">SUPABASE_URL</code>{" "}
          and <code className="text-espresso-900">SUPABASE_ANON_KEY</code>, run{" "}
          <code className="text-espresso-900">supabase/schema.sql</code>, and any
          menu you publish will show up here.
        </p>
        <Link href="/menu/demo" className="btn-outline mt-6 inline-flex px-4">
          See the sample menu
        </Link>
      </main>
    );
  }

  let menu: MenuDoc | null = null;
  try {
    menu = await readPublicMenu(slug);
  } catch (error) {
    console.error("[menu] read failed:", error);
    return (
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-xl px-4 pt-16 pb-20 text-center sm:px-6">
        <p className="label">Menu</p>
        <h1 className="mt-3 font-display text-[1.7rem] font-semibold leading-tight text-espresso-900">
          This menu&apos;s taking a minute.
        </h1>
        <p className="section-lead mt-3">
          The page couldn&apos;t reach the menu right now. Reload in a moment — if
          you&apos;re ordering from a table, just ask the counter.
        </p>
      </main>
    );
  }

  // No `loading.tsx` in this folder, and please don't add one back: a loading
  // boundary makes Next flush the HTML shell — with a 200 — before this line
  // runs, so a menu that has been unpublished or mistyped would answer
  // "200 OK" with a not-found body. That is a soft 404, which search engines
  // treat as a broken page and visitors see as a slow, empty state.
  // Verified both ways with `next start` against a stub store: without the
  // boundary this responds 404, with it 200.
  if (!menu) notFound();

  const updated = menu.updatedAt
    ? new Date(menu.updatedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  // A café with an order number gets the cart; one without gets the menu, which
  // is exactly what they asked for by leaving it empty.
  const orderable = Boolean(menu.whatsapp);

  return (
    <main
      id="main"
      tabIndex={-1}
      className={`mx-auto w-full max-w-xl px-4 pt-8 sm:px-6 sm:pt-12 ${
        // Room for the fixed cart bar, which only appears once something is in it.
        orderable ? "pb-32 sm:pb-28" : "pb-16"
      }`}
    >
      {menu.tagline && (
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.16em] text-caramel-600">
          {menu.tagline}
        </p>
      )}

      {/* One island: the language switcher, the card, and the cart live in the
          same client tree so switching language never resets an order. */}
      <div className="mt-3">
        <MenuLanguages
          slug={slug}
          cafeName={menu.cafeName}
          items={menu.items}
          whatsapp={menu.whatsapp}
          updated={updated}
        />
      </div>

      {orderable && (
        <p className="mt-8 text-center text-[10.5px] leading-[1.6] text-espresso-400">
          Tap the + beside anything you want, then send the order to the café on
          WhatsApp. No app, no account, no commission.
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
        {updated && (
          <p className="flex items-center gap-1.5 text-[10.5px] text-espresso-400">
            <Clock className="h-3 w-3" aria-hidden />
            Prices last updated {updated}
          </p>
        )}
        <p className="text-[10.5px] text-espresso-400">
          Digital menu by{" "}
          <Link
            href="/"
            className="font-semibold text-espresso-600 underline decoration-espresso-900/20 underline-offset-2 hover:text-espresso-900"
          >
            CafeCaption
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mt-10">
        <Link
          href="/#studio"
          className="card tap flex items-start gap-3 p-4 hover:border-caramel-400/55"
        >
          <ArrowUpRight
            className="mt-0.5 h-4 w-4 shrink-0 text-espresso-700"
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-espresso-900">
              Run a café? Get a menu like this.
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-[1.6] text-espresso-600">
              Photograph your printed card and it becomes this — your own link, a
              QR for the tables, prices you can change without reprinting.
            </span>
          </span>
        </Link>
      </div>
    </main>
  );
}
