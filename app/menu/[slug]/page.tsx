import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Clock, MessageCircle } from "lucide-react";

import MenuCard from "@/components/menu/MenuCard";
import { SLUG_RE, toDigitalMenu, type MenuDoc } from "@/lib/menu";
import { menuStoreConfigured, readPublicMenu } from "@/lib/menu-store";

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

  let cafeName = "";
  if (SLUG_RE.test(slug) && menuStoreConfigured()) {
    try {
      cafeName = (await readPublicMenu(slug))?.cafeName ?? "";
    } catch {
      // A slow database shouldn't cost the page its title.
    }
  }

  return {
    title: cafeName ? `${cafeName} — menu` : "Live menu",
    description: cafeName
      ? `${cafeName}'s menu, with prices, kept up to date — scan, read, order.`
      : "A digitised café menu with prices, kept up to date.",
    alternates: { canonical: route },
    // Free publishing has no moderation step yet, so a menu stays out of search
    // until someone looks at it. Flipping this is one line when it matters.
    robots: { index: false, follow: true },
  };
}

function orderLink(whatsapp: string, cafeName: string): string {
  const message = `Hi ${cafeName}, I'd like to order from your menu.`;
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
}

export default async function MenuPage({ params }: Props) {
  const { slug } = await params;

  if (!SLUG_RE.test(slug)) notFound();

  if (!menuStoreConfigured()) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 pt-16 pb-20 text-center sm:px-6">
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
      <main className="mx-auto w-full max-w-xl px-4 pt-16 pb-20 text-center sm:px-6">
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

  if (!menu) notFound();

  const menuData = toDigitalMenu(menu.items);
  const updated = menu.updatedAt
    ? new Date(menu.updatedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      {menu.tagline && (
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.16em] text-caramel-600">
          {menu.tagline}
        </p>
      )}

      <div className="mt-3">
        <MenuCard
          menu={menuData}
          cafeName={menu.cafeName}
          isSample={false}
          updated={updated}
        />
      </div>

      {menu.whatsapp && (
        <a
          href={orderLink(menu.whatsapp, menu.cafeName)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary tap mt-4 inline-flex w-full items-center justify-center gap-2"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Order on WhatsApp
        </a>
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
