import type { Metadata } from "next";
import { notFound } from "next/navigation";

import MenuEditor from "@/components/menu/MenuEditor";
import { SLUG_RE } from "@/lib/menu";

/**
 * The owner's editor. A server shell around one client island: the key lives in
 * the URL fragment, so this page renders identically for everyone and the key is
 * never part of the HTML.
 */

export const metadata: Metadata = {
  title: "Edit your menu",
  // An editor has no business in a search index, and neither has its key.
  robots: { index: false, follow: false, nocache: true },
};

type Props = { params: Promise<{ slug: string }> };

export default async function MenuEditPage({ params }: Props) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <p className="label">Menu editor</p>
      <h1 className="mt-3 font-display text-[1.6rem] font-semibold leading-[1.12] tracking-[-0.02em] text-espresso-900 sm:text-[1.9rem]">
        Change a price, save, done.
      </h1>
      <p className="section-lead mt-3 mb-6">
        Edits appear on the public menu the moment you save — the QR code on your
        tables keeps pointing at the same place.
      </p>

      <MenuEditor slug={slug} />
    </main>
  );
}
